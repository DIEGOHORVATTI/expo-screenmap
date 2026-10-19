import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { layoutsAbove, matchScreen, type Edge, type Screen } from './routes'

export type { Edge } from './routes'

type PathRegistry = Record<string, unknown>

type PathBuilder = (...args: string[][]) => unknown

const transpilers = {
  tsx: new Bun.Transpiler({ loader: 'tsx' }),
  ts: new Bun.Transpiler({ loader: 'ts' }),
}
const SAMPLE_ARG = ['x']
const EXTENSIONS = ['.web.tsx', '.web.ts', '.tsx', '.ts', '.js']
const MEMBER_CHAIN = /\b[A-Za-z_$][\w$]*(?:\.[a-zA-Z]+)+/g
const LITERAL_NAVIGATION =
  /(?:push|replace|navigate|href=\{?|pathname:)\s*\(?\s*['"`](\/[^'"`?$]*)/g

function resolveImport(appRoot: string, fromFile: string, spec: string) {
  const base = spec.startsWith('@/')
    ? join(appRoot, spec.slice(2))
    : spec.startsWith('.')
      ? join(dirname(fromFile), spec)
      : null
  if (!base) return null
  const candidates = [
    base,
    ...EXTENSIONS.map((ext) => base + ext),
    ...EXTENSIONS.map((ext) => join(base, `index${ext}`)),
  ]
  return (
    candidates.find((candidate) => /\.[jt]sx?$/.test(candidate) && existsSync(candidate)) ?? null
  )
}

export class SourceGraph {
  private imports = new Map<string, string[]>()
  private sources = new Map<string, string>()

  constructor(private appRoot: string) {}

  invalidate(file: string) {
    this.imports.delete(file)
    this.sources.delete(file)
  }

  source(file: string) {
    if (!this.sources.has(file))
      this.sources.set(file, existsSync(file) ? readFileSync(file, 'utf8') : '')
    return this.sources.get(file) ?? ''
  }

  private importsOf(file: string) {
    if (!this.imports.has(file)) {
      const transpiler = file.endsWith('.tsx') ? transpilers.tsx : transpilers.ts
      const specs = this.source(file)
        ? transpiler.scanImports(this.source(file)).map((entry) => entry.path)
        : []
      const resolved = specs
        .map((spec) => resolveImport(this.appRoot, file, spec))
        .filter((path): path is string => !!path)
      this.imports.set(file, resolved)
    }
    return this.imports.get(file) ?? []
  }

  closure(entries: string[], stopAt: Set<string> = new Set()) {
    const seen = new Set<string>()
    const stack = [...entries]
    while (stack.length) {
      const file = stack.pop()!
      if (seen.has(file)) continue
      seen.add(file)
      for (const next of this.importsOf(file)) if (!stopAt.has(next)) stack.push(next)
    }
    return seen
  }
}

function flattenRegistry(registry: PathRegistry, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>()
  for (const [key, value] of Object.entries(registry)) {
    const name = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') entries.set(name, value)
    if (typeof value === 'function')
      entries.set(name, String((value as PathBuilder)(SAMPLE_ARG, SAMPLE_ARG, SAMPLE_ARG)))
    if (value && typeof value === 'object')
      for (const [k, v] of flattenRegistry(value as PathRegistry, name)) entries.set(k, v)
  }
  return entries
}

export async function loadPathRegistry(
  appRoot: string,
  source?: { file: string; exportName: string },
) {
  if (!source) return new Map<string, string>()
  const module = await import(`${join(appRoot, source.file)}?t=${Date.now()}`)
  return flattenRegistry(module[source.exportName] as PathRegistry, source.exportName)
}

function navigationTargets(source: string, registry: Map<string, string>) {
  const fromRegistry = registry.size
    ? [...source.matchAll(MEMBER_CHAIN)].map((match) => registry.get(match[0]))
    : []
  const literals = [...source.matchAll(LITERAL_NAVIGATION)].map((match) => match[1])
  return [...fromRegistry, ...literals].filter((href): href is string => !!href)
}

export function navigationEdges(
  graph: SourceGraph,
  screens: Screen[],
  registry: Map<string, string>,
): Edge[] {
  const screenFiles = new Set(screens.map((screen) => screen.file))
  const edges = new Map<string, Edge>()
  for (const screen of screens) {
    const stopAt = new Set([...screenFiles].filter((file) => file !== screen.file))
    for (const file of graph.closure([screen.file], stopAt)) {
      for (const href of navigationTargets(graph.source(file), registry)) {
        const target = matchScreen(screens, href)
        if (target && target.id !== screen.id)
          edges.set(`${screen.id}>${target.id}`, { from: screen.id, to: target.id })
      }
    }
  }
  return [...edges.values()]
}

export function affectedScreens(
  graph: SourceGraph,
  appDir: string,
  screens: Screen[],
  changed: Set<string>,
) {
  return screens.filter((screen) => {
    const deps = graph.closure([screen.file, ...layoutsAbove(appDir, screen)])
    return [...changed].some((file) => deps.has(file))
  })
}
