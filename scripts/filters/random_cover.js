/**
 * Random cover for posts
 */

'use strict'

hexo.extend.generator.register('post', locals => {
  const imgTestReg = /\.(png|jpe?g|gif|svg|webp|avif)(\?.*)?$/i
  const remoteImgReg = /^(?:https?:)?\/\//i
  const dataImgReg = /^data:image\//i

  const { post_asset_folder: postAssetFolder } = hexo.config
  const { cover: { default_cover: defaultCover } } = hexo.theme.config

  const isImage = value => {
    return typeof value === 'string' &&
      (remoteImgReg.test(value) || dataImgReg.test(value) || imgTestReg.test(value))
  }

  function * createCoverGenerator () {
    if (!defaultCover || (Array.isArray(defaultCover) && defaultCover.length === 0)) {
      while (true) yield false
    }

    if (!Array.isArray(defaultCover)) {
      while (true) yield defaultCover
    }

    if (defaultCover.length === 1) {
      while (true) yield defaultCover[0]
    }

    const coverCount = defaultCover.length
    const maxHistory = Math.min(3, coverCount - 1)
    const history = []

    while (true) {
      let index

      do {
        index = Math.floor(Math.random() * coverCount)
      } while (history.includes(index))

      history.push(index)

      if (history.length > maxHistory) {
        history.shift()
      }

      yield defaultCover[index]
    }
  }

  const coverGenerator = createCoverGenerator()

  const resolvePostAsset = (value, postPath) => {
    if (
      !postAssetFolder ||
      typeof value !== 'string' ||
      value.includes('/') ||
      !imgTestReg.test(value)
    ) {
      return value
    }

    return `${postPath}${value}`
  }

  const handleImg = data => {
    data.top_img = resolvePostAsset(data.top_img, data.path)
    data.cover = resolvePostAsset(data.cover, data.path)
    data.pagination_cover = resolvePostAsset(data.pagination_cover, data.path)

    if (data.cover === false) return data

    if (!data.cover) {
      data.cover = coverGenerator.next().value
    }

    if (isImage(data.cover)) {
      data.cover_type = 'img'
    }

    return data
  }

  const posts = locals.posts.sort('date').toArray()
  const { length } = posts

  return posts.map((post, index) => {
    const data = post

    if (index > 0) {
      data.prev = posts[index - 1]
    }

    if (index < length - 1) {
      data.next = posts[index + 1]
    }

    data.__post = true

    return {
      data: handleImg(data),
      layout: 'post',
      path: data.path
    }
  })
})
