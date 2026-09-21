// Panda theme — blog series (folder + index.md)
// Distinct from Butterfly's `{% series %}` tag / front-matter `series:`.
// Config key: blog_series (default on).
'use strict'

const fs = require('fs')
const path = require('path')
const {
  parseSeriesIndex,
  parseSeriesMember,
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
  toTime
} = require('./lib/blog-series')

const SERIES_SCAFFOLD = [
  '---',
  'title: {{ title }}',
  'description:',
  'cover:',
  '---',
  ''
].join('\n')

if (hexo.scaffold && hexo.scaffold.defaults) {
  hexo.scaffold.defaults.series = SERIES_SCAFFOLD
}

function classifyFromLocals (ctx, locals) {
  const all = ctx.model('Post').toArray()
  const published = locals.posts.toArray()
  const indexes = all.filter(p => parseSeriesIndex(p.source))
  return classifyPosts([...published, ...indexes])
}

function attachMemberMeta (classified, pathPrefix) {
  for (const s of classified.series.values()) {
    const seriesPath = seriesPagePath(s.folder, pathPrefix)
    const meta = { title: s.index.title, path: seriesPath, slug: s.folder }
    for (const member of s.members) member.blog_series = meta
  }
}

function unpublishIndexes (classified) {
  const saves = []
  for (const s of classified.series.values()) {
    if (s.index.published !== false) {
      s.index.published = false
      if (typeof s.index.save === 'function') saves.push(s.index.save())
    }
  }
  return Promise.all(saves)
}

hexo.extend.filter.register('before_generate', function () {
  if (!isSeriesEnabled(this.theme.config)) return
  const classified = classifyPosts(this.model('Post').toArray())
  validateSeriesIndexes(classified.series)
  attachMemberMeta(classified, blogSeriesConfig(this.theme.config).path)
  return unpublishIndexes(classified)
})

hexo.extend.filter.register('before_post_render', function (data) {
  if (!isSeriesEnabled(hexo.theme.config)) return data
  const member = parseSeriesMember(data.source)
  if (!member) return data
  if (data.blog_series) return data
  const classified = classifyPosts(hexo.model('Post').toArray())
  const s = classified.series.get(member.folder)
  if (!s) return data
  data.blog_series = {
    title: s.index.title,
    path: seriesPagePath(s.folder, blogSeriesConfig(hexo.theme.config).path),
    slug: s.folder
  }
  return data
})

hexo.extend.filter.register('new_post_path', function (data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data instanceof String) {
    return data
  }
  if (!isSeriesEnabled(this.theme.config)) return data
  const resolved = resolveNewPostPath(data)
  if (!resolved) return data
  const abs = path.join(this.source_dir, '_posts', resolved.path)
  if (resolved.kind === 'series-index' && fs.existsSync(abs)) {
    throw new Error(`Panda blog series: already exists ${path.relative(this.base_dir, abs).replace(/\\/g, '/')}`)
  }
  if (resolved.createIndexIfMissing) {
    const indexAbs = path.join(this.source_dir, '_posts', resolved.folder, 'index.md')
    if (!fs.existsSync(indexAbs)) {
      fs.mkdirSync(path.dirname(indexAbs), { recursive: true })
      fs.writeFileSync(indexAbs, seriesIndexMarkdown(resolved.folder))
    }
  }
  data.path = resolved.path
  delete data.series
  return data
}, 1)

hexo.on('new', post => {
  if (!post || !post.path || !isSeriesEnabled(hexo.theme.config)) return
  const rel = path.relative(path.join(hexo.source_dir, '_posts'), post.path).replace(/\\/g, '/')
  if (!rel || rel.startsWith('..')) return
  const next = rewriteNewPostContent(`_posts/${rel}`, post.content)
  if (next != null && next !== post.content) {
    fs.writeFileSync(post.path, next)
    post.content = next
  }
})

// Wrap whatever `post` generator is current. Script load order is not guaranteed
// (random_cover.js also registers `post`), so re-wrap at after_init: if another
// script took the slot after us, wrapping is what keeps the series rewiring alive.
let registeredWrapper = null
function wrapPostGenerator () {
  const current = hexo.extend.generator.get('post')
  if (!current || current === registeredWrapper) return
  const wrapped = current
  registeredWrapper = function (locals) {
    return Promise.resolve(wrapped.call(this, locals)).then(routes => {
      if (!isSeriesEnabled(this.theme.config)) return routes
      rewireNeighbors(classifyFromLocals(this, locals))
      return routes
    })
  }
  hexo.extend.generator.register('post', registeredWrapper)
}

wrapPostGenerator()
hexo.extend.filter.register('after_init', wrapPostGenerator)

const originalIndex = hexo.extend.generator.get('index')
hexo.extend.generator.register('index', function (locals) {
  if (!isSeriesEnabled(this.theme.config)) {
    return originalIndex ? originalIndex.call(this, locals) : []
  }
  const classified = classifyFromLocals(this, locals)
  const items = buildListingItems(classified, { pathPrefix: blogSeriesConfig(this.theme.config).path })
  const ig = this.config.index_generator || {}
  const paginationDir = ig.pagination_dir || this.config.pagination_dir || 'page'
  const perPage = ig.per_page == null ? this.config.per_page : ig.per_page
  return paginateListing(items, {
    base: ig.path || '',
    perPage,
    layout: ig.layout || ['index', 'archive'],
    format: paginationDir + '/%d/',
    data: { __index: true }
  })
})

hexo.extend.generator.register('panda-blog-series', function (locals) {
  if (!isSeriesEnabled(this.theme.config)) return []
  const cfg = blogSeriesConfig(this.theme.config)
  const classified = classifyFromLocals(this, locals)
  const routes = []
  for (const s of classified.series.values()) {
    if (!s.members.length) continue
    const members = [...s.members].sort((a, b) => toTime(b.date) - toTime(a.date))
    const cover = s.index.cover
    let content = ''
    if (s.index.description) {
      content = this.render.renderSync({ text: String(s.index.description), engine: 'markdown' })
    }
    routes.push({
      path: seriesPagePath(s.folder, cfg.path),
      layout: ['series', 'page'],
      data: {
        title: s.index.title,
        description: s.index.description == null ? '' : s.index.description,
        content,
        cover: cover || false,
        cover_type: isImageCover(cover) ? 'img' : undefined,
        comments: s.index.comments === false ? false : true,
        layout: 'series',
        type: 'blog_series',
        posts: { data: members, length: members.length },
        blog_series: {
          slug: s.folder,
          member_count: members.length
        }
      }
    })
  }
  return routes
})
