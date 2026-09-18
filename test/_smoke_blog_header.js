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

const site = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-header-'))

function write (rel, body) {
  const abs = path.join(site, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
}

write('package.json', JSON.stringify({
  name: 'panda-header-smoke',
  private: true,
  hexo: {},
  dependencies: {
    hexo: '*',
    'hexo-generator-index': '*',
    'hexo-generator-page': '*',
    'hexo-renderer-pug': '*',
    'hexo-renderer-stylus': '*',
    'hexo-renderer-markdown-it-plus': '*'
  }
}, null, 2))

write('_config.yml', `
title: Header Smoke
author: tester
language: zh-CN
timezone: Asia/Shanghai
url: http://example.com
permalink: :title/
per_page: 10
theme: panda
index_generator:
  path: /blog
  per_page: 10
`)

write('_config.panda.yml', `
home_about:
  enable: true
  source: about/index.md
memos:
  enable: false
og_image:
  enable: false
feed:
  enable: false
blog_series:
  enable: false
subtitle:
  enable: true
  effect: true
  source: 0
  sub:
    - TYPEWRITER_LINE
`)

write('source/index.md', `---
title: 关于
layout: home
---
`)

write('source/about/index.md', `---
title: 关于
type: about
---
ABOUT_BODY
`)

write('source/link/index.md', `---
title: 友链
type: link
---
LINKS_BODY
`)

write('source/_posts/hello.md', `---
title: HELLO_POST
date: 2026-01-10 12:00:00
---
hello body
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

function headerChunk (html) {
  const start = html.indexOf('<header')
  if (start < 0) return ''
  const end = html.indexOf('</header>', start)
  return html.slice(start, end < 0 ? start + 2000 : end)
}

hexo.init().then(() => hexo.call('generate', {})).then(() => {
  const pub = path.join(site, 'public')
  const home = fs.readFileSync(path.join(pub, 'index.html'), 'utf8')
  const blog = fs.readFileSync(path.join(pub, 'blog', 'index.html'), 'utf8')
  const about = fs.readFileSync(path.join(pub, 'about', 'index.html'), 'utf8')
  const links = fs.readFileSync(path.join(pub, 'link', 'index.html'), 'utf8')

  const homeH = headerChunk(home)
  const blogH = headerChunk(blog)
  const aboutH = headerChunk(about)
  const linksH = headerChunk(links)

  if (!homeH.includes('full_page')) fail('home missing full_page')
  if (!homeH.includes('id="subtitle"')) fail('home missing typewriter subtitle')
  if (homeH.includes('id="page-site-info"')) fail('home should not use inner-page header')

  if (blogH.includes('full_page')) fail('blog listing still uses full_page')
  if (blogH.includes('id="subtitle"')) fail('blog listing still has typewriter')
  if (!blogH.includes('not-home-page')) fail('blog listing missing not-home-page')
  if (!blogH.includes('id="page-site-info"')) fail('blog listing missing page-site-info')
  if (!blogH.includes('全部文章')) fail('blog listing missing articles title')
  if (!blog.includes('HELLO_POST')) fail('blog listing missing post')

  if (!aboutH.includes('not-home-page') || aboutH.includes('full_page') || aboutH.includes('id="subtitle"')) {
    fail('about header is not inner-page')
  }
  if (!linksH.includes('not-home-page') || linksH.includes('full_page') || linksH.includes('id="subtitle"')) {
    fail('links header is not inner-page')
  }
}).then(() => {
  if (process.exitCode) return
  console.log('SMOKE PASS', site)
  return hexo.exit()
}).catch(err => {
  console.error(err)
  process.exitCode = 1
  return hexo.exit().catch(() => {})
})
