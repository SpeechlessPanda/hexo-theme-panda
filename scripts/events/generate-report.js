'use strict'

const { version } = require('../../package.json')

// `hexo generate` prints "N files generated in Xs" but never says which theme wrote
// them. That is the one fact an upgrade turns on: the footer and the `?v=` cache-bust
// only describe the output already in front of you, so a build that was never
// regenerated and a build that came from a stale lockfile look identical from
// outside. CI logs are the only place the answer exists, so print it there.
hexo.on('generateAfter', () => {
  const routes = typeof hexo.route?.list === 'function' ? hexo.route.list() : []
  hexo.log.info(`[panda] theme ${version} · Hexo ${hexo.version} · ${routes.length} files generated`)
})
