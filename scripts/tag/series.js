/**
 * series plugin
 * Syntax:
 *  {% series [series name] %}
 * Usage:
 * {% series %}
 * {% series series1 %}
 */

'use strict'

const urlFor = require('hexo-util').url_for.bind(hexo)

// Iterate all posts once and group by series name.
// Result is stored on hexo._seriesGroups, shared by both tag and helper.
function buildSeriesGroups () {
  const groups = {}
  const posts = hexo.model('Post').toArray()
  for (let i = 0, len = posts.length; i < len; i++) {
    const p = posts[i]
    if (p.series) {
      if (!groups[p.series]) groups[p.series] = []
      groups[p.series].push({
        title: p.title,
        path: p.path,
        date: p.date.valueOf()
      })
    }
  }
  return groups
}

// Build once before the first render (hexo generate / hexo server initial load).
// before_generate runs after tag rendering, so we need this as a fallback.
hexo.extend.filter.register('before_post_render', data => {
  if (!hexo.theme.config.series.enable) return data
  if (!hexo._seriesGroups) {
    hexo._seriesGroups = buildSeriesGroups()
  }
  return data
})

// Rebuild after each generate cycle in hexo server to reflect latest post data.
hexo.extend.filter.register('before_generate', () => {
  if (!hexo.theme.config.series.enable) return
  hexo._seriesGroups = buildSeriesGroups()
})

function series (args) {
  const { series } = hexo.theme.config
  if (!series.enable) {
    hexo.log.warn('Series plugin is disabled in the theme config')
    return ''
  }

  const groupName = args.length ? args[0] : this.series

  if (!groupName) {
    hexo.log.warn('No series specified')
    return ''
  }

  const groups = hexo._seriesGroups || {}
  const source = groups[groupName]

  if (!source || !source.length) {
    hexo.log.warn(`There is no series named "${groupName}"`)
    return ''
  }

  const isAsc = (series.order || 1) === 1
  const isSortByTitle = series.orderBy === 'title'

  // .slice() to copy before sorting, so we don't mutate the shared data
  const seriesArr = source.slice().sort((a, b) => {
    const itemA = isSortByTitle ? a.title.toUpperCase() : a.date
    const itemB = isSortByTitle ? b.title.toUpperCase() : b.date
    return itemA < itemB ? (isAsc ? -1 : 1) : itemA > itemB ? (isAsc ? 1 : -1) : 0
  })

  const listItems = seriesArr.map(ele =>
    `<li><a href="${urlFor(ele.path)}" title="${ele.title}">${ele.title}</a></li>`
  ).join('')

  return series.number ? `<ol class="series-items">${listItems}</ol>` : `<ul class="series-items">${listItems}</ul>`
}

hexo.extend.tag.register('series', series, { ends: false })
