(() => {
  const htmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  const btfFn = {
    escapeHTML: value => String(value ?? '').replace(/[&<>"']/g, char => htmlEntities[char]),

    httpUrl: (value, base = document.baseURI) => {
      if (typeof value !== 'string' || !value.trim()) return null
      try {
        const url = new URL(value, base)
        return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
      } catch (_) {
        return null
      }
    },

    debounce: (func, wait = 0, immediate = false) => {
      let timeout
      return (...args) => {
        const later = () => {
          timeout = null
          if (!immediate) func(...args)
        }
        const callNow = immediate && !timeout
        clearTimeout(timeout)
        timeout = setTimeout(later, wait)
        if (callNow) func(...args)
      }
    },

    throttle: (func, wait, options = {}) => {
      let timeout, args
      let previous = 0

      const later = () => {
        previous = options.leading === false ? 0 : new Date().getTime()
        timeout = null
        func(...args)
        if (!timeout) args = null
      }

      return (...params) => {
        const now = new Date().getTime()
        if (!previous && options.leading === false) previous = now
        const remaining = wait - (now - previous)
        args = params

        if (remaining <= 0 || remaining > wait) {
          if (timeout) {
            clearTimeout(timeout)
            timeout = null
          }
          previous = now
          func(...args)
          if (!timeout) args = null
        } else if (!timeout && options.trailing !== false) {
          timeout = setTimeout(later, remaining)
        }
      }
    },

    rafThrottle: fn => {
      let rafId = null
      return (...args) => {
        if (rafId) return
        rafId = requestAnimationFrame(() => {
          fn(...args)
          rafId = null
        })
      }
    },

    overflowPaddingR: (() => {
      let headerElement = null
      let menuElement = null

      const getElements = () => {
        if (!headerElement) {
          headerElement = document.getElementById('page-header')
        }
        if (!menuElement) {
          menuElement = document.getElementById('menus')
        }
        return { headerElement, menuElement }
      }

      return {
        add: () => {
          const paddingRight = window.innerWidth - document.body.clientWidth

          if (paddingRight > 0) {
            document.body.style.paddingRight = `${paddingRight}px`
            document.body.style.overflow = 'hidden'
            const { headerElement: header, menuElement: menu } = getElements()
            if (header && menu && header.classList.contains('nav-fixed')) {
              menu.style.paddingRight = `${paddingRight}px`
            }
          }
        },
        remove: () => {
          document.body.style.paddingRight = ''
          document.body.style.overflow = ''
          const { headerElement: header, menuElement: menu } = getElements()
          if (header && menu && header.classList.contains('nav-fixed')) {
            menu.style.paddingRight = ''
          }
        }
      }
    })(),

    snackbarShow: (text, showAction = false, duration = 2000) => {
      const { position, bgLight, bgDark } = GLOBAL_CONFIG.Snackbar
      const bg = document.documentElement.getAttribute('data-theme') === 'light' ? bgLight : bgDark
      Snackbar.show({
        text,
        backgroundColor: bg,
        showAction,
        duration,
        pos: position,
        customClass: 'snackbar-css'
      })
    },

    diffDate: (inputDate, more = false) => {
      const dateNow = new Date()
      const datePost = new Date(inputDate)
      const diffMs = dateNow - datePost
      const diffSec = diffMs / 1000
      const diffMin = diffSec / 60
      const diffHour = diffMin / 60
      const diffDay = diffHour / 24
      const diffMonth = diffDay / 30
      const { dateSuffix } = GLOBAL_CONFIG

      if (!more) return Math.floor(diffDay)

      if (diffMonth > 12) return datePost.toISOString().slice(0, 10)
      if (diffMonth >= 1) return `${Math.floor(diffMonth)} ${dateSuffix.month}`
      if (diffDay >= 1) return `${Math.floor(diffDay)} ${dateSuffix.day}`
      if (diffHour >= 1) return `${Math.floor(diffHour)} ${dateSuffix.hour}`
      if (diffMin >= 1) return `${Math.floor(diffMin)} ${dateSuffix.min}`
      return dateSuffix.just
    },

    loadComment: (dom, callback) => {
      if ('IntersectionObserver' in window) {
        const observerItem = new IntersectionObserver(entries => {
          if (entries[0].isIntersecting) {
            callback()
            observerItem.disconnect()
          }
        }, { threshold: [0] })
        observerItem.observe(dom)
      } else {
        callback()
      }
    },

    scrollToDest: (pos, time = 500) => {
      const currentPos = window.scrollY
      const isNavFixed = document.getElementById('page-header').classList.contains('fixed')
      if (currentPos > pos || isNavFixed) pos = pos - 70

      if ('scrollBehavior' in document.documentElement.style) {
        window.scrollTo({
          top: pos,
          behavior: 'smooth'
        })
        return
      }

      const startTime = performance.now()
      const animate = currentTime => {
        const timeElapsed = currentTime - startTime
        const progress = Math.min(timeElapsed / time, 1)
        const easedProgress = 1 - Math.pow(1 - progress, 4) // easeOutQuart
        window.scrollTo(0, currentPos + (pos - currentPos) * easedProgress)
        if (progress < 1) {
          requestAnimationFrame(animate)
        }
      }
      requestAnimationFrame(animate)
    },

    animateIn: (ele, animation) => {
      ele.style.display = 'block'
      ele.style.animation = animation
    },

    animateOut: (ele, animation) => {
      const handleAnimationEnd = () => {
        ele.style.display = ''
        ele.style.animation = ''
        ele.removeEventListener('animationend', handleAnimationEnd)
      }
      ele.addEventListener('animationend', handleAnimationEnd)
      ele.style.animation = animation
    },

    wrap: (selector, eleType, options) => {
      const createEle = document.createElement(eleType)
      for (const [key, value] of Object.entries(options)) {
        createEle.setAttribute(key, value)
      }
      selector.parentNode.insertBefore(createEle, selector)
      createEle.appendChild(selector)
    },

    isHidden: ele => ele.offsetHeight === 0 && ele.offsetWidth === 0,

    getEleTop: ele => ele.getBoundingClientRect().top + window.scrollY,

    loadLightbox: ele => {
      const service = GLOBAL_CONFIG.lightbox

      if (service === 'medium_zoom') {
        // The library ships from a CDN. When the request fails (offline, blocked
        // network, registry firewall) the global is undefined and calling it threw
        // out of the page's init, leaving every post body half-rendered.
        if (typeof mediumZoom !== 'function') return
        mediumZoom(ele, { background: 'var(--zoom-bg)' })
        return
      }

      if (service === 'fancybox') {
        // Same guard: a missing Fancybox must degrade to plain <img>, not abort
        // the surrounding init (the shuoshuo page replaced itself with an error icon).
        if (typeof Fancybox === 'undefined') return
        ele.forEach(i => {
          if (i.parentNode.tagName !== 'A') {
            const dataSrc = i.dataset.lazySrc || i.src
            const dataCaption = i.title || i.alt || ''
            btf.wrap(i, 'a', { href: dataSrc, 'data-fancybox': 'gallery', 'data-caption': dataCaption, 'data-thumb': dataSrc })
          }
        })

        if (!window.fancyboxRun) {
          let options = ''
          if (Fancybox.version < '6') {
            options = {
              Hash: false,
              Thumbs: {
                showOnStart: false
              },
              Images: {
                Panzoom: {
                  maxScale: 4
                }
              },
              Carousel: {
                transition: 'slide'
              },
              Toolbar: {
                display: {
                  left: ['infobar'],
                  middle: [
                    'zoomIn',
                    'zoomOut',
                    'toggle1to1',
                    'rotateCCW',
                    'rotateCW',
                    'flipX',
                    'flipY'
                  ],
                  right: ['slideshow', 'thumbs', 'close']
                }
              },
              hideScrollbar: false
            }
          } else {
            options = {
              Hash: false,
              Carousel: {
                transition: 'slide',
                Thumbs: {
                  showOnStart: false
                },
                Toolbar: {
                  display: {
                    left: ['counter'],
                    middle: [
                      'zoomIn',
                      'zoomOut',
                      'toggle1to1',
                      'rotateCCW',
                      'rotateCW',
                      'flipX',
                      'flipY',
                      'reset'
                    ],
                    right: ['autoplay', 'thumbs', 'close']
                  }
                },
                Zoomable: {
                  Panzoom: {
                    maxScale: 4
                  }
                }
              },
              hideScrollbar: false
            }
          }

          Fancybox.bind('[data-fancybox]', options)
          window.fancyboxRun = true
        }
      }
    },

    setLoading: {
      add: ele => {
        const html = `
        <div class="loading-container">
          <div class="loading-item">
            <div></div><div></div><div></div><div></div><div></div>
          </div>
        </div>
      `
        ele.insertAdjacentHTML('afterend', html)
      },
      remove: ele => {
        ele.nextElementSibling.remove()
      }
    },

    updateAnchor: anchor => {
      if (anchor !== window.location.hash) {
        if (!anchor) anchor = location.pathname + location.search
        const title = GLOBAL_CONFIG_SITE.title
        window.history.replaceState({
          url: location.href,
          title
        }, title, anchor)
      }
    },

    getScrollPercent: (currentTop, ele) => {
      const viewport = window.innerHeight
      const pageEnd = Math.max(0, document.documentElement.scrollHeight - viewport)
      const contentTop = ele === document.body ? 0 : ele.getBoundingClientRect().top + currentTop
      const start = Math.max(0, Math.min(contentTop, pageEnd))
      const end = ele === document.body ? pageEnd : Math.min(pageEnd, contentTop + ele.clientHeight - viewport)
      if (end <= start) return currentTop > start ? 100 : 0
      return Math.max(0, Math.min(100, Math.round((currentTop - start) / (end - start) * 100)))
    },

    addEventListenerPjax: (ele, event, fn, option = false) => {
      ele.addEventListener(event, fn, option)
      btf.addGlobalFn('pjaxSendOnce', () => {
        ele.removeEventListener(event, fn, option)
      })
    },

    removeGlobalFnEvent: (key, parent = window) => {
      const globalFn = parent.globalFn || {}
      const keyObj = globalFn[key]
      if (!keyObj) return

      Object.keys(keyObj).forEach(i => keyObj[i]())

      delete globalFn[key]
    },

    switchComments: (el = document, path) => {
      const switchBtn = el.querySelector('#switch-btn')
      if (!switchBtn) return

      let switchDone = false
      const postComment = el.querySelector('#post-comment')
      const handleSwitchBtn = () => {
        postComment.classList.toggle('move')
        if (!switchDone && typeof loadOtherComment === 'function') {
          switchDone = true
          loadOtherComment(el, path)
        }
      }
      btf.addEventListenerPjax(switchBtn, 'click', handleSwitchBtn)
    }
  }

  window.btf = { ...window.btf, ...btfFn }
})()
