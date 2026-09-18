'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { getPageType, isRelocatedIndex } = require('../scripts/common/pageType')

describe('isRelocatedIndex', () => {
  it('treats empty and slash as the front-page listing', () => {
    assert.equal(isRelocatedIndex(undefined), false)
    assert.equal(isRelocatedIndex(null), false)
    assert.equal(isRelocatedIndex(''), false)
    assert.equal(isRelocatedIndex('/'), false)
  })

  it('treats a non-root index_generator.path as relocated', () => {
    assert.equal(isRelocatedIndex('/blog'), true)
    assert.equal(isRelocatedIndex('blog'), true)
    assert.equal(isRelocatedIndex('/blog/'), true)
  })
})

describe('getPageType', () => {
  it('keeps layout home as home when the listing is relocated', () => {
    assert.equal(getPageType({ layout: 'home' }, false, '/blog'), 'home')
  })

  it('uses the inner-page type for a relocated index listing', () => {
    assert.equal(getPageType({ __index: true }, true, '/blog'), 'page')
  })

  it('uses home for the default index listing at /', () => {
    assert.equal(getPageType({ __index: true }, true, ''), 'home')
    assert.equal(getPageType({ __index: true }, true, '/'), 'home')
  })

  it('maps series generator pages to series', () => {
    assert.equal(getPageType({ type: 'blog_series' }, false, '/blog'), 'series')
  })

  it('maps ordinary posts when not home', () => {
    assert.equal(getPageType({}, false, '/blog'), 'post')
  })
})
