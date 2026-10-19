import { routePattern } from './routes'

type Body = any

export type IdSource = {
  endpoint: string | RegExp
  pick: string | ((body: Body) => string | undefined)
}

export type TapThrough = { path: string; tap: string }

export type DynamicScreen = {
  sources: IdSource[]
  url?: (id: string) => string
  via?: TapThrough
}

function matches(endpoint: IdSource['endpoint'], path: string) {
  return typeof endpoint === 'string' ? path.split('?')[0] === endpoint : endpoint.test(path)
}

function pickId(pick: IdSource['pick'], body: Body) {
  const value =
    typeof pick === 'function'
      ? pick(body)
      : pick.split('.').reduce((node, key) => node?.[key], body)
  return typeof value === 'string' && value ? value : undefined
}

function defaultUrl(screenId: string, id: string) {
  return routePattern(screenId).replace(/\[[^\]]+\]/, id)
}

export function createIdRecorder(dynamicScreens: Record<string, DynamicScreen>) {
  const found = new Map<string, string[]>()
  const sources = Object.entries(dynamicScreens).flatMap(([screenId, screen]) =>
    screen.sources.map((source, priority) => ({ screenId, priority, ...source })),
  )

  return {
    wants: (path: string) => sources.some((source) => matches(source.endpoint, path)),
    observe(path: string, body: unknown) {
      for (const source of sources) {
        if (!matches(source.endpoint, path)) continue
        const id = pickId(source.pick, body)
        if (!id) continue
        const ids = found.get(source.screenId) ?? []
        ids[source.priority] = id
        found.set(source.screenId, ids)
      }
    },
    isDynamic: (screenId: string) => screenId in dynamicScreens,
    via: (screenId: string) => dynamicScreens[screenId]?.via,
    url(screenId: string) {
      const id = found.get(screenId)?.find(Boolean)
      const screen = dynamicScreens[screenId]
      if (!id || !screen) return undefined
      return screen.url ? screen.url(id) : defaultUrl(screenId, id)
    },
  }
}

export type IdRecorder = ReturnType<typeof createIdRecorder>
