// Panda theme — normalization and validation for the two discovery config blocks
// (`site_discovery`, `ai_readable`). Pure module: no `hexo` at module scope, no
// file/network access. Every generator reads its options from here, so one
// malformed value is reported once, with the exact key that is wrong, instead of
// surfacing as an obscure render error three layers deep.
'use strict'

const ROBOTS_PROVIDERS = ['panda', 'external', 'disabled']
const SITEMAP_PROVIDERS = ['external', 'panda', 'disabled']
const ROBOTS_POLICIES = ['balanced', 'permissive', 'custom']
const PATH_STYLES = ['index', 'suffix']
const TRAINING_PREFERENCES = ['deny', 'allow', 'omit']
const GOOGLE_AGENT_MODES = ['omit', 'allow', 'disallow']

function isPlainObject (value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function asObject (value) {
  return isPlainObject(value) ? value : {}
}

// A quoted `"false"` is still a YAML string, and reading it as `true` (the naive
// `typeof === 'boolean' ? value : fallback`) silently inverts the owner's intent:
// they believe the feature is off while it stays on. Accept the two words that
// have an unambiguous meaning and treat anything else as "not a boolean".
function asBool (value, fallback) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase()
    if (text === 'true') return true
    if (text === 'false') return false
  }
  return fallback
}

/** Report a quoted boolean so the owner sees it in the build log. */
function flagQuotedBool (value, key, errors) {
  if (typeof value !== 'string') return
  const text = value.trim().toLowerCase()
  if (text === 'true' || text === 'false') {
    errors.push(`${key} is the string ${JSON.stringify(value)}; write it without quotes so YAML reads it as a boolean`)
  }
}

function asString (value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asInt (value, fallback, min) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const n = Math.trunc(value)
  if (min != null && n < min) return fallback
  return n
}

function asStringList (value) {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
}

// `path` values are site-relative. Normalize to a single canonical form:
//   robots/sitemap: 'robots.txt'      (no leading slash, no trailing slash)
//   pages:          '/ai/'            (leading and trailing slash)
function normalizeFilePath (value, fallback) {
  const raw = asString(value, fallback).replace(/\\/g, '/')
  return raw.replace(/^\/+/, '').replace(/\/+$/, '')
}

function normalizePagePath (value, fallback) {
  const raw = asString(value, fallback).replace(/\\/g, '/')
  const trimmed = raw.replace(/^\/+/, '').replace(/\/+$/, '')
  return trimmed ? `/${trimmed}/` : '/'
}

function normalizeGroups (value) {
  if (!Array.isArray(value)) return []
  const groups = []
  for (const item of value) {
    if (!isPlainObject(item)) continue
    const userAgents = asStringList(item.user_agents || item.userAgents || item['user-agent'])
    const allow = asStringList(item.allow)
    const disallow = asStringList(item.disallow)
    const contentUsage = asStringList(item.content_usage || item.contentUsage)
    if (!userAgents.length && !allow.length && !disallow.length && !contentUsage.length) continue
    groups.push({
      userAgents,
      allow,
      disallow,
      contentUsage,
      note: asString(item.note, null)
    })
  }
  return groups
}

function normalizeProjects (value) {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => isPlainObject(item) && asString(item.name, null) && asString(item.url, null))
    .map((item, index) => ({
      name: asString(item.name, ''),
      url: asString(item.url, ''),
      description: asString(item.description, null),
      order: asInt(item.order, index, 0)
    }))
    .sort((a, b) => a.order - b.order)
}

function normalizeFeatured (value) {
  if (!Array.isArray(value)) return []
  return value
    .map(item => {
      if (typeof item === 'string') return { source: item.trim(), description: null }
      if (!isPlainObject(item)) return null
      const source = asString(item.source || item.path || item.slug, null)
      if (!source) return null
      return { source, description: asString(item.description, null) }
    })
    .filter(Boolean)
}

function normalizeSections (value) {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => isPlainObject(item) && asString(item.title, null))
    .map(item => ({
      title: asString(item.title, ''),
      links: normalizeLinkList(item.links)
    }))
    .filter(section => section.links.length > 0)
}

function normalizeLinkList (value) {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => isPlainObject(item) && asString(item.url, null))
    .map(item => ({
      name: asString(item.name, asString(item.url, '')),
      url: asString(item.url, ''),
      description: asString(item.description, null)
    }))
}

