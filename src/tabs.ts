import { dirname, join } from 'node:path'

import type { Edge, SourceGraph } from './graph'
import type { Screen } from './routes'

type TabEntry = { name: string; hidden: boolean }

const TAB_SCREEN = /<\w*Tabs\.Screen\b/g
const HIDDEN_TAB = /tabBarHidden:\s*true|href:\s*null/

export function parseTabEntries(layoutSource: string): TabEntry[] {
  const starts = [...layoutSource.matchAll(TAB_SCREEN)].map((match) => match.index)
  return starts.flatMap((start, index) => {
    const block = layoutSource.slice(start, starts[index + 1] ?? layoutSource.length)
    const name = block.match(/name=["']([^"']+)["']/)?.[1]
    return name ? [{ name, hidden: HIDDEN_TAB.test(block) }] : []
  })
}

export function tabBarEdges(graph: SourceGraph, screens: Screen[]): Edge[] {
  const layoutDirs = new Set(screens.map((screen) => dirname(screen.file)))
  return [...layoutDirs].flatMap((dir) => {
    const entries = parseTabEntries(graph.source(join(dir, '_layout.tsx')))
    const idOf = (name: string) =>
      screens.find((screen) => screen.file === join(dir, `${name}.tsx`))?.id
    const tabs = entries.map((entry) => idOf(entry.name)).filter((id): id is string => !!id)
    const visible = entries.filter((entry) => !entry.hidden).map((entry) => idOf(entry.name))
    return tabs.flatMap((from) =>
      visible
        .filter((to): to is string => !!to && to !== from)
        .map((to) => ({ from, to, kind: 'tab' as const })),
    )
  })
}

export function mergeEdges(navigation: Edge[], tabs: Edge[]) {
  const known = new Set(navigation.map((edge) => `${edge.from}>${edge.to}`))
  return [...navigation, ...tabs.filter((edge) => !known.has(`${edge.from}>${edge.to}`))]
}
