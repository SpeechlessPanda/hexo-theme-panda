// New file in hexo-theme-panda (Apache-2.0), forked from hexo-theme-butterfly 5.7.0: open article/memo links in a new tab
/*!
 * 在新标签页打开文章正文与碎碎念里的链接
 *
 * 背景：
 * - Hexo 的 external_link 只给"非本站域名"的外链加 target=_blank；文章里引用本站其他文章
 *   时写的是完整域名 URL，被识别为站内链接，故仍在当前页跳转。
 * - 碎碎念(source/_data/shuoshuo.yml)由主题前端 JS 动态渲染，不经过 after_post_render，
 *   其中的链接（含外链）一个 target 都没有，同样在当前页跳转。
 *
 * 做法：在此统一兜底——给"正文容器"内的所有非页内锚点链接补 target=_blank rel=noopener。
 * - 作用域：#article-container（文章 / 页面 / 碎碎念页正文）、.recent-post-memo .content（首页"最新的碎碎念"）
 * - 不触碰导航、目录(TOC)、侧栏、页脚等站内导航（它们不在上述容器内，保持当前页跳转）
 * - 跳过页内锚点（href 以 # 开头）与 javascript: 伪链接
 * - 已是 target=_blank 的（external_link 处理过的外链）只补 rel=noopener，不重复处理
 * - MutationObserver 兜底碎碎念分页动态渲染与 pjax 切页后新插入的链接
 */
;(() => {
  const SCOPE = '#article-container, .recent-post-memo .content'

  const fixLink = (a) => {
    const href = a.getAttribute('href') || ''
    if (!href || href[0] === '#' || href.startsWith('javascript:')) return
    if (a.target === '_blank') {
      if (!/\bnoopener\b/.test(a.rel || '')) a.setAttribute('rel', 'noopener')
      return
    }
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener')
  }

  const fixScope = (el) => el && el.querySelectorAll('a[href]').forEach(fixLink)

  // 处理动态插入的节点：可能是作用域容器本身、容器内的链接，或带子树的新块
  const handleAdded = (node) => {
    if (node.nodeType !== 1 || !node.closest) return
    if (node.matches && node.matches(SCOPE)) { fixScope(node); return }
    if (node.tagName === 'A' && node.closest(SCOPE)) fixLink(node)
    if (!node.querySelectorAll) return
    node.querySelectorAll(SCOPE).forEach(fixScope)                       // 子树内的新作用域容器
    if (node.closest(SCOPE)) node.querySelectorAll('a[href]').forEach(fixLink) // 作用域内新插入的链接
  }

  const run = () => document.querySelectorAll(SCOPE).forEach(fixScope)

  const start = () => {
    run()
    if (window.MutationObserver) {
      new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(handleAdded)))
        .observe(document.documentElement, { childList: true, subtree: true })
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()

  // pjax 切页后正文整体替换，重新扫描
  document.addEventListener('pjax:complete', run)
  document.addEventListener('pjax:success', run)
})()
