'use strict'

// Unit tests for the pure discovery modules: config normalization, URL math,
// content collection, robots/sitemap/llms rendering, Markdown conversion and the
// verification checks. No Hexo instance is created here — the end-to-end build
// lives in test/discovery-build.test.js.

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { normalizeDiscoveryConfig, normalizePagePath, normalizeFilePath } = require('../scripts/panda/lib/discovery-config')
const { sitePath, absoluteUrl, mirrorRoutePath, mirrorUrlPath, resolveRelative, encodePath } = require('../scripts/panda/lib/site-url')
const { buildContentIndex, sitemapTargets, flags, createMatcher, cleanDescription } = require('../scripts/panda/lib/content-collect')
const { renderSitemap } = require('../scripts/panda/lib/sitemap')
const { renderRobots, detectGeneratorConflicts, conflictMessage, sitemapUrlFor } = require('../scripts/panda/lib/robots')
const { contentEntries, renderLlmsTxt } = require('../scripts/panda/lib/llms-txt')
const { renderMirror, splitFrontMatter, frontMatterValue } = require('../scripts/panda/lib/markdown-mirror')
const { verifyDiscovery } = require('../scripts/panda/lib/verify')

const theme = (extra = {}) => ({
  blog_series: { enable: true, path: '/series/' },
  ai_readable: { enable: true },
  site_discovery: {},
  ...extra
})

function post (source, extra = {}) {
  return {
    source,
    title: extra.title ?? source,
    date: extra.date ?? new Date('2026-01-01T00:00:00Z'),
    path: extra.path ?? `post/${source.replace(/_posts\//, '').replace(/\.md$/, '')}/`,
    raw: extra.raw,
    description: extra.description,
    tags: extra.tags || [],
    categories: extra.categories || [],
    published: extra.published !== false,
    ...extra.fields
  }
}

describe('suffix mirror paths', () => {
  const { mirrorRoutePath } = require('../scripts/panda/lib/site-url')

  it('names the served file for a directory route', () => {
    // Hexo models carry `post/2026/01/01/a/`; appending `.md` straight to that
    // produced `a/.md` — an empty file name behind every alternate link.
    assert.equal(mirrorRoutePath('2026/01/01/a/', 'suffix'), '2026/01/01/a/index.html.md')
    assert.equal(mirrorRoutePath('about/', 'suffix'), 'about/index.html.md')
  })

  it('never doubles the index file', () => {
    assert.equal(mirrorRoutePath('2026/01/01/a/index.html', 'suffix'), '2026/01/01/a/index.html.md')
    assert.equal(mirrorRoutePath('index.html', 'suffix'), 'index.html.md')
  })

  it('leaves the default index style untouched', () => {
    assert.equal(mirrorRoutePath('2026/01/01/a/', 'index'), '2026/01/01/a/index.md')
    assert.equal(mirrorRoutePath('2026/01/01/a/index.html', 'index'), '2026/01/01/a/index.md')
  })
})

describe('values that would silently invert intent', () => {
  it('reads a quoted "false" as false instead of falling back to true', () => {
    const cfg = normalizeDiscoveryConfig({ site_discovery: { sitemap: { include_tags: 'false' } } })
    assert.equal(cfg.discovery.sitemap.include_tags, false)
  })

  it('reports every quoted boolean with its exact key', () => {
    const cfg = normalizeDiscoveryConfig({ ai_readable: { markdown: { include_pages: 'false' } } })
    assert.ok(cfg.errors.some(e => e.includes('ai_readable.markdown.include_pages') && e.includes('without quotes')))
  })

  it('reports an unknown google_agent mode', () => {
    const cfg = normalizeDiscoveryConfig({ site_discovery: { robots: { google_agent: 'maybe' } } })
    assert.equal(cfg.discovery.robots.google_agent, 'omit')
    assert.ok(cfg.errors.some(e => e.includes('site_discovery.robots.google_agent')))
  })

  it('reports a negative recent_posts instead of clamping in silence', () => {
    const cfg = normalizeDiscoveryConfig({ ai_readable: { llms_txt: { recent_posts: -5 } } })
    assert.ok(cfg.errors.some(e => e.includes('ai_readable.llms_txt.recent_posts')))
  })
})

describe('removed config keys', () => {
  it('reports `show_on_home` instead of silently ignoring it', () => {
    const cfg = normalizeDiscoveryConfig({ ai_readable: { portal: { social_icon: { show_on_home: true } } } })
    assert.ok(cfg.errors.some(e => e.includes('portal.social_icon.show_on_home') && e.includes('removed in 1.2.0')))
    assert.ok(cfg.errors.some(e => e.includes('show_in_author_card')), 'the message names the replacement')
  })

  it('reports `row_title` and points at the label instead', () => {
    const cfg = normalizeDiscoveryConfig({ ai_readable: { portal: { social_icon: { row_title: 'Follow' } } } })
    assert.ok(cfg.errors.some(e => e.includes('portal.social_icon.row_title') && e.includes('portal.social_icon.label')))
  })

  it('stays quiet for the keys that replaced them', () => {
    const cfg = normalizeDiscoveryConfig({ ai_readable: { portal: { social_icon: { show_in_author_card: false, label: 'AI' } } } })
    assert.deepEqual(cfg.errors, [])
  })
})

