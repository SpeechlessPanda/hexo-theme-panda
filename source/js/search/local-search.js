// Modified from hexo-theme-butterfly 5.7.0 (Apache-2.0) by SpeechlessPanda, 2026: ranks tag hits in local search results
class LocalSearch {
  constructor ({
    path = '',
    unescape = false,
    top_n_per_article = 1
  }) {
    this.path = path
    this.unescape = unescape
    this.top_n_per_article = top_n_per_article
    this.isfetched = false
    this.datas = null
    this._unescapeDiv = unescape ? document.createElement('div') : null
    this._processedKeywords = null
  }

  _processKeywords (keywords) {
    if (this._processedKeywords) return this._processedKeywords
    this._processedKeywords = keywords.map(term => {
      let word = term
      if (this.unescape) {
        this._unescapeDiv.textContent = term
        word = this._unescapeDiv.innerHTML
      }
      return word ? { word, term, pattern: new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu') } : null
    }).filter(Boolean)
    return this._processedKeywords
  }

  getIndexByWord (words, text) {
    const index = []
    const included = new Set()
    // Search the original text so Unicode case folding cannot change offsets.
    for (const { word, term, pattern } of this._processKeywords(words)) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        index.push({ position: match.index, word })
        included.add(term)
      }
    }
    // Sort index by position of keyword
    index.sort((left, right) => {
      if (left.position !== right.position) {
        return left.position - right.position
      }
      return right.word.length - left.word.length
    })
    return [index, included]
  }

  // Merge hits into slices
  mergeIntoSlice (start, end, index, next = 0) {
    const hits = []
    const count = new Set()
    while (next < index.length) {
      const { position, word } = index[next]
      const wordEnd = position + word.length
      if (wordEnd > end) break
      count.add(word)
      hits.push({ position, length: word.length })
      do {
        next++
      } while (next < index.length && index[next].position < wordEnd)
    }
    return {
      hits,
      start,
      end,
      count: count.size,
      next
    }
  }

  // Highlight title and content
  highlightKeyword (val, slice) {
    const parts = []
    let index = slice.start
    for (const { position, length } of slice.hits) {
      parts.push(btf.escapeHTML(val.substring(index, position)))
      index = position + length
      parts.push(`<mark class="search-keyword">${btf.escapeHTML(val.substring(position, position + length))}</mark>`)
    }
    parts.push(btf.escapeHTML(val.substring(index, slice.end)))
    return parts.join('')
  }

  getResultItems (keywords) {
    const resultItems = []
    this._processedKeywords = null
    // Compute highlight param once instead of per-article
    const highlightParam = keywords.join(' ')
    this.datas.forEach(({ title, content, url, tags }) => {
      // The number of different keywords included in the article.
      const [indexOfTags, keysOfTags] = this.getIndexByWord(keywords, (tags || []).join(' '))
      const [indexOfTitle, keysOfTitle] = this.getIndexByWord(keywords, title)
      const [indexOfContent, keysOfContent] = this.getIndexByWord(keywords, content)
      const includedCount = new Set([...keysOfTags, ...keysOfTitle, ...keysOfContent]).size

      // Show search results
      const tagHit = indexOfTags.length
      const hitCount = tagHit + indexOfTitle.length + indexOfContent.length
      if (hitCount === 0) return

      const slicesOfTitle = []
      if (indexOfTitle.length !== 0) {
        slicesOfTitle.push(this.mergeIntoSlice(0, title.length, indexOfTitle))
      }

      let slicesOfContent = []
      for (let next = 0; next < indexOfContent.length;) {
        const { position, word } = indexOfContent[next]
        const start = Math.max(0, position - 20)
        const end = Math.min(content.length, position + Math.max(100, word.length))
        const slice = this.mergeIntoSlice(start, end, indexOfContent, next)
        slicesOfContent.push(slice)
        next = slice.next
      }

      // Sort slices in content by included keywords' count and hits' count
      slicesOfContent.sort((left, right) => {
        if (left.count !== right.count) {
          return right.count - left.count
        } else if (left.hits.length !== right.hits.length) {
          return right.hits.length - left.hits.length
        }
        return left.start - right.start
      })

      // Select top N slices in content
      const upperBound = parseInt(this.top_n_per_article, 10)
      if (upperBound >= 0) {
        slicesOfContent = slicesOfContent.slice(0, upperBound)
      }

      let resultItem = ''

      const target = btf.httpUrl(url, location.origin)
      if (!target) return
      target.searchParams.set('highlight', highlightParam)
      const href = btf.escapeHTML(target.href)

      if (slicesOfTitle.length !== 0) {
        resultItem += `<li class="local-search-hit-item"><a href="${href}"><span class="search-result-title">${this.highlightKeyword(title, slicesOfTitle[0])}</span>`
      } else {
        resultItem += `<li class="local-search-hit-item"><a href="${href}"><span class="search-result-title">${btf.escapeHTML(title)}</span>`
      }

      slicesOfContent.forEach(slice => {
        resultItem += `<p class="search-result">${this.highlightKeyword(content, slice)}...</p>`
      })

      resultItem += '</a></li>'
      resultItems.push({
        item: resultItem,
        id: resultItems.length,
        hitCount,
        includedCount,
        tagHit
      })
    })
    return resultItems
  }

  fetchData () {
    const isXml = !this.path.endsWith('json')
    fetch(this.path)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        return response.text()
      })
      .then(res => {
        // Get the contents from search data
        this.isfetched = true
        this.datas = isXml
          ? [...new DOMParser().parseFromString(res, 'text/xml').querySelectorAll('entry')].map(element => ({
              title: element.querySelector('title').textContent,
              content: element.querySelector('content').textContent,
              url: element.querySelector('url').textContent,
              tags: [...element.querySelectorAll('tags tag')].map(t => t.textContent)
            }))
          : JSON.parse(res)
        // Only match articles with non-empty titles
        this.datas = this.datas.filter(data => data.title).map(data => {
          data.title = data.title.trim()
          data.content = data.content ? data.content.trim().replace(/<[^>]+>/g, '') : ''
          return data
        })
        // Remove loading animation
        window.dispatchEvent(new Event('search:loaded'))
      })
      .catch(error => {
        console.error('Local search data fetch failed:', error)
        this.isfetched = true
        this.datas = []
        window.dispatchEvent(new Event('search:loaded'))
      })
  }

  // Highlight by wrapping node in mark elements with the given class name
  highlightText (node, slice, className) {
    const val = node.nodeValue
    let index = slice.start
    const children = []
    for (const { position, length } of slice.hits) {
      const text = document.createTextNode(val.substring(index, position))
      index = position + length
      const mark = document.createElement('mark')
      mark.className = className
      mark.appendChild(document.createTextNode(val.substring(position, position + length)))
      children.push(text, mark)
    }
    node.nodeValue = val.substring(index, slice.end)
    children.forEach(element => {
      node.parentNode.insertBefore(element, node)
    })
  }

  // Highlight the search words provided in the url in the text
  highlightSearchWords (body) {
    const params = new URL(location.href).searchParams.get('highlight')
    const keywords = params ? params.split(' ') : []
    if (!keywords.length || !body) return
    this._processedKeywords = null
    const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null)
    const allNodes = []
    while (walk.nextNode()) {
      if (!walk.currentNode.parentNode.closest('button, select, textarea, .mermaid, script, style')) allNodes.push(walk.currentNode)
    }
    allNodes.forEach(node => {
      const [indexOfNode] = this.getIndexByWord(keywords, node.nodeValue)
      if (!indexOfNode.length) return
      const slice = this.mergeIntoSlice(0, node.nodeValue.length, indexOfNode)
      this.highlightText(node, slice, 'search-keyword')
    })
  }
}

