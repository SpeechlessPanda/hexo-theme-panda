'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  classifyPosts,
  validateSeriesIndexes,
  buildListingItems,
  paginateListing,
  seriesPagePath,
  rewireNeighbors,
  resolveNewPostPath,
  seriesIndexMarkdown,
  rewriteNewPostContent
} = require('../scripts/panda/lib/blog-series')

function post (source, extra = {}) {
  return {
    source,
    title: extra.title ?? source,
    date: extra.date ?? new Date('2026-01-01'),
    raw: extra.raw,
    cover: extra.cover,
    description: extra.description,
    sticky: extra.sticky,
    published: extra.published !== false,
    path: extra.path
  }
}

function seriesIndex (folder, extra = {}) {
  const title = extra.title ?? folder
  const hasTitle = extra.omitTitle ? '' : `title: ${title}\n`
  const hasDesc = extra.omitDescription ? '' : `description: ${extra.description ?? ''}\n`
  return post(`_posts/${folder}/index.md`, {
    title,
    raw: `---\n${hasTitle}${hasDesc}cover:\n---\n`,
    description: extra.description ?? '',
    cover: extra.cover,
    date: extra.date ?? new Date('2000-01-01')
  })
}

describe('classifyPosts', () => {
  it('keeps flat posts independent and groups members under a folder index', () => {
    const hello = post('_posts/hello.md', { title: 'hello', date: new Date('2026-09-01') })
    const index = seriesIndex('大学道路入门', { title: '大学道路入门' })
    const ch1 = post('_posts/大学道路入门/一.md', { title: '一', date: new Date('2026-09-10') })
    const nested = post('_posts/大学道路入门/notes/x.md', { title: 'nested' })
    const orphan = post('_posts/orphan/ch.md', { title: 'orphan' })

    const { independents, series } = classifyPosts([hello, index, ch1, nested, orphan])

    assert.deepEqual(independents.map(p => p.title).sort(), ['hello', 'nested', 'orphan'])
    assert.equal(series.size, 1)
    const s = series.get('大学道路入门')
    assert.equal(s.index.title, '大学道路入门')
    assert.deepEqual(s.members.map(p => p.title), ['一'])
  })

  it('does not treat _posts/index.md as a series', () => {
    const rootIndex = post('_posts/index.md', { title: 'root' })
    const { independents, series } = classifyPosts([rootIndex])
    assert.equal(series.size, 0)
    assert.equal(independents[0].title, 'root')
  })
})

describe('validateSeriesIndexes', () => {
  it('throws when title or description keys are missing', () => {
    const missingTitle = seriesIndex('s', { omitTitle: true })
    missingTitle.raw = '---\ndescription:\n---\n'
    assert.throws(
      () => validateSeriesIndexes([missingTitle]),
      /s\/index\.md[\s\S]*title/
    )

    const missingDesc = seriesIndex('s')
    missingDesc.raw = '---\ntitle: s\n---\n'
    assert.throws(
      () => validateSeriesIndexes([missingDesc]),
      /description/
    )
  })

  it('allows an empty description value', () => {
    const ok = seriesIndex('s', { description: '' })
    assert.doesNotThrow(() => validateSeriesIndexes([ok]))
  })

  it('throws when title is empty', () => {
    const empty = seriesIndex('s', { title: '' })
    empty.raw = '---\ntitle:\ndescription:\n---\n'
    empty.title = ''
    assert.throws(() => validateSeriesIndexes([empty]), /title/)
  })
})

describe('buildListingItems', () => {
  it('hides members, skips empty series, and sorts by latest member date', () => {
    const oldPost = post('_posts/old.md', { title: 'old', date: new Date('2026-01-01') })
    const newPost = post('_posts/new.md', { title: 'new', date: new Date('2026-09-15') })
    const emptyIdx = seriesIndex('empty')
    const seriesIdx = seriesIndex('大学道路入门', { title: '大学道路入门', description: '入门' })
    const chOld = post('_posts/大学道路入门/一.md', { title: '一', date: new Date('2026-02-01') })
    const chNew = post('_posts/大学道路入门/二.md', { title: '二', date: new Date('2026-09-10') })

    const classified = classifyPosts([oldPost, newPost, emptyIdx, seriesIdx, chOld, chNew])
    const items = buildListingItems(classified, { pathPrefix: '/series/' })

    assert.deepEqual(items.map(i => i.title), ['new', '大学道路入门', 'old'])
    const card = items[1]
    assert.equal(card.blog_series_card, true)
    assert.equal(card.member_count, 2)
    assert.equal(card.description, '入门')
    assert.equal(card.path, 'series/大学道路入门/index.html')
    assert.equal(card.cover, false)
  })

  it('keeps independent sticky posts above series cards', () => {
    const sticky = post('_posts/pin.md', {
      title: 'pin',
      date: new Date('2020-01-01'),
      sticky: 1
    })
    const idx = seriesIndex('s', { title: 's' })
    const ch = post('_posts/s/a.md', { title: 'a', date: new Date('2026-09-01') })
    const items = buildListingItems(classifyPosts([sticky, idx, ch]), { pathPrefix: '/series/' })
    assert.equal(items[0].title, 'pin')
    assert.equal(items[1].title, 's')
  })

  it('keeps an image cover and treats blank cover as no-cover', () => {
    const withImg = seriesIndex('img', { title: 'img', cover: '/img/cover.png' })
    const chImg = post('_posts/img/a.md', { title: 'a', date: new Date('2026-09-01') })
    const blank = seriesIndex('blank', { title: 'blank', cover: '' })
    const chBlank = post('_posts/blank/a.md', { title: 'a', date: new Date('2026-09-02') })
    const items = buildListingItems(classifyPosts([withImg, chImg, blank, chBlank]), { pathPrefix: '/series/' })
    const imgCard = items.find(i => i.title === 'img')
    const blankCard = items.find(i => i.title === 'blank')
    assert.equal(imgCard.cover, '/img/cover.png')
    assert.equal(imgCard.cover_type, 'img')
    assert.equal(blankCard.cover, false)
  })
})

