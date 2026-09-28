'use strict'

// Feed identity smoke: simulates a plain CI user (GitHub Actions fresh checkout,
// no git-mtime-restore mitigation). File mtimes change on every build, so any
// entry id derived from mtime is unstable and RSS readers re-push the entry.
//
// Invariants asserted:
//   1. A post whose CONTENT did not change keeps the same <id> across builds,
//      no matter how file mtimes move (red on mtime-derived stub ids).
//   2. Memo entries keep stable ids across rebuilds.
//   3. A newly added memo appears as a new entry id (memos sync to the feed).
//
// Self-orchestrating: no arg = orchestrator; child phases build once and dump
// entry ids to JSON. db.json is deleted between phases (CI-fresh semantics).

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const blogRoot = path.resolve('D:/project/blog')
const themeRoot = path.resolve(__dirname, '..')
const phase = process.argv[2]

const site = process.env.PANDA_FEED_SMOKE_SITE ||
  (phase ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'panda-feed-')))

function fail (msg) {
  console.error('SMOKE FAIL:', msg)
  process.exitCode = 1
}

function write (rel, body) {
  const abs = path.join(site, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
}

function entryIds () {
  const xml = fs.readFileSync(path.join(site, 'public', 'atom.xml'), 'utf8')
  return xml.split('<entry>').slice(1).map(e => {
    const m = /<id>([^<]*)<\/id>/.exec(e)
    return m && m[1]
  }).filter(Boolean)
}

function touchSource (mtime) {
  const walk = dir => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name)
      const st = fs.statSync(p)
      if (st.isDirectory()) walk(p)
      else fs.utimesSync(p, mtime, mtime)
    }
  }
  walk(path.join(site, 'source'))
}

