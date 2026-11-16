'use strict'

// Smoke test: build a throwaway Hexo site with this theme as installed package
// and assert the heading-anchor feature end to end in the generated HTML/CSS/JS.

const fs = require('fs')
const os = require('os')
const path = require('path')

const blogRoot = path.resolve('D:/project/blog')
const themeRoot = path.resolve(__dirname, '..')
const { version } = require('../package.json')
const Module = require('module')
process.env.NODE_PATH = [path.join(themeRoot, 'node_modules'), path.join(blogRoot, 'node_modules'), process.env.NODE_PATH || '']
  .filter(Boolean)
  .join(path.delimiter)
Module._initPaths()

const site = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-anchor-'))

function write (rel, body) {
  const abs = path.join(site, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
}

write('package.json', JSON.stringify({
  name: 'panda-anchor-smoke',
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
title: Anchor Smoke
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
`)

write('source/_posts/anchor.md', `---
title: ANCHOR_POST
date: 2026-01-10 12:00:00
---
## 中文 标题

body

## Dup

{% hideToggle 分类A %}
## Dup
{% endhideToggle %}

## Dup

### Manual <span id="proj-demo">A</span>
`)

const nm = path.join(site, 'node_modules')
fs.symlinkSync(path.join(blogRoot, 'node_modules'), nm, 'junction')
const themes = path.join(site, 'themes')
fs.mkdirSync(themes)
fs.symlinkSync(themeRoot, path.join(themes, 'panda'), 'junction')

process.chdir(site)
const Hexo = require(path.join(blogRoot, 'node_modules', 'hexo'))
const hexo = new Hexo(site, { silent: true })

function fail (msg) {
  console.error('SMOKE FAIL:', msg)
  process.exitCode = 1
}

hexo.init().then(() => hexo.call('generate', {})).then(() => {
  const pub = path.join(site, 'public')
  const html = fs.readFileSync(path.join(pub, 'anchor', 'index.html'), 'utf8')
  const css = fs.readFileSync(path.join(pub, 'css', 'index.css'), 'utf8')
  const article = (html.match(/<article[\s\S]*?<\/article>/) || [''])[0]

  const ids = [...article.matchAll(/<h([1-6])[^>]*\sid="([^"]*)"/g)].map(m => m[2])
  const hrefs = [...article.matchAll(/<a class="headerlink"[^>]*href="([^"]*)"/g)].map(m => decodeURIComponent(m[1].slice(1)))
  const tocHrefs = [...html.matchAll(/class="toc-link"[^>]*href="([^"]*)"/g)].map(m => decodeURIComponent(m[1].slice(1)))

  if (!article) fail('article container missing')
  if (ids.length !== 5) fail(`expected 5 heading ids, got ${ids.length}: ${ids.join(', ')}`)
  if (new Set(ids).size !== ids.length) fail(`duplicate heading ids: ${ids.join(', ')}`)
  if (!ids.includes('中文-标题')) fail(`CJK slug missing: ${ids.join(', ')}`)
  if (!article.includes('<span id="proj-demo">')) fail('manual span id lost')
  if (hrefs.length !== ids.length) fail(`permalinks ${hrefs.length} != headings ${ids.length}`)
  const missing = hrefs.filter(id => !ids.includes(id) && id !== 'proj-demo')
  if (missing.length) fail(`permalinks point at missing ids: ${missing.join(', ')}`)
  const deadToc = tocHrefs.filter(id => id && !ids.includes(id) && id !== 'proj-demo')
  if (deadToc.length) fail(`TOC links point at missing ids: ${deadToc.join(', ')}`)
  if (!/<a class="headerlink"[^>]*title="标题永久链接"/.test(article)) fail('zh-CN permalink label missing')
  if (article.includes('markdownIt-Anchor')) fail('renderer empty anchor placeholder not removed')
  if (!/\[id\]\s*\{\s*scroll-margin-top:\s*var\(--panda-anchor-offset/.test(css)) fail('compiled CSS missing scroll-margin-top')
  if (!html.includes(`js/anchor.js?v=${version}`)) fail(`anchor.js not cache-busted with ?v=${version}`)
  if (!/GLOBAL_CONFIG[\s\S]*anchor:\s*\{[\s\S]*copyLink: true/.test(html)) fail('client anchor config missing')
}).then(() => {
  if (process.exitCode) return
  console.log('SMOKE PASS', site)
  return hexo.exit()
}).catch(err => {
  console.error(err)
  process.exitCode = 1
  return hexo.exit().catch(() => {})
})