describe('paginateListing', () => {
  it('counts a series card as one row and exposes posts.data', () => {
    const items = [
      { title: 'a' },
      { title: 's', blog_series_card: true },
      { title: 'b' }
    ]
    const pages = paginateListing(items, {
      base: '/blog',
      perPage: 2,
      layout: ['index', 'archive']
    })
    assert.equal(pages.length, 2)
    assert.equal(pages[0].data.posts.data.length, 2)
    assert.equal(pages[0].data.posts.data[1].title, 's')
    assert.equal(pages[0].data.current, 1)
    assert.equal(pages[0].data.total, 2)
    assert.equal(pages[1].data.posts.data[0].title, 'b')
    assert.match(pages[1].path, /page\/2/)
  })
})

describe('seriesPagePath', () => {
  it('builds a date-less series URL from the folder name', () => {
    assert.equal(seriesPagePath('大学道路入门', '/series/'), 'series/大学道路入门/index.html')
    assert.equal(seriesPagePath('foo', 'series'), 'series/foo/index.html')
  })
})

describe('rewireNeighbors', () => {
  it('chains members only inside the series and independents only with each other', () => {
    const a = post('_posts/a.md', { title: 'a', date: new Date('2026-01-01') })
    const b = post('_posts/b.md', { title: 'b', date: new Date('2026-03-01') })
    const idx = seriesIndex('s', { title: 's' })
    const m1 = post('_posts/s/m1.md', { title: 'm1', date: new Date('2026-02-01') })
    const m2 = post('_posts/s/m2.md', { title: 'm2', date: new Date('2026-04-01') })
    const classified = classifyPosts([a, b, idx, m1, m2])
    rewireNeighbors(classified)

    assert.equal(a.next.title, 'b')
    assert.equal(b.prev.title, 'a')
    assert.equal(a.prev, undefined)
    assert.equal(b.next, undefined)
    assert.equal(m1.next.title, 'm2')
    assert.equal(m2.prev.title, 'm1')
    assert.equal(m1.prev, undefined)
    assert.equal(m2.next, undefined)
  })
})

describe('resolveNewPostPath', () => {
  it('puts hexo new series under _posts/<title>/index.md without slugizing', () => {
    const r = resolveNewPostPath({ layout: 'series', title: '大学道路入门' })
    assert.equal(r.path, '大学道路入门/index.md')
    assert.equal(r.kind, 'series-index')
    assert.equal(r.folder, '大学道路入门')
  })

  it('puts --series posts under the folder using the title as filename', () => {
    const r = resolveNewPostPath({ layout: 'post', title: '(一)', series: '大学道路入门' })
    assert.equal(r.path, '大学道路入门/(一).md')
    assert.equal(r.kind, 'series-member')
    assert.equal(r.createIndexIfMissing, true)
  })

  it('rejects path segments that would escape the folder', () => {
    assert.throws(() => resolveNewPostPath({ layout: 'series', title: '../x' }), /illegal|非法|\.\./)
    assert.throws(() => resolveNewPostPath({ layout: 'post', title: 'a', series: 'foo/bar' }), /illegal|非法|\//)
  })

  it('leaves ordinary new posts alone', () => {
    assert.equal(resolveNewPostPath({ layout: 'post', title: 'hello' }), null)
  })
})

describe('seriesIndexMarkdown', () => {
  it('writes title plus empty description and cover keys', () => {
    const md = seriesIndexMarkdown('大学道路入门')
    assert.match(md, /^---\n/)
    assert.match(md, /title: 大学道路入门/)
    assert.match(md, /description:/)
    assert.match(md, /cover:/)
    assert.doesNotMatch(md, /^date:/m)
  })
})

describe('rewriteNewPostContent', () => {
  it('replaces a dated series scaffold with title and description keys', () => {
    const out = rewriteNewPostContent(
      '_posts/大学道路入门/index.md',
      '---\nlayout: series\ntitle: leftover\ndate: 2026-01-01 00:00:00\n---\n'
    )
    assert.match(out, /title: 大学道路入门/)
    assert.match(out, /description:/)
    assert.doesNotMatch(out, /^date:/m)
    assert.doesNotMatch(out, /^layout:/m)
  })

  it('strips series: from a member post and leaves the rest', () => {
    const out = rewriteNewPostContent(
      '_posts/大学道路入门/第三章.md',
      '---\ntitle: 第三章\nseries: 大学道路入门\ndate: 2026-01-01 00:00:00\n---\n'
    )
    assert.doesNotMatch(out, /^series:/m)
    assert.match(out, /^title: 第三章/m)
    assert.match(out, /^date:/m)
  })
})