describe('config normalization', () => {
  it('generates every surface by default so an empty config still gets all seven', () => {
    const cfg = normalizeDiscoveryConfig({})
    assert.equal(cfg.ai.enable, true, 'ai_readable is on by default since 1.2.0')
    assert.equal(cfg.discovery.robots.provider, 'panda')
    assert.equal(cfg.discovery.sitemap.provider, 'panda')
    assert.equal(cfg.ai.llms_txt.enable, true)
    assert.equal(cfg.ai.markdown.enable, true)
    assert.equal(cfg.ai.portal.enable, true)
    assert.equal(cfg.ai.rights.enable, true)
    assert.deepEqual(cfg.errors, [])
  })

  it('reports an invalid provider with the exact key and keeps a safe default', () => {
    const cfg = normalizeDiscoveryConfig({ site_discovery: { robots: { provider: 'nginx' } } })
    assert.equal(cfg.discovery.robots.provider, 'panda')
    assert.ok(cfg.errors.some(e => e.includes('site_discovery.robots.provider')))
  })

  it('normalizes page paths with a single leading and trailing slash', () => {
    assert.equal(normalizePagePath('ai', '/ai/'), '/ai/')
    assert.equal(normalizePagePath('/ai//', '/ai/'), '/ai/')
    assert.equal(normalizePagePath('  docs/ai/  ', '/ai/'), '/docs/ai/')
    assert.equal(normalizePagePath('', '/ai/'), '/ai/', 'an empty path keeps the supplied default')
  })

  it('normalizes file paths without slashes and validates the extension', () => {
    assert.equal(normalizeFilePath('/robots.txt', 'robots.txt'), 'robots.txt')
    const cfg = normalizeDiscoveryConfig({ site_discovery: { sitemap: { path: 'sitemap.json' } } })
    assert.ok(cfg.errors.some(e => e.includes('sitemap.path')))
  })

  it('forces panda providers back to external when site_discovery is disabled', () => {
    const cfg = normalizeDiscoveryConfig({
      site_discovery: { enable: false, robots: { provider: 'panda' }, sitemap: { provider: 'panda' } }
    })
    assert.equal(cfg.discovery.robots.provider, 'external')
    assert.equal(cfg.discovery.sitemap.provider, 'external')
  })

  it('normalizes exactly the documented key set (no dead options)', () => {
    const cfg = normalizeDiscoveryConfig({})
    const keys = o => Object.entries(o).flatMap(([k, v]) => (
      v && typeof v === 'object' && !Array.isArray(v) ? keys(v).map(inner => `${k}.${inner}`) : [k]
    ))
    assert.deepEqual(keys(cfg.discovery).sort(), [
      'enable',
      'robots.allow', 'robots.disallow', 'robots.google_agent', 'robots.groups',
      'robots.path', 'robots.policy', 'robots.provider', 'robots.sitemap', 'robots.usage_ai_training',
      'sitemap.exclude', 'sitemap.exclude_noindex', 'sitemap.include_categories',
      'sitemap.include_pages', 'sitemap.include_tags', 'sitemap.path', 'sitemap.provider'
    ].sort())
    assert.deepEqual(keys(cfg.ai).sort(), [
      'author_bio', 'enable', 'intro', 'topics',
      'llms_txt.enable', 'llms_txt.license', 'llms_txt.path', 'llms_txt.recent_posts', 'llms_txt.resources', 'llms_txt.sections', 'llms_txt.series', 'llms_txt.topics',
      'markdown.enable', 'markdown.exclude', 'markdown.include_pages', 'markdown.include_posts', 'markdown.include_series', 'markdown.path_style',
      'portal.enable', 'portal.featured_posts', 'portal.path', 'portal.projects', 'portal.respect_existing_pages',
      'portal.social_icon.color', 'portal.social_icon.enable', 'portal.social_icon.icon',
      'portal.social_icon.label', 'portal.social_icon.show_in_author_card',
      'rights.ai_training', 'rights.ai_use', 'rights.contact', 'rights.enable', 'rights.extra',
      'rights.license', 'rights.license_url', 'rights.path', 'rights.respect_existing_pages'
    ].sort())
  })

  it('keeps an explicit icon colour and drops a non-string one', () => {
    const withColor = normalizeDiscoveryConfig({ ai_readable: { portal: { social_icon: { color: '#49B1F5' } } } })
    assert.equal(withColor.ai.portal.social_icon.color, '#49B1F5')
    const bad = normalizeDiscoveryConfig({ ai_readable: { portal: { social_icon: { color: 42 } } } })
    assert.equal(bad.ai.portal.social_icon.color, null)
  })

  it('rejects unknown path_style and ai_training values instead of guessing', () => {
    const cfg = normalizeDiscoveryConfig({
      ai_readable: { markdown: { path_style: 'folder' }, rights: { ai_training: 'maybe' } }
    })
    assert.equal(cfg.ai.markdown.path_style, 'index')
    assert.equal(cfg.ai.rights.ai_training, 'deny')
    assert.equal(cfg.errors.length, 2)
  })
})

describe('URL math', () => {
  it('keeps the deployment root out of absolute URLs (config.url already has it)', () => {
    assert.equal(absoluteUrl('https://example.com/blog', 'post/a/index.html'), 'https://example.com/blog/post/a/index.html')
    assert.equal(absoluteUrl('https://example.com/blog/', '/post/a/'), 'https://example.com/blog/post/a/')
  })

  it('prefixes site paths with root and encodes CJK exactly once', () => {
    assert.equal(sitePath('/blog/', 'post/中文/index.html'), '/blog/post/%E4%B8%AD%E6%96%87/index.html')
    assert.equal(sitePath('/', 'post/中文/'), '/post/%E4%B8%AD%E6%96%87/')
    assert.equal(encodePath('post/%E4%B8%AD%E6%96%87/'), 'post/%E4%B8%AD%E6%96%87/')
  })

  it('encodes CJK, spaces and reserved characters exactly once', () => {
    assert.equal(encodePath('post/中文/x.html'), 'post/%E4%B8%AD%E6%96%87/x.html')
    assert.equal(encodePath('post/a b/x.html'), 'post/a%20b/x.html')
    // A `?` or `#` inside a file name would truncate the URL if left raw.
    assert.equal(encodePath('post/a?b/x.html'), 'post/a%3Fb/x.html')
    assert.equal(encodePath('post/a#frag/x.html'), 'post/a%23frag/x.html')
    assert.equal(encodePath('post/100%/x.html'), 'post/100%25/x.html')
    // Already-encoded input must not gain a second layer.
    assert.equal(encodePath('post/%E4%B8%AD%E6%96%87/x.html'), 'post/%E4%B8%AD%E6%96%87/x.html')
    assert.equal(encodePath(''), '')
  })

  it('keeps a custom permalink structure verbatim', () => {
    // A permalink with a literal prefix and nested segments must survive intact.
    assert.equal(absoluteUrl('https://example.com/blog', 'articles/2026/notes/draft-1/index.html'),
      'https://example.com/blog/articles/2026/notes/draft-1/index.html')
    assert.equal(mirrorRoutePath('articles/notes/draft-1/index.html', 'index'), 'articles/notes/draft-1/index.md')
    assert.equal(sitePath('/blog/', 'articles/notes/draft-1/index.html'), '/blog/articles/notes/draft-1/index.html')
  })

  it('maps a page route to a mirror route in both path styles', () => {
    assert.equal(mirrorRoutePath('2026/01/01/a/index.html', 'index'), '2026/01/01/a/index.md')
    assert.equal(mirrorRoutePath('2026/01/01/a/', 'index'), '2026/01/01/a/index.md')
    assert.equal(mirrorRoutePath('about/index.html', 'suffix'), 'about/index.html.md')
    assert.equal(mirrorRoutePath('notes.html', 'suffix'), 'notes.html.md')
    assert.equal(mirrorRoutePath('llms.txt', 'index'), null)
    assert.equal(mirrorRoutePath('post/index.md', 'index'), null, 'never mirror a mirror')
  })

  it('serves mirrors at their real file path', () => {
    assert.equal(mirrorUrlPath('/blog/', 'post/a/index.md'), '/blog/post/a/index.md')
  })

  it('resolves relative links against the page URL and leaves the rest untouched', () => {
    const base = 'https://example.com/blog/post/a/'
    assert.equal(resolveRelative('../b/', base), 'https://example.com/blog/post/b/')
    assert.equal(resolveRelative('/x/', base), '/x/')
    assert.equal(resolveRelative('#sec', base), '#sec')
    assert.equal(resolveRelative('mailto:a@b.c', base), 'mailto:a@b.c')
    assert.equal(resolveRelative('https://other/x', base), 'https://other/x')
    assert.equal(resolveRelative('img.png', ''), 'img.png', 'no base means no rewrite')
  })
})

