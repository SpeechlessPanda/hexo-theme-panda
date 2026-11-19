// Panda theme — Markdown mirror conversion.
//
// The mirror is built from the post's raw Markdown, never from rendered HTML:
// stripping tags out of HTML loses tables, code fences, math delimiters and every
// author intent that only exists in the source. What the source does NOT have is
// the theme's own tag plugins — those are Hexo/Nunjucks constructs, so this module
// rewrites them into equivalent Markdown before the file is written.
//
// Rules are ordered: block tags first (they consume their body), then inline tags,
// then a conservative fallback that keeps the body and reports the tag name so an
// unsupported plugin is never silently dropped.
'use strict'

const { resolveRelative } = require('./site-url')

// Markdown link/image targets: `[text](target "title")`. Code spans are masked
// first so a snippet that happens to contain `](` is never rewritten.
const LINK_RE = /(!?\[[^\]\n]*\]\()([^)\s]+)(\s+"[^"]*")?(\))/g

/**
 * Rewrite relative link and image targets against the page's absolute URL.
 * An agent reading the mirror has no browser, so `../other/` must become a full
 * URL; absolute, root-relative, anchor and mailto targets stay untouched.
 */
function absolutizeLinks (body, baseUrl) {
  if (!baseUrl) return body
  const code = []
  const masked = String(body).replace(/```[\s\S]*?```|`[^`\n]*`/g, (match) => {
    code.push(match)
    return `\u0000CODE${code.length - 1}\u0000`
  })
  const rewritten = masked.replace(LINK_RE, (match, open, target, title, close) => {
    const resolved = resolveRelative(target, baseUrl)
    return `${open}${resolved}${title || ''}${close}`
  })
  return rewritten.replace(/\u0000CODE(\d+)\u0000/g, (match, index) => code[Number(index)])
}

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/** Split raw file content into front matter and Markdown body. */
function splitFrontMatter (raw) {
  const text = String(raw == null ? '' : raw)
  const match = FM_RE.exec(text)
  if (!match) return { frontMatter: '', body: text }
  return { frontMatter: match[1], body: text.slice(match[0].length) }
}

function parseScalar (value) {
  let v = String(value == null ? '' : value).trim()
  if (!v) return ''
  const quote = v[0]
  if ((quote === '"' || quote === "'") && v.length > 1 && v[v.length - 1] === quote) {
    v = v.slice(1, -1)
    return quote === '"' ? v.replace(/\\"/g, '"') : v
  }
  return v
}

/** Read one top-level scalar key from front matter. Nested blocks are ignored. */
function frontMatterValue (frontMatter, key) {
  const re = new RegExp(`^${key}\\s*:\\s*(.*)$`, 'm')
  const m = re.exec(String(frontMatter || ''))
  return m ? parseScalar(m[1]) : null
}

function frontMatterList (frontMatter, key) {
  const lines = String(frontMatter || '').split(/\r?\n/)
  const start = lines.findIndex(line => new RegExp(`^${key}\\s*:`).test(line))
  if (start === -1) return []
  const inline = /\[(.*)\]/.exec(lines[start])
  if (inline) {
    return inline[1].split(',').map(parseScalar).filter(Boolean)
  }
  const items = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!/^\s*[-*]\s+/.test(line)) break
    items.push(parseScalar(line.replace(/^\s*[-*]\s+/, '')))
  }
  return items
}

function indentContent (content) {
  return String(content)
    .replace(/^\r?\n/, '')
    .replace(/\s+$/, '')
    .split(/\r?\n/)
    .map(line => (line ? `  ${line}` : ''))
    .join('\n')
}

/** `{% note info icon %}body{% endnote %}` → labelled blockquote. */
function convertNotes (body) {
  return body.replace(
    /\{%\s*(sub)?note\s+([^%]*?)\s*%\}([\s\S]*?)\{%\s*end\1?note\s*%\}/g,
    (match, sub, args, content) => {
      const tokens = String(args).trim().split(/\s+/).filter(Boolean)
      const label = tokens.find(t => ['default', 'primary', 'info', 'success', 'warning', 'danger', 'flat', 'modern', 'simple'].includes(t)) || 'note'
      const title = label.charAt(0).toUpperCase() + label.slice(1)
      return `> **${sub ? 'Sub-note' : `Note (${title})`}**\n>\n${indentContent(content)}`
    }
  )
}

/** `{% tabs ... %}<!-- tab A -->x<!-- endtab -->{% endtabs %}` → H3 per tab. */
function convertTabs (body) {
  return body.replace(
    /\{%\s*tabs\s*[^%]*?%\}([\s\S]*?)\{%\s*endtabs\s*%\}/g,
    (match, content) => {
      const re = /<!--\s*tab\s+([^\n>]*?)\s*-->\r?\n?([\s\S]*?)<!--\s*endtab\s*-->/g
      const parts = []
      let m
      while ((m = re.exec(content)) !== null) {
        const caption = String(m[1]).split('@')[0].trim()
        const text = String(m[2]).replace(/^\s+|\s+$/g, '')
        parts.push(caption ? `### ${caption}\n\n${text}` : text)
      }
      return parts.length ? parts.join('\n\n') : content.trim()
    }
  )
}

