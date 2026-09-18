'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const blogRoot = path.resolve('D:/project/blog')
const themeRoot = path.resolve(__dirname, '..')
const Module = require('module')
process.env.NODE_PATH = [path.join(themeRoot, 'node_modules'), path.join(blogRoot, 'node_modules'), process.env.NODE_PATH || '']
  .filter(Boolean)
  .join(path.delimiter)
Module._initPaths()
const site = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-series-'))

function write (rel, body) {
  const abs = path.join(site, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
}

write('package.json', JSON.stringify({
  name: 'panda-series-smoke',
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
title: Series Smoke
author: tester
language: zh-CN
timezone: Asia/Shanghai
url: http://example.com
permalink: :title/
new_post_name: :title.md
filename_case: 0
per_page: 10
theme: panda
index_generator:
  path: ''
  per_page: 10
`)

write('_config.panda.yml', `
home_about:
  enable: false
memos:
  enable: false
og_image:
  enable: false
feed:
  enable: true
  include_memos: false
blog_series:
  enable: true
  path: /series/
`)

write('source/_posts/standalone.md', `---
title: STANDALONE_POST
date: 2026-01-10 12:00:00
---
solo body
`)

write('source/_posts/older.md', `---
title: OLDER_POST
date: 2025-12-01 12:00:00
---
old body
`)

write('source/_posts/大学道路入门/index.md', `---
title: SERIES_CARD_TITLE
description: SERIES_CARD_DESC
cover:
---
`)

write('source/_posts/大学道路入门/第一章.md', `---
title: CHAPTER_ONE
date: 2026-01-01 12:00:00
---
ch1 body
`)

write('source/_posts/大学道路入门/第二章.md', `---
title: CHAPTER_TWO
date: 2026-01-20 12:00:00
---
ch2 body
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
  const indexHtml = fs.readFileSync(path.join(pub, 'index.html'), 'utf8')
  const seriesHtml = fs.readFileSync(path.join(pub, 'series', '大学道路入门', 'index.html'), 'utf8')
  const feed = fs.readFileSync(path.join(pub, 'atom.xml'), 'utf8')
  const ch1Html = fs.readFileSync(path.join(pub, '大学道路入门', '第一章', 'index.html'), 'utf8')
  const ch2Html = fs.readFileSync(path.join(pub, '大学道路入门', '第二章', 'index.html'), 'utf8')

  const idxSeries = indexHtml.indexOf('SERIES_CARD_TITLE')
  const idxStandalone = indexHtml.indexOf('STANDALONE_POST')
  const idxOlder = indexHtml.indexOf('OLDER_POST')

  if (idxSeries < 0) fail('index missing series card')
  if (!indexHtml.includes('series-card')) fail('index missing series-card class')
  if (idxStandalone < 0) fail('index missing standalone')
  if (idxOlder < 0) fail('index missing older post')
  if (!(idxSeries < idxStandalone && idxStandalone < idxOlder)) {
    fail(`index order wrong: series=${idxSeries} standalone=${idxStandalone} older=${idxOlder}`)
  }
  if (indexHtml.includes('CHAPTER_ONE') || indexHtml.includes('CHAPTER_TWO')) {
    fail('index still lists series members')
  }
  if (!indexHtml.includes('SERIES_CARD_DESC')) fail('index missing series description')

  if (!seriesHtml.includes('SERIES_CARD_TITLE')) fail('series page missing title')
  if (!seriesHtml.includes('CHAPTER_ONE') || !seriesHtml.includes('CHAPTER_TWO')) {
    fail('series page missing members')
  }
  if (seriesHtml.indexOf('CHAPTER_TWO') > seriesHtml.indexOf('CHAPTER_ONE')) {
    // newest first: CHAPTER_TWO (Jan 20) should appear before CHAPTER_ONE (Jan 1)
    fail('series page not newest-first')
  }

  if (feed.includes('SERIES_CARD_TITLE')) fail('feed includes unpublished series index')
  if (!feed.includes('CHAPTER_ONE') || !feed.includes('CHAPTER_TWO') || !feed.includes('STANDALONE_POST')) {
    fail('feed missing member or standalone posts')
  }

  if (!ch1Html.includes('SERIES_CARD_TITLE') || !ch1Html.includes('post-series-link')) fail('chapter 1 missing series badge')
  if (!ch2Html.includes('SERIES_CARD_TITLE') || !ch2Html.includes('post-series-link')) fail('chapter 2 missing series badge')
  const pag1 = (ch1Html.match(/id="pagination"[\s\S]*?<\/nav>/) || [''])[0]
  const pag2 = (ch2Html.match(/id="pagination"[\s\S]*?<\/nav>/) || [''])[0]
  if (!pag1.includes('CHAPTER_TWO')) fail('chapter 1 next should be chapter 2')
  if (!pag2.includes('CHAPTER_ONE')) fail('chapter 2 prev should be chapter 1')
  if (pag1.includes('STANDALONE_POST') || pag2.includes('STANDALONE_POST')) {
    fail('in-series nav leaked to an independent post')
  }

  return hexo.post.create({ title: 'CLI系列', layout: 'series' }).then(created => {
    const expected = path.join(site, 'source', '_posts', 'CLI系列', 'index.md')
    if (path.normalize(created.path) !== path.normalize(expected)) {
      fail('hexo new series path: ' + created.path)
    }
    const md = fs.readFileSync(created.path, 'utf8')
    if (!/^---[\s\S]*title:/.test(md) || !/description:/.test(md)) fail('series scaffold missing keys')
    if (/^date:/m.test(md)) fail('series index should not have date')
  }).then(() => hexo.post.create({ title: '第三章', series: '大学道路入门' })).then(created => {
    const expected = path.join(site, 'source', '_posts', '大学道路入门', '第三章.md')
    if (path.normalize(created.path) !== path.normalize(expected)) {
      fail('hexo new --series path: ' + created.path)
    }
    const md = fs.readFileSync(created.path, 'utf8')
    if (/^series:/m.test(md)) fail('member front-matter should not contain series:')
  })
}).then(() => {
  if (process.exitCode) return
  console.log('SMOKE PASS', site)
  return hexo.exit()
}).catch(err => {
  console.error(err)
  process.exitCode = 1
  return hexo.exit().catch(() => {})
})
