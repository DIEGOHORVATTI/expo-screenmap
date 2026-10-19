export type IdSource = {
  endpoint: RegExp
  pick: (body: unknown) => string | undefined
}

export type TapThrough = { path: string; tap: string }

export type DynamicScreen = {
  sources: IdSource[]
  url: (id: string) => string
  via?: TapThrough
}

export function createIdRecorder(dynamicScreens: Record<string, DynamicScreen>) {
  const found = new Map<string, string[]>()
  const sources = Object.entries(dynamicScreens).flatMap(([screenId, screen]) =>
    screen.sources.map((source, priority) => ({ screenId, priority, ...source })),
  )

  return {
    wants: (path: string) => sources.some((source) => source.endpoint.test(path)),
    observe(path: string, body: unknown) {
      for (const source of sources) {
        if (!source.endpoint.test(path)) continue
        const id = source.pick(body)
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
      return id ? dynamicScreens[screenId]?.url(id) : undefined
    },
  }
}

export type IdRecorder = ReturnType<typeof createIdRecorder>
