// Panda theme — heading anchor filter (Apache-2.0).
//
// Runs at `after_post_render`, i.e. after the renderer produced the final body
// HTML and before layouts call `toc(page.content)`. That ordering is the point:
// ids assigned here are the ones the TOC, permalinks and the scroll spy resolve.
'use strict'

const { addHeadingAnchors } = require('../panda/lib/anchor')

function permalinkLabel (hexo) {
  const language = hexo.config.language
  const code = Array.isArray(language) ? language[0] : (language || 'en')
  try {
    const text = hexo.theme.i18n.__(code)('anchor.permalink')
    if (text && text !== 'anchor.permalink') return text
  } catch (_) {}
  return 'Permalink to this heading'
}

hexo.extend.filter.register('after_post_render', data => {
  const config = hexo.theme.config.anchor
  if (!config || config.enable === false) return
  if (typeof data.content !== 'string' || !data.content) return
  data.content = addHeadingAnchors(data.content, { title: permalinkLabel(hexo) })
  return data
})
