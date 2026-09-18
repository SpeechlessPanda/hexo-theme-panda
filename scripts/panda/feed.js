// Panda theme — Atom feed generator (posts + memos mixed)
// Forked from SpeechlessPanda/blog-s-code scripts/atom-feed.js (Apache-2.0).
// Replaces hexo-generator-feed (which only sees posts, not _data memos).
// On by default (feed.enable: true). Do not run hexo-generator-feed at the same
// time — both would claim the path. Disable with feed.enable: false.
//
// Entry identity design (the key to working with every RSS reader):
// all distinguishing info goes into the URL **path** — never query or fragment,
// which some readers normalize away. Those URLs must really resolve:
//   - each memo gets a standalone page (scripts/panda/memos.js)
//   - each meaningful post update gets a stub page <post>/u/<timestamp>/
//     (meta refresh back to the post)
'use strict'

const { escapeXml, cdata, stripHtml, parseMemoDate, memoSlugs } = require('./lib/memo-utils')
const { memosEnabled, memosConfig, getMemos, memosPath, siteLang } = require('./lib/memo-utils')

function feedConfig () {
  return (hexo.theme.config && hexo.theme.config.feed) || {}
}

// Date -> compact stamp "20260804-131600" (post update stub paths)
function compactStamp (date) {
  return date.toISOString().slice(0, 19).replace(/-/g, '').replace(/:/g, '').replace('T', '-')
}

function postSummary (post, excerptLimit) {
  if (post.description) return post.description
  if (post.intro) return post.intro
  if (post.excerpt) return post.excerpt
  if (post.content) return post.content.substring(0, excerptLimit)
  return ''
}

// Update stub page: update-notification entries link here and bounce to the post
function updateStubHtml (post, __) {
  const url = post.permalink
  const suffix = __('feed.updated_suffix') === 'feed.updated_suffix' ? ' (updated)' : __('feed.updated_suffix')
  const redirecting = __('feed.redirecting') === 'feed.redirecting' ? 'This post was updated; redirecting to the original…' : __('feed.redirecting')
  const clickHere = __('feed.click_here') === 'feed.click_here' ? 'Click here' : __('feed.click_here')
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="robots" content="noindex,follow">' +
    `<meta http-equiv="refresh" content="0;url=${escapeXml(url)}">` +
    `<link rel="canonical" href="${escapeXml(url)}">` +
    `<title>${escapeXml(post.title)}${escapeXml(suffix)}</title></head><body>` +
    `<p>${escapeXml(post.title)} — ${escapeXml(redirecting)} <a href="${escapeXml(url)}">${escapeXml(clickHere)}</a></p>` +
    '</body></html>'
}

function buildPostEntry (post, authorXml, cfg, __) {
  const published = post.date.toDate()
  const updated = post.updated ? post.updated.toDate() : published
  const notifyMs = (cfg.update_notify_hours == null ? 24 : cfg.update_notify_hours) * 3600 * 1000
  // Update long after publish -> fresh id/link via stub page (readers can't collapse it);
  // otherwise keep the stable permalink identity to avoid false notifications
  const meaningfulUpdate = (updated - published) > notifyMs
  const updateUrl = meaningfulUpdate ? `${post.permalink}u/${compactStamp(updated)}/` : null
  const id = updateUrl || post.permalink
  const categories = [
    ...(post.categories ? post.categories.toArray() : []),
    ...(post.tags ? post.tags.toArray() : [])
  ].map(item => `<category term="${escapeXml(item.name)}" scheme="${escapeXml(item.permalink)}"/>`).join('')
  const content = (post.content || '').replace(/[\x00-\x1F\x7F]/g, '') // eslint-disable-line no-control-regex

  return {
    published,
    updated,
    stubRoute: updateUrl ? { path: `${post.path}u/${compactStamp(updated)}/index.html`, data: updateStubHtml(post, __) } : null,
    xml: `<entry>${authorXml}${categories}<content type="html">${cdata(content)}</content>` +
      `<id>${escapeXml(id)}</id><link href="${escapeXml(id)}"/>` +
      `<published>${published.toISOString()}</published>` +
      `<summary type="html">${cdata(postSummary(post, cfg.excerpt_limit == null ? 140 : cfg.excerpt_limit))}</summary>` +
      `<title>${escapeXml(post.title)}</title><updated>${updated.toISOString()}</updated></entry>`
  }
}

