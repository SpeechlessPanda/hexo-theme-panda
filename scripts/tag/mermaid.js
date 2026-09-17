// Modified from hexo-theme-butterfly 5.7.0 (Apache-2.0) by SpeechlessPanda, 2026: rebranded to Panda
'use strict'

const { escapeHTML } = require('hexo-util')

const mermaid = (args, content) => {
  const config = args[0] || '{}'
  return `<div class="mermaid-wrap"><pre class="mermaid-src" data-config="${escapeHTML(config)}" hidden>
    ${escapeHTML(content)}
  </pre></div>`
}

hexo.extend.tag.register('mermaid', mermaid, { ends: true })
