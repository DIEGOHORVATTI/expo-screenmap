import { join } from 'node:path'

import type { ShotResult } from './capture'
import { shotFileName } from './capture'
import type { Edge } from './graph'
import type { Screen } from './routes'

export type MapState = {
  screens: (Screen & { url: string; shot: string })[]
  edges: Edge[]
  shots: Record<string, ShotResult>
}

type ServerOptions = {
  port: number
  shotsDir: string
  getState: () => MapState
}

const VIEWER = join(import.meta.dir, 'viewer.html')

export function screenWithShot(screen: Screen, url: string) {
  return { ...screen, url, shot: shotFileName(screen.id) }
}

export function startMapServer(options: ServerOptions) {
  const clients = new Set<ReadableStreamDefaultController<string>>()

  const server = Bun.serve({
    port: options.port,
    idleTimeout: 0,
    fetch(request) {
      const { pathname } = new URL(request.url)
      if (pathname === '/') return new Response(Bun.file(VIEWER))
      if (pathname === '/map.json') return Response.json(options.getState())
      if (pathname.startsWith('/shots/')) {
        const file = Bun.file(
          join(options.shotsDir, pathname.slice('/shots/'.length).replace(/\.\./g, '')),
        )
        return new Response(file, {
          headers: { 'cache-control': 'public, max-age=31536000, immutable' },
        })
      }
      if (pathname === '/events') {
        let controller: ReadableStreamDefaultController<string>
        const stream = new ReadableStream<string>({
          start: (c) => void clients.add((controller = c)),
          cancel: () => void clients.delete(controller),
        })
        return new Response(stream, {
          headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
        })
      }
      return new Response('not found', { status: 404 })
    },
  })

  return {
    url: `http://localhost:${server.port}`,
    broadcast(event: object) {
      for (const client of clients) {
        try {
          client.enqueue(`data: ${JSON.stringify(event)}\n\n`)
        } catch {
          clients.delete(client)
        }
      }
    },
  }
}
