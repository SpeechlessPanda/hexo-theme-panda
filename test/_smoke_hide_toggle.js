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

const site = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-hide-'))

function write (rel, body) {
  const abs = path.join(site, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
}

write('package.json', JSON.stringify({
  name: 'panda-hide-smoke',
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
title: Hide Smoke
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

write('source/_posts/toggle.md', `---
title: TOGGLE_POST
date: 2026-01-10 12:00:00
---
{% hideToggle 分类A %}
inner body
{% endhideToggle %}
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
  const html = fs.readFileSync(path.join(pub, 'toggle', 'index.html'), 'utf8')
  const css = fs.readFileSync(path.join(pub, 'css', 'index.css'), 'utf8')
  const js = fs.readFileSync(path.join(pub, 'js', 'main.js'), 'utf8')

  if (!html.includes('TOGGLE_POST')) fail('post title missing')
  if (!html.includes('class="toggle"')) fail('details.toggle missing')
  if (!html.includes('class="toggle-collapse"')) fail('collapse button missing')
  if (!html.includes('>收起</button>')) fail('zh-CN collapse label missing')
  if (!html.includes('分类A')) fail('toggle title missing')
  if (!html.includes('?v=1.1.1')) fail('asset URLs missing ?v=1.1.1 cache-bust')
  if (!css.includes('.toggle-collapse')) fail('compiled CSS missing .toggle-collapse')
  if (!js.includes("closest('.toggle-collapse')")) fail('main.js missing collapse handler')
}).then(() => {
  if (process.exitCode) return
  console.log('SMOKE PASS', site)
  return hexo.exit()
}).catch(err => {
  console.error(err)
  process.exitCode = 1
  return hexo.exit().catch(() => {})
})
