'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const pkgVersion = require('../package.json').version

function mockHexo ({ routes = ['index.html', 'archives/index.html'] } = {}) {
  const events = {}
  const lines = []
  global.hexo = {
    version: '8.1.2',
    route: { list: () => routes },
    log: { info: msg => lines.push(msg) },
    on (event, fn) {
      events[event] = fn
    },
    events
  }
  const id = require.resolve('../scripts/events/generate-report.js')
  delete require.cache[id]
  require(id)
  return lines
}

describe('generate report', () => {
  it('names the installed theme version, the Hexo version and the file count', () => {
    const lines = mockHexo()
    assert.equal(lines.length, 0, 'nothing is logged before generate completes')

    global.hexo.events.generateAfter()
    assert.equal(lines.length, 1)
    assert.match(lines[0], /^\[panda\] theme /)
    assert.equal(lines[0], `[panda] theme ${pkgVersion} · Hexo 8.1.2 · 2 files generated`)
  })

  it('stays truthful when the version no longer matches package.json', () => {
    const lines = mockHexo({ routes: [] })
    global.hexo.events.generateAfter()
    assert.equal(lines[0], `[panda] theme ${pkgVersion} · Hexo 8.1.2 · 0 files generated`)
    assert.notEqual(lines[0], `[panda] theme ${pkgVersion} · Hexo 8.1.2 · 1 files generated`)
  })

  it('survives a hexo instance without a router', () => {
    const lines = mockHexo()
    global.hexo.route = undefined
    assert.doesNotThrow(() => global.hexo.events.generateAfter())
    assert.equal(lines[0], `[panda] theme ${pkgVersion} · Hexo 8.1.2 · 0 files generated`)
  })
})
