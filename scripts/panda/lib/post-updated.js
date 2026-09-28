// Panda theme — post update-notification identity (pure module: no `hexo` at
// module scope; theme scripts are loaded via vm and required submodules have no
// lexical `hexo`).
//
// Re-push semantics: a post is re-pushed in the feed only when its front-matter
// carries an explicit, truthy `updated:` date (mtime is checkout time on CI and
// must never drive identity). The stub id is a hash of the raw file bytes:
// same content -> same id on any machine; any edit -> exactly one fresh id.
'use strict'

const crypto = require('crypto')

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/
const UPDATED_LINE_RE = /^updated\s*:\s*(.*?)\s*$/m
const DATE_LINE_RE = /^date\s*:.*$/m

// Front-matter `updated` counts only when it is a real value. `updated: false`
// (the scaffold default), `updated:`, `updated: null` and `updated: ~` all mean
// "never revised" — and Hexo itself treats them as absent (mtime fallback), so
// honoring them here would re-open the mtime leak.
function explicitUpdated (post) {
  const fm = FM_RE.exec(String(post.raw || ''))
  if (!fm) return false
  const line = UPDATED_LINE_RE.exec(fm[1])
  if (!line) return false
  const value = line[1].replace(/\s+#.*$/, '')
  return value !== '' && !/^(false|null|~)$/.test(value)
}

// Stub identity derives from the file bytes (front-matter included): editing
// body/tags or bumping `updated:` all change the hash -> readers re-push once.
function contentStamp (post) {
  return crypto.createHash('sha1').update(String(post.raw || '')).digest('hex').slice(0, 10)
}

// Ensure new posts carry `updated: false` so the re-push switch is visible.
// Inserted right after the `date:` line; posts without a date (e.g. series
// index.md, which is not a feed entry) are left alone. Returns null when no
// change is needed (already has the key, or no front-matter/date).
function ensureUpdatedField (content) {
  const s = String(content || '')
  const fm = FM_RE.exec(s)
  if (!fm) return null
  if (UPDATED_LINE_RE.test(fm[1])) return null
  if (!DATE_LINE_RE.test(fm[1])) return null
  const head = s.slice(0, fm[0].length)
  const tail = s.slice(fm[0].length)
  return head.replace(DATE_LINE_RE, m => `${m}\nupdated: false`) + tail
}

module.exports = { explicitUpdated, contentStamp, ensureUpdatedField }
