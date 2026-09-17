// Modified from hexo-theme-butterfly 5.7.0 (Apache-2.0) by SpeechlessPanda, 2026: rebranded to Panda
'use strict'

hexo.extend.generator.register('404', function (locals) {
  const error404 = hexo.theme.config.error_404 || {}
  if (!error404.enable) return
  return {
    path: '404.html',
    layout: ['page'],
    data: {
      type: '404',
      top_img: false,
      comments: false,
      aside: false
    }
  }
})
