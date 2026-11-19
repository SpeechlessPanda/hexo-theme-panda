// Panda theme — `hexo panda verify-ai` checks, kept pure for testing.
//
// Input is a snapshot of the generated site (route path → file content), plus the
// outputs the generators promised to produce. Nothing here touches the filesystem
// or a Hexo instance, so the checks run in unit tests against captured fixtures and
// in the console command against `public/`.
//
// Every check answers a question a reader can act on: does the file exist, is the
// URL absolute, does the advertised mirror exist, did excluded content leak.
'use strict'

const { mirrorRoutePath } = require('./site-url')
const { createMatcher } = require('./content-collect')

const INDEX_HTML_RE = /(^|\/)index\.html$/i
const MARKDOWN_LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
// Only markup the converter should have handled counts as residue. An author-written
// `<span id="x"></span>` is a deliberate anchor inside the source Markdown and must
// survive into the mirror; flagging it would force authors to strip their own
// anchors. These are the structures that only come from rendered HTML or theme tags:
// excerpts, comment-only markers, and block-level chrome.
const RESIDUAL_HTML_RE = /<!--\s*(?:more|tab|endtab|timeline|endtimeline)\s*-->|<(?:div|section|figure|aside|header|footer|script|style)\b/i

function normalize (routePath) {
  return String(routePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
}

function siblingsFor (routePath) {
  const p = normalize(routePath)
  // The site root is `index.html` on disk and `/` in a URL.
  if (!p) return ['index.html']
  const out = [p]
  if (INDEX_HTML_RE.test(p)) out.push(p.replace(/index\.html$/i, ''))
  if (p.endsWith('/')) out.push(`${p}index.html`)
  else out.push(`${p}/`, `${p}/index.html`)
  return out
}

function lookup (files, routePath) {
  for (const key of siblingsFor(routePath)) {
    if (files.has(key)) return files.get(key)
  }
  return null
}

function exists (files, routePath) {
  return lookup(files, routePath) != null
}

function check (results, id, run) {
  try {
    const problem = run()
    results.push(problem ? { id, ok: false, detail: problem } : { id, ok: true })
  } catch (error) {
    results.push({ id, ok: false, detail: error && error.message ? error.message : String(error) })
  }
}

function isAbsolute (url) {
  return /^https?:\/\//i.test(String(url || ''))
}

/**
 * Strip the origin and the deployment root from a URL so it can be looked up in
 * the route map: `https://example.com/blog/post/` and `/blog/post/` both become
 * `post/`. A root of `/` leaves site-absolute URLs unchanged.
 */
function rootRelative (url, root) {
  const value = String(url || '').replace(/^[a-z][a-z\d+.-]*:\/\/[^/]+/i, '')
  const r = String(root || '/').replace(/\/+$/, '')
  const pathOnly = value.replace(/^\/+/, '')
  const stripped = (!r || r === '/')
    ? pathOnly
    : (pathOnly.startsWith(`${r.replace(/^\/+/, '')}/`) ? pathOnly.slice(r.replace(/^\/+/, '').length + 1) : pathOnly)
  // A published URL is percent-encoded; the route map keys hold the raw file path
  // (`中文标题`, not `%E4%B8%AD%E6%96%87...`), so decode before comparing.
  try {
    return decodeURIComponent(stripped)
  } catch (_) {
    return stripped
  }
}

function verifyRobots (files, expected, results) {
  if (!expected.robots) return
  check(results, 'robots.txt', () => {
    const text = lookup(files, expected.robots.path)
    if (text == null) return `${expected.robots.path} was not generated`
    const users = text.match(/^User-agent:\s*\S+/gim) || []
    if (!users.length) return 'no User-agent group'
    if (!/^User-agent:\s*\*/im.test(text)) return 'missing the catch-all `User-agent: *` group'
    const sitemaps = text.match(/^Sitemap:\s*(\S+)/gim) || []
    if (!sitemaps.length) return 'no Sitemap line'
    for (const line of sitemaps) {
      const url = line.replace(/^Sitemap:\s*/i, '')
      if (!isAbsolute(url)) return `Sitemap is not absolute: ${url}`
    }
    if (expected.sitemap && !sitemaps.some(line => line.includes(expected.sitemap.path))) {
      return `Sitemap line does not point at ${expected.sitemap.path}`
    }
    const policies = expected.robots.policy || {}
    if (policies.allow_search_bots === false) return 'search crawlers are blocked by policy'
    if (!/^Allow:\s*\//im.test(text) && !/^Disallow:\s*$/im.test(text)) return 'no Allow rule for public pages'
    if (policies.ai_training === 'deny' && !/^Disallow:\s*\/\s*$/im.test(text)) return 'ai_training=deny has no Disallow rule'
    return null
  })
}

function verifyLlms (files, expected, results) {
  if (!expected.llms) return
  check(results, 'llms.txt', () => {
    const text = lookup(files, expected.llms.path)
    if (text == null) return `${expected.llms.path} was not generated`
    const lines = text.split(/\r?\n/)
    if (!/^#\s+\S/.test(lines[0] || '')) return 'first line is not an H1'
    if (!/^>\s*\S/m.test(text)) return 'no blockquote summary'
    const headings = text.match(/^##\s+\S/gm) || []
    if (headings.length < 2) return 'fewer than two H2 sections'
    if (/{{|{%|TODO|FIXME|%s/.test(text)) return 'contains a placeholder or unrendered template token'
    let cursor
    MARKDOWN_LINK_RE.lastIndex = 0
    while ((cursor = MARKDOWN_LINK_RE.exec(text))) {
      const target = cursor[1]
      if (!isAbsolute(target) && !target.startsWith('/') && !target.startsWith('#')) {
        return `relative link in llms.txt: ${target}`
      }
      if (/\.md(?:\?|#|$)/i.test(target) && !exists(files, rootRelative(target, expected.root))) {
        return `llms.txt links to a missing mirror: ${target}`
      }
    }
    return null
  })
}

function verifySitemap (files, expected, results) {
  if (!expected.sitemap) return
  check(results, 'sitemap.xml', () => {
    const text = lookup(files, expected.sitemap.path)
    if (text == null) return `${expected.sitemap.path} was not generated`
    if (!/<urlset\s/.test(text)) return 'not a sitemap urlset'
    const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
    if (!locs.length) return 'no <loc> entries'
    for (const loc of locs) {
      if (!isAbsolute(loc)) return `loc is not absolute: ${loc}`
      if (/\.md(?:\?|#|$)/i.test(loc)) return `sitemap lists a Markdown mirror: ${loc}`
      // Both URL shapes are legitimate: Hexo's `pretty_urls.trailing_index` decides
      // whether the canonical is `…/post/` or `…/post/index.html`. What matters is
      // that each loc resolves to a generated page, so that is what is checked.
      if (!exists(files, rootRelative(loc, expected.root))) return `sitemap URL has no generated page: ${loc}`
    }
    for (const path of expected.excludedPaths || []) {
      if (locs.some(loc => rootRelative(loc, expected.root).replace(/\/$/, '') === String(path).replace(/^\/+|\/+$/g, ''))) {
        return `excluded page appears in the sitemap: ${path}`
      }
    }
    for (const loc of locs) {
      if (/noindex/i.test(loc)) return `sitemap lists a noindex URL: ${loc}`
    }
    return null
  })
}

function verifyMirrors (files, expected, results) {
  if (!expected.mirrors || !expected.mirrors.length) return
  check(results, 'Markdown mirrors', () => {
    const missing = expected.mirrors.filter(route => !exists(files, route))
    if (missing.length) return `${missing.length} mirror(s) missing, e.g. ${missing[0]}`
    for (const route of expected.mirrors) {
      const text = lookup(files, route)
      if (!String(text || '').trim()) return `empty mirror: ${route}`
      if (/^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(text)) return `front matter leaked into ${route}`
      if (/{{|{%/.test(text)) return `Hexo template syntax in ${route}`
      if (RESIDUAL_HTML_RE.test(text)) return `residual HTML in ${route}`
      if (/\{#[^}]*#\}|\{:[^}]*:\}/.test(text)) return `Hexo tag output in ${route}`
    }
    for (const route of expected.excludedMirrorRoutes || []) {
      if (exists(files, route)) return `excluded content has a mirror: ${route}`
    }
    return null
  })
}

function verifyHeadLinks (files, expected, results) {
  check(results, 'HTML discovery links', () => {
    const expectedMirrors = new Set(expected.mirrors || [])
    for (const [route, html] of files) {
      if (!INDEX_HTML_RE.test(route)) continue
      if (route === expected.llms || route === expected.sitemap || route === expected.robots) continue
      const mirror = mirrorRoutePath(route, expected.pathStyle)
      const hasMirror = mirror && expectedMirrors.has(mirror)
      const alternate = html.match(/<link[^>]+rel="alternate"[^>]+type="text\/markdown"[^>]+href="([^"]+)"/i)
      if (hasMirror) {
        if (!alternate) return `${route} has a mirror but no alternate link`
        if (!exists(files, rootRelative(alternate[1], expected.root))) {
          return `${route} advertises a missing mirror: ${alternate[1]}`
        }
      } else if (alternate) {
        return `${route} advertises a mirror that was not generated: ${alternate[1]}`
      }
      if (expected.llms && !(expected.excludedPageRoutes || []).includes(route)) {
        const described = html.match(/<link[^>]+rel="describedby"[^>]+href="([^"]+)"/i)
        if (markerAllows(html) && !described) return `${route} has no describedby link to llms.txt`
        if (described && !described[1].includes(expected.llms.path)) {
          return `${route} describedby does not point at ${expected.llms.path}`
        }
      }
    }
    return null
  })
}

function markerAllows (html) {
  return !/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html)
}

function verifyPages (files, expected, results) {
  check(results, 'AI portal page', () => {
    if (!expected.portal) return null
    const html = lookup(files, expected.portal)
    if (html == null) return `${expected.portal} was not generated`
    if (!/<main|<article|article-container/.test(html)) return 'portal has no readable content container'
    if (expected.llms && !html.includes(expected.llms.path)) return 'portal does not link llms.txt'
    if (expected.sitemap && !html.includes(expected.sitemap.path)) return 'portal does not link the sitemap'
    if (expected.rights && !html.includes(expected.rights.replace(/index\.html$/i, ''))) return 'portal does not link the rights page'
    return null
  })

  check(results, 'Rights page', () => {
    if (!expected.rights || !expected.license) return null
    const html = lookup(files, expected.rights)
    if (html == null) return `${expected.rights} was not generated`
    if (!html.includes(expected.license)) return `license string not rendered: ${expected.license}`
    if (expected.licenseUrl && !html.includes(expected.licenseUrl)) return 'license URL not rendered'
    return null
  })
}

function verifyHomeIcon (files, expected, results) {
  if (!expected.homeIcon) return
  check(results, 'Home robot icon', () => {
    const html = lookup(files, expected.homeIcon.page)
    if (html == null) return `${expected.homeIcon.page} was not generated`
    const rows = [...html.matchAll(/class="[^"]*card-info-social-icons[^"]*"/g)]
    if (!rows.length) return 'no social icon row on the home page'
    const rowStart = rows[0].index
    const rest = html.slice(rowStart)
    const robot = rest.search(/class="[^"]*ai-reading-icon/)
    if (robot < 0) return 'the robot icon is missing from the home page'
    const links = [...rest.matchAll(/class="social-icon(?![^"]*ai-reading-icon)/g)]
    if (links.length && links[links.length - 1].index > robot) return 'the robot icon is not the last social icon'
    if (!/<a[^>]+class="[^"]*ai-reading-icon[^"]*"[^>]*aria-label="[^"]+"/.test(rest)) return 'the robot link has no aria-label'
    if (!/<a[^>]+class="[^"]*ai-reading-icon[^"]*"[^>]*title="[^"]+"/.test(rest)) return 'the robot link has no title'
    if (expected.portal && !rest.includes(rootRelative(expected.portal, expected.root).replace(/index\.html$/, ''))) {
      return 'the robot link does not point at the portal page'
    }
    const occurrences = (html.match(/ai-reading-icon/g) || []).length
    if (occurrences > 1) return `the robot icon renders ${occurrences} times on the home page`
    return null
  })
}

function verifyNoLeaks (files, expected, results) {
  check(results, 'No leaked internals', () => {
    const paths = expected.excludedSources || []
    const matcher = createMatcher(paths)
    if (!paths.length) return null
    for (const [route, text] of files) {
      if (!/\.(?:txt|xml|md|html)$/i.test(route)) continue
      for (const path of paths) {
        if (route.endsWith(path) || matcher(route)) return `excluded source file was written: ${route}`
      }
      const sourceRefs = String(text).match(/_posts\/[^\s"')]+/g) || []
      for (const ref of sourceRefs) {
        if (matcher(ref)) return `excluded source path appears in ${route}: ${ref}`
      }
    }
    return null
  })
}

/**
 * @param {object} input
 * @param {Map<string,string>} input.files    route path (forward slashes) → file content
 * @param {object} input.expected             outputs the generators promised
 * @param {string} [input.root]               deployment root, default '/'
 */
function verifyDiscovery (input) {
  const files = input.files instanceof Map ? input.files : new Map(Object.entries(input.files || {}))
  const expected = { ...(input.expected || {}), root: input.root || (input.expected && input.expected.root) || '/' }
  const results = []
  verifyRobots(files, expected, results)
  verifyLlms(files, expected, results)
  verifySitemap(files, expected, results)
  verifyMirrors(files, expected, results)
  verifyHeadLinks(files, expected, results)
  verifyPages(files, expected, results)
  verifyHomeIcon(files, expected, results)
  verifyNoLeaks(files, expected, results)
  return {
    results,
    failed: results.filter(r => !r.ok).length,
    ok: results.every(r => r.ok)
  }
}

module.exports = { verifyDiscovery, normalize, lookup, rootRelative }
