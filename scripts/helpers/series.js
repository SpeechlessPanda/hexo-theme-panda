'use strict'

// Read pre-built groups from tag/series.js (hexo._seriesGroups)
// and sort each group according to the sidebar card config.
hexo.extend.helper.register('groupPosts', function () {
  const groups = hexo._seriesGroups || {}
  const { orderBy = 'date', order = 1 } = this.theme.aside.card_post_series

  const result = {}
  Object.keys(groups).forEach(key => {
    const arr = groups[key].slice() // copy to avoid mutating the shared data
    if (orderBy === 'title') {
      arr.sort((a, b) => {
        const cmp = a.title.toUpperCase().localeCompare(b.title.toUpperCase())
        return order === 1 ? cmp : -cmp
      })
    } else {
      arr.sort((a, b) => order === 1 ? a.date - b.date : b.date - a.date)
    }
    result[key] = arr
  })

  return result
})
