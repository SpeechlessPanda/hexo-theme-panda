// Modified from hexo-theme-butterfly 5.7.0 (Apache-2.0) by SpeechlessPanda, 2026: Panda terminal banner
hexo.on('ready', () => {
  const { version } = require('../../package.json')
  hexo.log.info(`
  ==============================================================
     #####    ##   #    # #####    ##
     #    #  #  #  ##   # #    #  #  #
     #####  #    # # #  # #    # #    #
     #      ###### #  # # #    # ######
     #      #    # #   ## #####  #    #
                        ${version}
  ==============================================================`)
})