describe('content collection', () => {
  it('separates independent posts, series members and pages', () => {
    const posts = [
      post('_posts/a.md', { title: 'A' }),
      post('_posts/deep/b.md', { title: 'B' })
    ]
    const index = buildContentIndex({ posts, pages: [], theme: theme() })
    assert.deepEqual(index.articles.map(a => a.title), ['A', 'B'])
    assert.deepEqual(index.series, [])
  })

  it('honours noindex, sitemap:false and ai_readable:false independently', () => {
    const entries = [
      post('_posts/hidden.md', { fields: { noindex: true } }),
      post('_posts/nositemap.md', { fields: { sitemap: false } }),
      post('_posts/noai.md', { fields: { ai_readable: false } }),
      post('_posts/ok.md')
    ]
    const index = buildContentIndex({ posts: entries, pages: [], theme: theme() })
    // noindex drops the page everywhere; the other two flags are orthogonal.
    assert.deepEqual(index.articles.map(a => a.title).sort(), ['_posts/noai.md', '_posts/nositemap.md', '_posts/ok.md'])
    const sitemap = sitemapTargets(index, theme())
    assert.deepEqual(sitemap.map(s => s.title).sort(), ['_posts/noai.md', '_posts/ok.md'], 'sitemap:false only affects the sitemap')
    assert.equal(index.articles.find(a => a.title === '_posts/noai.md').ai, false)
    assert.equal(index.articles.find(a => a.title === '_posts/noai.md').sitemap, true)
  })

  it('applies exclude globs to sources and paths', () => {
    const index = buildContentIndex({
      posts: [post('_posts/draft/a.md'), post('_posts/keep/b.md')],
      pages: [],
      theme: theme({ ai_readable: { enable: true, markdown: { exclude: ['_posts/draft/'] } } })
    })
    assert.deepEqual(index.articles.map(a => a.source), ['_posts/keep/b.md'])
  })

  it('sorts series chapters by date and keeps the series index markdown out of the posts', () => {
    const posts = [
      post('_posts/s/index.md', { title: 'Series', fields: { published: false } }),
      post('_posts/s/one.md', { title: 'One', date: new Date('2026-01-01T00:00:00Z') }),
      post('_posts/s/two.md', { title: 'Two', date: new Date('2026-02-01T00:00:00Z') })
    ]
    const index = buildContentIndex({ posts: posts.filter(p => p.published), allPosts: posts, pages: [], theme: theme() })
    assert.equal(index.series.length, 1)
    assert.deepEqual(index.series[0].members.map(m => m.title), ['One', 'Two'])
    assert.deepEqual(index.articles, [], 'series members do not appear as independent posts')
  })

  it('marks series indexes that should be excluded wholesale', () => {
    const posts = [
      post('_posts/s/index.md', { title: 'Series', fields: { published: false, noindex: true } }),
      post('_posts/s/one.md', { title: 'One' })
    ]
    const index = buildContentIndex({ posts: [posts[1]], allPosts: posts, pages: [], theme: theme() })
    assert.deepEqual(index.series, [])
    assert.ok(index.excluded.some(e => e.reason === 'noindex'))
  })

  it('never treats a page type of shuoshuo or 404 as public content', () => {
    const index = buildContentIndex({
      posts: [],
      pages: [post('memos/index.md', { fields: { type: 'shuoshuo' } }), post('404.md', { fields: { type: '404' } })],
      theme: theme()
    })
    assert.deepEqual(index.pages, [])
  })

  it('uses the publish date when no explicit updated time exists', () => {
    const date = new Date('2026-01-01T00:00:00Z')
    const index = buildContentIndex({
      posts: [post('_posts/a.md', { date, raw: '---\ntitle: A\ndate: 2026-01-01\n---\n' })],
      pages: [],
      theme: theme()
    })
    assert.equal(index.articles[0].updatedText, '2026-01-01')
  })

  it('uses an explicit updated front-matter date', () => {
    const index = buildContentIndex({
      posts: [post('_posts/a.md', {
        date: new Date('2026-01-01T00:00:00Z'),
        raw: '---\ntitle: A\ndate: 2026-01-01\nupdated: 2026-03-04 10:00:00\n---\n',
        fields: { updated: new Date('2026-03-04T10:00:00Z') }
      })],
      pages: [],
      theme: theme()
    })
    assert.equal(index.articles[0].updatedText, '2026-03-04')
  })

  it('reads explained flag spellings', () => {
    assert.equal(flags({ robots: 'noindex, nofollow' }).noindex, true)
    assert.equal(flags({ noindex: 'true' }).noindex, true)
    assert.equal(flags({ indexing: false }).noindex, true)
    assert.equal(flags({}).noindex, false)
  })

  it('truncates descriptions on a word boundary and strips markup', () => {
    assert.equal(cleanDescription('<p>Hello <b>world</b></p>'), 'Hello world')
    const long = cleanDescription('word '.repeat(60), 20)
    assert.ok(long.length <= 21 && long.endsWith('…'))
    assert.equal(cleanDescription(''), null)
  })

  it('compiles exclude globs with ** and ?', () => {
    assert.equal(createMatcher(['**/draft/*.md'])('_posts/a/draft/x.md'), true)
    assert.equal(createMatcher(['**/draft/*.md'])('_posts/a/x.md'), false)
    assert.equal(createMatcher(['_posts/a/**'])('_posts/a/draft/x.md'), true)
    assert.equal(createMatcher(['_posts/a/'])('_posts/a/draft/x.md'), true)
    assert.equal(createMatcher(['post-?.md'])('post-1.md'), true)
  })
})

