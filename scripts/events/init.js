// Modified from hexo-theme-butterfly 5.7.0 (Apache-2.0) by SpeechlessPanda, 2026: config override path renamed to _config.panda.yml
const { deepMerge } = require('hexo-util')
const path = require('path')

// Cache default config to avoid repeated file reads
let cachedDefaultConfig = null

/**
 * Check Hexo version and configuration
 */
function checkHexoEnvironment (hexo) {
  const { version, log, locals } = hexo

  const [major, minor] = version.split('.').map(Number)
  const requiredMajor = 5
  const requiredMinor = 3

  if (major < requiredMajor || (major === requiredMajor && minor < requiredMinor)) {
    log.error('Please update Hexo to V5.3.0 or higher!')
    log.error('請把 Hexo 升級到 V5.3.0 或更高的版本！')
    throw new Error('Hexo version too old')
  }

  // Check for deprecated configuration file
  if (locals.get) {
    const data = locals.get('data')
    if (data && (data.butterfly || data.panda)) {
      log.error("Panda: please use '_config.panda.yml' to override theme config; '_data/butterfly.yml' or '_data/panda.yml' is not supported")
      log.error("Panda: 請使用 '_config.panda.yml' 覆蓋主題配置；不支援 '_data/butterfly.yml' 或 '_data/panda.yml'")
      throw new Error('Deprecated configuration file')
    }
  }
}

/**
 * Load default configuration
 */
function loadDefaultConfig () {
  if (cachedDefaultConfig) {
    return cachedDefaultConfig
  }

  const configPath = path.join(__dirname, '../common/default_config.js')
  cachedDefaultConfig = require(configPath)
  return cachedDefaultConfig
}

/**
 * Process comment system configuration
 */
function processCommentConfig (themeConfig) {
  const { comments } = themeConfig
  if (!comments || !comments.use) {
    return
  }

  let { use } = comments

  if (!Array.isArray(use)) {
    use = typeof use === 'string' ? use.split(',') : [use]
  }

  use = use
    .map(item => {
      if (typeof item !== 'string') return item
      return item.trim().toLowerCase().replace(/\b[a-z]/g, s => s.toUpperCase())
    })
    .filter(Boolean)

  // Handle Disqus and Disqusjs conflict
  if (use.includes('Disqus') && use.includes('Disqusjs')) {
    hexo.log.warn('Disqus and Disqusjs conflict detected, keeping only the first one')
    hexo.log.warn('檢測到 Disqus 和 Disqusjs 衝突，只保留第一個')
    use = [use[0]]
  }

  themeConfig.comments.use = use
}

hexo.extend.filter.register('before_generate', () => {
  checkHexoEnvironment(hexo)

  const defaultConfig = loadDefaultConfig()
  hexo.theme.config = deepMerge(defaultConfig, hexo.theme.config)

  processCommentConfig(hexo.theme.config)
}, 1)