/** `{% hideToggle label %}body{% endhideToggle %}` → bold label + body. */
function convertHide (body) {
  let out = body.replace(
    /\{%\s*hideToggle\s+([^%]*?)\s*%\}([\s\S]*?)\{%\s*endhideToggle\s*%\}/g,
    (match, label, content) => {
      const title = String(label).trim() || 'Details'
      return `**${title}**\n\n${String(content).replace(/^\s+|\s+$/g, '')}`
    }
  )
  out = out.replace(
    /\{%\s*hideBlock\s+([^%]*?)\s*%\}([\s\S]*?)\{%\s*endhideBlock\s*%\}/g,
    (match, label, content) => {
      const title = String(label).trim()
      const text = String(content).replace(/^\s+|\s+$/g, '')
      return title ? `**${title}**\n\n${text}` : text
    }
  )
  out = out.replace(
    /\{%\s*hideInline\s+([^%]*?)\s*%\}/g,
    (match, args) => {
      const [content, shown] = String(args).split(',').map(s => s.trim())
      return `*${shown || 'Hidden'}*: ${content}`
    }
  )
  return out
}

function convertSeriesTag (body) {
  return body.replace(
    /\{%\s*series\s*([^%]*?)\s*%\}/g,
    (match, args) => {
      const name = String(args).trim()
      return name ? `> Series: ${name}` : '> Series: see the series landing page linked from the site index.'
    }
  )
}

function convertTimeline (body) {
  return body.replace(
    /\{%\s*timeline\s*([^%]*?)\s*%\}([\s\S]*?)\{%\s*endtimeline\s*%\}/g,
    (match, args, content) => {
      const headline = String(args).split(',')[0].trim()
      const items = []
      const re = /<!--\s*timeline\s*([^\n]*?)\s*-->\r?\n?([\s\S]*?)<!--\s*endtimeline\s*-->/g
      let m
      while ((m = re.exec(content)) !== null) {
        const title = String(m[1]).trim()
        const text = String(m[2]).replace(/^\s+|\s+$/g, '')
        items.push(`- **${title || 'Entry'}**\n${indentContent(text)}`)
      }
      const list = items.join('\n')
      return [headline ? `**${headline}**` : '', list].filter(Boolean).join('\n\n')
    }
  )
}

function convertGalleries (body) {
  return body.replace(
    /\{%\s*gallery\s*([^%]*?)\s*%\}([\s\S]*?)\{%\s*endgallery\s*%\}/g,
    (match, args, content) => String(content).replace(/^\s+|\s+$/g, '')
  )
}

