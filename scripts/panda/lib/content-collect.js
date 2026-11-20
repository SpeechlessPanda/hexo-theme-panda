// Panda theme — one pass over the site's content for every discovery output.
//
// llms.txt, sitemap.xml, the Markdown mirrors and the /ai/ portal all need the
// same answer to "which content is public, and where does it live?". Computing it
// once per build (and passing the result around) is what keeps a 500-post site
// from doing four full model scans with four subtly different filters.
//
// Pure module: callers pass plain post/page objects, so it is testable without a
// Hexo instance. `collectFromHexo` is the thin adapter for the real build.
'use strict'

const { parseSeriesIndex, classifyPosts, seriesPagePath, toTime } = require('./blog-series')
const { explicitUpdated } = require('./post-updated')

const NOINDEX_RE = /\bnoindex\b/i
const HTML_EXT_RE = /\.(?:html?|htm)$/i

function truthy (value) {
  return value === true || value === 'true'
}

// Front-matter booleans written as quoted YAML strings (`ai_readable: "false"`)
// parse to a string, and `!== false` then reads the opt-out as "on". The theme
// config layer already accepts both spellings (`asBool` in discovery-config);
// per-post switches must agree, or the same value means opposite things
// depending on which file it lives in. `undefined` means "not written".
function boolFlag (value, fallback) {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase()
    if (text === 'true') return true
    if (text === 'false') return false
  }
  return fallback
}

/**
 * Front-matter switches shared by every discovery output.
 *   noindex: true            exclude from sitemap, llms.txt, mirrors, portal
 *   robots: 'noindex'        same, in the spelling some sites already use
 *   sitemap: false           exclude from sitemap.xml only
 *   ai_readable: false       exclude from llms.txt, mirrors, portal
 *   markdown: false          exclude from Markdown mirrors only
 * Absent keys mean "on": a post that predates these switches stays discoverable.
 */
function flags (item) {
  const src = item || {}
  const robots = src.robots == null ? '' : String(src.robots)
  const noindex = truthy(src.noindex) || NOINDEX_RE.test(robots) || src.indexing === false
  const aiReadable = boolFlag(src.ai_readable, true)
  return {
    noindex,
    sitemap: !noindex && boolFlag(src.sitemap, true),
    ai: !noindex && aiReadable,
    markdown: !noindex && aiReadable && boolFlag(src.markdown, true)
  }
}

