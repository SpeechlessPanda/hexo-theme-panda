// Panda theme — URL math for the discovery generators.
//
// Hexo has two URL notions and mixing them is how sub-path deployments break:
//   route path   'blog/2026/01/01/post/index.html'  (relative to public/)
//   site path    '/blog/2026/01/01/post/'           (what url_for() returns)
//   absolute URL 'https://host/blog/2026/01/01/post/' (canonical)
//
// Absolute URLs are built exactly like hexo-util's `full_url_for`, because that
// is what `page.permalink` and the <link rel="canonical"> already emit. `config.url`
// is expected to carry the deployment sub-path (Hexo's documented setup); `root`
// is applied only to site paths.
'use strict'

function encodePath (value) {
  const raw = String(value == null ? '' : value)
  if (!raw) return ''
  // Decode once, then encode once, so an already-encoded route is never
  // double-encoded (`%E4%B8%AD` stays `%E4%B8%AD`, not `%25E4...`).
  let decoded
  try {
    decoded = decodeURI(raw)
  } catch (_) {
    decoded = raw
  }
  // `encodeURI` leaves `?` and `#` untouched because they are legal in a URI, but
  // in a *path* they terminate it. A route path may contain them (a file name
  // can), so escape them after encoding; a literal `%` is already `%25` by now.
  return encodeURI(decoded).replace(/\?/g, '%3F').replace(/#/g, '%23')
}

function normalizeRoot (root) {
  let r = String(root == null ? '/' : root).replace(/\\/g, '/').trim()
  if (!r.startsWith('/')) r = '/' + r
  if (!r.endsWith('/')) r += '/'
  return r.replace(/\/{2,}/g, '/')
}

function stripLeadingSlash (value) {
  return String(value == null ? '' : value).replace(/\\/g, '/').replace(/^\/+/, '')
}

/**
 * Site path (root-prefixed, never double-slashed) for a route path.
 * The result always starts with '/' and keeps the route's directory form.
 */
function sitePath (root, routePath, options) {
  const r = normalizeRoot(root)
  const p = stripLeadingSlash(routePath)
  const joined = encodePath((r + p).replace(/\/{2,}/g, '/'))
  return options ? prettify(joined, options) : joined
}

/**
 * `config.pretty_urls` as Hexo reads it. Reproduced rather than required from
 * hexo-util so this module stays dependency-free, but the defaults and the two
 * regexes are copied verbatim from hexo-util's `pretty_urls`.
 *
 * This is the single source of truth for the *shape* of every URL the theme
 * emits: `<link rel="canonical">` is produced by Hexo's own `urlNoIndex` helper
 * with these same options, so sitemap locs, llms.txt links and mirror URLs agree
 * with the canonical byte for byte. Hardcoding the directory form here is what
 * broke sites that keep `trailing_index: true` (the Hexo default).
 */
function prettyUrlsOptions (config) {
  const options = (config && config.pretty_urls) || {}
  return {
    trailing_index: options.trailing_index !== false,
    trailing_html: options.trailing_html !== false
  }
}

/** Apply `config.pretty_urls` to an already-encoded URL. */
function prettify (url, options) {
  const opts = options || { trailing_index: true, trailing_html: true }
  const indexPattern = /index\.html$/
  let out = String(url || '')
  if (opts.trailing_index === false) out = out.replace(indexPattern, '')
  if (opts.trailing_html === false && !indexPattern.test(out)) {
    out = out.replace(/\.html$/, '')
  }
  return out
}

/**
 * Absolute URL for a *page route*, matching `<link rel="canonical">`.
 *
 * Hexo's canonical helper (`urlNoIndex`) runs `pretty_urls` over `page.permalink`,
 * which always names the real file — `…/post/index.html`. A route path taken from
 * a Post model is already the directory form `…/post/`, so applying
 * `pretty_urls` alone would leave the two disagreeing whenever
 * `trailing_index: true` (Hexo's default, and this blog's setting). Adding the
 * file name first makes both paths compute the same string.
 */
function pageUrl (siteUrl, routePath, options, root) {
  const p = stripLeadingSlash(routePath)
  const withIndex = (!p || p.endsWith('/')) ? `${p}index.html` : p
  const base = String(siteUrl || '').replace(/\/+$/, '')
  const joined = encodePath(`${base}/${withIndex}`.replace(/([^:])\/{2,}/g, '$1/'))
  const pretty = options ? prettify(joined, options) : joined
  // `trailing_index: false` strips the file name again, which is the directory
  // form the site actually serves; nothing else to do.
  return pretty
}

/** Site-relative counterpart of {@link pageUrl} (root-prefixed, no origin). */
function pagePath (root, routePath, options) {
  const p = stripLeadingSlash(routePath)
  const withIndex = (!p || p.endsWith('/')) ? `${p}index.html` : p
  const r = normalizeRoot(root)
  const joined = encodePath((r + withIndex).replace(/\/{2,}/g, '/'))
  return options ? prettify(joined, options) : joined
}

/**
 * Absolute URL for a route path, mirroring hexo-util's `full_url_for`:
 * `config.url` + '/' + route path, slashes collapsed, then `pretty_urls`.
 * `options` is the {@link prettyUrlsOptions} result; omit it to keep trailing
 * `index.html` (Hexo's default).
 */
function absoluteUrl (siteUrl, routePath, options) {
  const base = String(siteUrl || '').replace(/\/+$/, '')
  const p = stripLeadingSlash(routePath)
  const joined = encodePath(`${base}/${p}`.replace(/([^:])\/{2,}/g, '$1/'))
  return options ? prettify(joined, options) : joined
}

/**
 * Markdown mirror route path for a page route path.
 *
 * v2 of the llms.txt proposal allows both `page.html.md` (append) and
 * `page.md` (replace) for file-style URLs, and `index.md` for directory URLs.
 * `path_style: 'index'` (default) uses the directory form; `suffix` always
 * appends `.md` to the HTML file name, which is unambiguous for any URL shape.
 *
 * Returns null for routes that are not HTML pages.
 */
function mirrorRoutePath (routePath, pathStyle) {
  const p = stripLeadingSlash(routePath)
  if (!p) return null
  if (/\.md$/i.test(p)) return null // never mirror a mirror
  const isIndex = /(^|\/)index\.html?$/i.test(p) || p.endsWith('/')
  const isIndexFile = /(^|\/)index\.html?$/i.test(p)
  const isHtml = /\.html?$/i.test(p) || p.endsWith('/')
  if (!isIndex && !isHtml) return null
  // `suffix` appends `.md` to the HTML *file name*. A directory-form route
  // (`post/2026/01/01/a/`, which is what Hexo models carry) has no file name, so
  // appending straight to it produced `a/.md` — an empty name that 404s and makes
  // every `<link rel="alternate">` point at nothing.
  if (pathStyle === 'suffix') {
    // Already a file name: append once.
    if (isIndexFile) return `${p}.md`
    // Directory form: name the file that the URL actually serves.
    if (isIndex) return `${p.endsWith('/') ? p : `${p}/`}index.html.md`
    return `${p}.md`
  }
  if (isIndex) {
    const dir = p.replace(/index\.html?$/i, '')
    return `${dir ? `${dir.replace(/\/$/, '')}/` : ''}index.md`
  }
  return `${p}.md`
}

/**
 * The public URL an agent should request for a mirror route path.
 * `llms.txt` and the <link rel="alternate"> both use this string.
 */
function mirrorUrlPath (root, mirrorRoute, options) {
  if (!mirrorRoute) return null
  // The mirror is a real file: `…/post/index.md` is served at that exact path,
  // which is the form llms.txt v2 specifies for URLs without a file name.
  // Callers pass no `options`: `pretty_urls` must never rewrite a `.md` file.
  return sitePath(root, mirrorRoute, options)
}

function isExternalUrl (value) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(String(value || ''))
}

