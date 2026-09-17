// Panda theme — shared memos (shuoshuo) utilities (pure module: no `hexo` at
// module scope; theme scripts are loaded via vm and required submodules have no
// lexical `hexo`, so every function takes hexo explicitly).
// Forked from SpeechlessPanda/blog-s-code scripts/lib/memo-utils.js (Apache-2.0).
//
// Dates in the memos data file are plain local times ("2026-08-23 23:30") written
// in the SITE timezone (hexo `config.timezone`). Parsing them through the site
// timezone keeps slugs/ids stable no matter where the build runs (local vs CI).
'use strict'

const moment = require('moment-timezone')

// ===== theme config accessors =====

function memosConfig (hexo) {
  return (hexo.theme.config && hexo.theme.config.memos) || {}
}

function memosEnabled (hexo) {
  return memosConfig(hexo).enable !== false
}

function memosDataKey (hexo) {
  return memosConfig(hexo).data_key || 'shuoshuo'
}

// Memos page path, normalized with leading+trailing slash ('/memos/')
function memosPath (hexo) {
  let p = memosConfig(hexo).path || '/memos/'
  if (!p.startsWith('/')) p = '/' + p
  if (!p.endsWith('/')) p += '/'
  return p
}

function getMemos (hexo, localsData) {
  const data = localsData || hexo.locals.get('data') || {}
  return data[memosDataKey(hexo)] || []
}

function siteLang (hexo) {
  const lang = hexo.config && hexo.config.language
  return Array.isArray(lang) ? lang[0] : (lang || 'en')
}

function siteTimezone (hexo) {
  return (hexo.config && hexo.config.timezone) || 'UTC'
}

// ===== pure helpers =====

function escapeXml (s) {
  return String(s == null ? '' : s).replace(/[<>&'"]/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ))
}

// CDATA must never contain "]]>", split-escape it
function cdata (s) {
  return '<![CDATA[' + String(s == null ? '' : s).replace(/\]\]>/g, ']]]]><![CDATA[>') + ']]>'
}

function stripHtml (html) {
  return String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

// Parse "2026-08-23 23:30" (seconds optional) in the site timezone
function parseMemoDate (hexo, str) {
  const t = String(str == null ? '' : str).trim()
  if (!t) return null
  const m = moment.tz(t, ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm'], siteTimezone(hexo))
  return m.isValid() ? m.toDate() : null
}

// Date -> path-safe timestamp "2026-08-25T15-30" (site timezone wall time)
function pathStamp (hexo, date) {
  return moment(date).tz(siteTimezone(hexo)).format('YYYY-MM-DDTHH-mm')
}

// Memo data key: explicit `key` wins, otherwise derived from the date.
// Must stay in sync with the fallback formula in layout/includes/page/shuoshuo.pug.
function memoDataKey (item) {
  return item.key || ('memo-' + String(item.date || '').replace(/[^0-9a-zA-Z]/g, '-'))
}

// Stable unique slug per memo (<path><slug>/). Collisions within the same minute
// are de-duplicated by file order (file order is stable, so slugs are stable).
// Returns an array as long as `memos`; entries with invalid dates get null.
function memoSlugs (hexo, memos) {
  const used = new Set()
  return memos.map(item => {
    const date = parseMemoDate(hexo, item.date)
    if (!date) return null
    const stamp = pathStamp(hexo, date)
    let slug = stamp
    for (let i = 2; used.has(slug); i++) slug = `${stamp}-${i}`
    used.add(slug)
    return slug
  })
}

module.exports = {
  memosConfig,
  memosEnabled,
  memosDataKey,
  memosPath,
  getMemos,
  siteLang,
  siteTimezone,
  escapeXml,
  cdata,
  stripHtml,
  parseMemoDate,
  pathStamp,
  memoDataKey,
  memoSlugs
}