/** Minimal glob → RegExp: `*` within a segment, `**` across segments, `?` one char. */
function globToRegExp (pattern) {
  const normalized = String(pattern || '').replace(/\\/g, '/').replace(/^\/+/, '')
  let out = ''
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (ch === '*') {
      if (normalized[i + 1] === '*') {
        out += '.*'
        i++
        if (normalized[i + 1] === '/') i++
      } else {
        out += '[^/]*'
      }
    } else if (ch === '?') {
      out += '[^/]'
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${out}$`)
}

function createMatcher (patterns) {
  const list = Array.isArray(patterns) ? patterns.filter(p => typeof p === 'string' && p.trim()) : []
  if (!list.length) return () => false
  const rules = list.map(pattern => {
    const raw = pattern.trim()
    // A trailing slash means "everything under this directory".
    if (/\/$/.test(raw) && !/[*?]/.test(raw)) {
      const reg = globToRegExp(`${raw.replace(/\/+$/, '')}/**`)
      return value => reg.test(value) || value === raw.replace(/\/+$/, '')
    }
    const reg = globToRegExp(raw)
    const bare = raw.replace(/^\/+/, '')
    return value => reg.test(value) || reg.test(`/${value}`) || value === bare || value === `/${bare}`
  })
  return value => {
    const v = String(value == null ? '' : value).replace(/\\/g, '/').replace(/^\/+/, '')
    return rules.some(rule => rule(v))
  }
}

function stripHtml (html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanDescription (value, maxLength = 200) {
  if (value == null) return null
  const text = stripHtml(value)
  if (!text) return null
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`
}

function formatDate (date) {
  if (!date) return null
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.valueOf())) return null
  return d.toISOString().slice(0, 10)
}

function isoDateTime (date) {
  if (!date) return null
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.valueOf())) return null
  return d.toISOString()
}

function safePath (item) {
  if (!item) return null
  if (typeof item.path === 'string' && item.path) return item.path.replace(/\\/g, '/').replace(/^\/+/, '')
  return null
}

function isHtmlRoute (path) {
  if (!path) return false
  return HTML_EXT_RE.test(path) || path.endsWith('/')
}

/** Public, indexable page types. Everything else (shuoshuo, 404, feed stubs) is skipped. */
const NON_INDEXABLE_TYPES = new Set(['shuoshuo', '404'])

/**
 * Updated time that is actually written down. Hexo falls back to the file's mtime
 * when a post has no front-matter `updated:`, and on CI every checkout rewrites the
 * mtime — using it would claim every page changed on every deploy. Only an explicit
 * `updated:` counts; otherwise the publish date is the honest answer.
 */
function realUpdated (post, fallback) {
  if (post && typeof post.raw === 'string' && explicitUpdated(post)) {
    const value = post.updated || post.date
    if (value) return value
  }
  return (post && post.date) || fallback || null
}

function entryFromPost (post, extras = {}) {
  const path = safePath(post)
  const description = cleanDescription(post.description || post.intro || post.excerpt)
  return {
    kind: extras.kind || 'post',
    source: String(post.source || '').replace(/\\/g, '/'),
    path,
    title: post.title == null ? '' : String(post.title),
    date: post.date,
    updated: realUpdated(post),
    dateText: formatDate(post.date),
    updatedText: formatDate(realUpdated(post)),
    description,
    tags: extras.tags || post.tags || [],
    categories: extras.categories || post.categories || [],
    // Raw Markdown source: the mirror generator converts this, never the HTML.
    raw: typeof post.raw === 'string' ? post.raw : null,
    ...flags(post),
    ...extras.meta
  }
}

/**
 * @param {object} input
 * @param {Array} input.posts         published posts (locals.posts)
 * @param {Array} input.allPosts      every post in the model, including unpublished series indexes
 * @param {Array} input.pages         pages (locals.pages)
 * @param {object} input.theme        theme config (blog_series, ai_readable, site_discovery)
 * @returns {{articles, series, pages, excluded, markdownEntries}}
 */
function buildContentIndex (input = {}) {
  const theme = input.theme || {}
  const posts = Array.isArray(input.posts) ? input.posts.filter(Boolean) : []
  const allPosts = Array.isArray(input.allPosts) ? input.allPosts.filter(Boolean) : posts
  const pages = Array.isArray(input.pages) ? input.pages.filter(Boolean) : []

  const seriesCfg = (theme.blog_series || {})
  const seriesEnabled = seriesCfg.enable !== false
  const seriesPrefix = seriesCfg.path || '/series/'

  const aiCfg = theme.ai_readable || {}
  const markdownCfg = aiCfg.markdown || {}
  const sitemapCfg = (theme.site_discovery || {}).sitemap || {}

  const articleExclude = createMatcher(markdownCfg.exclude)
  const sitemapExclude = createMatcher(sitemapCfg.exclude)

  // Series indexes are unpublished by scripts/panda/blog-series.js, so the model
  // (not locals.posts) is what still knows them.
  const indexes = allPosts.filter(post => parseSeriesIndex(post.source))
  const classified = seriesEnabled
    ? classifyPosts([...posts, ...indexes])
    : { series: new Map(), independents: posts }

  const excluded = []
  const articles = []
  const seenPostSources = new Set()

  const pushExcluded = (item, reason) => {
    excluded.push({ title: item && item.title, source: item && item.source, path: item && item.path, reason })
  }

  for (const post of classified.independents) {
    const entry = entryFromPost(post)
    seenPostSources.add(entry.source)
    if (entry.noindex) { pushExcluded(post, 'noindex'); continue }
    if (articleExclude(entry.source) || articleExclude(entry.path)) { pushExcluded(post, 'markdown.exclude'); continue }
    articles.push(entry)
  }

  const seriesList = []
  for (const s of classified.series.values()) {
    if (!s.members.length) continue
    const indexPost = s.index
    const indexFlags = flags(indexPost)
    if (indexFlags.noindex) {
      pushExcluded(indexPost, 'noindex')
      continue
    }
    const members = []
    for (const member of [...s.members].sort((a, b) => toTime(a.date) - toTime(b.date))) {
      const entry = entryFromPost(member, { kind: 'series-member', tags: member.tags, categories: member.categories })
      seenPostSources.add(entry.source)
      if (entry.noindex) { pushExcluded(member, 'noindex'); continue }
      if (articleExclude(entry.source) || articleExclude(entry.path)) { pushExcluded(member, 'markdown.exclude'); continue }
      members.push(entry)
    }
    if (!members.length) continue
    const routePath = seriesPagePath(s.folder, seriesPrefix)
    seriesList.push({
      kind: 'series',
      folder: s.folder,
      title: indexPost.title == null ? s.folder : String(indexPost.title),
      description: cleanDescription(indexPost.description),
      source: String(indexPost.source || ''),
      path: routePath,
      raw: typeof indexPost.raw === 'string' ? indexPost.raw : null,
      date: members[0] ? members[0].date : indexPost.date,
      updated: members.reduce((latest, m) => (toTime(m.updated || m.date) > toTime(latest) ? (m.updated || m.date) : latest), members[0].updated || members[0].date),
      members,
      ...flags(indexPost)
    })
  }

  const pageEntries = []
  for (const page of pages) {
    const type = String((page && page.type) || '').toLowerCase()
    if (NON_INDEXABLE_TYPES.has(type)) { pushExcluded(page, `page type ${type}`); continue }
    const entry = entryFromPost(page, { kind: 'page' })
    if (entry.noindex) { pushExcluded(page, 'noindex'); continue }
    if (articleExclude(entry.source) || articleExclude(entry.path)) { pushExcluded(page, 'markdown.exclude'); continue }
    pageEntries.push(entry)
  }

  const byDateDesc = (a, b) => toTime(b.date) - toTime(a.date)

  return {
    articles: articles.sort(byDateDesc),
    series: seriesList.sort(byDateDesc),
    pages: pageEntries.sort(byDateDesc),
    updatedOf: realUpdated,
    excluded,
    seenPostSources,
    sitemapExcludedByConfig: item => sitemapExclude(item.source) || sitemapExclude(item.path)
  }
}

/** Markdown mirrors this build should emit, honouring include_* switches. */
function markdownTargets (index, theme) {
  const cfg = ((theme.ai_readable || {}).markdown) || {}
  if (cfg.enable === false) return []
  const targets = []
  if (cfg.include_posts !== false) {
    for (const article of index.articles) {
      if (article.markdown) targets.push({ ...article, mirrorKind: 'post' })
    }
  }
  if (cfg.include_series !== false) {
    for (const series of index.series) {
      if (!series.markdown) continue
      targets.push({
        kind: 'series-index',
        source: series.source,
        path: series.path,
        title: series.title,
        description: series.description,
        date: series.date,
        updated: series.updated,
        raw: series.raw,
        members: series.members
      })
      for (const member of series.members) {
        if (member.markdown) targets.push({ ...member, mirrorKind: 'series-member' })
      }
    }
  }
  if (cfg.include_pages === true) {
    for (const page of index.pages) {
      if (page.markdown) targets.push({ ...page, mirrorKind: 'page' })
    }
  }
  return targets
}

/** Sitemap entries: posts, series landing pages, and opt-in pages. */
function sitemapTargets (index, theme) {
  const cfg = ((theme.site_discovery || {}).sitemap) || {}
  const entries = []
  const seen = new Set()
  const push = (item) => {
    if (!item || !item.path) return
    if (index.sitemapExcludedByConfig(item)) return
    const key = item.path.replace(/index\.html?$/i, '').replace(/\/+$/, '')
    if (seen.has(key)) return
    seen.add(key)
    entries.push(item)
  }
  for (const article of index.articles) if (article.sitemap) push(article)
  // Series chapters are separated out of `articles` so llms.txt lists them under
  // their series instead of twice. They are still ordinary published pages with
  // their own URL, so the sitemap must list them.
  for (const series of index.series) {
    if (series.sitemap) push(series)
    for (const member of series.members) if (member.sitemap) push(member)
  }
  for (const page of index.pages) {
    if (cfg.include_pages === false) break
    if (page.sitemap) push(page)
  }
  return entries
}

/** Adapter for the real build: reads the models, returns the same shape. */
function collectFromHexo (hexo, locals) {
  const Post = hexo.model('Post')
  const allPosts = typeof Post.toArray === 'function' ? Post.toArray() : []
  const published = locals && locals.posts && typeof locals.posts.toArray === 'function'
    ? locals.posts.toArray()
    : []
  const pages = locals && locals.pages && typeof locals.pages.toArray === 'function'
    ? locals.pages.toArray()
    : []
  return buildContentIndex({ posts: published, allPosts, pages, theme: hexo.theme.config })
}

module.exports = {
  buildContentIndex,
  collectFromHexo,
  markdownTargets,
  sitemapTargets,
  flags,
  cleanDescription,
  realUpdated,
  formatDate,
  isoDateTime,
  stripHtml,
  createMatcher,
  globToRegExp,
  isHtmlRoute
}
