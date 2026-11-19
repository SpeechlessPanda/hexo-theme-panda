// Panda theme — `hexo panda verify-ai`.
//
// The command exists because "the files look fine" is not evidence. It checks the
// artefacts a deploy actually ships: every `.html`/`.txt`/`.xml`/`.md` file under
// `public/`. That way a file deleted by a later build step, or a stale `public/`
// from an older theme, is caught instead of being re-rendered and silently approved.
// Nothing is written and no network is touched, so it runs in CI after `hexo generate`.
'use strict'

const fs = require('fs')
const path = require('path')

const { verifyDiscovery } = require('./lib/verify')
const { config: discoveryConfig, index: contentIndex, reset } = require('./lib/discovery-state')
const { markdownTargets } = require('./lib/content-collect')
const { mirrorRoutePath } = require('./lib/site-url')

const CHECKED_RE = /\.(?:html?|txt|xml|md)$/i

function rootPath (routePath) {
  return String(routePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
}

function walk (dir, base, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(abs, base, out)
    else out.push(path.relative(base, abs).replace(/\\/g, '/'))
  }
  return out
}

/** Read the generated site: route path (forward slashes) → file text. */
function readPublic (publicDir) {
  const files = new Map()
  if (!fs.existsSync(publicDir)) return files
  for (const route of walk(publicDir, publicDir, [])) {
    if (!CHECKED_RE.test(route)) continue
    try {
      files.set(route, fs.readFileSync(path.join(publicDir, route), 'utf8'))
    } catch (_) {
      files.set(route, '')
    }
  }
  return files
}

/**
 * Expected outputs, derived from the same config and content index the generators
 * use — so a disagreement between the two surfaces here instead of in production.
 */
function expectations (hexo, cfg) {
  const root = (hexo.config && hexo.config.root) || '/'
  const expected = {
    root,
    robots: null,
    sitemap: null,
    llms: null,
    portal: null,
    rights: null,
    pathStyle: cfg.ai.markdown.path_style,
    mirrors: [],
    excludedSources: [],
    excludedMirrorRoutes: [],
    excludedPageRoutes: []
  }

  if (cfg.discovery.sitemap.provider === 'panda') expected.sitemap = { path: cfg.discovery.sitemap.path }
  if (cfg.discovery.robots.provider === 'panda') {
    expected.robots = { path: cfg.discovery.robots.path, policy: cfg.discovery.robots, sitemap: expected.sitemap }
  }
  if (cfg.ai.enable && cfg.ai.llms_txt.enable) expected.llms = { path: cfg.ai.llms_txt.path }
  if (cfg.ai.enable && cfg.ai.portal.enable) expected.portal = `${rootPath(cfg.ai.portal.path)}index.html`
  if (cfg.ai.enable && cfg.ai.rights.enable) expected.rights = `${rootPath(cfg.ai.rights.path)}index.html`
  const homeIcon = cfg.ai.enable && cfg.ai.portal.enable && cfg.ai.portal.social_icon.enable
  if (homeIcon) {
    // The robot lives in the author card, which renders in the aside on the home
    // page. Any page using the `home` layout reuses that card, so check whichever
    // page the site actually serves at the root.
    const asideHome = (hexo.theme.config.aside || {}).display || {}
    if (asideHome.home !== false) {
      const pages = hexo.model('Page').toArray()
      const holder = pages.find(page => page.layout === 'home')
      const about = (hexo.theme.config.home_about || {}).source || 'about/index.md'
      const fallback = pages.find(page => page.source === about)
      const target = holder || fallback
      expected.homeIcon = { page: target ? rootPath(target.path) : 'index.html' }
    }
  }

  if (!cfg.ai.enable || !cfg.ai.markdown.enable) return expected

  const index = contentIndex(hexo, hexo.locals.toObject())
  for (const target of markdownTargets(index, hexo.theme.config)) {
    const route = mirrorRoutePath(target.path, cfg.ai.markdown.path_style)
    if (route) expected.mirrors.push(route)
  }
  for (const item of index.excluded) {
    if (item.source) expected.excludedSources.push(item.source)
    const route = mirrorRoutePath(item.path, cfg.ai.markdown.path_style)
    if (route) expected.excludedMirrorRoutes.push(route)
    // Excluded pages legitimately have no discovery links; only a page the theme
    // considers public must advertise llms.txt.
    if (item.path) expected.excludedPageRoutes.push(`${rootPath(item.path).replace(/\/+$/, '')}/index.html`)
  }
  return expected
}

function report (hexo, outcome) {
  for (const result of outcome.results) {
    if (result.ok) hexo.log.info(`[verify-ai] ok    ${result.id}`)
    else hexo.log.error(`[verify-ai] FAIL  ${result.id} — ${result.detail}`)
  }
  if (outcome.ok) hexo.log.info(`[verify-ai] ${outcome.results.length} checks passed`)
  else hexo.log.error(`[verify-ai] ${outcome.failed} of ${outcome.results.length} checks failed`)
  return outcome
}

function verifyConsole () {
  const hexo = this
  const publicDir = hexo.public_dir
  if (!publicDir || !fs.existsSync(publicDir)) {
    return Promise.reject(new Error('[panda] verify-ai needs a build: run `hexo generate` first '
      + `(${publicDir || 'public/'} does not exist)`))
  }
  reset()
  return hexo.load()
    .then(() => {
      const files = readPublic(publicDir)
      const cfg = discoveryConfig(hexo)
      const outcome = verifyDiscovery({ files, expected: expectations(hexo, cfg), root: (hexo.config && hexo.config.root) || '/' })
      report(hexo, outcome)
      if (!outcome.ok) process.exitCode = 1
      return outcome
    })
}

function pandaConsole (args = {}) {
  const sub = Array.isArray(args._) ? args._[0] : null
  if (sub === 'verify-ai') return verifyConsole.call(this, args)
  this.log.error(`Unknown subcommand ${JSON.stringify(sub || '')}. Available: panda verify-ai`)
  process.exitCode = 1
  return Promise.resolve()
}

function register (hexo) {
  hexo.extend.console.register('panda', 'Panda theme utilities (`panda verify-ai`)', {
    usage: '<command> [options]'
  }, pandaConsole)
}

module.exports = { register, verifyConsole, expectations, readPublic, pandaConsole }
