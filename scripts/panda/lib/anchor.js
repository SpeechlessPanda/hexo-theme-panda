// Panda theme — heading anchors (pure module: no `hexo` at module scope).
//
// Why a filter instead of a renderer plugin: the markdown renderer assigns ids
// per render call, so two headings with the same text inside a hideToggle/tabs
// block and in the main body get the same id. Duplicate ids silently bind TOC
// links, permalinks and the scroll spy to the first element, i.e. a link can
// land in the wrong block. This module normalises every heading once, after the
// whole body HTML exists and before layouts build the TOC.
//
// Contract:
// - every h1-h6 in the given HTML ends up with a non-empty, document-unique id
// - an existing id is kept whenever possible (published deep links stay valid);
//   only duplicates are suffixed `-2`, `-3`, ... in document order
// - missing ids derive from the heading text (hexo-util slugize, CJK kept)
// - headings without a visible renderer anchor get one canonical permalink
//   `<a class="headerlink" href="#id" title="...">#</a>`
// - the renderer's empty `<a class="markdownIt-Anchor"></a>` placeholders are
//   dropped: they are 0x0, invisible, and leak a leading space into TOC text
// - a renderer anchor with a visible symbol (custom `anchorLinkSymbol`) is kept
//   so a site's own choice still wins
'use strict'

const { slugize, stripHTML, escapeHTML, unescapeHTML } = require('hexo-util')

const HEADING_RE = /<h([1-6])((?:\s+[^>]*?)?)>([\s\S]*?)<\/h\1>/gi
const ID_ATTR_RE = /\s+id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i
const ANCHOR_RE = /<a\b((?:"[^"]*"|'[^']*'|[^>])*)>([\s\S]*?)<\/a>/gi
const CLASS_ATTR_RE = /\s+class\s*=\s*(?:"([^"]*)"|'([^']*)')/i
const HREF_ATTR_RE = /\s+href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i
const MARKDOWN_IT_ANCHOR_RE = /\bmarkdownIt-Anchor\b/

function readAttr (attrs, re) {
  const m = re.exec(attrs)
  if (!m) return null
  return unescapeHTML(m[1] ?? m[2] ?? m[3] ?? '')
}

function attrValue (value) {
  return `"${escapeHTML(value)}"`
}

