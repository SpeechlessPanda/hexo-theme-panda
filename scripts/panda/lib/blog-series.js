'use strict'

const INDEX_RE = /^_posts\/([^/]+)\/index\.(md|markdown|mkd|mdwn|mdtxt|mdtext)$/i
const MEMBER_RE = /^_posts\/([^/]+)\/([^/]+)\.(md|markdown|mkd|mdwn|mdtxt|mdtext)$/i
const ILLEGAL_SEGMENT = /[<>:"|?*\u0000]/

function normalizeSource (source) {
  return String(source || '').replace(/\\/g, '/')
}

function parseSeriesIndex (source) {
  const m = INDEX_RE.exec(normalizeSource(source))
  return m ? { folder: m[1] } : null
}

function parseSeriesMember (source) {
  const m = MEMBER_RE.exec(normalizeSource(source))
  if (!m) return null
  if (/^index$/i.test(m[2])) return null
  return { folder: m[1], filename: m[2] }
}

function frontMatterKeys (raw) {
  const text = String(raw || '')
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!match) return new Set()
  const keys = new Set()
  for (const line of match[1].split(/\r?\n/)) {
    const km = /^([A-Za-z0-9_-]+)\s*:/.exec(line)
    if (km) keys.add(km[1])
  }
  return keys
}

function toTime (date) {
  if (date == null) return 0
  if (typeof date.valueOf === 'function') {
    const v = date.valueOf()
    if (typeof v === 'number' && !Number.isNaN(v)) return v
  }
  const t = Date.parse(date)
  return Number.isNaN(t) ? 0 : t
}

function classifyPosts (posts) {
  const list = Array.isArray(posts) ? posts : []
  const series = new Map()
  for (const post of list) {
    const parsed = parseSeriesIndex(post && post.source)
    if (!parsed) continue
    series.set(parsed.folder, { folder: parsed.folder, index: post, members: [] })
  }
  const independents = []
  for (const post of list) {
    if (!post) continue
    if (parseSeriesIndex(post.source)) continue
    const member = parseSeriesMember(post.source)
    if (member && series.has(member.folder)) {
      series.get(member.folder).members.push(post)
    } else {
      independents.push(post)
    }
  }
  return { series, independents }
}

function validateSeriesIndexes (postsOrSeries) {
  const indexes = []
  if (postsOrSeries && typeof postsOrSeries.get === 'function' && postsOrSeries.values) {
    for (const s of postsOrSeries.values()) indexes.push(s.index)
  } else {
    for (const post of postsOrSeries || []) {
      if (parseSeriesIndex(post && post.source)) indexes.push(post)
    }
  }
  for (const post of indexes) {
    const keys = frontMatterKeys(post.raw)
    const missing = []
    if (!keys.has('title')) missing.push('title')
    if (!keys.has('description')) missing.push('description')
    const source = normalizeSource(post.source)
    if (missing.length) {
      throw new Error(`Panda blog series: ${source} missing front-matter: ${missing.join(', ')}`)
    }
    const title = post.title
    if (title == null || String(title).trim() === '') {
      throw new Error(`Panda blog series: ${source} missing front-matter: title`)
    }
  }
}

function normalizePrefix (pathPrefix) {
  let prefix = String(pathPrefix == null ? 'series' : pathPrefix).replace(/\\/g, '/')
  prefix = prefix.replace(/^\/+/, '').replace(/\/+$/, '')
  return prefix || 'series'
}

function seriesPagePath (folder, pathPrefix) {
  return `${normalizePrefix(pathPrefix)}/${folder}/index.html`
}

function isImageCover (value) {
  if (typeof value !== 'string' || !value) return false
  return /^(?:https?:)?\/\//i.test(value) ||
    /^data:image\//i.test(value) ||
    /\.(png|jpe?g|gif|svg|webp|avif)(\?.*)?$/i.test(value)
}

function emptyTaxonomy () {
  return { data: [], length: 0 }
}

function buildListingItems (classified, options = {}) {
  const pathPrefix = options.pathPrefix || '/series/'
  const items = []
  for (const post of classified.independents) {
    items.push(post)
  }
  for (const s of classified.series.values()) {
    if (!s.members.length) continue
    let latest = s.members[0]
    for (const member of s.members) {
      if (toTime(member.date) > toTime(latest.date)) latest = member
    }
    const cover = s.index.cover
    const imageCover = isImageCover(cover)
    items.push({
      blog_series_card: true,
      title: s.index.title,
      path: seriesPagePath(s.folder, pathPrefix),
      description: s.index.description == null ? '' : s.index.description,
      cover: imageCover ? cover : (cover || false),
      cover_type: imageCover ? 'img' : undefined,
      date: latest.date,
      member_count: s.members.length,
      folder: s.folder,
      categories: emptyTaxonomy(),
      tags: emptyTaxonomy()
    })
  }
  items.sort((a, b) => {
    const stickyA = a.blog_series_card ? 0 : (a.sticky || 0)
    const stickyB = b.blog_series_card ? 0 : (b.sticky || 0)
    if (stickyA !== stickyB) return stickyB - stickyA
    return toTime(b.date) - toTime(a.date)
  })
  return items
}

