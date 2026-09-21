'use strict'

// Smoke: the fixed nav bar paints the top band of the website background image.
// One Hexo site per case (theme scripts register helpers at require time, so cases
// cannot share a process). Run: node test/_smoke_nav_band.js

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const themeRoot = path.resolve(__dirname, '..')
const blogRoot = path.resolve('D:/project/blog')

const CASES = {
  single: '/img/bg.webp',
  array: "['/img/a.webp', '#123456']",
  color: "'#123456'"
}

function runCase (name) {
  const Module = require('module')
  process.env.NODE_PATH = [path.join(themeRoot, 'node_modules'), path.join(blogRoot, 'node_modules'), process.env.NODE_PATH || '']
    .filter(Boolean)
    .join(path.delimiter)
  Module._initPaths()

  const site = fs.mkdtempSync(path.join(os.tmpdir(), `panda-navband-${name}-`))

  function write (rel, body) {
    const abs = path.join(site, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }

  write('package.json', JSON.stringify({
    name: `panda-navband-${name}-smoke`,
    private: true,
    hexo: {},
    dependencies: {
      hexo: '*',
      'hexo-generator-index': '*',
      'hexo-renderer-pug': '*',
      'hexo-renderer-stylus': '*',
      'hexo-renderer-markdown-it-plus': '*'
    }
  }, null, 2))

  write('_config.yml', `
title: Nav Band Smoke
author: tester
language: zh-CN
timezone: Asia/Shanghai
url: http://example.com
permalink: :title/
per_page: 10
theme: panda
`)

  write('_config.panda.yml', `
memos:
  enable: false
og_image:
  enable: false
feed:
  enable: false
blog_series:
  enable: false
home_about:
  enable: false
background: ${CASES[name]}
`)

  write('source/_posts/band.md', `---
title: BAND_POST
date: 2026-01-10 12:00:00
---
band body
`)

  const nm = path.join(site, 'node_modules')
  fs.symlinkSync(path.join(blogRoot, 'node_modules'), nm, 'junction')
  const themes = path.join(site, 'themes')
  fs.mkdirSync(themes)
  fs.symlinkSync(themeRoot, path.join(themes, 'panda'), 'junction')

  process.chdir(site)
  const Hexo = require(path.join(blogRoot, 'node_modules', 'hexo'))
  const hexo = new Hexo(site, { silent: true })

  let failed = false
  const ok = (cond, msg) => { if (!cond) { console.error(`SMOKE FAIL [${name}]:`, msg); failed = true } }

  hexo.init().then(() => hexo.call('generate', {})).then(() => {
    const pub = path.join(site, 'public')
    const html = fs.readFileSync(path.join(pub, 'band', 'index.html'), 'utf8')
    const bandIndex = html.indexOf('.panda-nav-band #page-header.nav-fixed #nav')
    const gradientNavIndex = html.indexOf('rgba(79, 172, 254, 0.96)')
    const bandBlock = (html.match(/<style>[\s\S]*?<\/style>/g) || []).find(block => block.includes('.panda-nav-band'))

    ok(html.includes('BAND_POST'), 'post title missing')
    ok(html.includes(`?v=${require('../package.json').version}`), 'asset URLs missing the version cache-bust')
    ok(html.includes('<div class="bg-animation" id="web_bg"'), '#web_bg div missing')

    if (bandBlock) {
      // Every selector inside the band block must carry the gate: an array background
      // drops `panda-nav-band` at runtime, and an ungated selector would keep painting.
      const ungated = bandBlock.split('\n').filter(line => /^\s*#page-header/.test(line))
      ok(ungated.length === 0, `ungated band selectors: ${ungated.join(' | ')}`)
    } else {
      ok(name === 'color', 'band style block missing')
    }

    if (name === 'single') {
      ok(/class="[^"]*panda-nav-band[^"]*"/.test(html), 'html missing panda-nav-band class')
      ok(html.includes('style="background-image: url(/img/bg.webp);"'), '#web_bg missing the background image')
      ok(bandIndex !== -1, 'band selector missing')
      ok(/background-attachment:\s*fixed/.test(html), 'band not locked to the viewport')
      ok(/background-position:\s*center/.test(html), 'band not centered like #web_bg')
      ok(/background-size:\s*cover/.test(html), 'band not covering the viewport')
      ok(html.includes("url('/img/bg.webp')"), 'baked band image url missing')
      ok(html.includes("[data-theme='dark'].panda-nav-band"), 'dark-mode twin missing')
      ok(html.includes('.apple.panda-nav-band'), 'iOS fallback missing')
      ok(!html.includes("[data-theme='dark'] .panda-nav-band"), 'dark gate must be compound (same <html> element)')
      ok(!html.includes('.apple .panda-nav-band'), 'apple gate must be compound (same <html> element)')
      ok(/color:\s*#ffffff !important/.test(html), 'band text color missing')
      ok(gradientNavIndex !== -1 && bandIndex > gradientNavIndex, 'band rule must be emitted after gradient.nav_light')
    }

    if (name === 'array') {
      ok(!/class="[^"]*panda-nav-band[^"]*"/.test(html), 'array background must not bake the class')
      ok(bandIndex !== -1, 'band selector missing for an array background')
      ok(html.includes('var(--panda-nav-bg-image, none)'), 'array band must fall back to none before JS')
      ok(html.includes('--panda-nav-bg-image'), 'random-bg script missing the nav var')
      ok(html.includes("url('/img/a.webp')"), 'array image url missing from the script')
      ok(html.includes(',null]'), 'non-image array entry must map to null')
    }

    if (name === 'color') {
      ok(!html.includes('panda-nav-band'), 'a color background must not emit a band')
      ok(html.includes('style="background-color: #123456;"'), '#web_bg missing the background color')
    }
  }).then(() => {
    if (failed) process.exitCode = 1
    else console.log(`SMOKE PASS [${name}]`, site)
    return hexo.exit()
  }).catch(err => {
    console.error(err)
    process.exitCode = 1
    return hexo.exit().catch(() => {})
  })
}

if (process.env.SMOKE_CASE) {
  runCase(process.env.SMOKE_CASE)
} else {
  let failed = false
  for (const name of Object.keys(CASES)) {
    const run = spawnSync(process.execPath, [__filename], {
      env: { ...process.env, SMOKE_CASE: name },
      stdio: 'inherit'
    })
    if (run.status !== 0) failed = true
  }
  if (failed) {
    console.error('SMOKE FAIL: nav band cases')
    process.exitCode = 1
  } else {
    console.log('SMOKE PASS nav band (single / array / color)')
  }
}
