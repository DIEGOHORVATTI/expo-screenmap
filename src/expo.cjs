const { existsSync } = require('node:fs')
const path = require('node:path')

const isScreenmap = () => process.env.SCREENMAP === '1'

function asList(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function nodeModulesAbove(dir) {
  const found = []
  for (let current = dir; ; current = path.dirname(current)) {
    const candidate = path.join(current, 'node_modules')
    if (existsSync(candidate)) found.push(candidate)
    if (path.dirname(current) === current) return found
  }
}

function withScreenmapMetro(config) {
  if (!isScreenmap()) return config
  const projectRoot = config.projectRoot ?? process.cwd()
  const reactPackage = require.resolve('react/package.json', { paths: [projectRoot] })
  const reactVersion = require(reactPackage).version.replaceAll('.', '\\.')
  const mismatchedReactDom = new RegExp(`[/\\\\]react-dom@(?!${reactVersion}\\+)`)
  config.resolver.blockList = [...asList(config.resolver.blockList), mismatchedReactDom]
  config.resolver.nodeModulesPaths = [...new Set([
    ...asList(config.resolver.nodeModulesPaths),
    ...nodeModulesAbove(projectRoot),
  ])]
  return config
}

function withScreenmapWeb(config) {
  const platforms = config.platforms ?? ['ios', 'android']
  if (!isScreenmap()) return { ...config, platforms }
  return {
    ...config,
    platforms: platforms.includes('web') ? platforms : [...platforms, 'web'],
    web: { ...config.web, output: 'single' },
  }
}

module.exports = { withScreenmapMetro, withScreenmapWeb }
