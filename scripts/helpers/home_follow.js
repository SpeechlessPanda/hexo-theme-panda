'use strict'

// One place decides whether the home about area owns the social row. Both the
// Follow Me partial and the author card consult it, so the AI reading entry can
// never render twice on the home page: the row shows it, the card omits it.
hexo.extend.helper.register('pandaHomeFollowRow', function () {
  const cfg = this.theme || {}
  if (!this.page) return false
  // Only the page that actually uses the `home` layout (or the generated index)
  // renders the about area; on every other page the author card keeps the icon.
  if (this.page.layout !== 'home' && !this.page.__index) return false

  const ha = cfg.home_about || {}
  if (ha.enable === false) return false
  if (!this.site.pages.findOne({ source: ha.source || 'about/index.md' })) return false

  const ai = cfg.ai_readable || {}
  const portal = ai.portal || {}
  const icon = portal.social_icon || {}
  const followOn = !!(ai.enable && portal.enable && icon.enable && icon.show_on_home !== false)
  const hasSocial = !!(cfg.social && Object.keys(cfg.social).length)
  return followOn || hasSocial
})
