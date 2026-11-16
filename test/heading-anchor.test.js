'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { addHeadingAnchors } = require('../scripts/panda/lib/anchor')

const headings = html => html.match(/<h[1-6]\b[\s\S]*?<\/h[1-6]>/gi) || []
const ids = html => headings(html).map(h => (h.match(/\sid="([^"]*)"/) || [])[1])
const permalinks = html => headings(html).map(h => (h.match(/<a class="headerlink"[^>]*href="([^"]*)"/) || [])[1])

describe('addHeadingAnchors', () => {
  it('derives ids from text and appends a permalink to plain headings', () => {
    const out = addHeadingAnchors('<h2>Hello World</h2>', { title: 'Permalink' })
    assert.equal(out, '<h2 id="hello-world">Hello World<a class="headerlink" href="#hello-world" title="Permalink">#</a></h2>')
  })

  it('keeps CJK text in the slug and percent-encodes the href', () => {
    const out = addHeadingAnchors('<h3>中文 标题</h3>', { title: 'Permalink' })
    assert.deepEqual(ids(out), ['中文-标题'])
    assert.deepEqual(permalinks(out), ['#%E4%B8%AD%E6%96%87-%E6%A0%87%E9%A2%98'])
    // The href must resolve back to the id, or the link is a dead link.
    assert.equal(decodeURIComponent(permalinks(out)[0].slice(1)), ids(out)[0])
  })

  it('suffixes duplicate ids in document order', () => {
    const out = addHeadingAnchors('<h2>Dup</h2><h2>Dup</h2><h2>Dup</h2>', { title: 'Permalink' })
    assert.deepEqual(ids(out), ['dup', 'dup-2', 'dup-3'])
    assert.deepEqual(permalinks(out), ['#dup', '#dup-2', '#dup-3'])
  })

  // The regression this module exists for: a heading inside a hide-toggle or
  // tab and the same heading in the body. The renderer assigns ids per render
  // call, so both used to get `dup`; the second was then unreachable.
  it('never lets a generated id steal an existing one declared later', () => {
    const out = addHeadingAnchors('<h2>Plain</h2><h2 id="plain">Stable</h2>', { title: 'Permalink' })
    assert.deepEqual(ids(out), ['plain-2', 'plain'])
    assert.deepEqual(permalinks(out), ['#plain-2', '#plain'])
  })

  it('preserves an explicitly assigned id so published deep links stay valid', () => {
    const out = addHeadingAnchors('<h2 id="proj-abc">项目 A</h2>', { title: 'Permalink' })
    assert.deepEqual(ids(out), ['proj-abc'])
    assert.deepEqual(permalinks(out), ['#proj-abc'])
  })

  it('drops the renderer empty anchor and the space it leaves in the heading text', () => {
    const out = addHeadingAnchors('<h2><a class="markdownIt-Anchor" href="#x"></a> Title</h2>', { title: 'Permalink' })
    assert.ok(!out.includes('markdownIt-Anchor'))
    assert.match(out, /<h2 id="title">Title<a class="headerlink"/)
  })

  it('keeps a renderer anchor that carries a visible symbol, pointed at the final id', () => {
    const out = addHeadingAnchors('<h2><a class="markdownIt-Anchor" href="#old">§</a> Custom</h2>', { title: 'Permalink' })
    assert.match(out, /<h2 id="§-custom"><a class="markdownIt-Anchor" href="#%C2%A7-custom">§<\/a> Custom<\/h2>/)
  })

  it('labels the permalink from the title option and leaves other attributes alone', () => {
    const out = addHeadingAnchors('<h3 class="foo" data-x="1">a b</h3>', { title: '标题永久链接' })
    assert.equal(out, '<h3 class="foo" data-x="1" id="a-b">a b<a class="headerlink" href="#a-b" title="标题永久链接">#</a></h3>')
  })

  it('falls back to section-N when the heading has no usable text', () => {
    const out = addHeadingAnchors('<h2>💡</h2><h2><img src="a.png"></h2>', { title: 'Permalink' })
    assert.deepEqual(ids(out).length, 2)
    assert.deepEqual(permalinks(out), ['#%F0%9F%92%A1', '#section-2'])
  })

  it('escapes quotes in the permalink label instead of breaking the attribute', () => {
    const out = addHeadingAnchors('<h2>A</h2>', { title: 'a "b" & c' })
    assert.match(out, /title="a &quot;b&quot; &amp; c"/)
  })

  it('is idempotent for the id it assigned, so a second pass keeps the TOC links', () => {
    const once = addHeadingAnchors('<h2>中文</h2>', { title: 'Permalink' })
    assert.equal(addHeadingAnchors(once, { title: 'Permalink' }), once)
  })

  it('returns non-string or heading-free input unchanged', () => {
    assert.equal(addHeadingAnchors(undefined), undefined)
    assert.equal(addHeadingAnchors(''), '')
    const html = '<p>no headings</p>'
    assert.equal(addHeadingAnchors(html), html)
  })
})