// Fragment spelling used in hrefs: percent-encode like Hexo's TOC helper so
// `#中文` and `#a b` survive copy/paste, but keep characters that browsers and
// servers already treat as literal in fragments.
function fragment (id) {
  return escapeHTML(encodeURI(id).replace(/#/g, '%23'))
}

function headingText (inner) {
  // Two passes: strip markup, decode entities, strip again. The order matters
  // in both directions — `C++ &amp; Rust` needs the decode to slug as `c-rust`,
  // while a renderer with `html: false` hands us `&lt;span id="x"&gt;`, whose
  // tags only appear after decoding and must not leak their attributes into
  // the slug.
  const text = stripHTML(unescapeHTML(stripHTML(inner)))
  return text.replace(/\s+/g, ' ').trim()
}

function slugOf (inner) {
  const text = headingText(inner)
  if (!text) return ''
  return slugize(text, { transform: 1 })
}

function uniqueId (base, reserved) {
  let id = base
  let n = 2
  while (reserved.has(id)) id = `${base}-${n++}`
  reserved.add(id)
  return id
}

function collectAnchors (inner) {
  const anchors = []
  ANCHOR_RE.lastIndex = 0
  let m
  while ((m = ANCHOR_RE.exec(inner))) {
    anchors.push({
      start: m.index,
      end: m.index + m[0].length,
      html: m[0],
      attrs: m[1],
      text: headingText(m[2])
    })
  }
  return anchors
}

// The renderer writes a decoded `href="#中文"`; rewrite it to our fragment
// spelling only when the id actually changed.
function rewriteHashHref (anchorHtml, id) {
  const href = readAttr(anchorHtml, HREF_ATTR_RE)
  if (!href || href[0] !== '#') return anchorHtml
  return anchorHtml.replace(HREF_ATTR_RE, () => ` href="#${fragment(id)}"`)
}

function renderHeading (heading, id, options) {
  const { attrs, inner, existingId } = heading
  const anchors = collectAnchors(inner)

  let rebuilt = ''
  let pos = 0
  let visibleAnchor = false
  let removed = false

  for (const anchor of anchors) {
    rebuilt += inner.slice(pos, anchor.start)
    pos = anchor.end
    const classes = readAttr(anchor.attrs, CLASS_ATTR_RE) || ''
    const isRenderer = MARKDOWN_IT_ANCHOR_RE.test(classes)
    if (!isRenderer) {
      // Our own permalink from an earlier pass: re-running the filter must not
      // stack a second `#`.
      if (/\bheaderlink\b/.test(classes)) visibleAnchor = true
      rebuilt += anchor.html
      continue
    }
    if (!anchor.text) {
      removed = true
      continue
    }
    visibleAnchor = true
    // Keep a renderer anchor that carries a visible symbol (a site's custom
    // `anchorLinkSymbol`), but point it at the id this pass settled on.
    rebuilt += rewriteHashHref(anchor.html, id)
  }
  rebuilt += inner.slice(pos)
  // The renderer puts the anchor first and a space after it; without this the
  // TOC entry keeps that leading space.
  if (removed) rebuilt = rebuilt.replace(/^[ \t]+|[ \t]+$/g, '')

  if (!visibleAnchor) {
    rebuilt += `<a class="headerlink" href="#${fragment(id)}" title="${escapeHTML(options.title)}">#</a>`
  }

  let newAttrs = attrs
  if (existingId == null) {
    newAttrs = `${attrs} id=${attrValue(id)}`
  } else if (existingId !== id) {
    newAttrs = attrs.replace(ID_ATTR_RE, () => ` id=${attrValue(id)}`)
  }

  return `<h${heading.level}${newAttrs}>${rebuilt}</h${heading.level}>`
}

/**
 * Normalise heading ids and permalinks in a rendered post/page body.
 * @param {string} html rendered content
 * @param {{title?: string}} [options]
 * @returns {string}
 */
function addHeadingAnchors (html, options = {}) {
  if (typeof html !== 'string' || !html) return html
  const title = options.title || ''

  const headings = []
  HEADING_RE.lastIndex = 0
  let m
  while ((m = HEADING_RE.exec(html))) {
    headings.push({
      start: m.index,
      end: m.index + m[0].length,
      level: m[1],
      attrs: m[2] || '',
      inner: m[3],
      existingId: readAttr(m[2] || '', ID_ATTR_RE)
    })
  }
  if (!headings.length) return html

  const reserved = new Set()
  const ids = new Array(headings.length)
  const pending = []

  // Pass 1 reserves every first-occurrence existing id, so generating an id for
  // an earlier unlabelled heading can never steal a published deep link.
  headings.forEach((heading, i) => {
    if (heading.existingId && !reserved.has(heading.existingId)) {
      reserved.add(heading.existingId)
      ids[i] = heading.existingId
    } else {
      pending.push(i)
    }
  })

  // Pass 2 names the rest in document order: duplicates get `-2`, missing ids
  // derive from text, and `section-N` is the deterministic last resort.
  for (const i of pending) {
    const heading = headings[i]
    const base = heading.existingId || slugOf(heading.inner) || `section-${i + 1}`
    ids[i] = uniqueId(base, reserved)
  }

  let out = ''
  let last = 0
  headings.forEach((heading, i) => {
    out += html.slice(last, heading.start)
    out += renderHeading(heading, ids[i], { title })
    last = heading.end
  })
  return out + html.slice(last)
}

module.exports = { addHeadingAnchors }
