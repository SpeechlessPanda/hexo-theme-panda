// Panda theme — heading anchor behaviour (Apache-2.0).
//
// The build already guarantees `id` + a visible `a.headerlink` on every heading,
// and CSS gives in-article targets `scroll-margin-top`, so plain fragment
// navigation lands below the fixed nav even with JS disabled. This script only
// covers what the browser cannot do itself:
//
//   1. A target inside a closed <details>, an unopened hide-block/hide-inline or
//      an inactive tab has no box: the browser sets the hash and never scrolls.
//      Reveal the enclosing widgets, then align.
//   2. Late layout shifts (webfonts, lazy images above the target) move the
//      target after the first jump. Re-align for a bounded window and stop the
//      moment the reader scrolls.
//   3. Clicking `#` copies the absolute permalink.
//
// The browser keeps owning fragment navigation: no preventDefault, no history
// rewriting, so PJAX, back/forward and TOC clicks behave exactly as before.
;(() => {
  if (window.__pandaAnchor) return
  window.__pandaAnchor = true

  const SETTLE_MS = 1200
  const REVEAL_DEPTH = 40

  let frame = null

  const currentHash = () => {
    const raw = window.location.hash.slice(1)
    if (!raw) return ''
    try {
      return decodeURIComponent(raw)
    } catch (_) {
      return raw
    }
  }

  const targetOf = id => {
    if (!id) return null
    return document.getElementById(id) || document.getElementsByName(id)[0] || null
  }

  const chainOf = el => {
    const chain = []
    let node = el
    while (node && node !== document.body && chain.length < REVEAL_DEPTH) {
      chain.push(node)
      node = node.parentElement
    }
    return chain
  }

  const clickIfClosed = button => {
    if (button && !button.classList.contains('open') && !button.classList.contains('active')) {
      button.click()
    }
  }

  // Ancestors are revealed outermost-first: a nested <details> inside a closed
  // one reports no box until the outer block is open, so a single flat pass can
  // miss it and the tab-bar lookup would run against an inactive tab panel.
  const reveal = el => {
    const chain = chainOf(el)
    for (let i = chain.length - 1; i >= 0; i--) {
      const node = chain[i]
      if (node.tagName === 'DETAILS' && !node.open) node.open = true
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      const node = chain[i]
      if (!node.classList) continue
      if (node.classList.contains('hide-block') || node.classList.contains('hide-inline')) {
        clickIfClosed(node.firstElementChild)
      }
      if (node.classList.contains('tab-item-content') && !node.classList.contains('active')) {
        const contents = node.parentElement
        const nav = contents && contents.previousElementSibling
        const index = contents ? Array.prototype.indexOf.call(contents.children, node) : -1
        if (nav && index >= 0) clickIfClosed(nav.children[index])
      }
    }
  }

  const cancelSettle = () => {
    if (frame) cancelAnimationFrame(frame)
    frame = null
  }

  // scrollIntoView honours `scroll-margin-top`, so the offset lives in one place
  // (CSS) instead of being duplicated as a JS constant. `instant` is required:
  // the theme sets `scroll-behavior: smooth`, and a smooth re-align would still
  // be animating when the next measurement lands, so the target would stop
  // short of the offset.
  const align = el => el.scrollIntoView({ block: 'start', behavior: 'instant' })

  // Re-align only when layout moves the target, not when the viewport moves.
  // Near the end of a short page the browser cannot reach the requested offset.
  const settle = el => {
    const until = Date.now() + SETTLE_MS
    let scrollY = window.scrollY
    let documentTop = el.getBoundingClientRect().top + scrollY

    const tick = () => {
      frame = null
      if (!el.isConnected || Date.now() > until || Math.abs(window.scrollY - scrollY) > 1) return
      const nextTop = el.getBoundingClientRect().top + scrollY
      if (Math.abs(nextTop - documentTop) > 1) {
        align(el)
        scrollY = window.scrollY
        documentTop = nextTop
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  }

  const jump = (id, watchLayout = false) => {
    cancelSettle()
    const el = targetOf(id)
    if (!el) return false
    reveal(el)
    align(el)
    if (watchLayout) settle(el)
    return true
  }

  const userMoved = () => cancelSettle()
  ;['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(type => {
    window.addEventListener(type, userMoved, { passive: true })
  })

  // Keep the CSS offset equal to the real nav height: 60px on desktop, taller
  // when the mobile menu wraps onto a second line.
  const syncOffset = () => {
    const nav = document.getElementById('nav')
    const height = nav ? Math.round(nav.getBoundingClientRect().height) : 0
    document.documentElement.style.setProperty('--panda-anchor-offset', `${height > 0 ? height + 10 : 70}px`)
  }

  // `GLOBAL_CONFIG` is declared with `const` in an earlier inline classic
  // script (head/config.pug), so it is a script-scope lexical binding, not a
  // `window` property. Read the bare identifier like the rest of the theme
  // does; `typeof` guards the case where the tag failed to render.
  const globalConfig = () => (typeof GLOBAL_CONFIG === 'undefined' ? null : GLOBAL_CONFIG)

  const anchorConfig = () => {
    const config = globalConfig()
    return (config && config.anchor) || {}
  }

  const copyPermalink = async link => {
    if (anchorConfig().copyLink === false) return

    const href = link.getAttribute('href')
    if (!href || href.charAt(0) !== '#') return
    const url = new URL(href, window.location.href).href
    let done = false

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url)
        done = true
      }
    } catch (_) {}

    if (!done) {
      try {
        const area = document.createElement('textarea')
        area.value = url
        area.setAttribute('readonly', '')
        area.style.cssText = 'position:fixed;top:-1000px;opacity:0'
        document.body.appendChild(area)
        area.select()
        done = document.execCommand('copy')
        area.remove()
      } catch (_) {}
    }

    const config = globalConfig()
    if (done && window.btf && config && config.Snackbar !== undefined) {
      const message = config.copy && config.copy.success
      message && window.btf.snackbarShow(message)
    }
  }

  // Only references to this document may be handled as fragment navigation.
  const fragmentRef = link => {
    let url
    try {
      url = new URL(link.href, window.location.href)
    } catch (_) {
      return null
    }
    if (!url.hash || url.hash === '#') return null
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || url.search !== window.location.search) return null
    let id = url.hash.slice(1)
    try {
      id = decodeURIComponent(id)
    } catch (_) {}
    return { id, hash: url.hash, absolute: (link.getAttribute('href') || '').charAt(0) !== '#' }
  }

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = event.target
    if (!target || !target.closest) return
    const link = target.closest('a')

    if (link) {
      const ref = fragmentRef(link)
      if (!ref) return
      const el = targetOf(ref.id)
      if (!el) return
      // Reveal before the default action so a target inside a closed <details>,
      // hide-block or inactive tab has a box when the fragment is resolved.
      reveal(el)
      if (link.classList.contains('headerlink')) copyPermalink(link)

      if (ref.absolute) {
        // fix-link-target gives in-article links target=_blank, so a pasted
        // absolute deep link would open a tab instead of moving. Keep it here.
        event.preventDefault()
        window.location.hash = ref.hash
        return
      }
      // Hash-only links keep native navigation (and main.js's TOC handler).
      // Re-clicking a permalink already in the URL fires no hashchange, so the
      // browser would not scroll by itself.
      if (currentHash() === ref.id) jump(ref.id)
      return
    }

    // Opt-in: treat a click anywhere on the heading as a click on its permalink.
    if (!anchorConfig().clickToScroll) return
    const heading = target.closest('#article-container :is(h1,h2,h3,h4,h5,h6)')
    if (!heading || !heading.id) return
    if (window.getSelection && window.getSelection().toString()) return
    const permalink = heading.querySelector('a.headerlink')
    copyPermalink(permalink || { getAttribute: () => `#${encodeURIComponent(heading.id)}` })
    if (currentHash() === heading.id) jump(heading.id)
    else window.location.hash = `#${encodeURIComponent(heading.id)}`
  }, true)

  window.addEventListener('hashchange', () => jump(currentHash()))
  window.addEventListener('resize', syncOffset, { passive: true })
  document.addEventListener('pjax:send', cancelSettle)

  // Deferred: other pjax:complete listeners rebuild the article widgets, so the
  // reveal must run after they attached their click handlers.
  const onReady = () => {
    syncOffset()
    if (window.location.hash) jump(currentHash(), true)
  }

  document.addEventListener('pjax:complete', () => setTimeout(onReady, 0))

  if (document.readyState === 'loading') {
    // Registered after main.js's own DOMContentLoaded handler (its script tag
    // comes first), so tab/hide/collapse handlers already exist when we click.
    document.addEventListener('DOMContentLoaded', () => setTimeout(onReady, 0))
  } else {
    setTimeout(onReady, 0)
  }
})()
