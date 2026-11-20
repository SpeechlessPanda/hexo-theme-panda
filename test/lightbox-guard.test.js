'use strict'

// Regression: the lightbox libraries ship from a CDN. When the request fails
// (offline, blocked network, corporate firewall) the globals are undefined, and
// dereferencing them threw out of the page's init. On the shuoshuo page that
// replaced the entire rendered list with a single error icon.
//
// `source/js/utils.js` is a browser IIFE that publishes onto `window.btf`; run it
// in a vm sandbox with the minimum globals it touches, then drive loadLightbox.

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'source', 'js', 'utils.js'), 'utf8')

function makeSandbox ({ lightbox, globals = {} }) {
  const wrapped = []
  const listeners = []
  const document = {
    baseURI: 'http://example.test/',
    createElement: () => ({ setAttribute () {}, appendChild () {}, style: {}, classList: { add () {}, remove () {} } }),
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: { getAttribute: () => 'light', setAttribute () {} },
    body: { appendChild () {}, classList: { add () {}, remove () {} } },
    addEventListener () {},
    removeEventListener () {}
  }
  const sandbox = {
    GLOBAL_CONFIG: { lightbox, dateSuffix: {} },
    document,
    navigator: { userAgent: 'node' },
    localStorage: { getItem: () => null, setItem () {}, removeItem () {} },
    location: { href: 'http://example.test/' },
    console,
    setTimeout,
    clearTimeout,
    ...globals
  }
  sandbox.window = sandbox
  sandbox.self = sandbox
  sandbox.globalThis = sandbox
  sandbox.addEventListener = (...a) => listeners.push(a)
  sandbox.removeEventListener = () => {}
  vm.createContext(sandbox)
  vm.runInContext(SOURCE, sandbox, { filename: 'utils.js' })
  return { sandbox, btf: sandbox.window.btf, wrapped }
}

const imgs = () => [{ parentNode: { tagName: 'P' }, dataset: {}, src: 'a.png', title: '', alt: '' }]

describe('loadLightbox with a missing CDN library', () => {
  it('publishes loadLightbox on window.btf', () => {
    const { btf } = makeSandbox({ lightbox: 'fancybox' })
    assert.equal(typeof btf.loadLightbox, 'function')
  })

  it('does not throw when Fancybox never loaded', () => {
    const { btf } = makeSandbox({ lightbox: 'fancybox' })
    // Before the guard this dereferenced `Fancybox.version` and threw.
    assert.doesNotThrow(() => btf.loadLightbox(imgs()))
  })

  it('leaves images untouched instead of wrapping them for a dead lightbox', () => {
    const { btf, wrapped } = makeSandbox({ lightbox: 'fancybox' })
    btf.loadLightbox(imgs())
    assert.equal(wrapped.length, 0, 'no <a data-fancybox> wrapper is added when Fancybox is absent')
  })

  it('does not throw when medium_zoom never loaded', () => {
    const { btf } = makeSandbox({ lightbox: 'medium_zoom' })
    assert.doesNotThrow(() => btf.loadLightbox(imgs()))
  })

  it('still calls Fancybox.bind when the library is present', () => {
    const bound = []
    const Fancybox = { version: '6.1.14', bind: (sel, opts) => bound.push({ sel, opts }) }
    // No images: the wrapper path needs a real DOM; the binding path is the guard's scope.
    const lib = makeSandbox({ lightbox: 'fancybox', globals: { Fancybox } })
    assert.doesNotThrow(() => lib.btf.loadLightbox([]))
    assert.equal(bound.length, 1, 'Fancybox.bind is called once when the library exists')
    assert.equal(bound[0].sel, '[data-fancybox]')
    assert.equal(lib.sandbox.window.fancyboxRun, true)
  })
})
