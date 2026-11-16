'use strict'

// Regression: `head/config.pug` declares `const GLOBAL_CONFIG = {...}` in an
// inline classic script. That is a script-scope lexical binding, so it is
// visible to later scripts but is NOT a property of `window`. Reading
// `window.GLOBAL_CONFIG` therefore silently yields undefined, which made
// `anchor.copy_link: false` and `anchor.click_to_scroll: true` no-ops.
//
// These cases run the real source/js/anchor.js in a fresh realm with a minimal
// DOM, so a regression shows up as a wrong observable outcome, not as a text
// match on the file.

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const source = fs.readFileSync(path.join(__dirname, '..', 'source', 'js', 'anchor.js'), 'utf8')

// Minimal DOM surface: anchor.js only needs element lookup, a few listeners,
// classList and getBoundingClientRect on what it touches.
function makeElement (tag, id) {
  const classes = new Set()
  const element = {
    tagName: tag,
    id,
    parentElement: null,
    children: [],
    firstElementChild: null,
    classList: {
      add: name => classes.add(name),
      contains: name => classes.has(name)
    },
    listeners: {},
    addEventListener (type, fn) { (element.listeners[type] ||= []).push(fn) },
    removeEventListener () {},
    setAttribute () {},
    querySelector: () => null,
    closest: () => null,
    getBoundingClientRect: () => ({ top: 0, height: 60 }),
    scrollIntoView: () => {},
    isConnected: true,
    style: {},
    click () { (element.listeners.click || []).forEach(fn => fn({ target: element, defaultPrevented: false, button: 0 })) }
  }
  return element
}

// Build a realm where a `const GLOBAL_CONFIG` script ran before anchor.js, the
// same order the theme emits (head/config.pug, then the deferred body script).
function run (anchorConfig, { exposeOnWindow = false } = {}) {
  const copied = []
  const nav = makeElement('nav', 'nav')
  const heading = makeElement('h2', 'h-1')
  const permalink = makeElement('a', '')
  permalink.getAttribute = name => (name === 'href' ? '#h-1' : null)
  const clicked = []

  const document = {
    readyState: 'complete',
    documentElement: { style: { setProperty: () => {} } },
    body: makeElement('body', 'body'),
    getElementById: id => (id === 'nav' ? nav : id === 'h-1' ? heading : null),
    getElementsByName: () => [],
    querySelectorAll: () => [],
    listeners: {},
    addEventListener (type, fn) { (document.listeners[type] ||= []).push(fn) },
    createElement: () => makeElement('textarea', '')
  }

  const window = {
    location: { hash: '', href: 'https://example.test/p/', pathname: '/p/', search: '' },
    isSecureContext: true,
    scrollY: 0,
    btf: { snackbarShow: () => {} },
    listeners: {},
    addEventListener (type, fn) { (window.listeners[type] ||= []).push(fn) },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({ scrollMarginTop: '70px' }),
    getSelection: () => ({ toString: () => '' }),
    scrollTo: () => {}
  }

  const context = vm.createContext({ window, document, navigator: { clipboard: { writeText: async text => copied.push(text) } }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout, URL, console })
  // Class assignments at the top of anchor.js write to the realm's globalThis.
  context.globalThis = context
  context.window = window
  context.document = document
  window.GLOBAL_CONFIG = exposeOnWindow ? { anchor: anchorConfig } : undefined

  if (exposeOnWindow) {
    vm.runInContext('var GLOBAL_CONFIG = ' + JSON.stringify({ anchor: anchorConfig }), context)
  } else {
    // Exactly what head/config.pug produces: a lexical const, no window property.
    vm.runInContext('const GLOBAL_CONFIG = ' + JSON.stringify({ anchor: anchorConfig }), context)
  }
  assert.equal(vm.runInContext('"GLOBAL_CONFIG" in globalThis', context), exposeOnWindow,
    'fixture must reproduce the lexical (non-window) binding')

  vm.runInContext(source, context)

  // Clicking a heading exercises the opt-in `click_to_scroll` path, which reads
  // anchor.anchorConfig() before doing anything else.
  heading.classList.add('article-heading')
  const handler = document.listeners.click[0]
  handler({
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: {
      closest: selector => (selector.startsWith('#article-container') ? heading : null)
    }
  })
  return { copied, clicked }
}

describe('anchor.js reads the theme config', () => {
  it('honours click_to_scroll from the lexical GLOBAL_CONFIG binding', () => {
    // Before the fix `window.GLOBAL_CONFIG` was undefined, so this path bailed
    // out and the permalink was never copied.
    const { copied } = run({ copyLink: true, clickToScroll: true })
    assert.deepEqual(copied, ['https://example.test/p/#h-1'])
  })

  it('stays inert when click_to_scroll is off', () => {
    const { copied } = run({ copyLink: true, clickToScroll: false })
    assert.deepEqual(copied, [])
  })

  it('respects copy_link: false', () => {
    const { copied } = run({ copyLink: false, clickToScroll: true })
    assert.deepEqual(copied, [])
  })
})
