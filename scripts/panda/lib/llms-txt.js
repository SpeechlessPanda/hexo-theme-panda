// Panda theme — llms.txt (v2 proposal) rendering.
//
// Structure is fixed by the proposal: an H1, a blockquote summary, optional prose,
// then H2 sections holding `- [name](url): notes` lists. The file must stay small:
// it is an index of what exists, not a dump of the content. Every link points at
// the Markdown mirror when one was generated, and at the HTML page otherwise.
'use strict'

function escapeMd (text) {
  return String(text == null ? '' : text)
    .replace(/\\/g, '\\\\')
    .replace(/([\[\]])/g, '\\$1')
    .replace(/\r?\n/g, ' ')
    .trim()
}

function link (name, url, description) {
  const label = escapeMd(name) || url
  const note = description ? `: ${escapeMd(description)}` : ''
  return `- [${label}](${url})${note}`
}

/**
 * Render one entry, plus any nested lines. A series lists its chapters this way
 * instead of repeating every chapter as a top-level link, and a featured post can
 * expose its mirror as a sub-item — both are still plain Markdown lists, which is
 * what the proposal expects, but the reader sees the hierarchy.
 */
function renderEntry (entry) {
  if (!entry || !entry.url) return ''
  const lines = [link(entry.name, entry.url, entry.description)]
  for (const child of entry.children || []) {
    if (!child || !child.url) continue
    const childNote = child.description ? `: ${escapeMd(child.description)}` : ''
    lines.push(`  - [${escapeMd(child.name) || child.url}](${child.url})${childNote}`)
  }
  return lines.join('\n')
}

/**
 * @param {object} model
 * @param {string} model.siteTitle
 * @param {string} model.summary            one-sentence blockquote
 * @param {string[]} model.background       plain paragraphs under the blockquote
 * @param {Array<{title:string, entries:Array}>} model.sections
 * @param {Array<{title:string, entries:Array}>} model.optional
 */
function renderLlmsTxt (model) {
  const lines = []
  lines.push(`# ${escapeMd(model.siteTitle || 'Site')}`, '')

  const summary = String(model.summary || '').replace(/\r?\n/g, ' ').trim()
  if (summary) {
    lines.push(`> ${summary}`, '')
  }

  for (const paragraph of model.background || []) {
    const text = String(paragraph || '').trim()
    if (text) lines.push(text, '')
  }

  for (const section of model.sections || []) {
    if (!section) continue
    // A section may be prose only (`body`), which is how the site explains its own
    // content organisation before listing anything.
    if (!section.entries || !section.entries.length) {
      if (!section.body) continue
    }
    lines.push(`## ${escapeMd(section.title)}`, '')
    if (section.body) lines.push(String(section.body).trim(), '')
    for (const entry of section.entries || []) {
      const rendered = renderEntry(entry)
      if (rendered) lines.push(rendered)
    }
    lines.push('')
  }

  const optional = (model.optional || []).filter(section => section && section.entries && section.entries.length)
  if (optional.length) {
    lines.push('## Optional', '')
    for (const section of optional) {
      for (const entry of section.entries) {
        const rendered = renderEntry(entry)
        if (rendered) lines.push(rendered)
      }
    }
    lines.push('')
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

/**
 * Index entries for llms.txt.
 *
 * Selection rules that belong to the file, not to its caller:
 *   * `ai_readable: false` (or `noindex`) content is never listed — a post can stay
 *     in the sitemap while being kept out of the agent-facing index;
 *   * `limit` caps the list so llms.txt does not grow with the archive;
 *   * the mirror URL wins over the HTML page, so agents get clean text.
 */
function contentEntries (items, options = {}) {
  const { limit, mirrorUrlFor, pageUrlFor, untitled } = options
  const list = (items || []).filter(item => item && item.ai !== false && item.noindex !== true)
  const capped = typeof limit === 'number' && limit >= 0 ? list.slice(0, limit) : list
  return capped.map(item => {
    const mirror = typeof mirrorUrlFor === 'function' ? mirrorUrlFor(item) : null
    return {
      name: item.title || untitled || 'Untitled',
      url: mirror || pageUrlFor(item),
      description: item.description || null,
      mirror: !!mirror
    }
  })
}

/**
 * Produce the section model from the content index. Kept separate from rendering
 * so the verifier can assert on data instead of regexing the file it just wrote.
 */
function buildLlmsModel (input) {
  const {
    siteTitle,
    summary,
    background,
    featured,
    recent,
    series,
    projects,
    resources,
    extraSections,
    optional,
    headings
  } = input

  // Section titles follow the site language (they come from the language files);
  // English is the fallback so an untranslated locale still produces valid output.
  const labels = {
    featured: (headings && headings.featured) || 'Featured',
    articles: (headings && headings.articles) || 'Articles',
    series: (headings && headings.series) || 'Series',
    projects: (headings && headings.projects) || 'Projects',
    resources: (headings && headings.resources) || 'Resources'
  }

  const sections = []
  if (featured && featured.length) {
    sections.push({ title: labels.featured, entries: featured })
  }
  if (recent && recent.length) {
    sections.push({ title: labels.articles, entries: recent })
  }
  if (series && series.length) {
    sections.push({ title: labels.series, entries: series })
  }
  if (projects && projects.length) {
    sections.push({ title: labels.projects, entries: projects })
  }
  for (const section of extraSections || []) {
    // A section may be prose only (`body`), which is how a site states its license
    // and AI preference without inventing links.
    if (!section) continue
    if ((section.entries && section.entries.length) || section.body) sections.push(section)
  }
  if (resources && resources.length) {
    sections.push({ title: labels.resources, entries: resources })
  }

  const optionalSections = (optional || []).filter(section => section && section.entries && section.entries.length)

  return {
    siteTitle,
    summary,
    background: background || [],
    sections,
    optional: optionalSections
  }
}

module.exports = { renderLlmsTxt, buildLlmsModel, contentEntries, escapeMd }
