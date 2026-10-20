import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { layoutsAbove, matchScreen, type Edge, type Screen } from './routes'

export type { Edge } from './routes'

type PathRegistry = Record<string, unknown>

type PathBuilder = (...args: string[][]) => unknown

type Names = Set<string> | 'all'

type Dependency = { file: string; names: Names; exports?: Map<string, string> | 'all' }

type Statement = { spec: string; names: Names; exports?: Map<string, string> | 'all' }

const transpilers = {
  tsx: new Bun.Transpiler({ loader: 'tsx' }),
  ts: new Bun.Transpiler({ loader: 'ts' }),
}

function scanImports(file: string, source: string) {
  if (!source) return []
  const transpiler = file.endsWith('.tsx') ? transpilers.tsx : transpilers.ts
  try {
    return transpiler.scanImports(source).map((entry) => entry.path)
  } catch {
    return null
  }
}

const STATIC_IMPORT = /^\s*import\s+(type\s+)?([\w$*{}\s,]+?)\s+from\s+['"]([^'"]+)['"]/gm
const REEXPORT =
  /^\s*export\s+(type\s+)?(\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm

function bindings(list: string) {
  return list
    .replace(/[{}]/g, '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry && !entry.startsWith('type '))
    .map((entry) => {
      const [local, alias] = entry.split(/\s+as\s+/)
      return { imported: local, exported: alias ?? local }
    })
}

function importedNames(clause: string): Names {
  if (clause.includes('*')) return 'all'
  const [head, named = ''] = clause.split('{')
  const names = bindings(named).map((binding) => binding.imported)
  if (head.replace(',', '').trim()) names.push('default')
  return new Set(names)
}

function reexportedNames(clause: string): Map<string, string> | 'all' {
  if (clause === '*') return 'all'
  const star = clause.match(/^\*\s+as\s+([\w$]+)/)
  if (star) return new Map([[star[1], '*']])
  return new Map(bindings(clause).map((binding) => [binding.exported, binding.imported]))
}

function staticStatements(source: string) {
  const statements: Statement[] = []
  const typeOnly = new Set<string>()
  for (const [, isType, clause, spec] of source.matchAll(STATIC_IMPORT)) {
    if (isType) typeOnly.add(spec)
    else statements.push({ spec, names: importedNames(clause) })
  }
  for (const [, isType, clause, spec] of source.matchAll(REEXPORT)) {
    if (isType) typeOnly.add(spec)
    else statements.push({ spec, names: new Set(), exports: reexportedNames(clause.trim()) })
  }
  return { statements, typeOnly }
}

function forwarded(exports: Map<string, string> | 'all', requested: Names): Names | null {
  if (exports === 'all') return requested
  const wanted = [...exports]
    .filter(([exported]) => requested === 'all' || requested.has(exported))
    .map(([, imported]) => imported)
  if (!wanted.length) return null
  return wanted.includes('*') ? 'all' : new Set(wanted)
}

function newlyRequested(before: Names | undefined, names: Names): Names | null {
  if (before === 'all') return null
  if (names === 'all' || !before) return names
  const added = [...names].filter((name) => !before.has(name))
  return added.length ? new Set(added) : null
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
  private imports = new Map<string, Dependency[]>()
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

  private dependenciesOf(file: string) {
    if (!this.imports.has(file)) {
      const source = this.source(file)
      const specs = scanImports(file, source)
      if (!specs) return []
      const { statements, typeOnly } = staticStatements(source)
      const covered = new Set(statements.map((statement) => statement.spec))
      const dynamic = specs
        .filter((spec) => !covered.has(spec) && !typeOnly.has(spec))
        .map((spec): Statement => ({ spec, names: 'all' }))
      const resolved = [...statements, ...dynamic].flatMap(({ spec, ...rest }) => {
        const path = resolveImport(this.appRoot, file, spec)
        return path ? [{ file: path, ...rest }] : []
      })
      this.imports.set(file, resolved)
    }
    return this.imports.get(file) ?? []
  }

  closure(entries: string[], stopAt: Set<string> = new Set()) {
    const requested = new Map<string, Names>()
    const stack = entries.map((file): [string, Names] => [file, 'all'])
    while (stack.length) {
      const [file, names] = stack.pop()!
      const before = requested.get(file)
      const added = newlyRequested(before, names)
      if (!added) continue
      requested.set(file, added === 'all' || !before ? added : new Set([...before, ...added]))
      for (const dependency of this.dependenciesOf(file)) {
        if (stopAt.has(dependency.file)) continue
        if (!dependency.exports) {
          if (!before) stack.push([dependency.file, dependency.names])
          continue
        }
        const wanted = forwarded(dependency.exports, added)
        if (wanted) stack.push([dependency.file, wanted])
      }
    }
    return new Set(requested.keys())
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
  ignored: Set<string> = new Set(),
): Edge[] {
  const screenFiles = new Set(screens.map((screen) => screen.file))
  const edges = new Map<string, Edge>()
  for (const screen of screens) {
    const stopAt = new Set([...screenFiles].filter((file) => file !== screen.file))
    for (const file of graph.closure([screen.file], stopAt)) {
      if (ignored.has(file)) continue
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
