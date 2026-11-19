// Panda theme — tell "the site asked for panda" apart from "panda is the default".
//
// 1.1.10 shipped `robots.provider` / `sitemap.provider` defaulting to `external`.
// 1.2.0 flips both to `panda`, which is what makes the seven surfaces appear for
// a site that configures nothing. That flip creates a hazard: a site that already
// runs `hexo-generator-sitemap` would suddenly have two generators claiming
// sitemap.xml, and a hard build failure is a bad upgrade.
//
// So a conflict resolves differently depending on intent:
//   explicit `provider: panda` -> the site's own configuration collides with its
//                                 plugins: fail loudly, naming the plugin
//   inherited default          -> step aside and warn once, leaving the plugin in
//                                 charge
//
// Intent cannot be read from `hexo.theme.config`: Hexo merges `_config.panda.yml`
// into it in `load_theme_config`, before any filter runs, so by the time a
// generator sees that object the defaults and the site's values are one. The file
// itself is the only honest source, so this module reads it with a line scan —
// no YAML dependency, and anything it does not understand degrades to "not
// explicit", the safe answer that keeps an upgrade from failing a build.
'use strict'

const fs = require('fs')
const path = require('path')

const CACHE = new Map() // site root → { mtimeMs, providers }

/**
 * Which discovery providers did the site write down itself?
 * @param {string} baseDir absolute site root (usually `hexo.base_dir`)
 * @returns {{robots: string|null, sitemap: string|null}}
 */
function readExplicitProviders (baseDir) {
  const none = { robots: null, sitemap: null }
  if (!baseDir) return none
  const file = path.join(baseDir, '_config.panda.yml')

  let stat
  try { stat = fs.statSync(file) } catch (_) { return none }
  const cached = CACHE.get(baseDir)
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.providers

  let text
  try { text = fs.readFileSync(file, 'utf8') } catch (_) { return none }

  const providers = parseProviders(text)
  CACHE.set(baseDir, { mtimeMs: stat.mtimeMs, providers })
  return providers
}

/** Indentation stack: only `site_discovery.<kind>.provider` is recorded. */
function parseProviders (text) {
  const result = { robots: null, sitemap: null }
  const stack = [] // [{ key, indent }]

  for (const rawLine of String(text).replace(/\r\n/g, '\n').split('\n')) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue
    const line = rawLine.replace(/\t/g, '  ')
    const indent = line.length - line.trimStart().length
    const body = line.trim()
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(body)
    if (!kv) continue
    const [, key, rest] = kv

    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    stack.push({ key, indent })

    const atDiscovery = stack.length === 2 && stack[0].key === 'site_discovery'
    const inSection = stack.length === 3 && stack[0].key === 'site_discovery' &&
      (stack[1].key === 'robots' || stack[1].key === 'sitemap')

    if (inSection && key === 'provider') {
      const value = rest.replace(/^['"]|['"]$/g, '').trim().toLowerCase()
      if (value) result[stack[1].key] = value
    } else if (atDiscovery && (key === 'robots' || key === 'sitemap')) {
      // Flow mapping form: `robots: { provider: panda, path: robots.txt }`
      const inline = /provider\s*:\s*['"]?([A-Za-z0-9_-]+)/.exec(rest)
      if (inline) result[key] = inline[1].toLowerCase()
    }
  }
  return result
}

/** Cached per-site lookup, so repeated generator calls do not re-read the file. */
function explicitProviders (hexo) {
  return readExplicitProviders(hexo && hexo.base_dir)
}

/** True when the site wrote `site_discovery.<kind>.provider` itself. */
function providerIsExplicit (hexo, kind) {
  const providers = explicitProviders(hexo)
  return !!(providers && providers[kind])
}

module.exports = { readExplicitProviders, parseProviders, explicitProviders, providerIsExplicit }
