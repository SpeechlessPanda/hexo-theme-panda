'use strict'

// Builds a throwaway Hexo site with this theme, then asserts on the real files in
// `public/`. This is the only test that proves the discovery outputs work inside
// Hexo's actual lifecycle (generators, filters, Pug, Stylus, i18n).
//
// Hexo itself is not a dependency of the theme (it is a peer by design), so the
// test finds a usable installation and skips with an explanation when there is
// none. CI installs it explicitly — see .github/workflows/ci.yml.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const themeRoot = path.resolve(__dirname, '..')

function resolveHexoRoot () {
  const candidates = [
    process.env.PANDA_HEXO_SITE,
    'D:/project/blog',
    path.join(themeRoot, '..', 'blog'),
    process.cwd()
  ].filter(Boolean)
  for (const dir of candidates) {
    // The *site's* node_modules is what a real build resolves plugins from. Taking
    // the pnpm store path of the hexo package itself would find hexo but none of
    // the renderers, and the build would silently copy .md files instead of rendering.
    const nm = path.join(dir, 'node_modules')
    if (!fs.existsSync(path.join(nm, 'hexo'))) continue
    if (!fs.existsSync(path.join(nm, 'hexo-renderer-markdown-it-plus'))) continue
    if (!fs.existsSync(path.join(nm, 'hexo-renderer-pug'))) continue
    return { site: dir, nodeModules: nm }
  }
  return null
}

const found = resolveHexoRoot()
const skip = found ? false : 'no Hexo installation found (set PANDA_HEXO_SITE to a Hexo site)'

let siteDir = null
let output = null

function write (rel, body) {
  const abs = path.join(siteDir, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
}

function read (rel) {
  return fs.readFileSync(path.join(output, rel), 'utf8')
}

function exists (rel) {
  return fs.existsSync(path.join(output, rel))
}

async function build (verbose) {
  process.env.NODE_PATH = [path.join(themeRoot, 'node_modules'), found.nodeModules, process.env.NODE_PATH || '']
    .filter(Boolean)
    .join(path.delimiter)
  Module._initPaths()

  const nm = path.join(siteDir, 'node_modules')
  if (!fs.existsSync(nm)) fs.symlinkSync(found.nodeModules, nm, 'junction')
  const themes = path.join(siteDir, 'themes')
  fs.mkdirSync(themes, { recursive: true })
  const themeLink = path.join(themes, 'panda')
  if (!fs.existsSync(themeLink)) fs.symlinkSync(themeRoot, themeLink, 'junction')

  const Hexo = require(require.resolve('hexo', { paths: [found.nodeModules] }))
  const hexo = new Hexo(siteDir, { silent: true })
  await hexo.init()
  await hexo.call('generate', {})
  if (verbose) {
    console.log('ROUTES:', hexo.route.list())
    const pub = path.join(siteDir, 'public')
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.relative(pub, path.join(dir, e.name))])
    console.log('PUBLIC:', walk(pub))
  }
  await hexo.exit()
  return path.join(siteDir, 'public')
}

before(async () => {
  if (skip) return
  siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-discovery-'))

  // Generators/renderers come from the donor site's node_modules; declaring them
  // here mirrors a normal Hexo site's package.json so `hexo generate` behaves the same.
  write('package.json', JSON.stringify({
    name: 'panda-discovery-smoke',
    private: true,
    hexo: {},
    dependencies: {
      hexo: '*',
      'hexo-generator-index': '*',
      'hexo-generator-archive': '*',
      'hexo-generator-category': '*',
      'hexo-generator-tag': '*',
      'hexo-renderer-markdown-it-plus': '*',
      'hexo-renderer-pug': '*',
      'hexo-renderer-stylus': '*'
    }
  }, null, 2))
  write('_config.yml', [
    'title: Discovery Smoke',
    'author: tester',
    'description: A test site for the AI-readable outputs.',
    'language: zh-CN',
    'timezone: Asia/Shanghai',
    'url: https://example.com/blog',
    'root: /blog/',
    'permalink: :year/:month/:day/:title/',
    'per_page: 10',
    'theme: panda',
    'index_generator:',
    '  path: "/blog"',
    '  per_page: 10',
    'post_copyright:',
    '  enable: true',
    '  license: CC BY-NC-SA 4.0',
    '  license_url: https://creativecommons.org/licenses/by-nc-sa/4.0/'
  ].join('\n'))

  write('_config.panda.yml', [
    'social:',
    '  fab fa-github: https://github.com/example || GitHub || \'#24292e\'',
    '  fas fa-envelope: mailto:test@example.com || Email',
    'home_about:',
    '  enable: true',
    '  source: about/index.md',
    'memos:',
    '  enable: false',
    'feed:',
    '  enable: true',
    '  include_memos: false',
    'blog_series:',
    '  enable: true',
    '  path: /series/',
    'site_discovery:',
    '  robots:',
    '    provider: panda',
    '    policy: balanced',
    '  sitemap:',
    '    provider: panda',
    'ai_readable:',
    '  enable: true',
    '  topics:',
    '    - hexo',
    '    - testing',
    '  portal:',
    '    projects:',
    '      - name: Panda',
    '        url: https://github.com/SpeechlessPanda/hexo-theme-panda',
    '        description: The theme under test',
    '  markdown:',
    '    exclude:',
    '      - _posts/excluded.md'
  ].join('\n'))

  write('source/_posts/hello-world.md', [
    '---',
    'title: Hello World',
    'date: 2026-01-10 12:00:00',
    'updated: 2026-02-01 09:00:00',
    'tags:',
    '  - Intro',
    'categories:',
    '  - Notes',
    'description: The first post.',
    '---',
    '',
    'Opening paragraph with a [relative link](../about/).',
    '',
    '## Section',
    '',
    '| a | b |',
    '| - | - |',
    '| 1 | 2 |',
    '',
    '```js',
    'const x = 1',
    '```',
    '',
    '{% note info %}',
    'A note body.',
    '{% endnote %}',
    '',
    '{% hideToggle More details %}',
    'Hidden text.',
    '{% endhideToggle %}',
    ''
  ].join('\n'))

  write('source/_posts/中文标题.md', [
    '---',
    'title: 中文标题',
    'date: 2026-01-05 12:00:00',
    '---',
    '',
    '正文段落。',
    ''
  ].join('\n'))

  write('source/_posts/hidden.md', [
    '---',
    'title: Hidden Post',
    'date: 2026-01-06 12:00:00',
    'noindex: true',
    '---',
    '',
    'Should never be indexed.',
    ''
  ].join('\n'))

  write('source/_posts/excluded.md', [
    '---',
    'title: Excluded Post',
    'date: 2026-01-07 12:00:00',
    '---',
    '',
    'Excluded by config.',
    ''
  ].join('\n'))

  write('source/_posts/my-series/index.md', [
    '---',
    'title: My Series',
    'description: A short series.',
    '---',
    '',
    'Series landing content.',
    ''
  ].join('\n'))

  write('source/_posts/my-series/chapter-one.md', [
    '---',
    'title: Chapter One',
    'date: 2026-01-08 12:00:00',
    '---',
    '',
    'Chapter body.',
    ''
  ].join('\n'))

  // The theme's home layout is opt-in per page, exactly like the real blog.
  write('source/index.md', [
    '---',
    'title: About',
    'layout: home',
    'comments: false',
    '---',
    ''
  ].join('\n'))

  write('source/about/index.md', [
    '---',
    'title: About',
    'date: 2025-12-01 12:00:00',
    '---',
    '',
    'About the tester.',
    ''
  ].join('\n'))

  write('source/memos/index.md', ['---', 'title: Memos', 'type: shuoshuo', 'date: 2025-12-01 12:00:00', '---', ''].join('\n'))

  output = await build(true)
})

