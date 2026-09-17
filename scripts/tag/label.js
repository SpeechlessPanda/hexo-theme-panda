// Modified from hexo-theme-butterfly 5.7.0 (Apache-2.0) by SpeechlessPanda, 2026: rebranded to Panda
'use strict'

const addLabel = args => {
  const [text, className = 'default'] = args
  return `<mark class="hl-label ${className}">${text}</mark>`
}

hexo.extend.tag.register('label', addLabel, { ends: false })