function withSlash (base) {
  let s = String(base == null ? '' : base).replace(/\\/g, '/')
  if (s === '/' || s === '') return ''
  s = s.replace(/^\/+/, '').replace(/\/+$/, '')
  return s ? `${s}/` : ''
}

function pagePath (prefix, format, i) {
  if (i === 1) return prefix || ''
  return `${prefix}${format.replace('%d', String(i))}`
}

function paginateListing (items, options = {}) {
  const list = Array.isArray(items) ? items : []
  const perPage = options.perPage == null ? 10 : options.perPage
  const layout = options.layout || ['index', 'archive']
  const format = options.format || 'page/%d/'
  const extraData = options.data || {}
  const prefix = withSlash(options.base)
  const total = perPage ? Math.max(Math.ceil(list.length / perPage), list.length ? 1 : 1) : 1
  const pageCount = list.length === 0 ? 1 : total
  const pages = []
  for (let i = 1; i <= pageCount; i++) {
    const slice = perPage ? list.slice(perPage * (i - 1), perPage * i) : list
    const path = pagePath(prefix, format, i)
    pages.push({
      path,
      layout,
      data: {
        ...extraData,
        __index: true,
        base: prefix,
        total: pageCount,
        current: i,
        current_url: path,
        posts: { data: slice, length: slice.length },
        prev: i > 1 ? i - 1 : 0,
        prev_link: i > 1 ? pagePath(prefix, format, i - 1) : '',
        next: i < pageCount ? i + 1 : 0,
        next_link: i < pageCount ? pagePath(prefix, format, i + 1) : ''
      }
    })
  }
  return pages
}

function chainByDateAsc (posts) {
  const sorted = [...posts].sort((a, b) => toTime(a.date) - toTime(b.date))
  for (let i = 0; i < sorted.length; i++) {
    sorted[i].prev = i > 0 ? sorted[i - 1] : undefined
    sorted[i].next = i < sorted.length - 1 ? sorted[i + 1] : undefined
  }
}

function rewireNeighbors (classified) {
  chainByDateAsc(classified.independents)
  for (const s of classified.series.values()) chainByDateAsc(s.members)
}

function assertSafeSegment (name, label) {
  const s = String(name == null ? '' : name)
  if (!s.trim()) {
    throw new Error(`Panda blog series: ${label} is empty`)
  }
  if (s === '.' || s === '..' || s.includes('..')) {
    throw new Error(`Panda blog series: illegal ${label}: ${s}`)
  }
  if (s.includes('/') || s.includes('\\') || ILLEGAL_SEGMENT.test(s)) {
    throw new Error(`Panda blog series: illegal ${label}: ${s}`)
  }
  return s
}

function resolveNewPostPath (data) {
  if (!data || typeof data !== 'object') return null
  const layout = String(data.layout || '').toLowerCase()
  if (layout === 'series') {
    const folder = assertSafeSegment(data.title, 'series folder')
    return { kind: 'series-index', folder, path: `${folder}/index.md`, createIndexIfMissing: false }
  }
  if (typeof data.series === 'string' && data.series) {
    const folder = assertSafeSegment(data.series, 'series folder')
    const filename = assertSafeSegment(data.title, 'post title')
    return {
      kind: 'series-member',
      folder,
      path: `${folder}/${filename}.md`,
      createIndexIfMissing: true
    }
  }
  return null
}

function yamlScalar (value) {
  const s = String(value)
  if (s === '' || /[:#{}[\],&*!|>'"%@`]/.test(s) || /^\s|\s$/.test(s) || /[\r\n]/.test(s)) {
    return JSON.stringify(s)
  }
  return s
}

function seriesIndexMarkdown (title) {
  return `---\ntitle: ${yamlScalar(title)}\ndescription:\ncover:\n---\n`
}

function rewriteNewPostContent (source, content) {
  const parsedIndex = parseSeriesIndex(source)
  if (parsedIndex) return seriesIndexMarkdown(parsedIndex.folder)
  if (parseSeriesMember(source) && content != null) {
    return String(content).replace(/^series:\s*.*\r?\n/m, '')
  }
  return content
}

function isSeriesEnabled (themeConfig) {
  const cfg = themeConfig && themeConfig.blog_series
  if (cfg == null) return true
  return cfg.enable !== false
}

function blogSeriesConfig (themeConfig) {
  const cfg = (themeConfig && themeConfig.blog_series) || {}
  return {
    enable: cfg.enable !== false,
    path: cfg.path || '/series/'
  }
}

module.exports = {
  parseSeriesIndex,
  parseSeriesMember,
  frontMatterKeys,
  classifyPosts,
  validateSeriesIndexes,
  buildListingItems,
  paginateListing,
  seriesPagePath,
  rewireNeighbors,
  resolveNewPostPath,
  seriesIndexMarkdown,
  rewriteNewPostContent,
  isSeriesEnabled,
  blogSeriesConfig,
  isImageCover,
  normalizeSource,
  toTime
}
