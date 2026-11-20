// Panda theme — discovery generators: robots.txt, sitemap.xml, llms.txt, Markdown
// mirrors, the /ai/ portal and the /rights/ policy page.
//
// Design rules that shaped this file:
//   * one content index per build (lib/discovery-state.js), shared by every output;
//   * generators own routes, filters own data — no output is written from a filter;
//   * `external` providers register nothing, and panda providers refuse to register
//     when another plugin already claims the same path (two generators fighting over
//     robots.txt is how a site loses its rules silently);
//   * nothing here reads the network, spawns a process or calls an AI API.
'use strict'

const { url_for } = require('hexo-util')

const { config: discoveryConfig, index: contentIndex, reset, registerMirror, mirrorFor, reportConfig, issueOnce, hasSiteAsset } = require('./lib/discovery-state')
const { flags, markdownTargets, sitemapTargets, cleanDescription } = require('./lib/content-collect')
const { prettyUrlsOptions, pageUrl, pagePath, mirrorRoutePath, mirrorUrlPath, toSiteUrl, resolveRelative } = require('./lib/site-url')
const { renderRobots, sitemapUrlFor, detectGeneratorConflicts, conflictMessage } = require('./lib/robots')
const { renderSitemap } = require('./lib/sitemap')
const { renderLlmsTxt, buildLlmsModel, contentEntries, escapeMd } = require('./lib/llms-txt')
const { splitFrontMatter, frontMatterValue, renderMirror } = require('./lib/markdown-mirror')
const { readAiData, mergeAiData } = require('./lib/ai-data')

const THEME_VERSION = require('../../package.json').version