describe('shipped config files', () => {
  // `_config.yml` is documentation for users, `default_config.js` is what the theme
  // actually merges in. They must agree, or a documented default would silently
  // differ from the real one.
  const fs = require('node:fs')
  const path = require('node:path')
  const root = path.join(__dirname, '..')

  function yamlBlock (name) {
    const text = fs.readFileSync(path.join(root, '_config.yml'), 'utf8')
    const lines = text.split('\n')
    const start = lines.findIndex(line => line === `${name}:`)
    const out = [lines[start]]
    for (const line of lines.slice(start + 1)) {
      if (line && !/^\s/.test(line) && !line.startsWith('#')) break
      out.push(line)
    }
    return out.join('\n')
  }

  // Enough YAML for these two blocks: nested maps, scalars, booleans, null, `[]`.
  function parseBlock (text) {
    const rootObj = {}
    const stack = [[-1, rootObj]]
    for (const raw of text.split('\n')) {
      if (!raw.trim() || raw.trim().startsWith('#')) continue
      const indent = raw.length - raw.trimStart().length
      const line = raw.trim()
      const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
      if (!match) continue
      while (stack[stack.length - 1][0] >= indent) stack.pop()
      const parent = stack[stack.length - 1][1]
      const [, key, value] = match
      if (value === '') {
        parent[key] = {}
        stack.push([indent, parent[key]])
      } else if (value === '[]') {
        parent[key] = []
      } else if (value === 'null' || value === '~') {
        parent[key] = null
      } else if (value === 'true' || value === 'false') {
        parent[key] = value === 'true'
      } else if (/^\d+$/.test(value)) {
        parent[key] = Number(value)
      } else {
        parent[key] = value
      }
    }
    return rootObj
  }

  function diff (a, b, prefix) {
    const out = []
    for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
      const label = prefix ? `${prefix}.${key}` : key
      const av = a && a[key]
      const bv = b && b[key]
      const aMap = av && typeof av === 'object' && !Array.isArray(av)
      const bMap = bv && typeof bv === 'object' && !Array.isArray(bv)
      if (aMap && bMap) out.push(...diff(av, bv, label))
      else if (JSON.stringify(av) !== JSON.stringify(bv)) out.push(`${label}: yml=${JSON.stringify(av)} js=${JSON.stringify(bv)}`)
    }
    return out
  }

  const defaults = require('../scripts/common/default_config')

  it('mirrors site_discovery between _config.yml and default_config.js', () => {
    const fromYml = parseBlock(yamlBlock('site_discovery')).site_discovery
    assert.deepEqual(diff(fromYml, defaults.site_discovery, 'site_discovery'), [])
  })

  it('mirrors ai_readable between _config.yml and default_config.js', () => {
    const fromYml = parseBlock(yamlBlock('ai_readable')).ai_readable
    assert.deepEqual(diff(fromYml, defaults.ai_readable, 'ai_readable'), [])
  })

  it('ships every surface on by default and still allows opting out', () => {
    const defaults = require('../scripts/common/default_config')
    assert.equal(defaults.ai_readable.enable, true)
    assert.equal(defaults.site_discovery.robots.provider, 'panda')
    assert.equal(defaults.site_discovery.sitemap.provider, 'panda')

    const off = normalizeDiscoveryConfig({
      ai_readable: { enable: false },
      site_discovery: { robots: { provider: 'disabled' }, sitemap: { provider: 'disabled' } }
    })
    assert.equal(off.ai.enable, false)
    assert.equal(off.discovery.robots.provider, 'disabled')
    assert.equal(off.discovery.sitemap.provider, 'disabled')
  })
})

