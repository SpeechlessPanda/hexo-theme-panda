// Panda theme — sitemap.xml rendering (built-in generator).
//
// Deliberately minimal, because everything beyond these fields is guesswork:
//   * `lastmod` only ever comes from a real content date (`updated`, else `date`).
//     Writing the build time would tell crawlers every page changed on every deploy.
//   * no `changefreq`, no `priority`: sitemaps.org marks both as hints, and a value
//     invented per-page is noise that Google documents as ignored.
//   * URLs are absolute and percent-encoded once.
'use strict'

function escapeXml (value) {
  return String(value == null ? '' : value).replace(/[<>&'"]/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ))
}

function isoDate (value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.valueOf())) return null
  return d.toISOString()
}

/**
 * @param {Array<{url:string, lastmod?:Date}>} entries
 * @returns {string} XML document
 */
function renderSitemap (entries) {
  const seen = new Set()
  const rows = []
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || !entry.url) continue
    const url = String(entry.url)
    if (seen.has(url)) continue
    seen.add(url)
    const lastmod = isoDate(entry.lastmod)
    rows.push(
      lastmod
        ? `  <url>\n    <loc>${escapeXml(url)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
        : `  <url>\n    <loc>${escapeXml(url)}</loc>\n  </url>`
    )
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...rows,
    '</urlset>',
    ''
  ].join('\n')
}

module.exports = { renderSitemap, escapeXml, isoDate }