function buildMemoEntry (item, slug, memosUrl, author, cfg, memosTitle) {
  const date = parseMemoDate(hexo, item.date)
  if (!date || !slug) return null
  const html = hexo.render.renderSync({ text: item.content || '', engine: 'markdown' })
    .replace(/[\x00-\x1F\x7F]/g, '') // eslint-disable-line no-control-regex
  const url = `${memosUrl}${slug}/`
  const tags = (item.tags || []).map(t => `<category term="${escapeXml(t)}"/>`).join('')
  const authorXml = `<author><name>${escapeXml(item.author || author)}</name></author>`
  const excerptLimit = cfg.excerpt_limit == null ? 140 : cfg.excerpt_limit

  return {
    published: date,
    updated: date,
    xml: `<entry>${authorXml}${tags}<content type="html">${cdata(html)}</content>` +
      `<id>${escapeXml(url)}</id><link href="${escapeXml(url)}"/>` +
      `<published>${date.toISOString()}</published>` +
      `<summary type="html">${cdata(stripHtml(html).substring(0, excerptLimit))}</summary>` +
      `<title>${escapeXml(memosTitle)}</title><updated>${date.toISOString()}</updated></entry>`
  }
}

hexo.extend.generator.register('panda-atom-feed', function (locals) {
  const cfg = feedConfig()
  if (cfg.enable !== true) return []

  const { config } = this
  const __ = this.theme.i18n.__(siteLang(hexo))
  const feedPath = cfg.path || 'atom.xml'
  const postLimit = cfg.post_limit == null ? 20 : cfg.post_limit
  let siteUrl = config.url
  if (siteUrl[siteUrl.length - 1] !== '/') siteUrl += '/'
  const memosUrl = siteUrl + memosPath(hexo).replace(/^\//, '')
  const authorXml = `<author><name>${escapeXml(config.author || 'Author')}</name></author>`
  const routes = []

  // Post entries (selection mirrors hexo-generator-feed)
  const posts = locals.posts.sort('-date').filter(post => post.draft !== true).limit(postLimit)
  const entries = posts.toArray().map(post => {
    const entry = buildPostEntry(post, authorXml, cfg, __)
    if (entry.stubRoute) routes.push(entry.stubRoute)
    return entry
  })

  // Memo entries (all of them)
  if (memosEnabled(hexo) && cfg.include_memos !== false) {
    const memos = getMemos(hexo, locals.data)
    if (memos.length) {
      const memosTitle = __('memos.title') === 'memos.title' ? 'Memos' : __('memos.title')
      const slugs = memoSlugs(hexo, memos)
      memos.forEach((item, i) => {
        const entry = buildMemoEntry(item, slugs[i], memosUrl, config.author, cfg, memosTitle)
        if (entry) entries.push(entry)
      })
    }
  }

  // Posts + memos mixed, newest first
  entries.sort((a, b) => b.published - a.published)

  // Feed-level updated tracks the freshest entry published/updated
  const feedUpdated = entries.length
    ? entries.reduce((max, e) => {
      const t = e.updated > e.published ? e.updated : e.published
      return t > max ? t : max
    }, new Date(0))
    : new Date()
  const xml = '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<feed xmlns="http://www.w3.org/2005/Atom">' +
    authorXml +
    '<generator uri="https://github.com/SpeechlessPanda/hexo-theme-panda">Hexo Panda</generator>' +
    `<id>${escapeXml(siteUrl)}</id>` +
    `<link href="${escapeXml(siteUrl)}" rel="alternate"/>` +
    `<link href="${escapeXml(siteUrl + feedPath)}" rel="self"/>` +
    (config.author ? `<rights>All rights reserved ${new Date().getFullYear()}, ${escapeXml(config.author)}</rights>` : '') +
    `<subtitle>${escapeXml(config.subtitle || config.description || '')}</subtitle>` +
    `<title>${escapeXml(config.title)}</title>` +
    `<updated>${feedUpdated.toISOString()}</updated>` +
    entries.map(e => e.xml).join('') +
    '</feed>'

  return [{ path: feedPath, data: xml }, ...routes]
})
