import type { Edge, Screen } from './routes'

export type Variant = {
  name: string
  storage?: Record<string, string>
  anonymous?: boolean
}

export type ScreenRules = {
  variants?: Record<string, Variant[]>
  loggedOut?: (screen: Screen) => boolean
}

function variantOf(screen: Screen, variant: Variant, index: number): Screen {
  return {
    ...screen,
    id: index === 0 ? screen.id : `${screen.id}#${index}-${variant.name}`,
    label: `${screen.pattern} · ${index + 1}. ${variant.name}`,
    anonymous: variant.anonymous ?? screen.anonymous,
    storage: { ...screen.storage, ...variant.storage },
  }
}

export function applyRules(screens: Screen[], rules: ScreenRules) {
  return screens.flatMap((screen) => {
    const variants = rules.variants?.[screen.id]
    if (variants?.length) return variants.map((variant, index) => variantOf(screen, variant, index))
    return rules.loggedOut?.(screen) ? [{ ...screen, anonymous: true }] : [screen]
  })
}

export function variantEdges(screens: Screen[], variants: ScreenRules['variants'] = {}): Edge[] {
  return Object.keys(variants).flatMap((baseId) => {
    const chain = screens.filter(
      (screen) => screen.id === baseId || screen.id.startsWith(`${baseId}#`),
    )
    return chain.slice(1).map((screen, index) => ({ from: chain[index].id, to: screen.id }))
  })
}

export function moveFlowExits(
  edges: Edge[],
  screens: Screen[],
  variants: ScreenRules['variants'] = {},
) {
  const lastStep = new Map(
    Object.keys(variants).map((baseId) => [
      baseId,
      screens.filter((screen) => screen.id === baseId || screen.id.startsWith(`${baseId}#`)).at(-1)
        ?.id,
    ]),
  )
  const isBackEdge = (edge: Edge) =>
    edges.some((other) => other.from === edge.to && other.to === edge.from)
  return edges.map((edge) => {
    const last = lastStep.get(edge.from)
    const leavesFlow = !edge.to.startsWith(`${edge.from}#`)
    return last && leavesFlow && !isBackEdge(edge) ? { ...edge, from: last } : edge
  })
}
