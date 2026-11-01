// Panda theme — memo comment counts via GitHub GraphQL (Giscus)
// Forked from SpeechlessPanda/blog-s-code scripts/memo-comment-count.js (Apache-2.0).
//
// At build time, query Giscus discussions and write a count into the memos
// page's shuoshuo-data JSON. The frontend auto-expands a memo when that count
// is greater than zero.
//
// Giscus shows two kinds of activity on one discussion: a posted comment
// (comments.totalCount) and an emoji left on the discussion itself
// (reactions.totalCount — the row of emoji under the comment box). An
// emoji-only discussion has comments.totalCount === 0, so counting comments
// alone leaves its memo collapsed. A memo expands when either count is > 0.
//
// Requires: `comments.use: Giscus` + `giscus.repo`, and env GH_DISCUSSION_TOKEN
// (a GitHub token with discussions read access). Without the token the filter
// leaves the data untouched (frontend keeps its default collapsed behavior).
// Disable entirely with `memos.comment_count: false`.
'use strict'

const { memoDataKey, memosEnabled, memosConfig, memosPath } = require('./lib/memo-utils')

const GISCUS_QUERY = `query($owner:String!,$name:String!,$categoryId:ID,$after:String){
  repository(owner:$owner,name:$name){
    discussions(first:100,after:$after,categoryId:$categoryId,orderBy:{field:UPDATED_AT,direction:DESC}){
      pageInfo{hasNextPage,endCursor}
      nodes{title comments{totalCount} reactions{totalCount}}
    }
  }
}`

// Activity that should open the comment area: a written comment, or an emoji
// reaction on the discussion. Missing fields count as zero, never as activity.
function discussionActivity (node) {
  if (!node) return 0
  const comments = node.comments && node.comments.totalCount || 0
  const reactions = node.reactions && node.reactions.totalCount || 0
  return comments + reactions
}

// title -> activity count. A later page must not wipe an earlier count with 0.
function indexDiscussionActivity (nodes, titleToCount) {
  for (const node of nodes || []) {
    if (!node || !node.title) continue
    titleToCount[node.title] = discussionActivity(node)
  }
  return titleToCount
}

if (typeof hexo !== 'undefined') hexo.extend.filter.register('after_generate', async function () {
  const cfg = memosConfig(hexo)
  if (!memosEnabled(hexo) || cfg.comment_count === false) return

  const memosFile = memosPath(hexo).replace(/^\//, '') + 'index.html'
  const route = hexo.route
  if (!route.list().includes(memosFile)) return

  const token = process.env.GH_DISCUSSION_TOKEN
  if (!token) return // keep frontend default behavior without a token

  const giscus = (hexo.theme.config && hexo.theme.config.giscus) || {}
  if (!giscus.repo) return

  // Read memos page HTML from the in-memory route (after_generate runs before write-out)
  const stream = route.get(memosFile)
  let html = ''
  for await (const chunk of stream) html += chunk.toString()

  const match = html.match(/<script type="application\/json" id="shuoshuo-data">([\s\S]*?)<\/script>/)
  if (!match) return
  let data
  try {
    data = JSON.parse(match[1])
  } catch (e) {
    hexo.log.warn('[panda] shuoshuo-data JSON parse failed, skipping comment counts')
    return
  }
  if (!data || !data.length) return

  const [owner, name] = giscus.repo.split('/')
  const categoryId = giscus.category_id || null
  const titleToCount = {}
  try {
    let hasNextPage = true
    let after = null
    while (hasNextPage) {
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'hexo-theme-panda',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: GISCUS_QUERY, variables: { owner, name, categoryId, after } })
      })
      if (!res.ok) {
        hexo.log.warn('[panda] GitHub GraphQL HTTP %s, comment counts skipped', res.status)
        return
      }
      const json = await res.json()
      const discussions = json && json.data && json.data.repository && json.data.repository.discussions
      const nodes = (discussions && discussions.nodes) || []
      indexDiscussionActivity(nodes, titleToCount)
      hasNextPage = !!(discussions && discussions.pageInfo && discussions.pageInfo.hasNextPage)
      after = discussions && discussions.pageInfo && discussions.pageInfo.endCursor
      if (!nodes.length) break
    }
    const termPrefix = memosPath(hexo).replace(/\/$/, '') // '/memos'
    data.forEach(item => {
      item.commentCount = titleToCount[`${termPrefix}?key=${memoDataKey(item)}`] || 0
    })
  } catch (e) {
    hexo.log.warn('[panda] GitHub GraphQL query failed: %s, comment counts skipped', e.message)
    return
  }

  const newHtml = html.replace(match[0], `<script type="application/json" id="shuoshuo-data">${JSON.stringify(data)}</script>`)
  route.set(memosFile, newHtml)

  const withComments = data.filter(d => d.commentCount > 0).length
  hexo.log.info('[panda] %d/%d memo(s) have comments, auto-expanded', withComments, data.length)
})

module.exports = { GISCUS_QUERY, discussionActivity, indexDiscussionActivity }
