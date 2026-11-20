// Panda theme — optional curated content for llms.txt and the /ai/ portal.
//
// A site can hand-pick featured posts, describe topics and list projects in
// `source/_data/ai.yml`. Reading it here (instead of only from `_config.yml`)
// keeps the theme's config free of personal data: the theme default stays empty,
// and a blog supplies its own file without touching the theme package.
//
// Precedence is deliberate — the data file *adds to and refines* the theme config,
// never silently discards it:
//   * text fields (`intro`, `author_bio`) fall back to config when absent;
//   * `featured` / `projects` / `sections` from the file win when non-empty,
//     because a curated list is an explicit editorial decision;
//   * `topics` merge by name, file descriptions taking priority.
'use strict'

function asArray (value) {
  return Array.isArray(value) ? value : []
}

function asString (value) {
  return value == null ? null : String(value)
}

/** The raw `source/_data/ai.yml`, or an empty object when the site has none. */
function readAiData (hexo) {
  const site = (hexo && hexo.locals && typeof hexo.locals.get === 'function') ? hexo.locals.get('data') : null
  const data = site && site.ai
  return data && typeof data === 'object' ? data : {}
}

function normalizeFeatured (list) {
  const out = []
  for (const item of asArray(list)) {
    if (typeof item === 'string') {
      out.push({ source: item, description: null })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const source = asString(item.source)
    if (!source) continue
    out.push({ source, description: asString(item.summary || item.description) })
  }
  return out
}

function normalizeProjects (list) {
  return asArray(list)
    .filter(item => item && typeof item === 'object' && item.name && item.url)
    .map(item => ({
      name: String(item.name).trim(),
      url: String(item.url).trim(),
      description: item.description == null ? null : String(item.description).trim(),
      order: Number.isFinite(item.order) ? item.order : null
    }))
}

function normalizeTopics (list) {
  return asArray(list)
    .filter(item => item && typeof item === 'object' && item.name)
    .map(item => ({ name: String(item.name).trim(), description: item.description == null ? null : String(item.description).trim() }))
}

/**
 * Merge the data file over the normalized theme config.
 * @param {object} ai      normalized `ai_readable` config (from discovery-config)
 * @param {object} data    raw `source/_data/ai.yml`
 * @param {object} site    `hexo.config` (for `description`, `title`)
 */
function mergeAiData (ai, data, site = {}) {
  const cfg = ai || {}
  const file = data || {}
  const fileFeatured = normalizeFeatured(file.featured)
  const fileProjects = normalizeProjects(file.projects)
  const fileTopics = normalizeTopics(file.topics)

  const configFeatured = ((cfg.portal && cfg.portal.featured_posts) || []).map(item => {
    if (typeof item === 'string') return { source: item, description: null }
    return { source: item.source, description: item.description == null ? null : String(item.description) }
  })
  const configProjects = ((cfg.portal && cfg.portal.projects) || []).map(project => ({
    name: project.name,
    url: project.url,
    description: project.description,
    order: project.order == null ? null : project.order
  }))
  const configTopics = (cfg.topics || []).map(name => ({ name, description: null }))

  // Topics merge by name: the data file's description wins, config order is kept
  // for names they share, then the file's extras are appended.
  const topicByName = new Map()
  for (const topic of [...configTopics, ...fileTopics]) {
    if (!topic || !topic.name) continue
    const existing = topicByName.get(topic.name)
    topicByName.set(topic.name, {
      name: topic.name,
      description: topic.description || (existing && existing.description) || null
    })
  }

  const featured = fileFeatured.length ? fileFeatured : configFeatured
  const projects = (fileProjects.length ? fileProjects : configProjects)
    .slice()
    .sort((a, b) => {
      if (a.order == null && b.order == null) return 0
      if (a.order == null) return 1
      if (b.order == null) return -1
      return a.order - b.order
    })
  const siteBlock = file.site && typeof file.site === 'object' ? file.site : {}
  const aboutBlock = file.about && typeof file.about === 'object' ? file.about : {}

  return {
    intro: cfg.intro || asString(siteBlock.description) || asString(siteBlock.tagline) || null,
    authorBio: cfg.author_bio || asString(aboutBlock.description) || null,
    author: asString(aboutBlock.name) || asString(site.author) || null,
    contact: asString(aboutBlock.contact) || (cfg.rights && cfg.rights.contact) || null,
    tagline: asString(siteBlock.tagline) || asString(site.description) || null,
    organization: asString(siteBlock.organization) || null,
    notes: file.notes && typeof file.notes === 'object' ? file.notes : {},
    topics: [...topicByName.values()],
    featured,
    projects,
    latestCount: Number.isSafeInteger(file.latest_count) && file.latest_count >= 0 ? file.latest_count : null
  }
}

module.exports = { readAiData, mergeAiData, normalizeFeatured, normalizeProjects, normalizeTopics }
