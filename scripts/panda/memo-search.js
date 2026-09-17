// Panda theme — inject memos into the local search index (search.xml)
// Forked from SpeechlessPanda/blog-s-code scripts/search-memos.js (Apache-2.0).
// Each memo entry points at its standalone page so search hits deep-link
// instead of all landing on the timeline page.
'use strict'

const { escapeXml, cdata, parseMemoDate, memoSlugs } = require('./lib/memo-utils')
const { memosEnabled, memosConfig, getMemos, memosPath, siteLang } = require('./lib/memo-utils')

hexo.extend.filter.register('after_generate', async function () {
  const cfg = memosConfig(hexo)
  if (!memosEnabled(hexo) || cfg.search_injection === false) return

  const searchCfg = hexo.config.search || {}
  const path = searchCfg.path || 'search.xml'
  if (!path.endsWith('.xml')) return // xml format only

  const memos = getMemos(hexo)
  if (!memos.length) return

  const route = hexo.route
  if (!route.list().includes(path)) return

  // Read the generated search.xml from the in-memory route
  const stream = route.get(path)
  let xml = ''
  for await (const chunk of stream) xml += chunk.toString()

  const __ = this.theme.i18n.__(siteLang(hexo))
  const memosTitle = __('memos.title') === 'memos.title' ? 'Memos' : __('memos.title')
  const basePath = memosPath(hexo)
  const slugs = memoSlugs(hexo, memos)

  const entries = memos.map((item, i) => {
    const html = hexo.render.renderSync({ text: item.content || '', engine: 'markdown' })
    const content = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const tags = (item.tags || []).map(t => `<tag>${escapeXml(t)}</tag>`).join('')
    const date = parseMemoDate(hexo, item.date)
    const dateStr = date ? date.toISOString().slice(0, 10) : ''
    const title = memosTitle + (dateStr ? ' · ' + dateStr : '')
    const url = slugs[i] ? `${basePath}${slugs[i]}/` : basePath
    return `<entry><title>${escapeXml(title)}</title><url>${escapeXml(url)}</url><content>${cdata(content)}</content><tags>${tags}</tags></entry>`
  }).join('')

  route.set(path, xml.replace('</search>', entries + '</search>'))
  hexo.log.info('[panda] injected %d memo(s) into %s', memos.length, path)
})
