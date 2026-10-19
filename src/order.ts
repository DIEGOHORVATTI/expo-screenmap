import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Screen } from './routes'

const DECLARED_SCREEN = /<\w+(?:\.\w+)*\.Screen\b[^>]*?\bname=["']([^"']+)["']/g
const UNDECLARED = Number.MAX_SAFE_INTEGER

function segmentKind(id: string) {
  const last = id.split('/').at(-1) ?? ''
  if (last === 'index') return 0
  return last.startsWith('[') ? 2 : 1
}

export function declaredNames(layoutSource: string) {
  return [...layoutSource.matchAll(DECLARED_SCREEN)].map((match) => match[1])
}

function compareKeys(a: number[], b: number[]) {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const diff = (a[index] ?? -1) - (b[index] ?? -1)
    if (diff) return diff
  }
  return 0
}

export function orderByLayouts(appDir: string, screens: Screen[]) {
  const names = new Map<string, string[]>()
  const namesIn = (dir: string) => {
    if (!names.has(dir)) {
      const layout = join(dir, '_layout.tsx')
      names.set(dir, existsSync(layout) ? declaredNames(readFileSync(layout, 'utf8')) : [])
    }
    return names.get(dir)!
  }
  const keyOf = (screen: Screen) => {
    const parts = screen.id.split('/')
    return parts.map((_, depth) => {
      const rest = parts.slice(depth).join('/')
      const position = namesIn(join(appDir, ...parts.slice(0, depth))).findIndex(
        (name) => rest === name || rest.startsWith(`${name}/`),
      )
      return position === -1 ? UNDECLARED : position
    })
  }
  const keys = new Map(screens.map((screen) => [screen.id, keyOf(screen)]))
  return [...screens].sort(
    (a, b) =>
      compareKeys(keys.get(a.id)!, keys.get(b.id)!) ||
      segmentKind(a.id) - segmentKind(b.id) ||
      a.id.localeCompare(b.id),
  )
}
