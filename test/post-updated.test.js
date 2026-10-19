'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { explicitUpdated, contentStamp, ensurePostDefaults } = require('../scripts/panda/lib/post-updated')

const post = raw => ({ raw })

// 重要：t.test() 返回 Promise。若父测试函数不是 async 且不 await 其子测试，
// 函数体会同步返回并被判定"已完成"，尚未排空的子测试会被标记为
// 'test did not finish before its parent and was cancelled' —— 表现为
// 首个子测试通过、其后全部 cancelled，且被测代码其实没有任何问题。
// 因此凡是含 t.test() 的父测试，都必须是 async 并 await 每个子测试。
test('explicitUpdated', async t => {
  await t.test('no front-matter or no updated key -> false (mtime must not leak)', () => {
    assert.equal(explicitUpdated(post('no front matter here')), false)
    assert.equal(explicitUpdated(post('---\ntitle: A\ndate: 2026-08-01 12:00:00\n---\nbody')), false)
  })

  await t.test('real date value -> true', () => {
    assert.equal(explicitUpdated(post('---\ntitle: A\ndate: 2026-08-01 12:00:00\nupdated: 2026-08-20 12:00:00\n---\nbody')), true)
  })

  await t.test('scaffold defaults mean "never revised" -> false', () => {
    for (const v of ['false', 'null', '~', '']) {
      assert.equal(explicitUpdated(post(`---\ntitle: A\ndate: 2026-08-01 12:00:00\nupdated: ${v}\n---\nbody`)), false, `updated: ${v}`)
    }
  })

  await t.test('false with inline comment -> false; date with inline comment -> true', () => {
    assert.equal(explicitUpdated(post('---\ndate: 2026-08-01 12:00:00\nupdated: false # not revised\n---\n')), false)
    assert.equal(explicitUpdated(post('---\ndate: 2026-08-01 12:00:00\nupdated: 2026-08-20 12:00:00 # revised\n---\n')), true)
  })

  await t.test('CRLF front-matter is handled', () => {
    assert.equal(explicitUpdated(post('---\r\ntitle: A\r\ndate: 2026-08-01 12:00:00\r\nupdated: 2026-08-20 12:00:00\r\n---\r\nbody')), true)
  })

  // 回归：YAML 允许引号包裹标量，引号内的 false/null/~ 同样是"从未修订"。
  // 若不剥引号，会被误判为真实修订日期 → 向订阅者重复推送旧文更新通知。
  await t.test('quoted falsey spellings are not a real revision', () => {
    for (const v of ['"false"', "'null'", '"~"', '""', '"  "', "'false' # c"]) {
      assert.equal(
        explicitUpdated(post(`---\ndate: 2026-08-01 12:00:00\nupdated: ${v}\n---\nbody`)),
        false,
        `updated: ${v}`
      )
    }
  })

  await t.test('quoted real date still counts', () => {
    assert.equal(explicitUpdated(post('---\ndate: 2026-08-01\nupdated: "2026-08-20 12:00:00"\n---\n')), true)
  })
})

test('contentStamp', async t => {
  await t.test('same bytes -> same stamp; any edit -> different stamp', () => {
    const a = '---\ntitle: A\ndate: 2026-08-01 12:00:00\n---\nbody v1'
    assert.equal(contentStamp(post(a)), contentStamp(post(a)))
    assert.match(contentStamp(post(a)), /^[0-9a-f]{10}$/)
    assert.notEqual(contentStamp(post(a)), contentStamp(post(a.replace('v1', 'v2'))))
    // bumping only the front-matter updated line also re-identifies
    const b = '---\ntitle: A\ndate: 2026-08-01 12:00:00\nupdated: 2026-08-20 12:00:00\n---\nbody v1'
    assert.notEqual(contentStamp(post(b)), contentStamp(post(b.replace('08-20', '08-21'))))
  })
})

test('ensurePostDefaults', async t => {
  await t.test('inserts updated: false and sticky: false right after the date line', () => {
    const out = ensurePostDefaults('---\ntitle: A\ndate: 2026-09-28 21:00:00\ntags:\n---\nbody')
    assert.equal(out, '---\ntitle: A\ndate: 2026-09-28 21:00:00\nupdated: false\nsticky: false\ntags:\n---\nbody')
  })

  await t.test('adds only the missing key (existing keys stay put)', () => {
    assert.equal(
      ensurePostDefaults('---\ndate: 2026-09-28 21:00:00\nsticky: true\n---\n'),
      '---\ndate: 2026-09-28 21:00:00\nupdated: false\nsticky: true\n---\n')
    assert.equal(
      ensurePostDefaults('---\ndate: 2026-09-28 21:00:00\nupdated: 2026-09-29 10:00:00\n---\n'),
      '---\ndate: 2026-09-28 21:00:00\nsticky: false\nupdated: 2026-09-29 10:00:00\n---\n')
  })

  await t.test('both present -> no change', () => {
    assert.equal(ensurePostDefaults('---\ndate: 2026-09-28 21:00:00\nupdated: false\nsticky: false\n---\n'), null)
  })

  await t.test('no date (series index) or no front-matter -> no change', () => {
    assert.equal(ensurePostDefaults('---\ntitle: S\ndescription:\n---\n'), null)
    assert.equal(ensurePostDefaults('plain markdown'), null)
  })

  // 回归：YAML 允许 `key : value`（冒号前有空格）。旧检测要求冒号紧贴键名，
  // 于是会在已有的 `sticky : true` 旁边再插一个 `sticky: false`，
  // 形成重复键；YAML 解析重复键时后者覆盖前者，作者写的值被静默丢弃。
  await t.test('existing keys with space before colon are recognised', () => {
    // 只有 sticky : true → 缺 updated，应补 updated，但绝不能再补一个 sticky
    assert.equal(
      ensurePostDefaults('---\ndate: 2026-09-28 21:00:00\nsticky : true\n---\n'),
      '---\ndate: 2026-09-28 21:00:00\nupdated: false\nsticky : true\n---\n'
    )
    // 只有 updated : xxx → 缺 sticky，应补 sticky，且不重复 updated
    assert.equal(
      ensurePostDefaults('---\ndate: 2026-09-28 21:00:00\nupdated : 2026-09-29 10:00:00\n---\n'),
      '---\ndate: 2026-09-28 21:00:00\nsticky: false\nupdated : 2026-09-29 10:00:00\n---\n'
    )
    // 两个键都用带空格写法 → 都已存在，无需任何改动
    assert.equal(
      ensurePostDefaults('---\ndate: 2026-09-28 21:00:00\nupdated : 2026-09-29 10:00:00\nsticky : true\n---\n'),
      null
    )
    // 无空格写法同样识别
    assert.equal(
      ensurePostDefaults('---\ndate: 2026-09-28 21:00:00\nsticky:true\nupdated:true\n---\n'),
      null
    )
  })
})