// Hexo preserves parsed site overrides separately from the theme defaults.
function providerIsExplicit (hexo, kind) {
  const provider = hexo.config.theme_config?.site_discovery?.[kind]?.provider
  return typeof provider === 'string' && provider.trim().toLowerCase() === 'panda'
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function i18n (hexo, key, fallback, ...args) {
  const language = hexo.config && hexo.config.language
  const code = Array.isArray(language) ? language[0] : (language || 'en')
  try {
    const translate = hexo.theme.i18n.__(code)
    const text = args.length ? translate(key, ...args) : translate(key)
    if (text && text !== key) return text
  } catch (_) {}
  return fallback
}

function siteTitle (hexo) {
  return (hexo.config && (hexo.config.title || hexo.config.author)) || 'Site'
}

function summaryFor (hexo, ai) {
  if (ai.intro) return ai.intro
  const description = hexo.config && hexo.config.description
  if (description) return String(description).replace(/\r?\n/g, ' ').trim()
  return i18n(hexo, 'ai_readable.llms.summary_fallback', `${siteTitle(hexo)} — public articles, series and resources.`)
}

function authorBio (hexo, ai) {
  if (ai.author_bio) return ai.author_bio
  const author = hexo.config && hexo.config.author
  if (author) return i18n(hexo, 'ai_readable.llms.author_fallback', `Maintained by ${author}.`, author)
  return null
}

function rootPath (routePath) {
  return String(routePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
}

// Canonical absolute URL for a route path. Generated routes carry an explicit
// `index.html`; the URL a reader (or an agent) sees in the address bar is the
// directory form, so that is what llms.txt, sitemaps and <link> tags advertise.
/**
 * Absolute URL for a page route, byte-identical to `<link rel="canonical">`.
 * `pageUrl` supplies the `index.html` the route path omits and then applies
 * `pretty_urls`, which is exactly what Hexo's `urlNoIndex` does. Sitemap locs,
 * llms.txt links and the portal all go through here so no two outputs can drift.
 */
function absoluteFor (hexo, routePath) {
  return pageUrl(hexo.config.url, rootPath(routePath), prettyUrlsOptions(hexo.config))
}

function mirrorForRoute (hexo, mirrorCfg, routePath) {
  const route = mirrorRoutePath(routePath, mirrorCfg.path_style)
  if (!route) return null
  // A mirror is a real file (`…/index.md`), so `pretty_urls` must not strip it;
  // passing no options keeps the exact path the generator writes to disk.
  return { route, url: mirrorUrlPath(hexo.config.root, route) }
}

function tagNames (item) {
  const tags = item && item.tags
  if (!tags) return []
  const list = Array.isArray(tags) ? tags : (tags.data || [])
  return list.map(tag => (typeof tag === 'string' ? tag : tag && tag.name)).filter(Boolean)
}

function categoryNames (item) {
  const categories = item && item.categories
  if (!categories) return []
  const list = Array.isArray(categories) ? categories : (categories.data || [])
  return list.map(cat => (typeof cat === 'string' ? cat : cat && cat.name)).filter(Boolean)
}

// ---------------------------------------------------------------------------
// Markdown mirror generation (runs first: llms.txt and the head partial read it)
// ---------------------------------------------------------------------------

function buildMirrors (hexo, locals) {
  const cfg = discoveryConfig(hexo)
  const ai = cfg.ai
  if (!ai.enable || !ai.markdown.enable) return []

  const index = contentIndex(hexo, locals)
  const targets = markdownTargets(index, hexo.theme.config)
  const license = ai.rights.enable ? resolveLicense(hexo, ai.rights) : null
  const routeBySource = new Map()
  const mirrorOwners = new Map() // mirror route -> source that produced it
  const routes = []

  // Pass 1: route + URL for every target, so cross-links (series chapters) can be
  // resolved before any file is rendered.
  const planned = []
  for (const target of targets) {
    const sourceKey = target.source.replace(/\\/g, '/')
    const routePath = rootPath(target.path)
    const mirror = mirrorForRoute(hexo, ai.markdown, routePath)
    if (!mirror) continue
    if (routeBySource.has(`${sourceKey}#${target.kind}`)) continue
    // Two different sources landing on one mirror path means one of them would
    // silently overwrite the other. `path_style: index` makes this possible when a
    // post lives at `a/index.md` while another page routes to `a/`.
    const owner = mirrorOwners.get(mirror.route)
    if (owner && owner !== sourceKey) {
      throw new Error(`[panda] Markdown mirror path collision: ${JSON.stringify(mirror.route)} `
        + `would be written for both ${JSON.stringify(owner)} and ${JSON.stringify(sourceKey)}. `
        + 'Change ai_readable.markdown.path_style or one of the page permalinks.')
    }
    mirrorOwners.set(mirror.route, sourceKey)
    routeBySource.set(`${sourceKey}#${target.kind}`, mirror)
    const pageUrl = absoluteFor(hexo, routePath)
    const entry = {
      title: target.title,
      description: target.description,
      dateText: target.dateText,
      updatedText: target.updatedText,
      tags: tagNames(target),
      categories: categoryNames(target),
      canonicalUrl: pageUrl,
      license: license ? license.license : null,
      licenseUrl: license ? license.licenseUrl : null,
      author: (hexo.config && hexo.config.author) || null,
      body: '',
      seriesTitle: target.kind === 'series-member' ? (target.seriesTitle || null) : null
    }
    planned.push({ target, mirror, entry, routePath })
    registerMirror(routePath, mirror.url)
  }

  // Pass 2: render.
  for (const item of planned) {
    const { target, mirror, entry } = item
    const raw = target.raw || ''
    const split = splitFrontMatter(raw)
    entry.body = split.body
    if (!entry.description) {
      const fmDesc = frontMatterValue(split.frontMatter, 'description')
      if (fmDesc) entry.description = cleanDescription(fmDesc)
    }
    if (target.kind === 'series-index') {
      entry.seriesTitle = null
      entry.title = target.title
      // Chapter links are absolute inside the mirror: an agent may have fetched this
      // file from a cache or a repository and still needs a resolvable target.
      const members = (target.members || []).filter(member => member.ai).map(member => {
        const sibling = routeBySource.get(`${member.source.replace(/\\/g, '/')}#series-member`)
        return {
          title: member.title,
          description: member.description,
          mirrorUrl: sibling ? absoluteFor(hexo, sibling.route) : null,
          url: absoluteFor(hexo, member.path)
        }
      })
      const rendered = renderMirror(entry, {
        untitled: i18n(hexo, 'ai_readable.untitled', 'Untitled'),
        seriesMembers: members
      })
      routes.push({ path: mirror.route, data: rendered.markdown })
      pushWarnings(hexo, rendered.warnings)
      continue
    }
    if (!entry.description) {
      const firstParagraph = String(split.body || '').replace(/^\s+/, '').split(/\n\s*\n/)[0] || ''
      const plain = firstParagraph.replace(/[#>*_`[\]]/g, ' ').replace(/\s+/g, ' ').trim()
      if (plain && !/^!?\[/.test(plain)) entry.description = cleanDescription(plain, 160)
    }
    const rendered = renderMirror(entry, { untitled: i18n(hexo, 'ai_readable.untitled', 'Untitled') })
    routes.push({ path: mirror.route, data: rendered.markdown })
    pushWarnings(hexo, rendered.warnings)
  }

  return routes
}

function pushWarnings (hexo, warnings) {
  for (const warning of warnings || []) issueOnce(hexo, `md:${warning}`, 'warn', `[panda] ${warning}`)
}

// ---------------------------------------------------------------------------
// license resolution (shared by mirrors and the rights page)
// ---------------------------------------------------------------------------

function resolveLicense (hexo, rights) {
  const postCopyright = (hexo.theme.config && hexo.theme.config.post_copyright) || {}
  const inherit = rights.license === 'inherit' || rights.license == null
  const license = inherit ? (postCopyright.enable ? postCopyright.license || null : null) : rights.license
  const inheritUrl = rights.license_url === 'inherit' || rights.license_url == null
  const licenseUrl = !license ? null : (inheritUrl ? (inherit ? postCopyright.license_url || null : null) : rights.license_url)
  return { license, licenseUrl, inherited: inherit }
}

// ---------------------------------------------------------------------------
// llms.txt
// ---------------------------------------------------------------------------

function llmsEntryOptions (hexo) {
  return {
    mirrorUrlFor: item => {
      const mirror = mirrorFor(item.path)
      return mirror ? new URL(mirror, hexo.config.url).href : null
    },
    pageUrlFor: item => absoluteFor(hexo, item.path),
    untitled: i18n(hexo, 'ai_readable.untitled', 'Untitled')
  }
}

function resolveFeatured (hexo, index, entries) {
  // Chapters live under their series, not in `articles`, and editors frequently
  // feature one. Searching all three lists is what makes a curated `source:` path
  // resolve no matter how the post is organised.
  const all = [
    ...index.articles.filter(item => item.ai),
    ...index.series.filter(item => item.ai),
    ...index.series.flatMap(series => series.members).filter(item => item.ai)
  ]
  const out = []
  const used = new Set()
  for (const wanted of entries || []) {
    const key = String(wanted.source || '').replace(/\\/g, '/')
    const slug = key.replace(/^_posts\//, '').replace(/\.(md|markdown|mkd|mdwn|mdtxt|mdtext)$/i, '')
    const hit = all.find(item => {
      const src = String(item.source || '').replace(/\\/g, '/')
      const itemSlug = src.replace(/^_posts\//, '').replace(/\/index\.(md|markdown)$/i, '').replace(/\.(md|markdown|mkd|mdwn|mdtxt|mdtext)$/i, '')
      return src === key || itemSlug === slug || item.path === key || String(item.title) === wanted.source
    })
    if (!hit || used.has(hit)) {
      if (!hit) issueOnce(hexo, `featured:${key}`, 'warn', `[panda] ai_readable.portal.featured_posts: no post matches "${wanted.source}"`)
      continue
    }
    used.add(hit)
    out.push({ item: hit, description: wanted.description })
  }
  return out
}

/**
 * Theme config merged with the site's optional `source/_data/ai.yml`. Both
 * llms.txt and the portal read this, so a curated featured list cannot show up in
 * one and disappear from the other.
 */
function curated (hexo) {
  const cfg = discoveryConfig(hexo)
  return mergeAiData(cfg.ai, readAiData(hexo), hexo.config)
}

function buildLlms (hexo, locals, routes) {
  const cfg = discoveryConfig(hexo)
  const ai = cfg.ai
  if (!ai.enable || !ai.llms_txt.enable) return
  const index = contentIndex(hexo, locals)
  const entryOptions = llmsEntryOptions(hexo)

  const curatedAi = curated(hexo)
  const featured = resolveFeatured(hexo, index, curatedAi.featured)
  const featuredEntries = featured.map(({ item, description }) => {
    const entry = contentEntries([item], entryOptions)[0]
    if (description) entry.description = description
    return entry
  })

  const recentEntries = contentEntries(index.articles, { ...entryOptions, limit: ai.llms_txt.recent_posts })

  const eligibleSeries = ai.llms_txt.series ? index.series.filter(series => series.ai) : []
  const seriesEntries = ai.llms_txt.series
    ? contentEntries(eligibleSeries, entryOptions).map((entry, i) => {
        const series = eligibleSeries[i]
        // Keep the chapters reachable from the series entry instead of flattening them
        // into the article list, so a reader sees the reading order in one place.
        entry.children = series.members.map(member => {
          const chapter = contentEntries([member], entryOptions)[0]
          if (!chapter) return null
          return {
            name: `${member.title}`,
            url: chapter.url,
            description: chapter.description
          }
        }).filter(Boolean)
        entry.description = entry.description || `${entry.children.length} chapters`
        return entry
      })
    : []

  const projectEntries = curatedAi.projects.map(project => ({
    name: project.name,
    url: toSiteUrl(hexo.config.root, project.url),
    description: project.description
  }))

  const resources = []
  if (ai.llms_txt.resources) {
    const sitemapPath = publishedSitemapPath(hexo, cfg)
    if (sitemapPath) {
      resources.push({
        name: sitemapPath,
        url: absoluteFor(hexo, sitemapPath),
        description: i18n(hexo, 'ai_readable.llms.resource_sitemap', 'All indexable pages')
      })
    }
    const feed = (hexo.theme.config && hexo.theme.config.feed) || {}
    if (feed.enable === true) {
      resources.push({
        name: feed.path || 'atom.xml',
        url: absoluteFor(hexo, feed.path || 'atom.xml'),
        description: i18n(hexo, 'ai_readable.llms.resource_feed', 'Latest articles and memos as Atom')
      })
    }
    if (hasArchive(hexo, locals)) {
      resources.push({
        name: i18n(hexo, 'ai_readable.llms.resource_archive', 'Archives'),
        url: absoluteFor(hexo, `${hexo.config.archive_dir || 'archives'}/`),
        description: i18n(hexo, 'ai_readable.llms.resource_archive_desc', 'Chronological index of every article')
      })
    }
    if (ai.portal.enable) {
      resources.push({
        name: i18n(hexo, 'ai_readable.portal.title', 'AI reading guide'),
        url: absoluteFor(hexo, ai.portal.path),
        description: i18n(hexo, 'ai_readable.llms.resource_portal', 'Human-readable guide to this site’s machine-readable resources')
      })
    }
    if (ai.rights.enable) {
      resources.push({
        name: i18n(hexo, 'ai_readable.rights.title', 'Copyright and usage policy'),
        url: absoluteFor(hexo, ai.rights.path),
        description: i18n(hexo, 'ai_readable.llms.resource_rights', 'Licensing, attribution and AI usage preferences')
      })
    }
  }

  const extraSections = (ai.llms_txt.sections || []).map(section => ({
    title: section.title,
    entries: section.links.map(link => ({
      name: link.name,
      url: toSiteUrl(hexo.config.root, link.url),
      description: link.description
    }))
  }))

  // Topic index: a curated one-liner per subject is more useful to an agent than a
  // bare tag cloud, and it is the only view that says what a tag is *about*.
  if (ai.llms_txt.topics !== false && curatedAi.topics.length) {
    const tags = hexo.extend.generator.get('tag') && locals.tags ? locals.tags.toArray() : []
    const tagPaths = new Map(tags.map(tag => [tag.name, tag.path]))
    const entries = []
    const notes = []
    for (const topic of curatedAi.topics) {
      const path = tagPaths.get(topic.name)
      if (path) entries.push({ name: topic.name, url: absoluteFor(hexo, path), description: topic.description })
      else notes.push(`- ${escapeMd(topic.name)}${topic.description ? `: ${escapeMd(topic.description)}` : ''}`)
    }
    extraSections.push({
      title: i18n(hexo, 'ai_readable.llms.heading_topics', 'Topics'),
      entries,
      body: notes.join('\n')
    })
  }

  // One place that answers "may I use this, and how" without a second fetch. The
  // text comes from the resolved license and the configured AI preference, so it
  // cannot contradict the /rights/ page.
  if (ai.llms_txt.license !== false) {
    const rights = resolveLicense(hexo, ai.rights)
    const lines = []
    if (rights && rights.license) {
      lines.push(`- ${i18n(hexo, 'ai_readable.llms.license_line', 'License')}: ${rights.licenseUrl ? `[${rights.license}](${rights.licenseUrl})` : rights.license}`)
    }
    lines.push(`- ${i18n(hexo, 'ai_readable.llms.ai_use_line', 'AI use')}: ${ai.rights.ai_use}`)
    if (ai.rights.ai_training && ai.rights.ai_training !== 'omit') {
      lines.push(`- ${i18n(hexo, 'ai_readable.llms.ai_training_line', 'AI training preference')}: ${ai.rights.ai_training}`)
    }
    if (ai.rights.enable) {
      lines.push(`- ${i18n(hexo, 'ai_readable.llms.rights_line', 'Full policy')}: ${absoluteFor(hexo, ai.rights.path)}`)
    }
    extraSections.push({
      title: i18n(hexo, 'ai_readable.llms.heading_license', 'Licensing and AI usage'),
      body: lines.join('\n')
    })
  }

  const background = []
  const bio = curatedAi.authorBio || authorBio(hexo, ai)
  if (bio) background.push(bio)
  if (curatedAi.topics.length) {
    background.push(`${i18n(hexo, 'ai_readable.llms.topics_label', 'Main topics')}: ${curatedAi.topics.map(topic => topic.name).join(', ')}.`)
  }

  const model = buildLlmsModel({
    siteTitle: siteTitle(hexo),
    summary: curatedAi.tagline || summaryFor(hexo, ai),
    background,
    featured: featuredEntries,
    recent: recentEntries,
    series: seriesEntries,
    projects: projectEntries,
    resources,
    extraSections,
    optional: [],
    headings: {
      featured: i18n(hexo, 'ai_readable.llms.heading_featured', 'Featured'),
      articles: i18n(hexo, 'ai_readable.llms.heading_articles', 'Articles'),
      series: i18n(hexo, 'ai_readable.llms.heading_series', 'Series'),
      projects: i18n(hexo, 'ai_readable.llms.heading_projects', 'Projects'),
      resources: i18n(hexo, 'ai_readable.llms.heading_resources', 'Resources')
    }
  })

  routes.push({ path: ai.llms_txt.path, data: renderLlmsTxt(model) })
}

// ---------------------------------------------------------------------------
// sitemap.xml
// ---------------------------------------------------------------------------

/**
 * A second generator already claims this file. Whether that is fatal depends on
 * who asked for `panda`:
 *
 *   explicit provider: panda -> the site's own configuration collides with its
 *     plugins; stop the build and name the plugin, because silently dropping one
 *     of two writers is how a site loses its rules without noticing.
 *
 *   inherited default       -> 1.2.0 turned `panda` on for everybody, so an
 *     existing site that upgraded must not start failing. Step aside, leave the
 *     plugin in charge, and say so once.
 *
 * @returns {boolean} true when the caller must skip registering its route.
 */
function yieldToExternalGenerator (hexo, kind, conflicts) {
  // Nothing registered: the theme owns the path and there is nothing to resolve.
  // Checking intent first would throw on an empty list and print `generator ""`,
  // which is exactly the confusing message this function exists to avoid.
  if (!conflicts.length) return false
  const key = `site_discovery.${kind}.provider`
  if (providerIsExplicit(hexo, kind)) {
    throw new Error(conflictMessage(kind, conflicts, key))
  }
  issueOnce(
    hexo,
    `conflict:${kind}`,
    'warn',
    `[panda] ${kind === 'robots' ? 'robots.txt' : 'sitemap.xml'}: the plugin (${conflicts.join(', ')}) ` +
      'keeps writing this file; the theme steps aside. Remove the plugin, or set ' +
      `${key} to "external" to silence this, or to "panda" to make the theme own it.`
  )
  return true
}

function hasArchive (hexo, locals) {
  return !!(hexo.extend.generator.get('archive') && locals.posts?.length)
}

function publishedSitemapPath (hexo, cfg) {
  const { provider, path } = cfg.discovery.sitemap
  if (provider === 'disabled') return null
  if (cfg.discovery.enable && provider === 'panda') return path
  return hasSiteAsset(hexo, path) || detectGeneratorConflicts(hexo, 'sitemap').length ? path : null
}

function buildSitemap (hexo, locals, routes) {
  const cfg = discoveryConfig(hexo)
  const sitemap = cfg.discovery.sitemap
  if (!cfg.discovery.enable || sitemap.provider !== 'panda') return
  if (hasSiteAsset(hexo, sitemap.path)) return
  if (yieldToExternalGenerator(hexo, 'sitemap', detectGeneratorConflicts(hexo, 'sitemap'))) return
  const index = contentIndex(hexo, locals)
  const entries = sitemapTargets(index, hexo.theme.config).map(item => ({
    url: absoluteFor(hexo, item.path),
    lastmod: item.updated || item.date || null
  }))

  // Taxonomy terms only have a page when a taxonomy generator ran. Generator order
  // is not guaranteed, so checking the route here would depend on which generator
  // happened to register first; the registered generator is the stable signal.
  const taxonomies = [
    [sitemap.include_tags, 'tags', 'tag'],
    [sitemap.include_categories, 'categories', 'category']
  ]
  for (const [enabled, modelName, routePrefix] of taxonomies) {
    if (!enabled) continue
    const generator = hexo.extend.generator.get(routePrefix)
    if (!generator) {
      issueOnce(hexo, `sitemap:${routePrefix}`, 'debug', `[panda] sitemap: include_${modelName} is true but no "${routePrefix}" generator is registered; install hexo-generator-${routePrefix} or set site_discovery.sitemap.include_${modelName}: false`)
      continue
    }
    const model = locals[modelName]
    const terms = (model && typeof model.toArray === 'function') ? model.toArray() : []
    for (const term of terms) {
      if (!term.path) continue
      entries.push({ url: absoluteFor(hexo, term.path), lastmod: null })
    }
  }

  // Generated pages are real, indexable HTML but have no Page model entry, so the
  // target list cannot know about them. Add the ones that will actually be written;
  // a path owned by the site's own page is already listed from the model.
  // Listing pages. They have no content model entry, so nothing above can find them,
  // and `hexo-generator-index` may serve the front page from a custom path.
  if (hasArchive(hexo, locals)) {
    entries.push({ url: absoluteFor(hexo, `${hexo.config.archive_dir || 'archives'}/`), lastmod: null })
  }
  // `hexo-generator-index` publishes the paginated list at `index_generator.path`
  // (served from the root when unset). Its route is not registered yet at this point
  // in the build, so check the generator itself instead of the route table.
  const indexGenerator = hexo.extend.generator.get('index') ? (hexo.config.index_generator || {}) : null
  if (indexGenerator) {
    const indexDir = String(indexGenerator.path || '').replace(/^\/+|\/+$/g, '')
    entries.push({ url: absoluteFor(hexo, indexDir ? `${indexDir}/` : ''), lastmod: null })
  }

  const ai = cfg.ai
  const generated = []
  if (ai.enable && ai.portal.enable) generated.push(ai.portal.path)
  if (ai.enable && ai.rights.enable) generated.push(ai.rights.path)
  for (const pagePath of generated) {
    if (existingPageAt(hexo, `${rootPath(pagePath)}index.html`)) continue
    entries.push({ url: absoluteFor(hexo, pagePath), lastmod: null })
  }

  routes.push({ path: sitemap.path, data: renderSitemap(entries) })
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

function buildRobots (hexo, routes) {
  const cfg = discoveryConfig(hexo)
  const robots = cfg.discovery.robots
  if (!cfg.discovery.enable || robots.provider !== 'panda') return
  if (hasSiteAsset(hexo, robots.path)) return

  // A second generator for robots.txt wins when the site did not ask for ours.
  if (yieldToExternalGenerator(hexo, 'robots', detectGeneratorConflicts(hexo, 'robots'))) return

  const sitemapPath = publishedSitemapPath(hexo, cfg)
  const sitemapUrl = robots.sitemap && sitemapPath ? sitemapUrlFor(hexo.config.url, sitemapPath) : null
  routes.push({
    path: robots.path,
    data: renderRobots({
      policy: robots.policy,
      disallow: robots.disallow,
      allow: robots.allow,
      customGroups: robots.groups,
      sitemapUrl,
      usageAiTraining: robots.usage_ai_training,
      googleAgent: robots.google_agent
    })
  })
}

// ---------------------------------------------------------------------------
// /ai/ portal and /rights/ pages (route data feeds a Pug layout)
// ---------------------------------------------------------------------------

function portalData (hexo, locals) {
  const cfg = discoveryConfig(hexo)
  const ai = cfg.ai
  if (!ai.enable || !ai.portal.enable) return null
  const index = contentIndex(hexo, locals)
  const linkFor = (item) => {
    return {
      title: item.title,
      url: url_for.call(hexo, item.path),
      markdown: mirrorFor(item.path),
      date: item.dateText,
      description: item.description
    }
  }

  const curatedAi = curated(hexo)
  const featured = resolveFeatured(hexo, index, curatedAi.featured)
    .map(({ item, description }) => ({ ...linkFor(item), description: description || item.description }))

  const recent = index.articles.filter(item => item.ai).slice(0, curatedAi.latestCount ?? 10).map(linkFor)

  const series = index.series.filter(item => item.ai).map(seriesItem => ({
    title: seriesItem.title,
    url: url_for.call(hexo, seriesItem.path),
    description: seriesItem.description,
    members: seriesItem.members.filter(item => item.ai).map(linkFor)
  }))

  const resources = []
  if (ai.llms_txt.enable) {
    resources.push({ label: 'llms.txt', url: url_for.call(hexo, ai.llms_txt.path), note: i18n(hexo, 'ai_readable.portal.resource_llms_note', 'LLM content index') })
  }
  const sitemapPath = publishedSitemapPath(hexo, cfg)
  if (sitemapPath) resources.push({ label: sitemapPath, url: url_for.call(hexo, sitemapPath), note: i18n(hexo, 'ai_readable.portal.resource_sitemap_note', 'Search engine index') })
  const feed = (hexo.theme.config && hexo.theme.config.feed) || {}
  if (feed.enable === true) resources.push({ label: 'Atom', url: url_for.call(hexo, feed.path || 'atom.xml'), note: i18n(hexo, 'ai_readable.portal.resource_feed_note', 'Posts and memos feed') })
  if (ai.rights.enable) resources.push({ label: i18n(hexo, 'ai_readable.rights.title', 'Copyright policy'), url: url_for.call(hexo, ai.rights.path), note: i18n(hexo, 'ai_readable.portal.resource_rights_note', 'Licensing and AI usage') })

  return {
    title: i18n(hexo, 'ai_readable.portal.title', 'AI reading guide'),
    intro: curatedAi.intro,
    authorBio: curatedAi.authorBio || authorBio(hexo, ai),
    // Topic objects carry the curated one-line description the portal renders under
    // each topic chip; plain config strings still work and simply have none.
    topics: curatedAi.topics,
    siteDescription: curatedAi.tagline,
    featured,
    recent,
    series,
    projects: curatedAi.projects.map(project => ({
      name: project.name,
      url: toSiteUrl(hexo.config.root, project.url),
      description: project.description
    })),
    resources
  }
}

function rightsData (hexo) {
  const cfg = discoveryConfig(hexo)
  const ai = cfg.ai
  if (!ai.enable || !ai.rights.enable) return null
  const license = resolveLicense(hexo, ai.rights)
  return {
    title: i18n(hexo, 'ai_readable.rights.title', 'Copyright & usage policy'),
    license: license.license,
    licenseUrl: license.licenseUrl,
    inherited: license.inherited,
    contact: curated(hexo).contact || ai.rights.contact,
    author: (hexo.config && hexo.config.author) || null,
    siteTitle: siteTitle(hexo),
    aiTraining: ai.rights.ai_training,
    aiUse: ai.rights.ai_use,
    extra: ai.rights.extra ? hexo.render.renderSync({ text: ai.rights.extra, engine: 'markdown' }) : null,
    llmsUrl: ai.llms_txt.enable ? url_for.call(hexo, ai.llms_txt.path) : null,
    portalUrl: ai.portal.enable ? url_for.call(hexo, ai.portal.path) : null
  }
}

/**
 * A hand-written page at the portal/rights path is the site owner's own content, so
 * it wins: overwriting it would delete text the theme never wrote. The theme says
 * which side it stepped aside for, because a silent skip looks like a broken
 * feature. Set `ai_readable.<area>.respect_existing_pages: false` to force the
 * generated page (the build then fails if a page still claims that path).
 */
function existingPageAt (hexo, routePath) {
  const normalize = value => rootPath(value).replace(/index\.html?$/i, '').replace(/\/+$/, '')
  const wanted = normalize(routePath)
  const model = hexo.model('Page')
  const pages = typeof model.toArray === 'function' ? model.toArray() : []
  return pages.find(page => normalize(page.path) === wanted) || null
}

function claimPagePath (hexo, routePath, configKey, respectExisting) {
  const clash = existingPageAt(hexo, routePath)
  if (!clash) return true
  if (respectExisting !== false) {
    issueOnce(hexo, `page:${configKey}`, 'info',
      `[panda] ${configKey}: using the existing page ${JSON.stringify(clash.source)} instead of the generated one.`)
    return false
  }
  throw new Error(`[panda] ${configKey} points at ${routePath}, but the page `
    + `${JSON.stringify(clash.source)} already routes there. Change ${configKey} or that page's path.`)
}

function buildPages (hexo, locals, routes) {
  const portal = portalData(hexo, locals)
  const cfg = discoveryConfig(hexo).ai
  const portalCfg = cfg.portal
  if (portal && claimPagePath(hexo, `${rootPath(portalCfg.path)}index.html`, 'ai_readable.portal.path', portalCfg.respect_existing_pages)) {
    routes.push({
      path: `${rootPath(portalCfg.path)}index.html`,
      layout: ['ai-portal', 'page'],
      data: { ...portal, layout: 'ai-portal', type: 'ai_portal', comments: false, aside: false }
    })
  }
  const rights = rightsData(hexo)
  const rightsCfg = discoveryConfig(hexo).ai.rights
  if (rights && claimPagePath(hexo, `${rootPath(rightsCfg.path)}index.html`, 'ai_readable.rights.path', rightsCfg.respect_existing_pages)) {
    routes.push({
      path: `${rootPath(rightsCfg.path)}index.html`,
      layout: ['rights', 'page'],
      data: { ...rights, layout: 'rights', type: 'rights', comments: false }
    })
  }
}

// ---------------------------------------------------------------------------
// lifecycle wiring
// ---------------------------------------------------------------------------

hexo.on('generateBefore', () => {
  reset()
  const cfg = discoveryConfig(hexo)
  reportConfig(hexo)

  // Duplicate generators for sitemap.xml are reported here, before any route is
  // registered: a build that silently drops one of two sitemaps is worse than a
  // build that stops with the exact plugin name.
  const sitemap = cfg.discovery.sitemap
  if (cfg.discovery.enable && sitemap.provider === 'panda' && providerIsExplicit(hexo, 'sitemap')) {
    const conflicts = detectGeneratorConflicts(hexo, 'sitemap')
    if (conflicts.length) {
      throw new Error(conflictMessage('sitemap', conflicts, 'site_discovery.sitemap.provider'))
    }
  }

  // External-mode compatibility (sitemap:false marking) is registered once at
  // script load — see `externalSitemapFilter` below.
})

/**
 * External sitemap providers (`hexo-generator-sitemap`) skip any post/page whose
 * `sitemap` is false. The theme therefore mirrors its own exclusion rules onto the
 * models, in `before_generate` at order 20 (after blog-series unpublished the
 * series indexes), so an existing plugin honours noindex/manual exclusions without
 * the theme writing a second sitemap.xml.
 */
hexo.extend.filter.register('before_generate', function () {
  const cfg = discoveryConfig(hexo)
  const sitemap = cfg.discovery.sitemap
  if (!cfg.discovery.enable || !sitemap.exclude_noindex) return
  const usesExternal = sitemap.provider === 'external' ||
    (sitemap.provider === 'panda' && !providerIsExplicit(hexo, 'sitemap') && detectGeneratorConflicts(hexo, 'sitemap').length)
  if (!usesExternal) return
  const { createMatcher } = require('./lib/content-collect')
  const { parseSeriesIndex } = require('./lib/blog-series')
  const excludes = createMatcher(sitemap.exclude)
  const pending = []
  const apply = model => {
    if (!model || typeof model.toArray !== 'function') return
    for (const item of model.toArray()) {
      if (item.sitemap === false) continue
      const itemFlags = flags(item)
      const isSeriesIndex = parseSeriesIndex(item.source)
      const excluded = !itemFlags.sitemap || isSeriesIndex || excludes(item.source) || excludes(item.path)
      // `toArray()` hands back fresh Document instances, so assigning to `item`
      // is discarded; the flag has to go through the model to reach the stored
      // record the sitemap plugin reads.
      if (excluded) pending.push(model.updateById(item._id, { sitemap: false }))
    }
  }
  apply(this.model('Post'))
  apply(this.model('Page'))
  return Promise.all(pending)
}, 20)

hexo.extend.generator.register('panda-discovery', function (locals) {
  const routes = []
  // Order matters only for readability; mirrors register their URLs in the shared
  // state so llms.txt and the head partial can link them in the same build.
  const mirrors = buildMirrors(this, locals)
  routes.push(...mirrors)
  buildLlms(this, locals, routes)
  buildSitemap(this, locals, routes)
  buildRobots(this, routes)
  buildPages(this, locals, routes)
  const ownedRoutes = new Set()
  for (const route of routes) {
    const path = this.route.format(route.path)
    if (path.split('/').some(part => part === '.' || part === '..' || part.includes(':'))) {
      throw new Error(`[panda] Discovery paths must stay within the generated site: ${JSON.stringify(route.path)}`)
    }
    if (ownedRoutes.has(path)) throw new Error(`[panda] Discovery outputs share the route ${JSON.stringify(path)}; configure distinct paths.`)
    ownedRoutes.add(path)
  }
  return routes
})

hexo.extend.helper.register('page_robots_directive', page => {
  if (!flags(page).noindex) return null
  return typeof page.robots === 'string' && /\bnoindex\b/i.test(page.robots) ? page.robots : 'noindex'
})

// Head links: rel="alternate" text/markdown for the current page + rel="describedby"
// for the llms.txt that covers it. Registered as a helper so the Pug template stays
// a one-liner and the URL math lives in one place.
hexo.extend.helper.register('ai_discovery_links', function () {
  const cfg = discoveryConfig(hexo)
  if (!cfg.ai.enable) return []
  const page = this.page || {}
  const eligibility = flags(page)
  const routePath = rootPath(page.path || this.path)
  const links = []
  if (cfg.ai.markdown.enable && eligibility.markdown) {
    // Ask the build's mirror map, not the path arithmetic: a page that was skipped
    // (listing, noindex, excluded) must not advertise a file that does not exist.
    const mirrorUrl = mirrorFor(routePath)
    if (mirrorUrl) {
      links.push({ rel: 'alternate', type: 'text/markdown', href: mirrorUrl, title: page.title || null })
    }
  }
  if (cfg.ai.llms_txt.enable && eligibility.ai) {
    links.push({ rel: 'describedby', type: 'text/plain', href: url_for.call(hexo, cfg.ai.llms_txt.path) })
  }
  return links
})

hexo.extend.helper.register('ai_discovery_enabled', function (kind) {
  const cfg = discoveryConfig(hexo)
  if (!cfg.ai.enable) return false
  if (kind === 'portal') return cfg.ai.portal.enable
  if (kind === 'rights') return cfg.ai.rights.enable
  return true
})

hexo.extend.helper.register('ai_portal_path', function () {
  return url_for.call(hexo, discoveryConfig(hexo).ai.portal.path)
})

hexo.extend.helper.register('ai_portal_icon', function () {
  const cfg = discoveryConfig(hexo)
  return (cfg.ai.portal.social_icon && cfg.ai.portal.social_icon.icon) || 'fas fa-robot'
})

hexo.extend.helper.register('ai_portal_label', function () {
  const cfg = discoveryConfig(hexo)
  const configured = cfg.ai.portal.social_icon && cfg.ai.portal.social_icon.label
  return configured || i18n(hexo, 'ai_readable.portal.icon_label', 'AI reading guide')
})

hexo.extend.helper.register('ai_theme_version', () => THEME_VERSION)

// `hexo-theme-panda` needs `path` for the verify command; keeping it here means the
// command and the generators agree on where outputs live.
hexo.extend.helper.register('ai_output_paths', function () {
  const cfg = discoveryConfig(hexo)
  return {
    robots: cfg.discovery.robots.provider === 'panda' ? cfg.discovery.robots.path : null,
    sitemap: cfg.discovery.sitemap.provider === 'panda' ? cfg.discovery.sitemap.path : null,
    llms: cfg.ai.enable && cfg.ai.llms_txt.enable ? cfg.ai.llms_txt.path : null,
    portal: cfg.ai.enable && cfg.ai.portal.enable ? `${rootPath(cfg.ai.portal.path)}index.html` : null,
    rights: cfg.ai.enable && cfg.ai.rights.enable ? `${rootPath(cfg.ai.rights.path)}index.html` : null
  }
})

// `hexo panda verify-ai` lives in its own module: it reads public routes, which is
// a different concern from producing them.
require('./verify-ai').register(hexo)

// Exported for the verify command and the tests. Keeping the renderers reachable
// avoids duplicating URL/policy logic in a second place.
module.exports = {
  buildMirrors,
  buildLlms,
  buildSitemap,
  buildRobots,
  buildPages,
  resolveLicense,
  i18n,
  resolveRelative
}