if (phase) {
  // ---- child: one fresh build, dump ids ----
  const Module = require('module')
  process.env.NODE_PATH = [path.join(themeRoot, 'node_modules'), path.join(blogRoot, 'node_modules'), process.env.NODE_PATH || '']
    .filter(Boolean)
    .join(path.delimiter)
  Module._initPaths()

  const nm = path.join(site, 'node_modules')
  if (!fs.existsSync(nm)) fs.symlinkSync(path.join(blogRoot, 'node_modules'), nm, 'junction')
  const themes = path.join(site, 'themes')
  if (!fs.existsSync(themes)) {
    fs.mkdirSync(themes)
    fs.symlinkSync(themeRoot, path.join(themes, 'panda'), 'junction')
  }
  const db = path.join(site, 'db.json')
  if (fs.existsSync(db)) fs.unlinkSync(db) // CI builds from a fresh checkout

  process.chdir(site)
  const Hexo = require(path.join(blogRoot, 'node_modules', 'hexo'))
  const hexo = new Hexo(site, { silent: true })
  hexo.init().then(() => hexo.call('generate', {})).then(() => {
    fs.writeFileSync(path.join(site, `ids-${phase}.json`), JSON.stringify(entryIds(), null, 2))
    console.log(`[phase ${phase}] ids dumped`)
  }).catch(err => {
    console.error(err)
    process.exitCode = 1
  })
} else {
  // ---- orchestrator ----
  process.env.PANDA_FEED_SMOKE_SITE = site

  write('package.json', JSON.stringify({
    name: 'panda-feed-smoke',
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
title: Feed Smoke
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
  enable: true
og_image:
  enable: false
feed:
  enable: true
blog_series:
  enable: false
`)

  // Old post (>24h before build), no front-matter `updated`: with Hexo's
  // default updated_option: mtime its `updated` tracks the file mtime.
  write('source/_posts/old-post.md', `---
title: OLD_POST
date: 2026-08-01 12:00:00
---
old body
`)

  write('source/_data/shuoshuo.yml', `
- author: tester
  date: 2026-08-10 12:00
  content: MEMO_ONE_BODY
`)

  const run = p => {
    const r = spawnSync(process.execPath, [__filename, p], {
      env: process.env,
      stdio: 'inherit'
    })
    if (r.status !== 0) { fail(`phase ${p} exited ${r.status}`); process.exit() }
  }
  const ids = p => JSON.parse(fs.readFileSync(path.join(site, `ids-${p}.json`), 'utf8'))

  const t0 = new Date('2026-08-02T12:00:00+08:00')
  touchSource(t0) // first clone at t0
  run('1')
  const first = ids('1')
  const postId1 = first.find(id => id.includes('/old-post/'))
  const memoId1 = first.find(id => id.includes('/memos/'))
  if (!postId1) fail('build 1: post entry missing')
  if (!memoId1) fail('build 1: memo entry missing')

  // Second CI build: fresh checkout at t1, content untouched
  const t1 = new Date('2026-08-05T12:00:00+08:00')
  touchSource(t1)
  run('2')
  const second = ids('2')
  const postId2 = second.find(id => id.includes('/old-post/'))
  if (postId1 && postId2 && postId1 !== postId2) {
    fail(`post id unstable across CI builds (mtime leak):\n  build1: ${postId1}\n  build2: ${postId2}`)
  }
  if (memoId1 && !second.includes(memoId1)) fail(`memo id lost/changed in build 2: ${memoId1}`)

  // Third build: user adds new memos (one with ISO "T" date) -> new entry ids
  write('source/_data/shuoshuo.yml', `
- author: tester
  date: 2026-08-12T08:15
  content: MEMO_THREE_BODY

- author: tester
  date: 2026-08-11 09:30
  content: MEMO_TWO_BODY

- author: tester
  date: 2026-08-10 12:00
  content: MEMO_ONE_BODY
`)
  run('3')
  const third = ids('3')
  if (!third.some(id => id.includes('/memos/2026-08-11T09-30'))) {
    fail('build 3: newly added memo missing from feed')
  }
  if (!third.some(id => id.includes('/memos/2026-08-12T08-15'))) {
    fail('build 3: memo with ISO "T" date missing from feed')
  }
  if (postId1 && !third.includes(postId1)) fail('build 3: post id changed after adding a memo')
  if (memoId1 && !third.includes(memoId1)) fail('build 3: first memo id changed after adding a memo')
  // Phase 4: explicit front-matter `updated` >24h after publish -> stub id
  // (content-hash form) + resolvable stub page. This is the notify path.
  write('source/_posts/old-post.md', `---
title: OLD_POST
date: 2026-08-01 12:00:00
updated: 2026-08-20 12:00:00
---
old body revised
`)
  run('4')
  const fourth = ids('4')
  const postId4 = fourth.find(id => id.includes('/old-post/'))
  if (!/\/old-post\/u\/[0-9a-f]{10}\/$/.test(postId4 || '')) {
    fail(`build 4: explicit front-matter updated did not produce a hash stub id, got: ${postId4}`)
  } else {
    const stub = path.join(site, 'public', postId4.replace('http://example.com/', ''), 'index.html')
    if (!fs.existsSync(stub)) fail(`build 4: stub page missing on disk: ${stub}`)
  }

  // Phase 5: no shuoshuo.yml at all -> theme ships one sample memo, visible in
  // the feed, on the timeline page and as a standalone page
  fs.unlinkSync(path.join(site, 'source/_data/shuoshuo.yml'))
  write('source/memos/index.md', `---
title: Memos
type: shuoshuo
---
`)
  run('5')
  const fifth = ids('5')
  if (!fifth.some(id => id.includes('/memos/2026-01-01T00-00'))) {
    fail('build 5: built-in sample memo missing from feed when data file absent')
  }
  const timeline = path.join(site, 'public/memos/index.html')
  if (!fs.existsSync(timeline) || !fs.readFileSync(timeline, 'utf8').includes("Hello, it")) {
    fail('build 5: sample memo not rendered on the /memos/ timeline page')
  }
  if (!fs.existsSync(path.join(site, 'public/memos/2026-01-01T00-00/index.html'))) {
    fail('build 5: sample memo standalone page missing')
  }

  if (!process.exitCode) console.log('SMOKE OK: feed entry ids stable across CI mtimes; new memo synced')
}
