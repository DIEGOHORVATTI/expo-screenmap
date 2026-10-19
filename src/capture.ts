import { join } from 'node:path'
import type { BrowserContext } from 'playwright-core'

import type { TapThrough } from './ids'

export type ShotJob = {
  id: string
  url: string
  via?: TapThrough
  anonymous?: boolean
  storage?: Record<string, string>
}

export type ShotResult = { id: string; at: number; ms: number; errors: string[] }

type CapturePoolOptions = {
  openContext: (job: ShotJob) => Promise<BrowserContext>
  appOrigin: string
  shotsDir: string
  concurrency: number
  onShot: (result: ShotResult) => void
}

const SETTLE_MS = 1200
const NETWORK_IDLE_TIMEOUT_MS = 8000
const SPINNER_TIMEOUT_MS = 5000
const HIDE_DEV_OVERLAYS = '#error-toast { display: none !important; }'

function noVisibleSpinner() {
  return ![...document.querySelectorAll('[role="progressbar"]')].some(
    (element) => (element as HTMLElement).offsetParent !== null,
  )
}

export function shotFileName(id: string) {
  return `${id.replace(/[^a-zA-Z0-9-]+/g, '_')}.png`
}

async function captureOne(job: ShotJob, options: CapturePoolOptions): Promise<ShotResult> {
  const errors: string[] = []
  const startedAt = Date.now()
  const context = await options.openContext(job)
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message.split('\n')[0]))
  try {
    await page.goto(`${options.appOrigin}${job.via?.path ?? job.url}`, {
      waitUntil: 'load',
      timeout: 120_000,
    })
    if (job.via) {
      await page
        .waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })
        .catch(() => {})
      await page
        .locator(job.via.tap)
        .first()
        .click({ force: true, timeout: NETWORK_IDLE_TIMEOUT_MS })
    }
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
    await page
      .waitForFunction(noVisibleSpinner, null, { timeout: SPINNER_TIMEOUT_MS })
      .catch(() => {})
    await page.waitForTimeout(SETTLE_MS)
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})
    await page.waitForTimeout(SETTLE_MS / 2)
    await page.addStyleTag({ content: HIDE_DEV_OVERLAYS })
    await page.screenshot({ path: join(options.shotsDir, shotFileName(job.id)) })
  } catch (error) {
    errors.push((error as Error).message.split('\n')[0])
  } finally {
    await context.close()
  }
  return { id: job.id, at: Date.now(), ms: Date.now() - startedAt, errors }
}

export function createCapturePool(options: CapturePoolOptions) {
  const queue: ShotJob[] = []
  const queued = new Set<string>()
  const idleWaiters: (() => void)[] = []
  let workers = 0
  const isIdle = () => workers === 0 && queue.length === 0

  async function startWorker() {
    workers++
    try {
      for (let job = queue.shift(); job; job = queue.shift()) {
        queued.delete(job.id)
        options.onShot(await captureOne(job, options))
      }
    } finally {
      workers--
      if (isIdle()) idleWaiters.splice(0).forEach((resolve) => resolve())
    }
  }

  return {
    enqueue(jobs: ShotJob[]) {
      for (const job of jobs) {
        if (queued.has(job.id)) continue
        queued.add(job.id)
        queue.push(job)
      }
      while (workers < Math.min(options.concurrency, queue.length)) void startWorker()
    },
    pending: () => queue.length + workers,
    idle: () =>
      isIdle() ? Promise.resolve() : new Promise<void>((resolve) => idleWaiters.push(resolve)),
  }
}
