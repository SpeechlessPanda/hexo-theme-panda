// Modified from hexo-theme-butterfly 5.7.0 (Apache-2.0) by SpeechlessPanda, 2026: Panda terminal banner
hexo.on('ready', () => {
  const { version } = require('../../package.json')
  const art = [
    '#####    ##   #    # #####    ##',
    '#    #  #  #  ##   # #    #  #  #',
    '#####  #    # # #  # #    # #    #',
    '#      ###### #  # # #    # ######',
    '#      #    # #   ## #####  #    #'
  ]
  const width = Math.max(...art.map(line => line.length), String(version).length)
  const rule = '='.repeat(width)
  const center = (text) => {
    const s = String(text)
    const space = width - s.length
    const left = Math.floor(space / 2)
    return ' '.repeat(left) + s
  }
  const indent = '  '
  hexo.log.info(['', rule, ...art, center(version), rule].map(line => indent + line).join('\n'))
})
