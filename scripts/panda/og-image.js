// Panda theme — OG share image generator (SVG -> PNG via @resvg/resvg-js)
// Forked from SpeechlessPanda/blog-s-code scripts/og-image.js (Apache-2.0).
// Config lives in the theme config (_config.panda.yml) under `og_image`.
// Requires the SITE to install the optional dependency: npm install @resvg/resvg-js
// Fonts (LXGW WenKai, SIL OFL 1.1) download once on first build into fonts/.
'use strict'

const fs = require('fs')
const path = require('path')
const https = require('https')

const DEFAULT_FONT_REGULAR_URL = 'https://github.com/lxgw/LxgwWenKai/releases/download/v1.330/LXGWWenKai-Regular.ttf'
const DEFAULT_FONT_BOLD_URL = 'https://github.com/lxgw/LxgwWenKai/releases/download/v1.330/LXGWWenKai-Bold.ttf'

function getConfig (hexo) {
  const c = (hexo.theme.config && hexo.theme.config.og_image) || {}
  return {
    enable: c.enable === true,
    width: c.width || 1200,
    height: c.height || 630,
    outputDir: c.output_dir || 'og-images',
    fontDir: path.resolve(hexo.base_dir, c.font_dir || 'fonts'),
    fontRegular: c.font_regular || 'LXGWWenKai-Regular.ttf',
    fontBold: c.font_bold || 'LXGWWenKai-Bold.ttf',
    regularUrl: c.font_regular_url || DEFAULT_FONT_REGULAR_URL,
    boldUrl: c.font_bold_url || DEFAULT_FONT_BOLD_URL,
    siteName: c.site_name || hexo.config.title || ''
  }
}

function download (url, dest) {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({ keepAlive: false })
    const file = fs.createWriteStream(dest)
    let settled = false
    const finish = (fn) => {
      if (settled) return
      settled = true
      try { agent.destroy() } catch (e) {}
      fn()
    }
    const get = (u) => {
      const req = https.get(u, { agent }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          get(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          fs.unlink(dest, () => finish(() => reject(new Error('[panda] font download failed ' + res.statusCode + ': ' + u))))
          return
        }
        res.pipe(file)
        file.on('finish', () => file.close(() => finish(resolve)))
      })
      req.on('error', (e) => { fs.unlink(dest, () => {}); finish(() => reject(e)) })
    }
    get(url)
  })
}

async function ensureFont (fontDir, name, url, log) {
  const filePath = path.join(fontDir, name)
  if (fs.existsSync(filePath)) return filePath
  await fs.promises.mkdir(fontDir, { recursive: true })
  log.info('[panda] downloading font %s ...', name)
  await download(url, filePath)
  log.info('[panda] font saved to %s', filePath)
  return filePath
}

function escapeXml (s) {
  return String(s == null ? '' : s).replace(/[<>&'"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ))
}

// Wrap by character count (CJK-friendly: 1 char ~ 1 cell); truncate with …
function wrapText (text, charsPerLine, maxLines) {
  const chars = Array.from(text)
  const lines = []
  for (let i = 0; i < chars.length && lines.length < maxLines; i += charsPerLine) {
    lines.push(chars.slice(i, i + charsPerLine).join(''))
  }
  if (chars.length > maxLines * charsPerLine) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, Math.max(1, charsPerLine - 1)) + '…'
  }
  return lines
}

function postSlug (post) {
  return (post.path || post.slug || 'post')
    .replace(/\/index\.html$/, '')
    .replace(/[\/\\]/g, '-')
}

function tagNames (post) {
  const t = post.tags
  const arr = Array.isArray(t) ? t : (t && t.data) || []
  return arr.map(x => (x && x.name) || x).filter(Boolean).join('   ')
}

