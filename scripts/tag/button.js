/**
 * Button
 * {% btn url text icon option %}
 * option: color outline center block larger
 * color : default/blue/pink/red/purple/orange/green
 */

'use strict'

const { url_for, escapeHTML } = require('hexo-util')
const urlFor = url_for.bind(hexo)

const btn = args => {
  const [url = '', text = '', icon = '', option = ''] = args.join(' ').split(',').map(arg => arg.trim())

  const iconHTML = icon ? `<i class="${escapeHTML(icon)}"></i>` : ''
  const textHTML = text ? `<span>${escapeHTML(text)}</span>` : ''

  return `<a class="btn-beautify ${escapeHTML(option)}" href="${urlFor(url)}" title="${escapeHTML(text)}">${iconHTML}${textHTML}</a>`
}

hexo.extend.tag.register('btn', btn, { ends: false })
