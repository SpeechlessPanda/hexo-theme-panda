// Panda theme — new posts carry `updated: false` by default.
// The feed re-pushes a post only when front-matter `updated:` holds a real date
// (see lib/post-updated.js); scaffolding the key with `false` makes the switch
// discoverable: revise a post, flip it to a date, subscribers get one "updated"
// notification. Works regardless of the site's own scaffolds/post.md, which
// always wins over theme-side scaffold defaults.
'use strict'

const fs = require('fs')
const path = require('path')
const { ensureUpdatedField } = require('./lib/post-updated')

hexo.on('new', post => {
  if (!post || !post.path) return
  const rel = path.relative(path.join(hexo.source_dir, '_posts'), post.path)
  if (!rel || rel.startsWith('..')) return // only posts, not pages/drafts-outside
  const next = ensureUpdatedField(post.content)
  if (next == null) return
  fs.writeFileSync(post.path, next)
  post.content = next
})