/** Code-bearing tags → fenced blocks. Never drop the payload. */
function convertCodeTags (body) {
  let out = body.replace(
    /\{%\s*mermaid\s*([^%]*?)\s*%\}([\s\S]*?)\{%\s*endmermaid\s*%\}/g,
    (match, args, content) => `\`\`\`mermaid\n${String(content).replace(/^\s+|^\r?\n|\s+$/g, '').replace(/\s+$/, '')}\n\`\`\``
  )
  out = out.replace(
    /\{%\s*codeblock\s+([^%,\s]+)([^%]*?)\s*%\}([\s\S]*?)\{%\s*endcodeblock\s*%\}/g,
    (match, lang, rest, content) => {
      const title = String(rest || '').trim().replace(/^[,\s]+/, '')
      const body = String(content).replace(/^\r?\n/, '').replace(/\s+$/, '')
      return `${title ? `**${title}**\n\n` : ''}\`\`\`${lang}\n${body}\n\`\`\``
    }
  )
  out = out.replace(
    /\{%\s*code\s+([^%]*?)\s*%\}([\s\S]*?)\{%\s*endcode\s*%\}/g,
    (match, args, content) => {
      const tokens = String(args).trim().split(/\s+/)
      const lang = /^[a-z0-9+#-]+$/i.test(tokens[0] || '') ? tokens[0] : ''
      const body = String(content).replace(/^\r?\n/, '').replace(/\s+$/, '')
      return `\`\`\`${lang}\n${body}\n\`\`\``
    }
  )
  out = out.replace(
    /\{%\s*(?:chartjs|score)\s*([^%]*?)\s*%\}([\s\S]*?)\{%\s*end(?:chartjs|score)\s*%\}/g,
    (match, args, content) => `\`\`\`text\n${String(content).replace(/^\s+|\s+$/g, '')}\n\`\`\``
  )
  return out
}

/** Inline tags → plain Markdown syntax. */
function convertInlineTags (body) {
  let out = body.replace(
    /\{%\s*(?:asset_)?img\s+([^%]*?)\s*%\}/g,
    (match, args) => {
      const [src = '', alt = ''] = String(args).split(',').map(s => s.trim())
      return `![${alt}](${src})`
    }
  )
  out = out.replace(
    /\{%\s*inlineImg\s+([^%]*?)\s*%\}/g,
    (match, args) => {
      const [src = '', alt = ''] = String(args).split(',').map(s => s.trim())
      return `![${alt}](${src})`
    }
  )
  out = out.replace(
    /\{%\s*label\s+([^%]*?)\s*%\}/g,
    (match, args) => {
      const [text = ''] = String(args).split(',').map(s => s.trim())
      return text
    }
  )
  out = out.replace(
    /\{%\s*btn\s+([^%]*?)\s*%\}/g,
    (match, args) => {
      const [url = '', text = ''] = String(args).split(',').map(s => s.trim())
      return `[${text || url}](${url})`
    }
  )
  out = out.replace(
    /\{%\s*flink\s*([^%]*?)\s*%\}([\s\S]*?)\{%\s*endflink\s*%\}/g,
    (match, args, content) => {
      // Friend links are a YAML block; keep the raw block readable instead of
      // inventing a table whose columns may differ per site.
      return `\`\`\`yaml\n${String(content).replace(/^\s+|\s+$/g, '')}\n\`\`\``
    }
  )
  out = out.replace(
    /\{%\s*(?:post_link|link)\s+([^%]*?)\s*%\}/g,
    (match, args) => {
      const [slug = '', title = ''] = String(args).split(',').map(s => s.trim())
      return `[${title || slug}](${slug})`
    }
  )
  return out
}

/** `{% raw %}…{% endraw %}` keeps its content verbatim. */
function convertRaw (body) {
  return body.replace(/\{%\s*raw\s*%\}([\s\S]*?)\{%\s*endraw\s*%\}/g, (m, content) => content)
}

/**
 * Fallback: keep the inner content of an unknown tag and report the tag name so
 * a missing conversion is visible in the build log instead of dropping silently.
 */
function convertUnknown (body, warnings) {
  const unknownEnd = /\{%\s*end(\w+)\s*%\}/g
  let out = body
  const paired = /\{%\s*(\w+)\s*([^%]*?)\s*%\}/g
  const names = new Set()
  // Report names of tags still present after the known conversions.
  let m
  // `{% endfoo %}` is the closer of a tag already reported; only openers matter.
  while ((m = paired.exec(out)) !== null) {
    if (!/^end/i.test(m[1])) names.add(m[1])
  }
  for (const name of names) {
    const blockRe = new RegExp(`\\{%\\s*${name}\\s*([^%]*?)\\s*%\\}([\\s\\S]*?)\\{%\\s*end${name}\\s*%\\}`, 'g')
    const hadBlock = blockRe.test(out)
    if (hadBlock) {
      out = out.replace(blockRe, (match, args, content) => String(content).replace(/^\s+|\s+$/g, ''))
    }
    const inlineRe = new RegExp(`\\{%\\s*${name}\\s*([^%]*?)\\s*%\\}`, 'g')
    out = out.replace(inlineRe, (match, args) => {
      const arg = String(args).trim()
      return arg ? `*(${name}: ${arg})*` : ''
    })
    out = out.replace(unknownEnd, (match) => (match.includes(name) ? '' : match))
    if (Array.isArray(warnings)) {
      warnings.push(`markdown mirror: unsupported tag \`${name}\` converted to plain content`)
    }
  }
  return out
}

/**
 * Convert a raw Markdown body into the mirror body.
 * @returns {{markdown: string, warnings: string[]}}
 */
function convertBody (rawBody, options = {}) {
  const warnings = []
  let body = String(rawBody == null ? '' : rawBody)
  body = body.replace(/\r\n/g, '\n')
  // `<!-- more -->` is a Hexo excerpt marker: it splits the homepage summary and has
  // no meaning in Markdown, so it is residue rather than content.
  body = body.replace(/<!--\s*more\s*-->/gi, '')
  body = convertRaw(body)
  body = convertNotes(body)
  body = convertTabs(body)
  body = convertHide(body)
  body = convertTimeline(body)
  body = convertGalleries(body)
  body = convertCodeTags(body)
  body = convertSeriesTag(body)
  body = convertInlineTags(body)
  body = convertUnknown(body, warnings)
  body = absolutizeLinks(body, options.baseUrl)
  body = body.replace(/\n{3,}/g, '\n\n').trim()

  if (options.stripAnchorPlaceholders) {
    body = body.replace(/<a class="markdownIt-Anchor"[^>]*><\/a>/g, '')
  }

  return { markdown: body, warnings }
}

function escapeMd (text) {
  return String(text == null ? '' : text).replace(/([\\[\]])/g, '\\$1').replace(/\r?\n/g, ' ')
}

/**
 * Build the mirror document: short metadata block, then the converted body.
 * Only facts that exist on the post are emitted — no invented summary, no
 * placeholder text, no generated opinions.
 */
function renderMirror (entry, meta = {}) {
  const { markdown, warnings } = convertBody(entry.body, {
    stripAnchorPlaceholders: true,
    baseUrl: entry.canonicalUrl
  })
  const title = entry.title || meta.untitled || 'Untitled'
  const lines = [`# ${title}`, '']

  if (entry.description) lines.push(`> ${escapeMd(entry.description)}`, '')

  const facts = []
  if (entry.dateText) facts.push(`- Published: ${entry.dateText}`)
  if (entry.updatedText && entry.updatedText !== entry.dateText) facts.push(`- Updated: ${entry.updatedText}`)
  if (entry.author) facts.push(`- Author: ${entry.author}`)
  if (entry.seriesTitle) facts.push(`- Series: ${entry.seriesTitle}`)
  if (entry.tags && entry.tags.length) facts.push(`- Tags: ${entry.tags.join(', ')}`)
  if (entry.categories && entry.categories.length) facts.push(`- Categories: ${entry.categories.join(', ')}`)
  if (entry.canonicalUrl) facts.push(`- Original page: ${entry.canonicalUrl}`)
  if (entry.license) {
    facts.push(`- License: ${entry.licenseUrl ? `[${entry.license}](${entry.licenseUrl})` : entry.license}`)
  }
  if (facts.length) lines.push(facts.join('\n'), '')

  lines.push('---', '')

  if (meta.seriesMembers && meta.seriesMembers.length) {
    lines.push('## Chapters', '')
    for (const member of meta.seriesMembers) {
      const link = member.mirrorUrl || member.url
      if (!link) continue
      const suffix = member.description ? `: ${escapeMd(member.description)}` : ''
      lines.push(`- [${escapeMd(member.title)}](${link})${suffix}`)
    }
    lines.push('')
  }

  lines.push(markdown, '')
  return { markdown: `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`, warnings }
}

module.exports = {
  splitFrontMatter,
  frontMatterValue,
  frontMatterList,
  convertBody,
  absolutizeLinks,
  renderMirror,
  escapeMd
}