describe('robots.txt rendering', () => {
  const base = () => ({ policy: 'balanced', sitemapUrl: 'https://example.com/blog/sitemap.xml', usageAiTraining: 'deny', googleAgent: 'omit' })

  it('separates search, training and user-triggered intents in balanced mode', () => {
    const text = renderRobots(base())
    assert.match(text, /User-agent: Googlebot\nUser-agent: OAI-SearchBot\nUser-agent: Claude-SearchBot\nUser-agent: Bingbot\nUser-agent: DuckDuckBot\nUser-agent: Baiduspider\nUser-agent: YandexBot\nAllow: \//)
    // The training group lists vendor tokens explicitly and repeats the preference in
    // the AIPREF `Content-Usage` spelling, because adoption of the shared signal differs.
    assert.match(text, /User-agent: GPTBot\nUser-agent: ClaudeBot\nUser-agent: Applebot-Extended\n[\s\S]*?Disallow: \/\nContent-Usage: train-ai=n/)
    assert.match(text, /User-agent: Google-Extended\nDisallow: \//)
    assert.match(text, /User-agent: __usage_ai-training\nDisallow: \/\nContent-Usage: train-ai=n/)
    // User-triggered fetches are their own allowed group, never a blanket block.
    assert.match(text, /User-agent: ChatGPT-User\nUser-agent: Claude-User\nUser-agent: Perplexity-User\nAllow: \//)
  })

  it('explains that Google-Extended is a control token and AIPREF is a draft', () => {
    const text = renderRobots(base())
    assert.match(text, /Control token, not a crawler/)
    assert.match(text, /never Google Search inclusion or ranking/)
    assert.match(text, /Internet-Draft, not an RFC/)
  })

  it('writes a single wildcard group and nothing AI-specific in permissive mode', () => {
    const text = renderRobots({ ...base(), policy: 'permissive' })
    assert.match(text, /^User-agent: \*\nAllow: \/$/m)
    assert.doesNotMatch(text, /GPTBot|Google-Extended|__usage_ai-training|OAI-SearchBot/)
  })

  it('emits no implicit wildcard group in custom mode', () => {
    const text = renderRobots({
      ...base(),
      policy: 'custom',
      customGroups: [{ userAgents: ['SomeBot'], allow: ['/'], disallow: ['/private/'], contentUsage: ['train-ai=n'], note: 'Partner rules' }]
    })
    assert.match(text, /^# Partner rules$/m)
    assert.match(text, /User-agent: SomeBot\nAllow: \/\nDisallow: \/private\/\nContent-Usage: train-ai=n/)
    assert.doesNotMatch(text, /GPTBot/)
    assert.doesNotMatch(text, /^User-agent: \*$/m)
  })

  it('honours usage_ai_training allow and omit', () => {
    assert.match(renderRobots({ ...base(), usageAiTraining: 'allow' }), /User-agent: __usage_ai-training\nAllow: \//)
    assert.doesNotMatch(renderRobots({ ...base(), usageAiTraining: 'omit' }), /__usage_ai-training/)
  })

  it('adds a Google-Agent group only when configured, labelled informational', () => {
    assert.doesNotMatch(renderRobots(base()), /Google-Agent/)
    const allowed = renderRobots({ ...base(), googleAgent: 'allow' })
    assert.match(allowed, /User-agent: Google-Agent\nAllow: \//)
    assert.match(allowed, /user-triggered: RFC 9309 does not govern it/)
    assert.match(renderRobots({ ...base(), googleAgent: 'disallow' }), /User-agent: Google-Agent\nDisallow: \//)
  })

  it('appends site-wide allow/disallow rules to the wildcard group', () => {
    const text = renderRobots({ ...base(), allow: ['/public/'], disallow: ['/drafts/', '/tmp/'] })
    const start = text.indexOf('User-agent: *')
    const wildcard = text.slice(start, text.indexOf('\n\n', start))
    assert.match(wildcard, /Allow: \/public\/\nDisallow: \/drafts\/\nDisallow: \/tmp\//)
  })

  it('does not negate an explicit site-wide disallow with an automatic allow', () => {
    const text = renderRobots({ ...base(), disallow: ['/'] })
    assert.match(text, /^User-agent: \*\nDisallow: \/$/m)
    assert.doesNotMatch(text, /^Allow: \/$/m)
  })

  it('requires an absolute Sitemap URL', () => {
    assert.equal(sitemapUrlFor('https://example.com/blog', '/sitemap.xml'), 'https://example.com/blog/sitemap.xml')
    assert.equal(sitemapUrlFor('https://example.com/blog/', 'sitemap.xml'), 'https://example.com/blog/sitemap.xml')
    assert.doesNotMatch(renderRobots({ ...base(), sitemapUrl: null }), /Sitemap:/)
  })
})

describe('generator conflict detection', () => {
  const fakeHexo = names => ({ extend: { generator: { get: name => (names.includes(name) ? () => [] : undefined) } } })

  it('finds the plugin generator that already claimed robots.txt', () => {
    assert.deepEqual(detectGeneratorConflicts(fakeHexo(['robotstxt']), 'robots'), ['robotstxt'])
    assert.deepEqual(detectGeneratorConflicts(fakeHexo(['robots-txt']), 'robots'), ['robots-txt'])
  })

  it('finds a sitemap generator but leaves unrelated ones alone', () => {
    assert.deepEqual(detectGeneratorConflicts(fakeHexo(['sitemap']), 'sitemap'), ['sitemap'])
    assert.deepEqual(detectGeneratorConflicts(fakeHexo(['baidu-sitemap', 'feed']), 'sitemap'), [])
    assert.deepEqual(detectGeneratorConflicts(fakeHexo(['sitemap']), 'robots'), [], 'a sitemap generator is not a robots conflict')
  })

  it('tolerates a missing or partial generator registry', () => {
    assert.deepEqual(detectGeneratorConflicts({}, 'robots'), [])
    assert.deepEqual(detectGeneratorConflicts({ extend: {} }, 'sitemap'), [])
    assert.deepEqual(detectGeneratorConflicts(null, 'sitemap'), [])
  })

  it('names the offending generator and both ways out', () => {
    const message = conflictMessage('sitemap', ['sitemap'], 'site_discovery.sitemap.provider')
    assert.match(message, /sitemap\.xml: provider is "panda" but generator "sitemap" is already registered/)
    assert.match(message, /site_discovery\.sitemap\.provider/)
    assert.match(message, /"external"/)
  })
})

describe('sitemap targets', () => {
  const posts = [post('_posts/a.md', { title: 'A', fields: { tags: [{ name: 'T' }], categories: [{ name: 'C' }] } })]

  const about = () => post('about/index.md', { title: 'About', path: 'about/' })

  it('lists posts, series and pages but never tag/category pages on its own', () => {
    // Taxonomy pages are appended by the generator from Hexo locals (they have no
    // model entry), so the target list must not invent them.
    const index = buildContentIndex({ posts, pages: [about()], theme: theme() })
    assert.deepEqual(sitemapTargets(index, theme()).map(t => t.path), ['post/a/', 'about/'])
  })

  it('lists series chapters even though they are split out of articles', () => {
    // Chapters leave `index.articles` so llms.txt can nest them under their series;
    // the sitemap still has to publish their own URLs.
    const index = buildContentIndex({
      posts: [post('_posts/s/a.md', { path: '2026/01/01/s/a/', title: 'A', fields: { blog_series: { slug: 's', title: 'S', path: 'series/s/' } } }),
        post('_posts/s/index.md', { path: 'series/s/', title: 'S' })],
      pages: [],
      theme: theme({ blog_series: { enable: true, path: '/series/' } })
    })
    assert.deepEqual(sitemapTargets(index, theme({ blog_series: { enable: true, path: '/series/' } })).map(t => t.path), ['series/s/index.html', '2026/01/01/s/a/'])
  })

  it('honours include_pages: false', () => {
    const index = buildContentIndex({ posts, pages: [about()], theme: theme() })
    assert.deepEqual(sitemapTargets(index, theme({ site_discovery: { sitemap: { include_pages: false } } })).map(t => t.path), ['post/a/'])
  })

  it('always drops noindex content in built-in mode', () => {
    // `exclude_noindex` only governs the external-mode filter; the built-in generator
    // must never publish a noindex page, whatever that switch says.
    const index = buildContentIndex({
      posts: [post('_posts/secret.md', { title: 'Secret', fields: { noindex: true } })],
      pages: [],
      theme: theme()
    })
    assert.deepEqual(sitemapTargets(index, theme()), [])
    assert.deepEqual(
      sitemapTargets(index, theme({ site_discovery: { sitemap: { exclude_noindex: false } } })),
      [],
      'the switch cannot make the built-in sitemap list a noindex page'
    )
  })

  it('drops sitemap:false and excluded paths', () => {
    const index = buildContentIndex({
      posts: [post('_posts/skip.md', { title: 'Skip', fields: { sitemap: false } }), post('_posts/drafty.md', { title: 'Drafty' })],
      pages: [],
      theme: theme({ site_discovery: { sitemap: { exclude: ['_posts/drafty.md'] } } })
    })
    assert.deepEqual(sitemapTargets(index, theme()), [])
  })
})

describe('sitemap rendering', () => {
  it('escapes XML entities and always emits an ISO-8601 date', () => {
    const xml = renderSitemap([{ url: 'https://example.com/a?b=1&c=2', lastmod: new Date('2026-01-01T00:00:00Z') }])
    assert.match(xml, /<loc>https:\/\/example\.com\/a\?b=1&amp;c=2<\/loc>/)
    assert.match(xml, /<lastmod>2026-01-01T00:00:00\.000Z<\/lastmod>/)
  })

  it('drops duplicates and empty entries instead of doubling URLs', () => {
    const xml = renderSitemap([
      { url: 'https://example.com/a/' },
      { url: 'https://example.com/a/' },
      { url: '' },
      null
    ])
    assert.equal((xml.match(/<loc>/g) || []).length, 1)
  })

  it('omits lastmod entirely when no date is known', () => {
    const xml = renderSitemap([{ url: 'https://example.com/a/' }])
    assert.doesNotMatch(xml, /<lastmod>/)
    assert.doesNotMatch(xml, /changefreq|priority/)
  })
})

describe('llms.txt rendering', () => {
  const index = buildContentIndex({
    posts: [
      post('_posts/newest.md', { title: 'Newest', date: new Date('2026-03-01T00:00:00Z') }),
      post('_posts/older.md', { title: 'Older', date: new Date('2026-02-01T00:00:00Z') }),
      post('_posts/agent-free.md', { title: 'Agent Free', date: new Date('2026-04-01T00:00:00Z'), fields: { ai_readable: false } })
    ],
    pages: [],
    theme: theme()
  })

  const entryOptions = {
    mirrorUrlFor: item => (item.title === 'Newest' ? 'https://example.com/blog/newest/index.md' : null),
    pageUrlFor: item => `https://example.com/blog/${String(item.title).toLowerCase().replace(/ /g, '-')}/`
  }

  it('caps the list at recent_posts and skips ai_readable:false content', () => {
    const entries = contentEntries(index.articles, { ...entryOptions, limit: 3 })
    assert.deepEqual(entries.map(e => e.name), ['Older', 'Newest'].sort((a, b) => a === 'Newest' ? -1 : 1))
    assert.equal(entries.length, 2, 'the quarterly newer post is excluded by its ai_readable flag')
  })

  it('applies the limit after filtering', () => {
    const entries = contentEntries(index.articles, { ...entryOptions, limit: 1 })
    assert.equal(entries.length, 1)
    assert.equal(entries[0].name, 'Newest')
  })

  it('prefers the Markdown mirror and falls back to the page URL', () => {
    const entries = contentEntries(index.articles, entryOptions)
    const newest = entries.find(e => e.name === 'Newest')
    const older = entries.find(e => e.name === 'Older')
    assert.equal(newest.url, 'https://example.com/blog/newest/index.md')
    assert.equal(newest.mirror, true)
    assert.equal(older.url, 'https://example.com/blog/older/')
    assert.equal(older.mirror, false)
  })

  it('uses localized section headings when supplied', () => {
    const text = renderLlmsTxt({
      siteTitle: '熊猫笔记',
      summary: '一个博客。',
      sections: [
        { title: '精选文章', entries: [{ name: 'A', url: 'https://example.com/a/' }] },
        { title: '项目', entries: [{ name: 'P', url: 'https://github.com/x/y' }] }
      ]
    })
    assert.match(text, /^## 精选文章$/m)
    assert.match(text, /^## 项目$/m)
  })

  it('renders H1, blockquote, background, and H2 sections with no placeholders', () => {
    const text = renderLlmsTxt({
      siteTitle: 'Site',
      summary: 'A site.',
      background: ['Maintained by me.', 'Main topics: hexo.'],
      sections: [
        { title: 'Articles', entries: contentEntries(index.articles, entryOptions) },
        { title: 'Projects', entries: [{ name: 'Test Project', url: 'https://github.com/example/project', description: 'A project' }] },
        { title: 'Extra', entries: [{ name: 'Link', url: 'https://example.com/x' }] }
      ]
    })
    assert.match(text, /^# Site\n/)
    assert.match(text, /^> A site\.$/m)
    assert.match(text, /^## Articles$/m)
    assert.match(text, /^## Extra$/m)
    assert.match(text, /\[Test Project\]\(https:\/\/github\.com\/example\/project\): A project/)
    assert.doesNotMatch(text, /\{\{|%s|TODO/)
  })

  it('renders the resources section with the license and sitemap links', () => {
    const text = renderLlmsTxt({
      siteTitle: 'Site',
      summary: 'A site.',
      sections: [{
        title: 'Resources',
        entries: [
          { name: 'sitemap.xml', url: 'https://example.com/blog/sitemap.xml' },
          { name: 'Copyright and usage policy', url: 'https://example.com/blog/rights/' }
        ]
      }]
    })
    assert.match(text, /\[Copyright and usage policy\]\(https:\/\/example\.com\/blog\/rights\/\)/)
    assert.match(text, /\[sitemap\.xml\]\(https:\/\/example\.com\/blog\/sitemap\.xml\)/)
  })

  it('never emits an empty section or a dangling link', () => {
    const text = renderLlmsTxt({
      siteTitle: 'Empty',
      summary: '',
      sections: [{ title: 'Nothing', entries: [] }]
    })
    assert.doesNotMatch(text, /## Nothing|## Broken/)
  })
})

describe('markdown mirror conversion', () => {
  it('splits front matter and keeps the body byte-for-byte', () => {
    const { frontMatter, body } = splitFrontMatter('---\ntitle: A\n---\n\nText\n')
    assert.match(frontMatter, /title: A/)
    assert.equal(body, '\nText\n')
  })

  it('reads simple front-matter values, including quoted ones', () => {
    const fm = 'title: "A: B"\ntags:\n  - one\n'
    assert.equal(frontMatterValue(fm, 'title'), 'A: B')
    assert.equal(frontMatterValue(fm, 'missing'), null)
  })

  const base = {
    title: 'A Post',
    canonicalUrl: 'https://example.com/blog/a/',
    updatedText: '2026-02-01',
    license: null,
    licenseUrl: null
  }

  it('converts note tabs hideToggle into semantic Markdown', () => {
    const raw = '---\ntitle: A\n---\n\n{% note info %}\nBody.\n{% endnote %}\n\n{% tabs %}\n<!-- tab One -->\nFirst\n<!-- endtab -->\n{% endtabs %}\n\n{% hideToggle More %}\nHidden\n{% endhideToggle %}\n'
    const { markdown: md } = renderMirror({ ...base, body: splitFrontMatter(raw).body })
    assert.match(md, /> \*\*Note/)
    assert.match(md, /^### One$/m)
    assert.match(md, /\*\*More\*\*/)
    assert.doesNotMatch(md, /\{%|\{#|\{:/)
  })

  it('keeps the body of an unknown tag and reports it instead of dropping it silently', () => {
    const { markdown: md, warnings } = renderMirror({ ...base, body: '{% mystery x %}\nkept\n{% endmystery %}' })
    assert.match(md, /kept/)
    assert.doesNotMatch(md, /\{%|\{:/, 'no unreadable tag syntax survives')
    assert.ok(warnings.some(w => w.includes('mystery')), 'the unsupported tag is reported in the build log')
  })

  it('absolutizes relative links and images but leaves anchors alone', () => {
    const { markdown: md } = renderMirror({ ...base, body: '[rel](../b/) ![img](img/a.png) [anchor](#x)' })
    assert.match(md, /\]\(https:\/\/example\.com\/blog\/b\/\)/)
    assert.match(md, /!\[img\]\(https:\/\/example\.com\/blog\/a\/img\/a\.png\)/)
    assert.match(md, /\]\(#x\)/)
  })

  it('writes YAML front matter with real metadata and no build-time claims', () => {
    const { markdown: md } = renderMirror({ ...base, description: 'Desc', body: 'Body' })
    assert.match(md, /^# A Post\n/)
    assert.match(md, /^> Desc$/m)
    assert.match(md, /^- Updated: 2026-02-01$/m)
    assert.doesNotMatch(md, /generated|build time/i)
  })

  it('renders the series index with chapter links and no post body leak', () => {
    const { markdown: md } = renderMirror(
      { ...base, title: 'S', description: 'Series', body: 'Intro text.' },
      {
        seriesMembers: [
          { title: 'One', url: 'https://example.com/blog/one/', mirrorUrl: 'https://example.com/blog/one/index.md' },
          { title: 'Two', url: 'https://example.com/blog/two/', mirrorUrl: null }
        ]
      }
    )
    assert.match(md, /## Chapters/)
    assert.match(md, /\[One\]\(https:\/\/example\.com\/blog\/one\/index\.md\)/)
    assert.match(md, /\[Two\]\(https:\/\/example\.com\/blog\/two\/\)/)
    assert.match(md, /Intro text\./)
  })
})

describe('empty and minimal inputs', () => {
  it('renders a valid llms.txt with no summary, series, projects or articles', () => {
    const text = renderLlmsTxt({ siteTitle: 'Bare', summary: '', sections: [], background: [] })
    assert.equal(text.trim(), '# Bare', 'a site with nothing to index still gets a valid H1 document')
    assert.doesNotMatch(text, /^>$/m)
  })

  it('produces no content sections when the index is empty', () => {
    const index = buildContentIndex({ posts: [], pages: [], theme: theme() })
    assert.deepEqual(index.articles, [])
    assert.deepEqual(index.series, [])
    assert.deepEqual(index.pages, [])
    assert.deepEqual(sitemapTargets(index, theme()), [])
  })

  it('ignores an empty project list instead of emitting an empty section', () => {
    const text = renderLlmsTxt({
      siteTitle: 'S', summary: 'x',
      sections: [{ title: 'Projects', entries: [] }]
    })
    assert.doesNotMatch(text, /## Projects/)
  })

  it('drops a project entry missing a URL rather than emitting a broken link', () => {
    const cfg = normalizeDiscoveryConfig({
      ai_readable: { portal: { projects: [{ name: 'NoUrl' }, { name: 'Ok', url: 'https://example.com/p' }] } }
    })
    assert.deepEqual(cfg.ai.portal.projects.map(p => p.name), ['Ok'])
  })

  it('lists the series landing page and its chapters, never the index.md source', () => {
    const posts = [
      post('_posts/s/index.md', { title: 'S', path: 'series/s/', fields: { published: false } }),
      post('_posts/s/one.md', { title: 'One', path: 's/one/', fields: { blog_series: { slug: 's', title: 'S', path: 'series/s/' } } })
    ]
    const index = buildContentIndex({ posts: [posts[1]], allPosts: posts, pages: [], theme: theme() })
    const paths = sitemapTargets(index, theme()).map(t => t.path.replace(/index\.html?$/, ''))
    assert.deepEqual(paths, ['series/s/', 's/one/'],
      'the landing page and each chapter are indexed; the index.md source is not listed as a post')
    assert.ok(!index.articles.some(a => a.title === 'S'), 'the series index.md never appears as an article')
  })
})

describe('verify checks', () => {
  const expected = {
    root: '/blog/',
    llms: { path: 'llms.txt' },
    sitemap: { path: 'sitemap.xml' },
    robots: { path: 'robots.txt', policy: { allow_search_bots: true, ai_training: 'deny' }, sitemap: { path: 'sitemap.xml' } },
    pathStyle: 'index',
    mirrors: ['2026/01/01/a/index.md'],
    portal: 'ai/index.html',
    rights: 'rights/index.html',
    license: 'CC BY-NC-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/'
  }

  const good = new Map([
    ['robots.txt', 'User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: https://example.com/blog/sitemap.xml\n'],
    ['sitemap.xml', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>https://example.com/blog/2026/01/01/a/</loc></url>\n</urlset>'],
    ['llms.txt', '# Site\n\n> Summary\n\n## Articles\n\n- [A](https://example.com/blog/2026/01/01/a/index.md)\n\n## Resources\n\n- [Sitemap](https://example.com/blog/sitemap.xml)\n'],
    ['2026/01/01/a/index.md', '# A\n\nBody\n'],
    ['2026/01/01/a/index.html', '<html><head><link rel="alternate" type="text/markdown" href="/blog/2026/01/01/a/index.md"><link rel="describedby" href="/blog/llms.txt"></head></html>'],
    ['ai/index.html', '<html><head><link rel="describedby" href="/blog/llms.txt"></head><body><article class="article-container"><a href="/blog/llms.txt">llms</a><a href="/blog/sitemap.xml">sitemap</a><a href="/blog/rights/">rights</a></article></body></html>'],
    ['rights/index.html', '<html><head><link rel="describedby" href="/blog/llms.txt"></head><body><article>CC BY-NC-SA 4.0 https://creativecommons.org/licenses/by-nc-sa/4.0/</article></body></html>']
  ])

  it('passes a consistent site', () => {
    const outcome = verifyDiscovery({ files: good, expected })
    assert.equal(outcome.ok, true, JSON.stringify(outcome.results.filter(r => !r.ok)))
  })

  it('catches a mirror advertised without a file', () => {
    const files = new Map(good)
    files.delete('2026/01/01/a/index.md')
    const outcome = verifyDiscovery({ files, expected })
    assert.equal(outcome.ok, false)
    assert.ok(outcome.results.some(r => r.id === 'Markdown mirrors' && !r.ok))
    assert.ok(outcome.results.some(r => r.id === 'HTML discovery links' && !r.ok))
  })

  it('catches a noindex page leaking into the sitemap', () => {
    const files = new Map(good)
    files.set('sitemap.xml', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>https://example.com/blog/secret/</loc></url>\n</urlset>')
    files.set('secret/index.html', '<html><head><meta name="robots" content="noindex"><link rel="describedby" href="/blog/llms.txt"></head></html>')
    const outcome = verifyDiscovery({ files, expected })
    assert.equal(outcome.ok, false)
    const sitemap = outcome.results.find(r => r.id === 'sitemap.xml')
    assert.match(sitemap.detail, /lists a noindex URL/)
  })

  it('catches front matter and template syntax left in a mirror', () => {
    const files = new Map(good)
    files.set('2026/01/01/a/index.md', '---\ntitle: A\n---\n\n{% note %}oops{% endnote %}')
    const outcome = verifyDiscovery({ files, expected })
    assert.equal(outcome.ok, false)
    assert.match(outcome.results.find(r => r.id === 'Markdown mirrors').detail, /front matter|template syntax/)
  })

  it('catches a relative Sitemap line in robots.txt', () => {
    const files = new Map(good)
    files.set('robots.txt', 'User-agent: *\nAllow: /\n\nSitemap: /blog/sitemap.xml\n')
    const outcome = verifyDiscovery({ files, expected })
    assert.match(outcome.results.find(r => r.id === 'robots.txt').detail, /not absolute/)
  })

  it('catches the robot icon inside the author card before the other icons', () => {
    const files = new Map(good)
    files.set('index.html', '<div class="card-info-social-icons"><a class="social-icon ai-reading-icon" aria-label="AI" title="AI" href="/blog/ai/"></a><a class="social-icon"></a></div>')
    const outcome = verifyDiscovery({ files, expected: { ...expected, homeIcon: { page: 'index.html' } } })
    const home = outcome.results.find(r => r.id === 'Home robot icon')
    assert.equal(home.ok, false)
    assert.match(home.detail, /not the last/)
  })

  it('accepts excluded sources that stay out of every output, and rejects a leaked source path', () => {
    const files = new Map(good)
    const clean = verifyDiscovery({ files, expected: { ...expected, excludedSources: ['_posts/secret.md'], excludedMirrorRoutes: ['_posts/secret/index.md'] } })
    assert.equal(clean.ok, true, JSON.stringify(clean.results.filter(r => !r.ok)))

    files.set('llms.txt', good.get('llms.txt').replace('## Resources', '- [Leak](https://example.com/blog/_posts/secret.md)\n\n## Resources'))
    const leaky = verifyDiscovery({ files, expected: { ...expected, excludedSources: ['_posts/secret.md'] } })
    assert.equal(leaky.ok, false)
    assert.match(leaky.results.find(r => r.id === 'No leaked internals').detail, /_posts\/secret\.md/)
  })
})

describe('shipped languages', () => {
  // The theme promises six locales. A new key added to `default.yml` and forgotten in
  // one of them falls back silently at runtime, so enforce parity instead.
  const fs = require('node:fs')
  const path = require('node:path')
  const dir = path.join(__dirname, '..', 'languages')

  function keysOf (file) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8')
    const keys = new Set()
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^(\s*)([A-Za-z0-9_.-]+):\s*(\S|$)/)
      if (match) keys.add(match[2])
    }
    return keys
  }

  it('every locale defines the same keys as default.yml', () => {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.yml'))
    assert.ok(files.includes('default.yml'), 'default.yml exists')
    const base = keysOf('default.yml')
    assert.ok(base.size > 100, 'default.yml parsed')
    for (const file of files) {
      const keys = keysOf(file)
      const missing = [...base].filter(key => !keys.has(key))
      const extra = [...keys].filter(key => !base.has(key))
      assert.deepEqual(missing, [], `${file} is missing ${missing.length} key(s)`)
      assert.deepEqual(extra, [], `${file} has ${extra.length} key(s) default.yml lacks`)
    }
  })

  it('the locales carry the new AI-readable strings', () => {
    for (const file of ['en.yml', 'zh-CN.yml', 'ja.yml', 'ko.yml']) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8')
      assert.match(text, /\bai_readable:/, `${file} has the ai_readable block`)
      assert.match(text, /^ {2}untitled:/m, `${file} defines the untitled fallback`)
      assert.match(text, /^ {2}portal:/m, `${file} defines the portal strings`)
    }
  })
})

describe('curated site data', () => {
  const { mergeAiData } = require('../scripts/panda/lib/ai-data')

  const baseConfig = () => ({
    intro: null,
    author_bio: null,
    topics: ['hexo'],
    portal: { featured_posts: [{ source: '_posts/from-config.md', description: null }], projects: [{ name: 'cfg', url: 'https://x', description: null, order: null }] }
  })

  // A `source/_data/ai.yml` is an editorial decision, so it replaces the config's
  // list rather than being silently appended to it (which would double-link posts).
  it('a data file replaces the config featured and project lists', () => {
    const merged = mergeAiData(baseConfig(), {
      featured: [{ source: '_posts/a.md', summary: 'A' }],
      projects: [{ name: 'from-data', url: 'https://y', description: 'd' }]
    })
    assert.deepEqual(merged.featured.map(f => f.source), ['_posts/a.md'])
    assert.equal(merged.featured[0].description, 'A')
    assert.deepEqual(merged.projects.map(p => p.name), ['from-data'])
  })

  it('falls back to config values when the data file is silent', () => {
    const merged = mergeAiData(baseConfig(), {})
    assert.deepEqual(merged.featured.map(f => f.source), ['_posts/from-config.md'])
    assert.deepEqual(merged.projects.map(p => p.name), ['cfg'])
    assert.deepEqual(merged.topics.map(t => t.name), ['hexo'])
  })

  it('merges topics by name, letting the file add descriptions', () => {
    const merged = mergeAiData(baseConfig(), { topics: [{ name: 'hexo', description: '静态博客' }, { name: 'rust' }] })
    assert.deepEqual(merged.topics.map(t => [t.name, t.description]), [['hexo', '静态博客'], ['rust', null]])
  })

  it('sorts projects by explicit order, keeping unordered ones last', () => {
    const merged = mergeAiData(baseConfig(), {
      projects: [{ name: 'b', url: 'u', order: 2 }, { name: 'none', url: 'u' }, { name: 'a', url: 'u', order: 1 }]
    })
    assert.deepEqual(merged.projects.map(p => p.name), ['a', 'b', 'none'])
  })

  it('uses the data file site/about blocks for intro, bio and contact', () => {
    const merged = mergeAiData(baseConfig(), {
      site: { tagline: 'tag', description: 'desc' },
      about: { name: 'Panda', description: 'bio', contact: 'mailto:a@b' }
    })
    assert.equal(merged.intro, 'desc')
    assert.equal(merged.authorBio, 'bio')
    assert.equal(merged.author, 'Panda')
    assert.equal(merged.contact, 'mailto:a@b')
  })
})