function normalizeTopics (value) {
  return asStringList(value)
}

function normalizeMarkdown (cfg, errors) {
  const raw = asObject(cfg)
  const pathStyle = asString(raw.path_style, 'index').toLowerCase()
  if (!PATH_STYLES.includes(pathStyle)) {
    errors.push(`ai_readable.markdown.path_style must be one of ${PATH_STYLES.join(', ')} (got ${JSON.stringify(raw.path_style)})`)
  }
  return {
    enable: asBool(raw.enable, true),
    include_posts: asBool(raw.include_posts, true),
    include_series: asBool(raw.include_series, true),
    include_pages: asBool(raw.include_pages, false),
    path_style: PATH_STYLES.includes(pathStyle) ? pathStyle : 'index',
    exclude: asStringList(raw.exclude)
  }
}

function normalizeLlms (cfg, errors) {
  const raw = asObject(cfg)
  const recent = asInt(raw.recent_posts, 10, 0)
  if (raw.recent_posts != null && typeof raw.recent_posts === 'number' && recent !== Math.trunc(raw.recent_posts)) {
    errors.push(`ai_readable.llms_txt.recent_posts must be a whole number >= 0 (got ${JSON.stringify(raw.recent_posts)})`)
  }
  if (raw.recent_posts != null && typeof raw.recent_posts !== 'number') {
    errors.push('ai_readable.llms_txt.recent_posts must be a number')
  }
  const path = normalizeFilePath(raw.path, 'llms.txt')
  if (!/\.txt$/i.test(path)) {
    errors.push(`ai_readable.llms_txt.path should end with .txt (got ${JSON.stringify(raw.path)})`)
  }
  return {
    enable: asBool(raw.enable, true),
    path,
    recent_posts: recent,
    series: asBool(raw.series, true),
    topics: asBool(raw.topics, true),
    license: asBool(raw.license, true),
    resources: asBool(raw.resources, true),
    sections: normalizeSections(raw.sections)
  }
}

// Keys 1.2.0 removed because the feature they configured is gone. Silently
// ignoring them is the worst outcome: the site owner believes the setting still
// does something. Report the key and what replaced it instead.
const REMOVED_AI_KEYS = {
  'portal.social_icon.show_on_home': 'the robot icon now always lives in the author card; use portal.social_icon.show_in_author_card',
  'portal.social_icon.row_title': 'the home Follow Me row was removed in 1.2.0; the label comes from portal.social_icon.label'
}

function reportRemovedKeys (portalCfg, errors) {
  const portal = asObject(portalCfg)
  const social = asObject(portal.social_icon)
  if (social.show_on_home !== undefined) {
    errors.push(`ai_readable.portal.social_icon.show_on_home was removed in 1.2.0 and is ignored (${REMOVED_AI_KEYS['portal.social_icon.show_on_home']})`)
  }
  if (social.row_title !== undefined) {
    errors.push(`ai_readable.portal.social_icon.row_title was removed in 1.2.0 and is ignored (${REMOVED_AI_KEYS['portal.social_icon.row_title']})`)
  }
}

function normalizePortal (cfg, errors) {
  const raw = asObject(cfg)
  const social = asObject(raw.social_icon)
  reportRemovedKeys(raw, errors)
  const path = normalizePagePath(raw.path, '/ai/')
  return {
    enable: asBool(raw.enable, true),
    path,
    // A hand-written page at this path is the owner's content; the theme leaves it
    // alone unless this is explicitly turned off.
    respect_existing_pages: asBool(raw.respect_existing_pages, true),
    // No per-portal `intro`/`author_bio`: the portal shares ai_readable.intro and
    // ai_readable.author_bio with llms.txt, so there is one place to edit.
    projects: normalizeProjects(raw.projects),
    featured_posts: normalizeFeatured(raw.featured_posts),
    social_icon: {
      enable: asBool(social.enable, true),
      show_in_author_card: asBool(social.show_in_author_card, true),
      icon: asString(social.icon, 'fas fa-robot'),
      label: asString(social.label, null),
      // A CSS colour for the robot icon; null keeps the theme's icon colour so it
      // sits beside the other social icons instead of standing out.
      color: asString(social.color, null)
    }
  }
}

