// Panda theme — per-build state for the discovery features.
//
// One content index per generate cycle, one validated config, one mirror map that
// the head partial reads. The index is expensive (it walks every post and page),
// so llms.txt, sitemap.xml, the Markdown mirrors and the portal must all reuse it
// instead of re-scanning the models.
//
// Reset happens in `before_generate` so a `hexo server` session picks up edits
// instead of serving the first build's content forever.
'use strict'

const { normalizeDiscoveryConfig } = require('./discovery-config')
const { collectFromHexo } = require('./content-collect')

const state = {
  config: null,
  index: null,
  mirrors: new Map(), // route path → absolute URL of its Markdown mirror
  warningsIssued: new Set()
}

function reset () {
  state.config = null
  state.index = null
  state.mirrors = new Map()
  state.warningsIssued = new Set()
}

function config (hexo) {
  if (!state.config) state.config = normalizeDiscoveryConfig(hexo.theme.config)
  return state.config
}

function index (hexo, locals) {
  if (!state.index) state.index = collectFromHexo(hexo, locals)
  return state.index
}

function keyVariants (routePath) {
  const p = String(routePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!p) return []
  const variants = new Set([p])
  if (p.endsWith('/')) variants.add(`${p}index.html`)
  if (/index\.html$/i.test(p)) variants.add(p.replace(/index\.html$/i, ''))
  const noSlash = p.replace(/\/+$/, '')
  variants.add(noSlash)
  variants.add(`${noSlash}/`)
  return [...variants]
}

function registerMirror (routePath, url) {
  for (const key of keyVariants(routePath)) state.mirrors.set(key, url)
}

function hasMirrorUrl (url) {
  if (!url) return false
  for (const value of state.mirrors.values()) {
    if (value === url) return true
  }
  return false
}

function mirrorFor (routePath) {
  for (const key of keyVariants(routePath)) {
    const hit = state.mirrors.get(key)
    if (hit) return hit
  }
  return null
}

function issueOnce (hexo, key, level, message) {
  if (state.warningsIssued.has(key)) return
  state.warningsIssued.add(key)
  hexo.log[level](message)
}

/** Validate config once per build; invalid values are reported, then defaults apply. */
function reportConfig (hexo) {
  const cfg = config(hexo)
  for (const error of cfg.errors) issueOnce(hexo, `cfg:${error}`, 'warn', `[panda] config: ${error}`)
  return cfg
}

module.exports = { state, reset, config, index, registerMirror, mirrorFor, hasMirrorUrl, issueOnce, reportConfig }