function isRelativeUrl (value) {
  const s = String(value || '')
  if (!s || s.startsWith('#') || s.startsWith('?') || s.startsWith('/')) return false
  return !isExternalUrl(s)
}

/**
 * Resolve a relative reference found inside a post body against the post's
 * absolute URL. Links that are already absolute, protocol-relative, in-page
 * anchors or mailto stay untouched.
 */
function resolveRelative (reference, baseUrl) {
  if (!isRelativeUrl(reference)) return reference
  const base = String(baseUrl || '')
  if (!base) return reference
  try {
    return new URL(reference, base).toString()
  } catch (_) {
    return reference
  }
}

/** Normalize a user-supplied site-relative or absolute URL to a site URL. */
function toSiteUrl (root, value) {
  const s = String(value == null ? '' : value).trim()
  if (!s) return null
  if (isExternalUrl(s)) return s
  if (s.startsWith('#')) return s
  return sitePath(root, s)
}

module.exports = {
  encodePath,
  normalizeRoot,
  sitePath,
  absoluteUrl,
  prettyUrlsOptions,
  prettify,
  pageUrl,
  pagePath,
  mirrorRoutePath,
  mirrorUrlPath,
  isExternalUrl,
  isRelativeUrl,
  resolveRelative,
  toSiteUrl
}