function buildSvg (post, cfg) {
  const title = post.title || post.slug || ''
  const titleLen = Array.from(title).length
  const fontSize = titleLen <= 12 ? 76 : titleLen <= 20 ? 60 : 48
  const charsPerLine = Math.max(6, Math.floor((cfg.width - 160) / fontSize))
  const titleLines = wrapText(title, charsPerLine, 2)

  const date = post.date ? post.date.format('YYYY·MM·DD') : ''
  const tags = tagNames(post)
  const subtitle = [date, tags].filter(Boolean).join('    ·    ')

  const titleStartY = 280
  const lineGap = Math.round(fontSize * 1.18)
  const titleEls = titleLines.map((line, i) =>
    `<text x="80" y="${titleStartY + i * lineGap}" font-size="${fontSize}" font-weight="700">${escapeXml(line)}</text>`
  ).join('\n    ')
  const subtitleY = titleStartY + titleLines.length * lineGap + 36

  // Panda signature gradient (matches theme gradient defaults)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cfg.width}" height="${cfg.height}" viewBox="0 0 ${cfg.width} ${cfg.height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4facfe"/>
      <stop offset="25%" stop-color="#6ec6ff"/>
      <stop offset="55%" stop-color="#a18cd1"/>
      <stop offset="75%" stop-color="#fbc2eb"/>
      <stop offset="100%" stop-color="#ffd2a8"/>
    </linearGradient>
  </defs>
  <rect width="${cfg.width}" height="${cfg.height}" fill="url(#bg)"/>
  <g font-family="LXGW WenKai" fill="#ffffff" text-rendering="geometricPrecision">
    ${titleEls}
    ${subtitle ? `<text x="80" y="${subtitleY}" font-size="32" opacity="0.88">${escapeXml(subtitle)}</text>` : ''}
    <text x="80" y="${cfg.height - 48}" font-size="28" opacity="0.9">${escapeXml(cfg.siteName)}</text>
  </g>
</svg>`
}

let fontPromise = null
function getFontPaths (cfg, log) {
  // Deduplicate concurrent calls behind one in-flight promise (avoids file write races)
  if (fontPromise) return fontPromise
  fontPromise = (async () => {
    const [regular, bold] = await Promise.all([
      ensureFont(cfg.fontDir, cfg.fontRegular, cfg.regularUrl, log),
      ensureFont(cfg.fontDir, cfg.fontBold, cfg.boldUrl, log)
    ])
    return [regular, bold]
  })()
  return fontPromise
}

function renderPng (post, cfg, fontFiles) {
  const { Resvg } = require('@resvg/resvg-js') // optional dependency of the site
  const svg = buildSvg(post, cfg)
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: cfg.width },
    font: {
      fontFiles: fontFiles,
      loadSystemFonts: false,
      defaultFontFamily: 'LXGW WenKai'
    }
  })
  return resvg.render().asPng()
}

// og_image_url(page) helper: Open_Graph.pug computes each page's OG image URL.
// (post custom properties do not reliably reach the template `page` variable)
hexo.extend.helper.register('og_image_url', function (page) {
  const cfg = getConfig(hexo)
  if (!cfg.enable || !page || !page.path) return ''
  const slug = String(page.path).replace(/\/index\.html$/, '').replace(/[\/\\]/g, '-')
  return '/' + cfg.outputDir + '/' + slug + '.png'
})

// Register a PNG route per post (rendered at build time)
hexo.extend.generator.register('og-image', function (locals) {
  const cfg = getConfig(hexo)
  if (!cfg.enable) return []
  try {
    require.resolve('@resvg/resvg-js')
  } catch (e) {
    hexo.log.warn('[panda] og_image.enable is true but @resvg/resvg-js is not installed in the site. Run: npm install @resvg/resvg-js')
    return []
  }
  return locals.posts.toArray()
    .filter(p => p.published !== false)
    .map(post => ({
      path: cfg.outputDir + '/' + postSlug(post) + '.png',
      data: async function () {
        const fontFiles = await getFontPaths(cfg, hexo.log)
        return renderPng(post, cfg, fontFiles)
      }
    }))
})