function normalizeRights (cfg, errors) {
  const raw = asObject(cfg)
  const path = normalizePagePath(raw.path, '/rights/')
  const license = asString(raw.license, 'inherit')
  const licenseUrl = asString(raw.license_url, 'inherit')
  const aiTraining = asString(raw.ai_training, 'deny').toLowerCase()
  if (!TRAINING_PREFERENCES.includes(aiTraining)) {
    errors.push(`ai_readable.rights.ai_training must be one of ${TRAINING_PREFERENCES.join(', ')} (got ${JSON.stringify(raw.ai_training)})`)
  }
  const aiUse = asString(raw.ai_use, 'allow-search')
  const extra = raw.extra == null
    ? null
    : (typeof raw.extra === 'string' ? raw.extra : null)
  if (raw.extra != null && typeof raw.extra !== 'string') {
    errors.push('ai_readable.rights.extra must be a string of Markdown (or null)')
  }
  return {
    enable: asBool(raw.enable, true),
    path,
    // Same rule as the portal: never overwrite a page the owner wrote.
    respect_existing_pages: asBool(raw.respect_existing_pages, true),
    license,
    license_url: licenseUrl,
    contact: asString(raw.contact, null),
    ai_training: TRAINING_PREFERENCES.includes(aiTraining) ? aiTraining : 'deny',
    ai_use: aiUse,
    extra
  }
}

function normalizeRobots (cfg, errors) {
  const raw = asObject(cfg)
  const provider = asString(raw.provider, 'panda').toLowerCase()
  if (!ROBOTS_PROVIDERS.includes(provider)) {
    errors.push(`site_discovery.robots.provider must be one of ${ROBOTS_PROVIDERS.join(', ')} (got ${JSON.stringify(raw.provider)})`)
  }
  const policy = asString(raw.policy, 'balanced').toLowerCase()
  if (!ROBOTS_POLICIES.includes(policy)) {
    errors.push(`site_discovery.robots.policy must be one of ${ROBOTS_POLICIES.join(', ')} (got ${JSON.stringify(raw.policy)})`)
  }
  const path = normalizeFilePath(raw.path, 'robots.txt')
  if (!/\.txt$/i.test(path)) {
    errors.push(`site_discovery.robots.path should end with .txt (got ${JSON.stringify(raw.path)})`)
  }
  const googleAgent = asString(raw.google_agent, 'omit').toLowerCase()
  if (!GOOGLE_AGENT_MODES.includes(googleAgent)) {
    errors.push(`site_discovery.robots.google_agent must be one of ${GOOGLE_AGENT_MODES.join(', ')} (got ${JSON.stringify(raw.google_agent)})`)
  }
  const training = asString(raw.usage_ai_training, 'deny').toLowerCase()
  if (!TRAINING_PREFERENCES.includes(training)) {
    errors.push(`site_discovery.robots.usage_ai_training must be one of ${TRAINING_PREFERENCES.join(', ')} (got ${JSON.stringify(raw.usage_ai_training)})`)
  }
  return {
    provider: ROBOTS_PROVIDERS.includes(provider) ? provider : 'panda',
    path,
    policy: ROBOTS_POLICIES.includes(policy) ? policy : 'balanced',
    sitemap: asBool(raw.sitemap, true),
    disallow: asStringList(raw.disallow),
    allow: asStringList(raw.allow),
    // `custom_groups` is the documented name; `groups` is accepted for tolerance.
    groups: normalizeGroups(raw.custom_groups || raw.groups),
    usage_ai_training: TRAINING_PREFERENCES.includes(training) ? training : 'deny',
    google_agent: GOOGLE_AGENT_MODES.includes(googleAgent) ? googleAgent : 'omit'
  }
}

function normalizeSitemap (cfg, errors) {
  const raw = asObject(cfg)
  const provider = asString(raw.provider, 'panda').toLowerCase()
  if (!SITEMAP_PROVIDERS.includes(provider)) {
    errors.push(`site_discovery.sitemap.provider must be one of ${SITEMAP_PROVIDERS.join(', ')} (got ${JSON.stringify(raw.provider)})`)
  }
  const path = normalizeFilePath(raw.path, 'sitemap.xml')
  if (!/\.xml$/i.test(path)) {
    errors.push(`site_discovery.sitemap.path should end with .xml (got ${JSON.stringify(raw.path)})`)
  }
  return {
    provider: SITEMAP_PROVIDERS.includes(provider) ? provider : 'panda',
    path,
    include_tags: asBool(raw.include_tags, true),
    include_categories: asBool(raw.include_categories, true),
    include_pages: asBool(raw.include_pages, true),
    exclude_noindex: asBool(raw.exclude_noindex, true),
    exclude: asStringList(raw.exclude)
  }
}

