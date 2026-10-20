import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Route } from 'playwright-core'

const PLAYWRIGHT_CACHE = join(homedir(), '.cache/ms-playwright')
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}

export const PHONE = { width: 393, height: 852 }

export type BrowserPrefs = {
  locale: string
  colorScheme: 'light' | 'dark'
}

function latestPlaywrightBinary(prefix: string, executable: string) {
  if (process.platform !== 'linux' || !existsSync(PLAYWRIGHT_CACHE)) return undefined
  const latest = readdirSync(PLAYWRIGHT_CACHE)
    .filter((dir) => dir.startsWith(prefix))
    .sort()
    .at(-1)
  const path = latest && join(PLAYWRIGHT_CACHE, latest, executable)
  return path && existsSync(path) ? path : undefined
}

export function launchBrowser(headed = false, chromePath?: string) {
  const executablePath =
    chromePath ??
    (headed
      ? latestPlaywrightBinary('chromium-', 'chrome-linux64/chrome')
      : latestPlaywrightBinary(
          'chromium_headless_shell-',
          'chrome-headless-shell-linux64/chrome-headless-shell',
        ))
  return chromium.launch({
    executablePath,
    headless: !headed,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${join(import.meta.dir, 'fake-camera.mjpeg')}`,
    ],
  })
}

async function proxyWithoutCors(route: Route) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: CORS_HEADERS })
  }
  try {
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), ...CORS_HEADERS } })
  } catch {
    await route.abort().catch(() => {})
  }
}

export async function openPhoneContext(
  browser: Browser,
  appOrigin: string,
  prefs: BrowserPrefs,
  statePath?: string,
  storage: Record<string, string> = {},
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: prefs.colorScheme,
    locale: prefs.locale,
    storageState: statePath && existsSync(statePath) ? statePath : undefined,
    permissions: ['camera'],
  })
  await context.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
  }, storage)
  await context.route(
    (url) => url.origin !== appOrigin && url.protocol.startsWith('http'),
    (route) =>
      ['fetch', 'xhr'].includes(route.request().resourceType())
        ? proxyWithoutCors(route)
        : route.continue(),
  )
  return context
}
