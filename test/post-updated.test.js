'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { explicitUpdated, contentStamp, ensureUpdatedField } = require('../scripts/panda/lib/post-updated')

const post = raw => ({ raw })

test('explicitUpdated', t => {
  t.test('no front-matter or no updated key -> false (mtime must not leak)', () => {
    assert.equal(explicitUpdated(post('no front matter here')), false)
    assert.equal(explicitUpdated(post('---\ntitle: A\ndate: 2026-08-01 12:00:00\n---\nbody')), false)
  })

  t.test('real date value -> true', () => {
    assert.equal(explicitUpdated(post('---\ntitle: A\ndate: 2026-08-01 12:00:00\nupdated: 2026-08-20 12:00:00\n---\nbody')), true)
  })

  t.test('scaffold defaults mean "never revised" -> false', () => {
    for (const v of ['false', 'null', '~', '']) {
      assert.equal(explicitUpdated(post(`---\ntitle: A\ndate: 2026-08-01 12:00:00\nupdated: ${v}\n---\nbody`)), false, `updated: ${v}`)
    }
  })

  t.test('false with inline comment -> false; date with inline comment -> true', () => {
    assert.equal(explicitUpdated(post('---\ndate: 2026-08-01 12:00:00\nupdated: false # not revised\n---\n')), false)
    assert.equal(explicitUpdated(post('---\ndate: 2026-08-01 12:00:00\nupdated: 2026-08-20 12:00:00 # revised\n---\n')), true)
  })

  t.test('CRLF front-matter is handled', () => {
    assert.equal(explicitUpdated(post('---\r\ntitle: A\r\ndate: 2026-08-01 12:00:00\r\nupdated: 2026-08-20 12:00:00\r\n---\r\nbody')), true)
  })
})

test('contentStamp', t => {
  t.test('same bytes -> same stamp; any edit -> different stamp', () => {
    const a = '---\ntitle: A\ndate: 2026-08-01 12:00:00\n---\nbody v1'
    assert.equal(contentStamp(post(a)), contentStamp(post(a)))
    assert.match(contentStamp(post(a)), /^[0-9a-f]{10}$/)
    assert.notEqual(contentStamp(post(a)), contentStamp(post(a.replace('v1', 'v2'))))
    // bumping only the front-matter updated line also re-identifies
    const b = '---\ntitle: A\ndate: 2026-08-01 12:00:00\nupdated: 2026-08-20 12:00:00\n---\nbody v1'
    assert.notEqual(contentStamp(post(b)), contentStamp(post(b.replace('08-20', '08-21'))))
  })
})

test('ensureUpdatedField', t => {
  t.test('inserts updated: false right after the date line', () => {
    const out = ensureUpdatedField('---\ntitle: A\ndate: 2026-09-28 21:00:00\ntags:\n---\nbody')
    assert.equal(out, '---\ntitle: A\ndate: 2026-09-28 21:00:00\nupdated: false\ntags:\n---\nbody')
  })

  t.test('already has updated key -> no change', () => {
    assert.equal(ensureUpdatedField('---\ndate: 2026-09-28 21:00:00\nupdated: false\n---\n'), null)
    assert.equal(ensureUpdatedField('---\ndate: 2026-09-28 21:00:00\nupdated: 2026-09-29 10:00:00\n---\n'), null)
  })

  t.test('no date (series index) or no front-matter -> no change', () => {
    assert.equal(ensureUpdatedField('---\ntitle: S\ndescription:\n---\n'), null)
    assert.equal(ensureUpdatedField('plain markdown'), null)
  })
})
