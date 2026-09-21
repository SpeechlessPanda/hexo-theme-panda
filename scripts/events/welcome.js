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

  // Hexo resolves `themes/<theme>` BEFORE `node_modules/hexo-theme-<theme>`
  // (hexo/lib/hexo/load_config.js), so a leftover clone silently shadows the npm
  // package and `npm update hexo-theme-panda` appears to do nothing.
  const themeDir = String(hexo.theme_dir || '').replace(/\\/g, '/')
  if (themeDir.includes('/themes/')) {
    hexo.log.warn([
      'Panda is loading from a vendored copy: ' + themeDir,
      '`themes/` overrides `node_modules/hexo-theme-panda`, so `npm update hexo-theme-panda` has no effect.',
      'Delete `themes/panda` to run the npm package (recommended), or keep the clone and `git pull` it yourself.'
    ].join('\n'))
  }
})
