import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

export type Edge = { from: string; to: string; kind?: 'tab' }

export type Screen = {
  id: string
  file: string
  pattern: string
  group: string
  label?: string
  anonymous?: boolean
  storage?: Record<string, string>
}

const NON_SCREEN_FILE = /(^|\/)(_layout|\+not-found|\+html)\.tsx$/

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })
}

export function routePattern(id: string) {
  const segments = id
    .split('/')
    .filter((segment) => !/^\(.*\)$/.test(segment) && segment !== 'index')
  return `/${segments.join('/')}`
}

function groupOf(id: string) {
  const [first] = id.split('/')
  return id.includes('/') ? first.replace(/[()]/g, '') : 'root'
}

export function discoverScreens(appDir: string): Screen[] {
  return listFiles(appDir)
    .filter((file) => file.endsWith('.tsx') && !NON_SCREEN_FILE.test(relative(appDir, file)))
    .map((file) => {
      const id = relative(appDir, file).replace(/\.tsx$/, '')
      return { id, file, pattern: routePattern(id), group: groupOf(id) }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function layoutsAbove(appDir: string, screen: Screen) {
  const parts = screen.id.split('/').slice(0, -1)
  return parts
    .map((_, index) => join(appDir, ...parts.slice(0, index + 1), '_layout.tsx'))
    .concat(join(appDir, '_layout.tsx'))
}

function patternToRegex(pattern: string) {
  const source = pattern
    .split('/')
    .map((segment) =>
      /^\[.*\]$/.test(segment) ? '[^/]+' : segment.replace(/[.*+?^${}()|\\]/g, '\\$&'),
    )
    .join('/')
  return new RegExp(`^${source}$`)
}

export function matchScreen(screens: Screen[], href: string) {
  const path = routePattern(href.split('?')[0].replace(/^\//, '')).replace(/\/$/, '') || '/'
  return (
    screens.find((screen) => screen.pattern === path) ??
    screens.find((screen) => patternToRegex(screen.pattern).test(path))
  )
}

export function screenUrl(screen: Screen, params: Record<string, string>) {
  return params[screen.id] ?? screen.pattern.replace(/\[[^\]]+\]/g, 'screenmap')
}
