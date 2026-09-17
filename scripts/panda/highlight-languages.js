// scripts/register-highlight-languages.js
// highlight.js 11 没有 fish / typst。hexo-util 遇到未知语言会把 lang 改成
// plaintext，Butterfly 再取 figure.highlight 的第二 class 并 uppercase，
// 代码块标题就显示 PLAINTEXT。
//
// Hexo 用 vm 加载 scripts/，并且把 require.resolve 包成只吃一个参数，
// 不能用 { paths }。pnpm 下 scripts/ 也 require 不到 hexo-util /
// highlight.js。用 createRequire 沿 hexo → hexo-util 拿到同一份 hljs。
'use strict'

const { createRequire } = require('module')

const EXTRA_LANGS = ['fish', 'typst']

function fishLang (hljsApi) {
  return {
    name: 'Fish',
    aliases: ['fishshell'],
    keywords: {
      keyword:
        'and begin break builtin case command continue else end exec exit for '
        + 'function if in not or return set status switch test time until while '
        + 'argparse complete source emit wait true false',
      built_in:
        'echo cd pwd ls string math count printf read set_color funcsave '
        + 'functions history jobs popd pushd type abbr alias bind disown eval '
        + 'fg bg kill ulimit'
    },
    contains: [
      hljsApi.QUOTE_STRING_MODE,
      hljsApi.APOS_STRING_MODE,
      hljsApi.HASH_COMMENT_MODE,
      {
        className: 'variable',
        variants: [
          { begin: /\$[\w-]+/ },
          { begin: /\$\{[\w-]+\}/ }
        ]
      },
      hljsApi.NUMBER_MODE
    ]
  }
}

function typstLang (hljsApi) {
  return {
    name: 'Typst',
    aliases: ['typ'],
    contains: [
      hljsApi.C_LINE_COMMENT_MODE,
      hljsApi.C_BLOCK_COMMENT_MODE,
      hljsApi.QUOTE_STRING_MODE,
      {
        className: 'number',
        begin: '\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?(?:pt|mm|cm|in|em|deg|rad|fr|%)?\\b'
      },
      {
        className: 'section',
        begin: '^={1,6}\\s+',
        end: '$'
      },
      {
        className: 'keyword',
        begin: '#(?:let|set|show|import|include|if|else|for|while|in|as|return|context|break|continue|not|and|or)\\b'
      },
      {
        className: 'built_in',
        begin: '#[a-zA-Z_][\\w-]*'
      }
    ]
  }
}

function loadHexoUtilHljs () {
  const hexoRequire = createRequire(require.resolve('hexo/package.json'))
  const utilRequire = createRequire(hexoRequire.resolve('hexo-util/package.json'))
  return utilRequire('highlight.js')
}

function registerGrammars () {
  const hljs = loadHexoUtilHljs()
  if (!hljs.getLanguage('fish')) hljs.registerLanguage('fish', fishLang)
  if (!hljs.getLanguage('typst')) hljs.registerLanguage('typst', typstLang)
}

try {
  registerGrammars()
  hexo.log.debug('[highlight-langs] registered fish, typst on highlight.js')
} catch (err) {
  hexo.log.warn('[highlight-langs] grammar register failed: ' + err.message)
}

hexo.extend.filter.register('after_init', () => {
  const orig = hexo.extend.highlight.query('highlight.js')
  if (!orig) return
  hexo.extend.highlight.register('highlight.js', function (code, options) {
    const requested = String(options.lang || '').toLowerCase()
    const html = orig.call(this, code, options)
    if (EXTRA_LANGS.includes(requested) && html.includes('class="highlight plaintext"')) {
      return html.replace('class="highlight plaintext"', 'class="highlight ' + requested + '"')
    }
    return html
  })
})
