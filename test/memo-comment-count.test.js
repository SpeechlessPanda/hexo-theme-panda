'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')


const { discussionActivity, indexDiscussionActivity, GISCUS_QUERY } = require('../scripts/panda/memo-comment-count')

describe('discussionActivity', () => {
  it('counts a written comment with no emoji', () => {
    assert.equal(discussionActivity({ comments: { totalCount: 1 }, reactions: { totalCount: 0 } }), 1)
  })

  it('counts an emoji-only discussion as activity', () => {
    assert.equal(discussionActivity({ comments: { totalCount: 0 }, reactions: { totalCount: 1 } }), 1)
  })

  it('adds written comments and discussion emoji', () => {
    assert.equal(discussionActivity({ comments: { totalCount: 2 }, reactions: { totalCount: 3 } }), 5)
  })

  it('stays zero when a discussion has neither', () => {
    assert.equal(discussionActivity({ comments: { totalCount: 0 }, reactions: { totalCount: 0 } }), 0)
  })

  it('treats missing count fields as zero', () => {
    assert.equal(discussionActivity({}), 0)
    assert.equal(discussionActivity(null), 0)
    assert.equal(discussionActivity({ comments: {}, reactions: null }), 0)
  })
})

describe('indexDiscussionActivity', () => {
  it('indexes the three live shapes under their discussion titles', () => {
    const counts = indexDiscussionActivity([
      { title: '/memos?key=text', comments: { totalCount: 1 }, reactions: { totalCount: 0 } },
      { title: '/memos?key=emoji', comments: { totalCount: 0 }, reactions: { totalCount: 1 } },
      { title: '/memos?key=empty', comments: { totalCount: 0 }, reactions: { totalCount: 0 } }
    ], {})
    assert.deepEqual(counts, {
      '/memos?key=text': 1,
      '/memos?key=emoji': 1,
      '/memos?key=empty': 0
    })
  })

  it('keeps an earlier count when a later node has no title', () => {
    const counts = indexDiscussionActivity([
      { title: '/memos?key=emoji', comments: { totalCount: 0 }, reactions: { totalCount: 1 } },
      { comments: { totalCount: 9 }, reactions: { totalCount: 9 } }
    ], {})
    assert.deepEqual(counts, { '/memos?key=emoji': 1 })
  })
})

describe('GISCUS_QUERY', () => {
  it('requests both comment and discussion reaction totals', () => {
    assert.equal(GISCUS_QUERY.includes('comments{totalCount}'), true)
    assert.equal(GISCUS_QUERY.includes('reactions{totalCount}'), true)
  })
})

