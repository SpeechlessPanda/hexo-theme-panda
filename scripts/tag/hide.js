// Modified from hexo-theme-butterfly 5.7.0 (Apache-2.0) by SpeechlessPanda, 2026: rebranded to Panda; hideToggle expanded blocks get a bottom collapse bar
'use strict'

const parseArgs = args => args.join(' ').split(',').map(s => s.trim())

const generateStyle = (bg, color) => {
  let style = 'style="'
  if (bg) style += `background-color: ${bg};`
  if (color) style += `color: ${color}`
  style += '"'
  return style
}

const hideInline = args => {
  const [content, display = 'Click', bg = false, color = false] = parseArgs(args)
  const style = generateStyle(bg, color)
  return `<span class="hide-inline"><button type="button" class="hide-button" ${style}>${display}</button><span class="hide-content">${content}</span></span>`
}

const hideBlock = (args, content) => {
  const [display = 'Click', bg = false, color = false] = parseArgs(args)
  const style = generateStyle(bg, color)
  const renderedContent = hexo.render.renderSync({ text: content, engine: 'markdown' })
  return `<div class="hide-block"><button type="button" class="hide-button" ${style}>${display}</button><div class="hide-content">${renderedContent}</div></div>`
}

const hideToggle = (args, content) => {
  const [display, bg = false, color = false] = parseArgs(args)
  const style = generateStyle(bg, color)
  const border = bg ? `style="border: 1px solid ${bg}"` : ''
  const renderedContent = hexo.render.renderSync({ text: content, engine: 'markdown' })
  const lang = hexo.config && hexo.config.language
  const code = Array.isArray(lang) ? lang[0] : (lang || 'en')
  let collapse = 'Collapse'
  try {
    const text = hexo.theme.i18n.__(code)('tag.hide_toggle_collapse')
    if (text && text !== 'tag.hide_toggle_collapse') collapse = text
  } catch (_) {}
  return `<details class="toggle" ${border}><summary class="toggle-button" ${style}>${display}</summary><div class="toggle-content">${renderedContent}</div><button type="button" class="toggle-collapse">${collapse}</button></details>`
}

hexo.extend.tag.register('hideInline', hideInline)
hexo.extend.tag.register('hideBlock', hideBlock, { ends: true })
hexo.extend.tag.register('hideToggle', hideToggle, { ends: true })