function normalizeAiReadable (cfg, errors) {
  const raw = asObject(cfg)
  // On by default since 1.2.0: every output is derived from the site's own posts
  // and config, so enabling costs the user nothing to write.
  const enabled = asBool(raw.enable, true)
  return {
    enable: enabled,
    intro: asString(raw.intro, null),
    author_bio: asString(raw.author_bio, null),
    topics: normalizeTopics(raw.topics),
    llms_txt: normalizeLlms(raw.llms_txt, errors),
    markdown: normalizeMarkdown(raw.markdown, errors),
    portal: normalizePortal(raw.portal, errors),
    rights: normalizeRights(raw.rights, errors)
  }
}

/**
 * Normalize both config blocks. Never throws: unknown/invalid values fall back to
 * documented defaults and are reported in `errors` so the caller can decide
 * between a warning (cosmetic) and a build failure (feature would silently lie).
 */
// Every documented boolean key, so a quoted `"true"`/`"false"` is reported once
// instead of depending on whether each normalizer happens to look at it.
const BOOLEAN_KEYS = [
  'enable', 'include_posts', 'include_series', 'include_pages', 'series', 'topics',
  'license', 'resources', 'respect_existing_pages', 'show_in_author_card',
  'sitemap', 'include_tags', 'include_categories', 'exclude_noindex'
]

function reportQuotedBooleans (block, errors, prefix) {
  const walk = (node, path) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return
    for (const [key, value] of Object.entries(node)) {
      const keyPath = path ? `${path}.${key}` : key
      if (BOOLEAN_KEYS.includes(key)) flagQuotedBool(value, `${prefix}${keyPath}`, errors)
      else if (value && typeof value === 'object' && !Array.isArray(value)) walk(value, keyPath)
    }
  }
  walk(block, '')
}

function normalizeDiscoveryConfig (themeConfig) {
  const theme = asObject(themeConfig)
  const errors = []
  reportQuotedBooleans(theme.site_discovery, errors, 'site_discovery.')
  reportQuotedBooleans(theme.ai_readable, errors, 'ai_readable.')
  const siteDiscovery = asObject(theme.site_discovery)
  const discoveryEnabled = asBool(siteDiscovery.enable, true)
  const robots = normalizeRobots(siteDiscovery.robots, errors)
  const sitemap = normalizeSitemap(siteDiscovery.sitemap, errors)
  if (!discoveryEnabled) {
    if (robots.provider === 'panda') robots.provider = 'external'
    if (sitemap.provider === 'panda') sitemap.provider = 'external'
  }
  return {
    discovery: {
      enable: discoveryEnabled,
      robots,
      sitemap
    },
    ai: normalizeAiReadable(theme.ai_readable, errors),
    errors
  }
}

/**
 * Cross-check that only runs when the theme actually has the theme config loaded.
 * Returns human-readable strings; the caller logs them once per build.
 */
function describeActive (config) {
  const lines = []
  const { discovery, ai } = config
  if (discovery.robots.provider === 'panda') lines.push(`robots.txt: panda (${discovery.robots.policy})`)
  if (discovery.sitemap.provider === 'panda') lines.push(`sitemap.xml: panda (${discovery.sitemap.path})`)
  if (ai.enable) {
    if (ai.llms_txt.enable) lines.push('llms.txt')
    if (ai.markdown.enable) lines.push('markdown mirrors')
    if (ai.portal.enable) lines.push(`portal ${ai.portal.path}`)
    if (ai.rights.enable) lines.push(`rights ${ai.rights.path}`)
  }
  return lines
}

module.exports = {
  ROBOTS_PROVIDERS,
  SITEMAP_PROVIDERS,
  ROBOTS_POLICIES,
  PATH_STYLES,
  TRAINING_PREFERENCES,
  normalizeDiscoveryConfig,
  normalizePagePath,
  normalizeFilePath,
  asStringList,
  describeActive
}
