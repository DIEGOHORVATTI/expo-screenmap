import { spawn } from 'node:child_process'
import { openSync } from 'node:fs'
import { join } from 'node:path'

type MetroOptions = {
  appRoot: string
  origin: string
  logPath: string
}

const READY_TIMEOUT_MS = 180_000

async function isUp(origin: string) {
  try {
    return (await fetch(origin, { signal: AbortSignal.timeout(2000) })).ok
  } catch {
    return false
  }
}

export async function ensureMetro(options: MetroOptions) {
  if (await isUp(options.origin)) return async () => {}

  const port = new URL(options.origin).port
  const log = openSync(options.logPath, 'w')
  const { CI: _ci, ...env } = process.env
  const metro = spawn(
    join(options.appRoot, 'node_modules/.bin/expo'),
    ['start', '--web', '--port', port],
    {
      cwd: options.appRoot,
      stdio: ['ignore', log, log],
      detached: true,
      env: { ...env, SCREENMAP: '1', EXPO_NO_WEB_SETUP: '1', BROWSER: 'none' },
    },
  )
  const stop = () => {
    try {
      process.kill(-metro.pid!, 'SIGTERM')
    } catch {}
  }
  process.on('exit', stop)
  const exited = new Promise<never>((_, reject) =>
    metro.once('exit', (code) =>
      reject(new Error(`metro exited with code ${code}; see ${options.logPath}`)),
    ),
  )

  const deadline = Date.now() + READY_TIMEOUT_MS
  while (!(await Promise.race([isUp(options.origin), exited]))) {
    if (Date.now() > deadline) throw new Error(`metro did not respond at ${options.origin}`)
    await Bun.sleep(1000)
  }
  exited.catch(() => {})
  console.log(`Metro web at ${options.origin} (log: ${options.logPath})`)
  return async () => stop()
}