after(() => {
  if (siteDir && fs.existsSync(siteDir)) {
    try { fs.rmSync(siteDir, { recursive: true, force: true }) } catch (_) {}
  }
})

test('robots.txt is generated with a balanced policy', { skip }, () => {
  const robots = read('robots.txt')
  assert.match(robots, /User-agent: \*/)
  // The training group lists every vendor token explicitly (no wildcard) and repeats
  // the preference in the AIPREF `Content-Usage` spelling, so both drafts are served.
  assert.match(robots, /User-agent: GPTBot\nUser-agent: ClaudeBot\nUser-agent: Applebot-Extended\n[\s\S]*?Disallow: \/\nContent-Usage: train-ai=n/)
  assert.match(robots, /User-agent: ChatGPT-User\nUser-agent: Claude-User\nUser-agent: Perplexity-User\nAllow: \//)
  assert.match(robots, /User-agent: __usage_ai-training\nDisallow: \/\nContent-Usage: train-ai=n/)
  assert.match(robots, /User-agent: Google-Extended\nDisallow: \//)
  assert.match(robots, /User-agent: Googlebot\nUser-agent: OAI-SearchBot\nUser-agent: Claude-SearchBot/)
  assert.doesNotMatch(robots, /Disallow: \/\n\n# Search indexing/)
  assert.match(robots, /User-agent: __usage_ai-training/)
  assert.match(robots, /Sitemap: https:\/\/example\.com\/blog\/sitemap\.xml/)
  assert.doesNotMatch(robots, /Sitemap: \/sitemap\.xml/)
})

test('sitemap.xml lists public pages with absolute URLs and real lastmod only', { skip }, () => {
  const xml = read('sitemap.xml')
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
  // The fixture keeps Hexo's default `pretty_urls.trailing_index: true`, so the
  // canonical `<link rel="canonical">` carries `index.html` and every loc must match
  // it byte for byte. The directory form is covered by the dedicated matrix test.
  assert.match(xml, /<loc>https:\/\/example\.com\/blog\/2026\/01\/10\/hello-world\/index\.html<\/loc>/)
  assert.match(xml, /<lastmod>2026-02-01T01:00:00\.000Z<\/lastmod>/)
  assert.doesNotMatch(xml, /hidden/)
  assert.doesNotMatch(xml, /excluded/)
  assert.doesNotMatch(xml, /\.md</)
  assert.doesNotMatch(xml, /changefreq|priority/)
  assert.match(xml, /<loc>https:\/\/example\.com\/blog\/2026\/01\/05\/%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98\/index\.html<\/loc>/)
  assert.match(xml, /<loc>https:\/\/example\.com\/blog\/about\/index\.html<\/loc>/)
  // series landing page is listed; its source index.md is not
  assert.match(xml, /<loc>https:\/\/example\.com\/blog\/series\/my-series\/index\.html<\/loc>/)
  // A post without `updated` falls back to its published date, never the build clock.
  const dated = xml.match(/<loc>[^<]*\/2026\/01\/05\/[^<]*<\/loc>\s*<lastmod>([^<]*)<\/lastmod>/)
  assert.ok(dated, 'the CJK post still carries a lastmod')
  assert.strictEqual(dated[1], '2026-01-05T04:00:00.000Z', 'lastmod is the publish date, not the build time')
})

test('sitemap lists tag and category pages only when they exist', { skip }, () => {
  const xml = read('sitemap.xml')
  // The fixture declares hexo-generator-tag/-category, so the pages exist and must be
  // listed. A site without those generators gets no entries, because buildSitemap keys
  // off the registered generator rather than the (order-dependent) route.
  assert.match(xml, /<loc>https:\/\/example\.com\/blog\/tags\/Intro\/index\.html<\/loc>/, 'existing tag pages are listed')
  assert.match(xml, /<loc>https:\/\/example\.com\/blog\/categories\/Notes\/index\.html<\/loc>/, 'existing category pages are listed')
})

test('llms.txt follows the v2 structure and links to Markdown mirrors', { skip }, () => {
  const txt = read('llms.txt')
  const lines = txt.split('\n')
  assert.equal(lines[0], '# Discovery Smoke')
  assert.match(txt, /^> .+/m)
  assert.match(txt, /^## /m)
  assert.match(txt, /- \[Hello World\]\(https:\/\/example\.com\/blog\/2026\/01\/10\/hello-world\/index\.md\)/)
  assert.doesNotMatch(txt, /Hidden Post/)
  assert.doesNotMatch(txt, /Excluded Post/)
  assert.doesNotMatch(txt, /\{\{|\}\}|TODO|Lorem ipsum/)
})

test('Markdown mirrors keep structure and convert theme tags', { skip }, () => {
  const md = read('2026/01/10/hello-world/index.md')
  assert.match(md, /^# Hello World/m)
  assert.doesNotMatch(md, /^---\ntitle:/m)
  assert.match(md, /\| a \| b \|/)
  assert.match(md, /```js\nconst x = 1\n```/)
  assert.match(md, /^> \*\*Note \(Info\)\*\*/m)
  assert.match(md, /^\*\*More details\*\*/m)
  assert.match(md, /Hidden text\./)
  assert.doesNotMatch(md, /\{%/)
})

test('series index gets its own Markdown index, not a post mirror', { skip }, () => {
  const md = read('series/my-series/index.md')
  assert.match(md, /^# My Series/m)
  assert.match(md, /## Chapters/)
  assert.match(md, /\[Chapter One\]\(https:\/\/example\.com\/blog\/2026\/01\/08\/my-series\/chapter-one\/index\.md\)/)
})

test('HTML head advertises the mirror and the llms.txt that covers it', { skip }, () => {
  const html = read('2026/01/10/hello-world/index.html')
  assert.match(html, /<link rel="alternate" type="text\/markdown" href="\/blog\/2026\/01\/10\/hello-world\/index\.md"/)
  assert.match(html, /<link rel="describedby" type="text\/plain" href="\/blog\/llms\.txt"/)
  const hidden = read('2026/01/06/hidden/index.html')
  assert.doesNotMatch(hidden, /rel="alternate" type="text\/markdown"/)
})

test('/ai/ portal and /rights/ page are real HTML pages', { skip }, () => {
  const portal = read('ai/index.html')
  assert.match(portal, /AI 阅读导航/)
  assert.match(portal, /llms\.txt/)
  assert.match(portal, /Panda/)
  const rights = read('rights/index.html')
  assert.match(rights, /版权与内容使用政策/)
  assert.match(rights, /CC BY-NC-SA 4\.0/)
  assert.match(rights, /https:\/\/creativecommons\.org\/licenses\/by-nc-sa\/4\.0\//)
})

test('the AI reading entry is keyboard reachable', { skip }, () => {
  // It is an <a>, so it is focusable by default; a `tabindex="-1"` or a click handler
  // on a non-link would silently drop it out of the tab order.
  const html = read('2026/01/10/hello-world/index.html')
  const marker = html.indexOf('class="social-icon ai-reading-icon"')
  const start = html.lastIndexOf('<', marker)
  const open = html.slice(start, html.indexOf('>', marker) + 1)
  assert.match(open, /^<a\b/, 'the entry is an anchor')
  assert.doesNotMatch(open, /tabindex="-1"/, 'the anchor stays in the tab order')
  assert.match(open, /href="\/blog\/ai\/"/, 'it points at the portal')
})

test('the AI reading entry wears the same social styling as the other icons', { skip }, () => {
  const html = read('2026/01/10/hello-world/index.html')
  assert.match(html, /class="social-icon ai-reading-icon"/)
  assert.match(html, /href="\/blog\/ai\/" title="[^"]+" aria-label="[^"]+"/)
  assert.match(html, /fas fa-robot/)
})

test('the author card carries the robot icon after the existing social icons', { skip }, () => {
  const html = read('index.html')
  assert.doesNotMatch(html, /panda-follow-me/, 'the about area does not render a second row')
  const rowStart = html.indexOf('card-info-social-icons')
  assert.ok(rowStart > -1, 'the author card renders the social row')
  const row = html.slice(rowStart, html.indexOf('</div>', html.indexOf('ai-reading-icon')))
  const github = row.indexOf('fa-github')
  const mail = row.indexOf('fa-envelope')
  const robot = row.indexOf('ai-reading-icon')
  assert.ok(github > -1 && mail > -1 && robot > -1, 'row must contain every icon')
  assert.ok(github < robot && mail < robot, 'the robot icon must come after the existing icons')
  const tail = row.slice(robot)
  assert.ok(!/fa-(github|envelope|rss|twitter)/.test(tail), 'no social icon may follow the robot icon')
  assert.match(tail, /aria-label="[^"]+"/, 'the robot icon is announced to assistive tech')
  assert.match(row, /href="\/blog\/ai\//)
})

test('`hexo panda verify-ai` passes on the generated public/ directory', { skip }, async () => {
  // The command reads `public/` (what a deploy ships), so run it against the real
  // build output rather than the in-memory route map.
  const verifier = require('../scripts/panda/verify-ai')
  const Hexo = require(require.resolve('hexo', { paths: [found.nodeModules] }))
  const hexo = new Hexo(siteDir, { silent: true })
  await hexo.init()

  const previous = process.exitCode
  process.exitCode = undefined
  const result = await verifier.verifyConsole.call(hexo)
  await hexo.exit()
  const exitCode = process.exitCode
  process.exitCode = previous

  assert.equal(result.ok, true, JSON.stringify(result.results.filter(r => !r.ok)))
  assert.ok(result.results.length >= 8, 'every check group must run')
  assert.equal(exitCode, undefined, 'a clean site must not set a non-zero exit code')
})

test('`hexo panda verify-ai` reports a broken output as failed', { skip }, async () => {
  // Inject a deliberate defect into the route set the command inspects: a mirror
  // that was deleted while a page still advertises it, plus a relative Sitemap line.
  // The command's own exit-code wiring is `if (!outcome.ok) process.exitCode = 1`.
  const verifier = require('../scripts/panda/verify-ai')
  const { verifyDiscovery } = require('../scripts/panda/lib/verify')
  const Hexo = require(require.resolve('hexo', { paths: [found.nodeModules] }))
  const hexo = new Hexo(siteDir, { silent: true })
  await hexo.init()
  await hexo.load()

  const cfg = require('../scripts/panda/lib/discovery-state').config(hexo)
  const expected = verifier.expectations(hexo, cfg)
  const files = verifier.readPublic(output)

  const healthy = verifyDiscovery({ files, expected, root: expected.root })
  assert.equal(healthy.ok, true, 'the baseline route set must be clean')

  files.delete(expected.mirrors[0])
  files.set('robots.txt', files.get('robots.txt').replace(/^Sitemap: https:\/\//m, 'Sitemap: /'))
  const broken = verifyDiscovery({ files, expected, root: expected.root })
  assert.equal(broken.ok, false, 'an injected defect must be detected')
  const ids = broken.results.filter(r => !r.ok).map(r => r.id)
  assert.ok(ids.includes('Markdown mirrors'), `expected a mirror failure, got ${JSON.stringify(ids)}`)
  assert.ok(ids.includes('robots.txt'), `expected a robots failure, got ${JSON.stringify(ids)}`)
  await hexo.exit()
})

test('shipped defaults emit all seven surfaces without any configuration', { skip }, async () => {
  // 1.2.0 turns the family on by default: a site with no discovery config still
  // gets robots.txt, sitemap.xml, llms.txt, /ai/, /rights/ and Markdown mirrors,
  // all derived from its existing posts and config.
  const Hexo = require(require.resolve('hexo', { paths: [found.nodeModules] }))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-defaults-'))
  const put = (rel, body) => {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
  try {
    // Declare the renderers: Hexo only loads plugins listed here, and without a
    // Markdown renderer it copies `.md` files verbatim instead of rendering them.
    put('package.json', JSON.stringify({
      name: 'panda-defaults',
      private: true,
      hexo: {},
      dependencies: {
        hexo: '*',
        'hexo-generator-index': '*',
        'hexo-generator-archive': '*',
        'hexo-renderer-markdown-it-plus': '*',
        'hexo-renderer-pug': '*',
        'hexo-renderer-stylus': '*'
      }
    }, null, 2))
    put('_config.yml', [
      'title: Defaults', 'author: tester', 'url: https://example.com', 'root: /',
      'permalink: :year/:month/:day/:title/', 'theme: panda'
    ].join('\n'))
    put('source/_posts/a.md', '---\ntitle: A\ndate: 2026-01-01 00:00:00\n---\n\nBody.\n')
    put('source/about/index.md', '---\ntitle: About\ndate: 2025-01-01 00:00:00\n---\n\nAbout.\n')
    fs.symlinkSync(found.nodeModules, path.join(dir, 'node_modules'), 'junction')
    fs.mkdirSync(path.join(dir, 'themes'))
    fs.symlinkSync(themeRoot, path.join(dir, 'themes', 'panda'), 'junction')

    const hexo = new Hexo(dir, { silent: true })
    await hexo.init()
    await hexo.call('generate', {})
    const routes = hexo.route.list()
    await hexo.exit()
    const discoveryRoutes = routes.filter(r => /(^|\/)(robots\.txt|sitemap\.xml|llms\.txt)$|^ai\/|^rights\/|\.md$/.test(r))
    for (const expected of ['robots.txt', 'sitemap.xml', 'llms.txt', 'ai/index.html', 'rights/index.html']) {
      assert.ok(discoveryRoutes.includes(expected), `defaults must emit ${expected}, got ${JSON.stringify(discoveryRoutes)}`)
    }
    assert.ok(discoveryRoutes.some(r => r.endsWith('.md')), 'defaults must emit Markdown mirrors')

    // Opting out has to stay possible for a site that wants the old footprint.
    const offDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-defaults-off-'))
    try {
      for (const rel of ['source/_posts/a.md', 'source/about/index.md']) {
        const abs = path.join(offDir, rel)
        fs.mkdirSync(path.dirname(abs), { recursive: true })
        fs.writeFileSync(abs, fs.readFileSync(path.join(dir, rel)))
      }
      fs.writeFileSync(path.join(offDir, 'package.json'), fs.readFileSync(path.join(dir, 'package.json')))
      fs.writeFileSync(path.join(offDir, '_config.yml'), fs.readFileSync(path.join(dir, '_config.yml')))
      fs.writeFileSync(path.join(offDir, '_config.panda.yml'), [
        'site_discovery:', '  robots:', '    provider: disabled', '  sitemap:', '    provider: disabled',
        'ai_readable:', '  enable: false'
      ].join('\n'))
      fs.symlinkSync(found.nodeModules, path.join(offDir, 'node_modules'), 'junction')
      fs.mkdirSync(path.join(offDir, 'themes'))
      fs.symlinkSync(themeRoot, path.join(offDir, 'themes', 'panda'), 'junction')

      const offHexo = new Hexo(offDir, { silent: true })
      await offHexo.init()
      await offHexo.call('generate', {})
      const offRoutes = offHexo.route.list()
      await offHexo.exit()
      const offDiscovery = offRoutes.filter(r => /(^|\/)(robots\.txt|sitemap\.xml|llms\.txt)$|^ai\/|^rights\/|\.md$/.test(r))
      assert.deepEqual(offDiscovery, [], `explicit opt-out must emit nothing, got ${JSON.stringify(offDiscovery)}`)
    } finally {
      fs.rmSync(offDir, { recursive: true, force: true })
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a site with no `social:` config still gets the robot in the author card', { skip }, async () => {
  // The card used to render its row only when `social:` was configured, which left
  // the AI entry invisible for a site that never filled that list in — the common
  // case for a fresh install, and precisely where the defaults are supposed to work.
  const Hexo = require(require.resolve('hexo', { paths: [found.nodeModules] }))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-nosocial-'))
  const put = (rel, body) => {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
  try {
    put('package.json', JSON.stringify({
      name: 'panda-nosocial', private: true, hexo: {}, dependencies: {
        hexo: '*', 'hexo-generator-index': '*', 'hexo-generator-archive': '*',
        'hexo-renderer-markdown-it-plus': '*', 'hexo-renderer-pug': '*', 'hexo-renderer-stylus': '*'
      }
    }, null, 2))
    put('_config.yml', ['title: No Social', 'author: tester', 'url: https://example.com', 'root: /', 'theme: panda'].join('\n'))
    put('source/_posts/a.md', '---\ntitle: A\ndate: 2026-01-01 00:00:00\n---\n\nA.\n')
    fs.symlinkSync(found.nodeModules, path.join(dir, 'node_modules'), 'junction')
    fs.mkdirSync(path.join(dir, 'themes'))
    fs.symlinkSync(themeRoot, path.join(dir, 'themes', 'panda'), 'junction')

    const hexo = new Hexo(dir, { silent: true })
    await hexo.init()
    await hexo.call('generate', {})
    const stream = hexo.route.get('index.html')
    const chunks = []
    await new Promise((resolve, reject) => {
      stream.on('data', c => chunks.push(Buffer.from(c)))
      stream.on('end', resolve)
      stream.on('error', reject)
    })
    const home = Buffer.concat(chunks).toString('utf8')
    await hexo.exit()

    assert.match(home, /card-info-social-icons/, 'the row renders without any social links')
    assert.match(home, /class="social-icon ai-reading-icon"[^>]*href="\/ai\/"/, 'the robot is the only icon, pointing at the portal')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('`hexo panda verify-ai` exits non-zero on a damaged public/', { skip }, async () => {
  // Delete a real mirror from the built site; the command must notice and fail.
  const verifier = require('../scripts/panda/verify-ai')
  const Hexo = require(require.resolve('hexo', { paths: [found.nodeModules] }))
  const mirror = fs.readdirSync(path.join(output, '2026', '01', '10', 'hello-world'))
    .find(name => name.endsWith('.md'))
  const mirrorPath = path.join(output, '2026', '01', '10', 'hello-world', mirror)
  const saved = fs.readFileSync(mirrorPath)
  const robotsPath = path.join(output, 'robots.txt')
  const savedRobots = fs.readFileSync(robotsPath)

  const hexo = new Hexo(siteDir, { silent: true })
  await hexo.init()
  const previous = process.exitCode
  process.exitCode = undefined
  let result
  try {
    fs.unlinkSync(mirrorPath)
    fs.writeFileSync(robotsPath, savedRobots.toString('utf8').replace(/^Sitemap: https:\/\//m, 'Sitemap: /'))
    result = await verifier.verifyConsole.call(hexo)
  } finally {
    fs.writeFileSync(mirrorPath, saved)
    fs.writeFileSync(robotsPath, savedRobots)
  }
  const exitCode = process.exitCode
  process.exitCode = previous
  await hexo.exit()

  assert.equal(result.ok, false, 'a deleted mirror must fail verification')
  assert.ok(result.results.filter(r => !r.ok).some(r => r.id === 'Markdown mirrors' || r.id === 'robots.txt'))
  assert.equal(exitCode, 1, 'the command must set process.exitCode = 1 so CI fails')
})

test('a CJK permalink with a sub-path root produces matching links everywhere', { skip }, async () => {
  // `permalink: :category/:title/` with a CJK filename puts raw CJK, a space and `#`
  // into the route. Every consumer (sitemap, llms.txt, mirror route, head links) must
  // agree on one encoding, and no raw space or `#` may leak into a URL.
  const Hexo = require(require.resolve('hexo', { paths: [found.nodeModules] }))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-cjk-'))
  const put = (rel, body) => {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
  const sourceName = '中文 标题 #1'
  try {
    put('package.json', JSON.stringify({
      name: 'panda-cjk', private: true, hexo: {}, dependencies: {
        hexo: '*', 'hexo-generator-index': '*', 'hexo-generator-archive': '*',
        'hexo-renderer-markdown-it-plus': '*', 'hexo-renderer-pug': '*', 'hexo-renderer-stylus': '*'
      }
    }, null, 2))
    put('_config.yml', [
      'title: CJK', 'author: tester', 'url: https://example.com/blog', 'root: /blog/',
      'permalink: ":category/:title/"', 'theme: panda'
    ].join('\n'))
    put('_config.panda.yml', [
      'site_discovery:', '  robots:', '    provider: panda', '  sitemap:', '    provider: panda',
      'ai_readable:', '  enable: true'
    ].join('\n'))
    put(`source/_posts/${sourceName}.md`, `---\ntitle: "${sourceName}"\ndate: 2026-01-10 12:00:00\ncategories: [笔记]\n---\n\n正文。\n`)
    fs.symlinkSync(found.nodeModules, path.join(dir, 'node_modules'), 'junction')
    fs.mkdirSync(path.join(dir, 'themes'))
    fs.symlinkSync(themeRoot, path.join(dir, 'themes', 'panda'), 'junction')

    const hexo = new Hexo(dir, { silent: true })
    await hexo.init()
    await hexo.call('generate', {})
    const routes = hexo.route.list()
    const read = (route) => new Promise((resolve, reject) => {
      const stream = hexo.route.get(route)
      if (!stream) return resolve(null)
      const chunks = []
      stream.on('data', c => chunks.push(Buffer.from(c)))
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      stream.on('error', reject)
    })
    const sitemap = await read('sitemap.xml')
    const llms = await read('llms.txt')
    const postRoute = routes.find(r => r.endsWith('/index.html') && r.startsWith('笔记/'))
    const html = await read(postRoute)
    const mirror = routes.find(r => r.startsWith('笔记/') && r.endsWith('.md'))
    await hexo.exit()

    assert.ok(mirror, 'the mirror route exists next to the CJK page path')
    // `encodeURI` keeps `#` (a URL delimiter) raw, which would truncate the URL, so
    // the theme must percent-encode it; mirror that expectation per segment.
    const enc = (value) => value.split('/').map(encodeURIComponent).join('/')
    const pageUrl = `https://example.com/blog/笔记/${sourceName}/`
    const locs = sitemap.match(/<loc>[^<]*<\/loc>/g).map(tag => tag.slice(5, -6))
    // The loc has to be the page's canonical, whichever shape `pretty_urls` picks.
    // Hexo's own canonical leaves a raw `#` in the slug, which a URL parser reads as
    // a fragment and truncates; the theme escapes it, so compare with that one
    // documented difference normalized.
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)[1].replace(/#/g, '%23')
    assert.ok(locs.includes(canonical), `the sitemap loc equals the page canonical; got ${JSON.stringify(locs)} vs ${canonical}`)
    for (const loc of locs) {
      assert.doesNotMatch(loc, / |#/, `no raw space or # leaks into a sitemap URL: ${loc}`)
    }
    const mirrorPath = mirror.replace(/^\//, '').split('/').map(decodeURIComponent).join('/')
    assert.strictEqual(mirrorPath, `笔记/${sourceName}/index.md`, 'the mirror lives at the matching directory')
    assert.ok(
      llms.includes(`/blog/${enc(mirrorPath)}`),
      `llms.txt links to the encoded mirror; got ${JSON.stringify(llms.match(/\]\([^)]*index\.md\)/g))}`
    )
    assert.ok(
      html.includes(`rel="alternate" type="text/markdown" href="/blog/${enc(mirrorPath)}"`),
      'the head advertises that same mirror'
    )
    assert.ok(html.includes('rel="describedby" type="text/plain" href="/blog/llms.txt"'), 'describedby honours the sub-path root')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the sitemap omits memo pages and feed update stubs', { skip }, async () => {
  // A memo page (`type: shuoshuo`) and the `<post>/u/<hash>/` update stub are real
  // routes but must never be indexed; the stub is not a model entry at all, so this
  // checks the generated output rather than the collection logic.
  const Hexo = require(require.resolve('hexo', { paths: [found.nodeModules] }))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-memo-'))
  const put = (rel, body) => {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
  try {
    put('package.json', JSON.stringify({
      name: 'panda-memo', private: true, hexo: {}, dependencies: {
        hexo: '*', 'hexo-generator-index': '*', 'hexo-generator-archive': '*',
        'hexo-renderer-markdown-it-plus': '*', 'hexo-renderer-pug': '*', 'hexo-renderer-stylus': '*'
      }
    }, null, 2))
    put('_config.yml', [
      'title: Memo', 'author: tester', 'url: https://example.com', 'root: /',
      'permalink: :year/:month/:day/:title/', 'theme: panda'
    ].join('\n'))
    put('_config.panda.yml', [
      'memos:', '  enable: true',
      'feed:', '  enable: true', '  include_memos: true',
      'site_discovery:', '  robots:', '    provider: panda', '  sitemap:', '    provider: panda',
      'ai_readable:', '  enable: true'
    ].join('\n'))
    put('source/_posts/hello.md', '---\ntitle: Hello\ndate: 2026-01-10 12:00:00\nupdated: 2026-02-01 09:00:00\n---\n\nBody.\n')
    put('source/_data/shuoshuo.yml', '- content: "A memo entry"\n  date: 2026-01-20 10:00:00\n')
    put('source/memos/index.md', '---\ntitle: Memos\ntype: shuoshuo\ndate: 2025-12-01 00:00:00\n---\n')
    fs.symlinkSync(found.nodeModules, path.join(dir, 'node_modules'), 'junction')
    fs.mkdirSync(path.join(dir, 'themes'))
    fs.symlinkSync(themeRoot, path.join(dir, 'themes', 'panda'), 'junction')

    const hexo = new Hexo(dir, { silent: true })
    await hexo.init()
    await hexo.call('generate', {})
    const routes = hexo.route.list()
    const stream = hexo.route.get('sitemap.xml')
    const xml = await new Promise((resolve, reject) => {
      const chunks = []
      stream.on('data', c => chunks.push(Buffer.from(c)))
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      stream.on('error', reject)
    })
    await hexo.exit()

    assert.ok(routes.some(r => r.startsWith('memos/')), 'the memo page exists in the build')
    assert.ok(routes.some(r => /\/u\/[0-9a-f]+\/index\.html$/.test(r)), 'the update stub exists in the build')
    assert.doesNotMatch(xml, /memos/, 'the memo page is not indexed')
    assert.doesNotMatch(xml, /\/u\//, 'the update stub is not indexed')
    assert.match(xml, /<loc>https:\/\/example\.com\/2026\/01\/10\/hello\/index\.html<\/loc>/, 'the real post is indexed in canonical form')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a hand-written /rights/ page wins over the generated one', { skip }, async () => {
  // The blog in this repo ships its own `source/rights/index.md`; the theme must
  // leave that content alone, and the sitemap must still list the real page.
  const Hexo = require(require.resolve('hexo', { paths: [found.nodeModules] }))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-own-rights-'))
  const put = (rel, body) => {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
  try {
    put('package.json', JSON.stringify({
      name: 'panda-own-rights', private: true, hexo: {}, dependencies: {
        hexo: '*', 'hexo-generator-index': '*', 'hexo-generator-archive': '*',
        'hexo-renderer-markdown-it-plus': '*', 'hexo-renderer-pug': '*', 'hexo-renderer-stylus': '*'
      }
    }, null, 2))
    put('_config.yml', ['title: Own', 'author: tester', 'url: https://example.com', 'root: /', 'theme: panda'].join('\n'))
    put('_config.panda.yml', ['site_discovery:', '  sitemap:', '    provider: panda', 'ai_readable:', '  enable: true'].join('\n'))
    put('source/_posts/a.md', '---\ntitle: A\ndate: 2026-01-01 00:00:00\n---\n\nA.\n')
    put('source/rights/index.md', '---\ntitle: 我自己写的政策\ndate: 2025-12-01 00:00:00\n---\n\nMINE-ONLY-MARKER\n')
    fs.symlinkSync(found.nodeModules, path.join(dir, 'node_modules'), 'junction')
    fs.mkdirSync(path.join(dir, 'themes'))
    fs.symlinkSync(themeRoot, path.join(dir, 'themes', 'panda'), 'junction')

    const hexo = new Hexo(dir, { silent: true })
    await hexo.init()
    await hexo.call('generate', {})
    const read = (route) => new Promise((resolve, reject) => {
      const stream = hexo.route.get(route)
      if (!stream) return resolve(null)
      const chunks = []
      stream.on('data', c => chunks.push(Buffer.from(c)))
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      stream.on('error', reject)
    })
    const rights = await read('rights/index.html')
    const sitemap = await read('sitemap.xml')
    const portal = await read('ai/index.html')
    await hexo.exit()

    assert.ok(rights.includes('MINE-ONLY-MARKER'), 'the hand-written rights page is kept verbatim')
    assert.doesNotMatch(rights, /ai-readab|rights-hero/, 'the generated layout did not overwrite it')
    assert.match(sitemap, /<loc>https:\/\/example\.com\/rights\/index\.html<\/loc>/, 'the real page is in the sitemap')
    assert.ok(portal, 'the portal is still generated')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a robot icon already present in `social:` is not duplicated', { skip }, async () => {
  const Hexo = require(require.resolve('hexo', { paths: [found.nodeModules] }))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-dedupe-'))
  const put = (rel, body) => {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
  try {
    put('package.json', JSON.stringify({
      name: 'panda-dedupe', private: true, hexo: {}, dependencies: {
        hexo: '*', 'hexo-generator-index': '*', 'hexo-generator-archive': '*',
        'hexo-renderer-markdown-it-plus': '*', 'hexo-renderer-pug': '*', 'hexo-renderer-stylus': '*'
      }
    }, null, 2))
    put('_config.yml', ['title: Dedupe', 'author: tester', 'url: https://example.com', 'root: /', 'theme: panda'].join('\n'))
    // Exactly the pre-1.1.10 workaround this blog shipped.
    put('_config.panda.yml', [
      'social:', '  fas fa-robot: /ai/ || AI 阅读入口',
      'home_about:', '  enable: true', '  source: about/index.md',
      'ai_readable:', '  enable: true'
    ].join('\n'))
    put('source/index.md', ['---', 'title: About', 'layout: home', '---', ''].join('\n'))
    put('source/about/index.md', ['---', 'title: About', 'date: 2025-12-01 00:00:00', '---', '', 'About.', ''].join('\n'))
    put('source/_posts/a.md', '---\ntitle: A\ndate: 2026-01-01 00:00:00\n---\n\nA.\n')
    fs.symlinkSync(found.nodeModules, path.join(dir, 'node_modules'), 'junction')
    fs.mkdirSync(path.join(dir, 'themes'))
    fs.symlinkSync(themeRoot, path.join(dir, 'themes', 'panda'), 'junction')

    const hexo = new Hexo(dir, { silent: true })
    await hexo.init()
    await hexo.call('generate', {})
    const read = (route) => new Promise((resolve, reject) => {
      const stream = hexo.route.get(route)
      if (!stream) return resolve(null)
      const chunks = []
      stream.on('data', c => chunks.push(Buffer.from(c)))
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      stream.on('error', reject)
    })
    const home = await read('index.html')
    await hexo.exit()

    // The fixture hand-writes the robot into `social:` (the pre-1.1.10
    // workaround). It renders exactly like every other social icon: once in the
    // hero row, once in the author card. The theme must not add one of its own.
    const generated = (home.match(/class="social-icon ai-reading-icon"/g) || []).length
    assert.equal(generated, 0, 'a hand-written entry wins, so no generated robot is added')
    const configured = (home.match(/<a class="social-icon"[^>]*href="\/ai\/"/g) || []).length
    assert.ok(configured >= 1, 'the configured AI entry still renders')
    assert.equal((home.match(/href="\/ai\/"/g) || []).length, configured,
      'every /ai/ link comes from the configured entry, none from the theme')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('pretty_urls decides the URL shape everywhere, consistently', { skip }, async () => {
  // Hexo ships `trailing_index: true`, and that is what this blog keeps, so the
  // canonical is `.../post/index.html`. The other setting must work too, and in both
  // cases every surface has to agree with the canonical.
  for (const trailingIndex of [true, false]) {
    const suffix = trailingIndex ? '/index.html' : '/'
    const Hexo = require(require.resolve('hexo', { paths: [found.nodeModules] }))
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `panda-pretty-${trailingIndex}-`))
    const put = (rel, body) => {
      const abs = path.join(dir, rel)
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, body)
    }
    try {
      put('package.json', JSON.stringify({
        name: 'panda-pretty', private: true, hexo: {}, dependencies: {
          hexo: '*', 'hexo-generator-index': '*', 'hexo-generator-archive': '*',
          'hexo-renderer-markdown-it-plus': '*', 'hexo-renderer-pug': '*', 'hexo-renderer-stylus': '*'
        }
      }, null, 2))
      put('_config.yml', [
        'title: Pretty', 'author: tester', 'url: https://example.com/blog', 'root: /blog/',
        'permalink: :year/:month/:day/:title/', 'theme: panda',
        'pretty_urls:', `  trailing_index: ${trailingIndex}`, '  trailing_html: true'
      ].join('\n'))
      put('_config.panda.yml', [
        'site_discovery:', '  robots:', '    provider: panda', '  sitemap:', '    provider: panda',
        'ai_readable:', '  enable: true'
      ].join('\n'))
      put('source/_posts/hello.md', '---\ntitle: Hello\ndate: 2026-01-10 12:00:00\nupdated: 2026-02-01 09:00:00\n---\n\nBody.\n')
      fs.symlinkSync(found.nodeModules, path.join(dir, 'node_modules'), 'junction')
      fs.mkdirSync(path.join(dir, 'themes'))
      fs.symlinkSync(themeRoot, path.join(dir, 'themes', 'panda'), 'junction')

      const hexo = new Hexo(dir, { silent: true })
      await hexo.init()
      await hexo.call('generate', {})
      const routes = hexo.route.list()
      const read = (route) => new Promise((resolve, reject) => {
        const stream = hexo.route.get(route)
        if (!stream) return resolve(null)
        const chunks = []
        stream.on('data', c => chunks.push(Buffer.from(c)))
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        stream.on('error', reject)
      })
      // Exclude the feed's `u/<hash>/` update stub, whose canonical is the post itself.
      const pageRoute = routes.find(r => r === '2026/01/10/hello/index.html')
      const html = await read(pageRoute)
      const sitemap = await read('sitemap.xml')
      const llms = await read('llms.txt')
      await hexo.exit()

      const canonicalMatch = /<link rel="canonical" href="([^"]+)"/.exec(html)
      assert.ok(canonicalMatch, `canonical missing for trailing_index: ${trailingIndex} (page ${pageRoute})`)
      const canonical = canonicalMatch[1]
      const pageUrl = `https://example.com/blog/2026/01/10/hello${suffix}`
      assert.strictEqual(canonical, pageUrl, `canonical follows pretty_urls (trailing_index: ${trailingIndex})`)
      assert.ok(sitemap.includes(`<loc>${pageUrl}</loc>`), `the sitemap loc equals the canonical (trailing_index: ${trailingIndex})`)
      assert.ok(llms.includes(`https://example.com/blog/2026/01/10/hello/index.md`), 'the mirror link keeps its .md path')
      assert.ok(html.includes('rel="alternate" type="text/markdown" href="/blog/2026/01/10/hello/index.md"'), 'the alternate link points at the mirror, not at a prettified URL')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('provider: disabled writes neither robots.txt nor sitemap.xml', { skip }, async () => {
  // The third provider mode: the theme stays completely out of the way, unlike
  // `external`, which still marks exclusions for an existing plugin.
  const Hexo = require(require.resolve('hexo', { paths: [found.nodeModules] }))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-disabled-'))
  const put = (rel, body) => {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
  try {
    put('package.json', JSON.stringify({
      name: 'panda-disabled', private: true, hexo: {}, dependencies: {
        hexo: '*', 'hexo-renderer-markdown-it-plus': '*', 'hexo-renderer-pug': '*', 'hexo-renderer-stylus': '*'
      }
    }, null, 2))
    put('_config.yml', [
      'title: Disabled', 'author: tester', 'url: https://example.com', 'root: /',
      'permalink: :year/:month/:day/:title/', 'theme: panda'
    ].join('\n'))
    put('_config.panda.yml', [
      'site_discovery:', '  robots:', '    provider: disabled', '  sitemap:', '    provider: disabled',
      'ai_readable:', '  enable: true', '  llms_txt:', '    enable: false', '  markdown:', '    enable: false',
      '  portal:', '    enable: false', '  rights:', '    enable: false'
    ].join('\n'))
    put('source/_posts/hidden.md', '---\ntitle: Hidden\ndate: 2026-01-03 00:00:00\nnoindex: true\n---\n\nSecret.\n')
    put('source/_posts/pub.md', '---\ntitle: Pub\ndate: 2026-01-02 00:00:00\n---\n\nP.\n')
    fs.symlinkSync(found.nodeModules, path.join(dir, 'node_modules'), 'junction')
    fs.mkdirSync(path.join(dir, 'themes'))
    fs.symlinkSync(themeRoot, path.join(dir, 'themes', 'panda'), 'junction')

    const hexo = new Hexo(dir, { silent: true })
    await hexo.init()
    await hexo.call('generate', {})
    const routes = hexo.route.list()
    const sitemapFlag = hexo.model('Post').toArray().find(p => p.title === 'Hidden').sitemap
    await hexo.exit()

    assert.ok(!routes.includes('robots.txt'), 'disabled must not produce robots.txt')
    assert.ok(!routes.includes('sitemap.xml'), 'disabled must not produce sitemap.xml')
    assert.notEqual(sitemapFlag, false, 'disabled must not touch the models either')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('external sitemap mode marks excluded content as sitemap:false', { skip }, async () => {
  // `hexo-generator-sitemap` skips anything with `sitemap: false`. In external mode
  // the theme must set that flag on noindex/excluded/series-index models, otherwise
  // the plugin would list pages the theme considers private.
  const Hexo = require(require.resolve('hexo', { paths: [found.nodeModules] }))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-external-'))
  const put = (rel, body) => {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
  try {
    put('package.json', JSON.stringify({
      name: 'panda-external', private: true, hexo: {}, dependencies: {
        hexo: '*', 'hexo-renderer-markdown-it-plus': '*', 'hexo-renderer-pug': '*', 'hexo-renderer-stylus': '*'
      }
    }, null, 2))
    put('_config.yml', [
      'title: External', 'author: tester', 'url: https://example.com', 'root: /',
      'permalink: :year/:month/:day/:title/', 'theme: panda'
    ].join('\n'))
    put('_config.panda.yml', [
      'blog_series:', '  enable: true', '  path: /series/',
      'site_discovery:', '  robots:', '    provider: external', '  sitemap:',
      '    provider: external', '    exclude_noindex: true'
    ].join('\n'))
    put('source/_posts/public.md', '---\ntitle: Public\ndate: 2026-01-02 00:00:00\n---\n\nBody.\n')
    put('source/_posts/hidden.md', '---\ntitle: Hidden\ndate: 2026-01-03 00:00:00\nnoindex: true\n---\n\nSecret.\n')
    put('source/_posts/s/index.md', '---\ntitle: Series\ndescription: A series.\n---\n\nIntro.\n')
    put('source/_posts/s/one.md', '---\ntitle: One\ndate: 2026-01-04 00:00:00\n---\n\nChapter.\n')
    fs.symlinkSync(found.nodeModules, path.join(dir, 'node_modules'), 'junction')
    fs.mkdirSync(path.join(dir, 'themes'))
    fs.symlinkSync(themeRoot, path.join(dir, 'themes', 'panda'), 'junction')

    const hexo = new Hexo(dir, { silent: true })
    await hexo.init()
    await hexo.call('generate', {})
    const byTitle = new Map(hexo.model('Post').toArray().map(p => [p.title, p]))
    const routes = hexo.route.list()
    await hexo.exit()

    assert.equal(byTitle.get('Hidden').sitemap, false, 'a noindex post is excluded from an external sitemap')
    assert.equal(byTitle.get('Series').sitemap, false, 'the series index.md source is excluded')
    assert.notEqual(byTitle.get('Public').sitemap, false, 'a public post stays in the sitemap')
    assert.ok(!routes.includes('sitemap.xml'), 'external mode must not write its own sitemap')
    assert.ok(!routes.includes('robots.txt'), 'external mode must not write its own robots.txt')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a generator that already claims sitemap.xml aborts a panda-mode build', { skip }, async () => {
  // The objective requires a loud failure instead of two generators fighting over
  // one path. Register a stand-in plugin on a fresh site and expect the build to
  // reject with the plugin's name in the message.
  const Hexo = require(require.resolve('hexo', { paths: [found.nodeModules] }))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-conflict-'))
  const put = (rel, body) => {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
  try {
    put('package.json', JSON.stringify({ name: 'panda-conflict', private: true, hexo: {}, dependencies: {} }))
    put('_config.yml', [
      'title: Conflict', 'author: tester', 'url: https://example.com', 'root: /',
      'permalink: :year/:month/:day/:title/', 'theme: panda'
    ].join('\n'))
    // Theme options live in `_config.panda.yml`, not the site config.
    put('_config.panda.yml', [
      'site_discovery:', '  robots:', '    provider: external', '  sitemap:', '    provider: panda',
      'ai_readable:', '  enable: false'
    ].join('\n'))
    put('source/_posts/hello.md', '---\ntitle: Hello\ndate: 2026-01-01 00:00:00\n---\n\nBody.\n')
    // Stand-in for hexo-generator-sitemap: same registered generator name.
    put('scripts/fake-sitemap.js', "hexo.extend.generator.register('sitemap', () => [])\n")
    fs.symlinkSync(found.nodeModules, path.join(dir, 'node_modules'), 'junction')
    fs.mkdirSync(path.join(dir, 'themes'))
    fs.symlinkSync(themeRoot, path.join(dir, 'themes', 'panda'), 'junction')

    const hexo = new Hexo(dir, { silent: true })
    await hexo.init()
    const error = await hexo.call('generate', {}).then(() => null, err => err)
    await hexo.exit()
    assert.ok(error, 'the build must fail instead of writing a second sitemap')
    assert.match(String(error.message), /sitemap\.xml: provider is "panda" but generator "sitemap"/)
    assert.match(String(error.message), /site_discovery\.sitemap\.provider/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the AI reading entry renders once, in the author card, under the Follow Me button', { skip }, () => {
  const html = read('index.html')
  assert.equal((html.match(/ai-reading-icon/g) || []).length, 1, 'exactly one AI entry on the home page')
  assert.doesNotMatch(html, /panda-follow-me/, 'the home about area no longer owns a social row')

  const card = html.indexOf('card-info-social-icons')
  assert.ok(card > -1, 'the author card renders the social row')
  const button = html.indexOf('card-info-btn')
  assert.ok(button > -1 && button < card, 'the row sits after the Follow Me button')
  const row = html.slice(card, html.indexOf('</div>', html.indexOf('ai-reading-icon')))
  const robot = row.indexOf('ai-reading-icon')
  const last = Math.max(row.indexOf('fa-github'), row.indexOf('fa-envelope'), row.indexOf('fa-rss'))
  assert.ok(last > -1 && last < robot, 'the robot is the last icon in the row')
})
