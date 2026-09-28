// Panda theme — new posts carry `updated: false` and `sticky: false`.
// `updated:` is the feed re-push switch (see lib/post-updated.js): flip it to a
// real date after revising and subscribers get exactly one "updated"
// notification. `sticky:` pins atop the post stream when truthy. Scaffolding
// both keys with `false` makes the switches discoverable. Works regardless of
// the site's own scaffolds/post.md, which always wins over theme-side scaffold
// defaults.
'use strict'

const fs = require('fs')
const path = require('path')
const { ensurePostDefaults } = require('./lib/post-updated')

hexo.on('new', post => {
  if (!post || !post.path) return
  const rel = path.relative(path.join(hexo.source_dir, '_posts'), post.path)
  if (!rel || rel.startsWith('..')) return // only posts, not pages/drafts-outside
  const next = ensurePostDefaults(post.content)
  if (next == null) return
  fs.writeFileSync(post.path, next)
  post.content = next
})
