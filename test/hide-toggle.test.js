'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const registered = {}

function mockHexo ({ language = 'en', translate, throwI18n = false } = {}) {
  registered.hideInline = undefined
  registered.hideBlock = undefined
  registered.hideToggle = undefined
  global.hexo = {
    config: { language },
    theme: {
      i18n: {
        __ (code) {
          if (throwI18n) throw new Error('no i18n')
          return key => {
            if (translate) return translate(code, key)
            return key
          }
        }
      }
    },
    render: {
      renderSync ({ text }) {
        return `<p>${String(text).trim()}</p>\n`
      }
    },
    extend: {
      tag: {
        register (name, fn) {
          registered[name] = fn
        }
      }
    }
  }
  const id = require.resolve('../scripts/tag/hide.js')
  delete require.cache[id]
  require(id)
}

describe('hideToggle', () => {
  it('emits a bottom collapse button with the i18n label', () => {
    mockHexo({
      language: 'zh-CN',
      translate (code, key) {
        assert.equal(code, 'zh-CN')
        if (key === 'tag.hide_toggle_collapse') return '收起'
        return key
      }
    })
    const html = registered.hideToggle(['分类A'], 'hello **x**')
    assert.match(html, /<details class="toggle"\s*>/)
    assert.match(html, /<summary class="toggle-button"[^>]*>分类A<\/summary>/)
    assert.match(html, /<div class="toggle-content"><p>hello \*\*x\*\*<\/p>/)
    assert.match(html, /<button type="button" class="toggle-collapse">收起<\/button><\/details>/)
  })

  it('falls back to Collapse when i18n returns the key', () => {
    mockHexo({ language: 'en' })
    const html = registered.hideToggle(['Title'], 'body')
    assert.match(html, /class="toggle-collapse">Collapse<\/button>/)
  })

  it('falls back to Collapse when i18n throws', () => {
    mockHexo({ throwI18n: true })
    const html = registered.hideToggle(['Title'], 'body')
    assert.match(html, /class="toggle-collapse">Collapse<\/button>/)
  })

  it('uses the first language when config.language is an array', () => {
    mockHexo({
      language: ['zh-TW', 'en'],
      translate (code, key) {
        assert.equal(code, 'zh-TW')
        if (key === 'tag.hide_toggle_collapse') return '收合'
        return key
      }
    })
    const html = registered.hideToggle(['T'], 'b')
    assert.match(html, />收合<\/button>/)
  })

  it('does not add a collapse bar to hideInline or hideBlock', () => {
    mockHexo()
    const inline = registered.hideInline(['secret, Click'])
    assert.match(inline, /class="hide-inline"/)
    assert.match(inline, /class="hide-content">secret<\/span>/)
    assert.doesNotMatch(inline, /toggle-collapse/)
    const block = registered.hideBlock(['More'], 'inner')
    assert.match(block, /class="hide-block"/)
    assert.doesNotMatch(block, /toggle-collapse/)
  })
})
