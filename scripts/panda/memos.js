// Panda theme — memos (shuoshuo) core: latest_memo helper + standalone memo pages
// Forked from SpeechlessPanda/blog-s-code scripts/memo-helpers.js and the memo-page
// part of scripts/atom-feed.js (Apache-2.0). Generalized: data key / page path /
// strings come from theme config + i18n instead of hardcoding.
'use strict'

const { escapeXml, memosConfig, memosEnabled, getMemos, memosPath, siteLang, memoSlugs } = require('./lib/memo-utils')

// latest_memo(): data for the "latest memo" card on the post stream
hexo.extend.helper.register('latest_memo', function () {
  const cfg = memosConfig(hexo)
  if (!memosEnabled(hexo) || cfg.latest_card === false) return null
  const memos = getMemos(hexo).slice().sort((a, b) => new Date(b.date) - new Date(a.date))
  if (!memos.length) return null
  const latest = memos[0]
  const html = hexo.render.renderSync({ text: latest.content || '', engine: 'markdown' })
  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const excerptLimit = typeof cfg.latest_excerpt === 'number' ? cfg.latest_excerpt : 120
  const excerpt = plainText.length > excerptLimit ? plainText.slice(0, excerptLimit) + '…' : plainText
  return { excerpt, date: latest.date, url: memosPath(hexo) }
})

// Standalone page per memo: the timeline page renders client-side and has no
// per-item URL; these minimal noindex pages give feeds/search real link targets.
function memoPageHtml (title, dateStr, contentHtml, backUrl, backLabel, lang) {
  return '<!DOCTYPE html><html lang="' + escapeXml(lang) + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex,follow">' +
    `<title>${escapeXml(title)} · ${escapeXml(dateStr)}</title>` +
    `<link rel="canonical" href="${escapeXml(backUrl)}">` +
    '<style>body{max-width:40rem;margin:3rem auto;padding:0 1rem;line-height:1.7;' +
    'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#24292f}' +
    'header{color:#6a737d;font-size:.9rem;margin-bottom:1rem}a{color:#1f6feb}img{max-width:100%}' +
    'footer{margin-top:2rem;font-size:.9rem}</style></head><body><article>' +
    `<header>${escapeXml(title)} · <time>${escapeXml(dateStr)}</time></header>` +
    `<div>${contentHtml}</div>` +
    `<footer><a href="${escapeXml(backUrl)}">← ${escapeXml(backLabel)}</a></footer>` +
    '</article></body></html>'
}

hexo.extend.generator.register('panda-memo-pages', function (locals) {
  const cfg = memosConfig(hexo)
  if (!memosEnabled(hexo) || cfg.standalone_pages === false) return []
  const memos = getMemos(hexo, locals.data)
  if (!memos.length) return []

  const lang = siteLang(hexo)
  const __ = this.theme.i18n.__(lang)
  const basePath = memosPath(hexo).replace(/^\//, '') // 'memos/'
  const siteUrl = (this.config.url || '').replace(/\/?$/, '/')
  const backUrl = siteUrl + basePath
  const tTitle = __('memos.title')
  const title = tTitle === 'memos.title' ? 'Memos' : tTitle
  const tBack = __('memos.back_to_all')
  const backLabel = tBack === 'memos.back_to_all' ? 'View all memos' : tBack

  const slugs = memoSlugs(hexo, memos)
  const routes = []
  memos.forEach((item, i) => {
    const slug = slugs[i]
    if (!slug) return
    const html = hexo.render.renderSync({ text: item.content || '', engine: 'markdown' })
      .replace(/[\x00-\x1F\x7F]/g, '') // eslint-disable-line no-control-regex
    const dateStr = slug.slice(0, 10) + ' ' + slug.slice(11).replace('-', ':')
    routes.push({
      path: `${basePath}${slug}/index.html`,
      data: memoPageHtml(title, dateStr, html, backUrl, backLabel, lang)
    })
  })
  return routes
})