window.addEventListener('load', () => {
  // Search
  const { path, top_n_per_article, unescape, languages, pagination } = GLOBAL_CONFIG.localSearch
  const enablePagination = pagination && pagination.enable
  const localSearch = new LocalSearch({
    path,
    top_n_per_article,
    unescape
  })

  const $input = document.querySelector('.local-search-input input')
  const $statsItem = document.getElementById('local-search-stats')
  const $loadingStatus = document.getElementById('loading-status')
  const $searchMask = document.getElementById('search-mask')
  const $searchDialog = document.querySelector('#local-search .search-dialog')
  const $results = document.getElementById('local-search-results')
  const $pagination = document.getElementById('local-search-pagination')
  const $paginationList = document.querySelector('#local-search-pagination .ais-Pagination-list')
  const isXml = !path.endsWith('json')

  // Pagination variables (only initialize if pagination is enabled)
  let currentPage = 0
  const hitsPerPage = pagination?.hitsPerPage || 10

  let currentResultItems = []

  if (!enablePagination) {
    currentPage = undefined
    currentResultItems = undefined
  }

  // Show/hide search results area
  const toggleResultsVisibility = hasResults => {
    $pagination.style.display = (hasResults && enablePagination) ? '' : 'none'
  }

  // Render search results for current page
  const renderResults = (searchText, resultItems) => {
    // Determine items to display based on pagination mode
    const itemsToDisplay = enablePagination
      ? currentResultItems.slice(currentPage * hitsPerPage, (currentPage + 1) * hitsPerPage)
      : resultItems

    // Handle empty page in pagination mode
    if (enablePagination && itemsToDisplay.length === 0 && currentResultItems.length > 0) {
      currentPage = 0
      renderResults(searchText, resultItems)
      return
    }

    // Add numbering to items
    const numberedItems = itemsToDisplay.map((result, index) => {
      const itemNumber = enablePagination
        ? currentPage * hitsPerPage + index + 1
        : index + 1
      return result.item.replace(
        '<li class="local-search-hit-item">',
        `<li class="local-search-hit-item" value="${itemNumber}">`
      )
    })

    $results.innerHTML = `<ol class="search-result-list">${numberedItems.join('')}</ol>`

    // Update stats
    const displayCount = enablePagination ? currentResultItems.length : resultItems.length
    const stats = languages.hits_stats.replace(/\$\{hits}/, displayCount)
    $statsItem.innerHTML = `<hr><div class="search-result-stats">${stats}</div>`

    // Handle pagination
    if (enablePagination) {
      const nbPages = Math.ceil(currentResultItems.length / hitsPerPage)
      renderPagination(currentPage, nbPages, searchText)
    }

    const hasResults = resultItems.length > 0
    toggleResultsVisibility(hasResults)

    window.pjax && window.pjax.refresh($results)
  }

  // Render pagination
  const renderPagination = (page, nbPages) => {
    if (nbPages <= 1) {
      $pagination.style.display = 'none'
      $paginationList.innerHTML = ''
      return
    }

    const isFirstPage = page === 0
    const isLastPage = page === nbPages - 1

    // Responsive page display
    const isMobile = window.innerWidth < 768
    const maxVisiblePages = isMobile ? 3 : 5
    let startPage = Math.max(0, page - Math.floor(maxVisiblePages / 2))
    const endPage = Math.min(nbPages - 1, startPage + maxVisiblePages - 1)

    // Adjust starting page to maintain max visible pages
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(0, endPage - maxVisiblePages + 1)
    }

    const parts = []

    // Only add ellipsis and first page when there are many pages
    if (nbPages > maxVisiblePages && startPage > 0) {
      parts.push('<li class="ais-Pagination-item ais-Pagination-item--page"><a class="ais-Pagination-link" aria-label="Page 1" href="#" data-page="0">1</a></li>')
      if (startPage > 1) {
        parts.push('<li class="ais-Pagination-item ais-Pagination-item--ellipsis"><span class="ais-Pagination-link">...</span></li>')
      }
    }

    // Add middle page numbers
    for (let i = startPage; i <= endPage; i++) {
      if (i === page) {
        parts.push(`<li class="ais-Pagination-item ais-Pagination-item--page ais-Pagination-item--selected"><span class="ais-Pagination-link" aria-label="Page ${i + 1}">${i + 1}</span></li>`)
      } else {
        parts.push(`<li class="ais-Pagination-item ais-Pagination-item--page"><a class="ais-Pagination-link" aria-label="Page ${i + 1}" href="#" data-page="${i}">${i + 1}</a></li>`)
      }
    }

    // Only add ellipsis and last page when there are many pages
    if (nbPages > maxVisiblePages && endPage < nbPages - 1) {
      if (endPage < nbPages - 2) {
        parts.push('<li class="ais-Pagination-item ais-Pagination-item--ellipsis"><span class="ais-Pagination-link">...</span></li>')
      }
      parts.push(`<li class="ais-Pagination-item ais-Pagination-item--page"><a class="ais-Pagination-link" aria-label="Page ${nbPages}" href="#" data-page="${nbPages - 1}">${nbPages}</a></li>`)
    }

    // Build prev/next links
    const prevLink = isFirstPage
      ? '<span class="ais-Pagination-link ais-Pagination-link--disabled" aria-label="Previous Page"><i class="fas fa-angle-left"></i></span>'
      : `<a class="ais-Pagination-link" aria-label="Previous Page" href="#" data-page="${page - 1}"><i class="fas fa-angle-left"></i></a>`
    const nextLink = isLastPage
      ? '<span class="ais-Pagination-link ais-Pagination-link--disabled" aria-label="Next Page"><i class="fas fa-angle-right"></i></span>'
      : `<a class="ais-Pagination-link" aria-label="Next Page" href="#" data-page="${page + 1}"><i class="fas fa-angle-right"></i></a>`

    $paginationList.innerHTML = `<li class="ais-Pagination-item ais-Pagination-item--previousPage ${isFirstPage ? 'ais-Pagination-item--disabled' : ''}">${prevLink}</li>${parts.join('')}<li class="ais-Pagination-item ais-Pagination-item--nextPage ${isLastPage ? 'ais-Pagination-item--disabled' : ''}">${nextLink}</li>`
    $pagination.style.display = ''
  }

  // Clear search results and stats
  const clearSearchResults = () => {
    $results.textContent = ''
    $statsItem.textContent = ''
    toggleResultsVisibility(false)
    if (enablePagination) {
      currentResultItems = []
      currentPage = 0
    }
  }

  // Show no results message
  const showNoResults = searchText => {
    $results.textContent = ''
    const statsDiv = document.createElement('div')
    statsDiv.className = 'search-result-stats'
    statsDiv.textContent = languages.hits_empty.replace(/\$\{query}/, searchText)
    $statsItem.innerHTML = statsDiv.outerHTML
    toggleResultsVisibility(false)
    if (enablePagination) {
      currentResultItems = []
      currentPage = 0
    }
  }

  const inputEventFunction = () => {
    if (!localSearch.isfetched) return
    let searchText = $input.value.trim().toLowerCase()
    isXml && (searchText = searchText.replace(/</g, '&lt;').replace(/>/g, '&gt;'))

    if (searchText !== '') $loadingStatus.hidden = false

    const keywords = searchText.split(/[-\s]+/)
    let resultItems = []

    if (searchText.length > 0) {
      resultItems = localSearch.getResultItems(keywords)
    }

    if (keywords.length === 1 && keywords[0] === '') {
      clearSearchResults()
    } else if (resultItems.length === 0) {
      showNoResults(searchText)
    } else {
      // Sort results by relevance (tag hits first, then coverage, then total hits)
      resultItems.sort((left, right) => {
        if (left.tagHit !== right.tagHit) {
          return right.tagHit - left.tagHit
        } else if (left.includedCount !== right.includedCount) {
          return right.includedCount - left.includedCount
        } else if (left.hitCount !== right.hitCount) {
          return right.hitCount - left.hitCount
        }
        return right.id - left.id
      })

      if (enablePagination) {
        currentResultItems = resultItems
        currentPage = 0
      }
      renderResults(searchText, resultItems)
    }

    $loadingStatus.hidden = true
  }

  // Debounced input handler
  let searchTimeout
  const debouncedInputEvent = () => {
    clearTimeout(searchTimeout)
    // Empty input: clear results immediately without debounce delay
    if (!$input.value.trim()) {
      inputEventFunction()
      return
    }
    searchTimeout = setTimeout(inputEventFunction, 200)
  }

  let loadFlag = false

  const fixSafariHeight = () => {
    if (window.innerWidth < 768) {
      $searchDialog.style.setProperty('--search-height', window.innerHeight + 'px')
    }
  }

  // Debounced resize to avoid layout thrashing
  let resizeTimer
  const onResize = () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(fixSafariHeight, 150)
  }

  const handleEscape = event => {
    if (event.code === 'Escape') {
      closeSearch()
      document.removeEventListener('keydown', handleEscape)
    }
  }

  const openSearch = () => {
    btf.overflowPaddingR.add()
    btf.animateIn($searchMask, 'to_show 0.5s')
    btf.animateIn($searchDialog, 'titleScale 0.5s')
    setTimeout(() => { $input.focus() }, 300)
    if (!loadFlag) {
      !localSearch.isfetched && localSearch.fetchData()
      $input.addEventListener('input', debouncedInputEvent)
      loadFlag = true
    }
    // shortcut: ESC
    document.addEventListener('keydown', handleEscape)

    fixSafariHeight()
    window.addEventListener('resize', onResize)
  }

  const closeSearch = () => {
    btf.overflowPaddingR.remove()
    btf.animateOut($searchDialog, 'search_close .5s')
    btf.animateOut($searchMask, 'to_hide 0.5s')
    document.removeEventListener('keydown', handleEscape)
    window.removeEventListener('resize', onResize)
  }

  const searchClickFn = () => {
    btf.addEventListenerPjax(document.querySelector('#search-button > .search'), 'click', openSearch)
  }

  const searchFnOnce = () => {
    document.querySelector('#local-search .search-close-button').addEventListener('click', closeSearch)
    $searchMask.addEventListener('click', closeSearch)
    if (GLOBAL_CONFIG.localSearch.preload) {
      localSearch.fetchData()
    }
    localSearch.highlightSearchWords(document.getElementById('article-container'))

    // Pagination event delegation - only add if pagination is enabled
    if (enablePagination) {
      $pagination.addEventListener('click', e => {
        e.preventDefault()
        const link = e.target.closest('a[data-page]')
        if (link) {
          const page = parseInt(link.dataset.page, 10)
          if (!isNaN(page) && currentResultItems.length > 0) {
            currentPage = page
            renderResults($input.value.trim().toLowerCase(), currentResultItems)
          }
        }
      })
    }

    // Initial state
    toggleResultsVisibility(false)
  }

  window.addEventListener('search:loaded', () => {
    const $loadDataItem = document.getElementById('loading-database')
    $loadDataItem.nextElementSibling.style.visibility = 'visible'
    $loadDataItem.remove()
  })

  searchClickFn()
  searchFnOnce()

  // pjax
  window.addEventListener('pjax:complete', () => {
    !btf.isHidden($searchMask) && closeSearch()
    localSearch.highlightSearchWords(document.getElementById('article-container'))
    searchClickFn()
  })
})
