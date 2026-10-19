#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseArgs } from 'node:util'

import { launchBrowser, openPhoneContext } from './browser'
import { createCapturePool, type ShotResult } from './capture'
import { loadConfig } from './config'
import { affectedScreens, loadPathRegistry, navigationEdges, SourceGraph, type Edge } from './graph'
import { createIdRecorder } from './ids'
import { ensureMetro } from './metro'
import { discoverScreens, screenUrl, type Screen } from './routes'
import { screenWithShot, startMapServer } from './server'
import { mergeEdges, tabBarEdges } from './tabs'

const DEBOUNCE_MS = 1500

const { values: flags, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: { once: { type: 'boolean' }, config: { type: 'string', short: 'c' } },
  allowPositionals: true,
})

const config = await loadConfig(process.cwd(), flags.config)
const shotsDir = join(config.outDir, 'shots')
const statePath = join(config.outDir, 'auth.json')
const shotsIndex = join(config.outDir, 'shots.json')
const prefs = { locale: config.locale, colorScheme: config.colorScheme }
const startMetro = () =>
  ensureMetro({
    appRoot: config.appRoot,
    origin: config.appOrigin,
    logPath: join(config.outDir, 'metro.log'),
  })

mkdirSync(shotsDir, { recursive: true })

async function login() {
  const stopMetro = await startMetro()
  const browser = await launchBrowser(true, config.chromePath)
  const context = await openPhoneContext(browser, config.appOrigin, prefs, statePath)
  const page = await context.newPage()
  await page.goto(`${config.appOrigin}${config.loginPath}`)
  console.log('Sign in in the browser window and close the tab once the home screen shows up.')
  await page.waitForEvent('close', { timeout: 0 })
  await context.storageState({ path: statePath })
  await browser.close()
  console.log(`Session saved to ${relative(process.cwd(), statePath)}`)
  await stopMetro()
  process.exit(0)
}

async function run() {
  const stopMetro = await startMetro()
  if (!existsSync(statePath))
    console.warn('No saved session: signed-in screens will redirect. Run `expo-screenmap login`.')

  const graph = new SourceGraph(config.appRoot)
  let registry = await loadPathRegistry(config.appRoot, config.pathRegistry)
  const loadScreens = () => {
    const screens = discoverScreens(config.appDir)
    return config.expandScreens ? config.expandScreens(screens, config.appRoot) : screens
  }
  let screens: Screen[] = loadScreens()
  let edges: Edge[] = allEdges()
  const shots: Record<string, ShotResult> = existsSync(shotsIndex)
    ? JSON.parse(readFileSync(shotsIndex, 'utf8'))
    : {}
  function allEdges() {
    return mergeEdges(
      navigationEdges(
        graph,
        screens.filter((screen) => !screen.id.includes('#')),
        registry,
      ),
      [...tabBarEdges(graph, screens), ...(config.extraEdges?.(screens) ?? [])],
    )
  }
  const { params } = config
  const recorder = createIdRecorder(config.dynamicScreens)
  const urlOf = (screen: Screen) =>
    params[screen.id] ?? recorder.url(screen.id) ?? screenUrl(screen, params)
  const isReady = (screen: Screen) =>
    !recorder.isDynamic(screen.id) || !!params[screen.id] || !!recorder.url(screen.id)

  const server = startMapServer({
    port: config.mapPort,
    shotsDir,
    getState: () => ({ screens: screens.map((s) => screenWithShot(s, urlOf(s))), edges, shots }),
  })

  const browser = await launchBrowser(false, config.chromePath)
  const pool = createCapturePool({
    async openContext(job) {
      const jobState = job.anonymous ? undefined : statePath
      const context = await openPhoneContext(
        browser,
        config.appOrigin,
        prefs,
        jobState,
        job.storage,
      )
      context.on('response', async (response) => {
        const { pathname, search } = new URL(response.url())
        if (!recorder.wants(pathname + search) || !response.ok()) return
        recorder.observe(pathname + search, await response.json().catch(() => null))
      })
      return context
    },
    appOrigin: config.appOrigin,
    shotsDir,
    concurrency: config.concurrency,
    onShot(result) {
      shots[result.id] = result
      writeFileSync(shotsIndex, JSON.stringify(shots))
      server.broadcast({ type: 'shot', shot: result })
      server.broadcast({ type: 'pending', count: pool.pending() - 1 })
      const status = result.errors.length ? `✗ ${result.errors[0]}` : '✓'
      console.log(`${status} ${result.id} (${result.ms} ms)`)
    },
  })

  const capture = (targets: Screen[]) => {
    pool.enqueue(
      targets.map((screen) => ({
        id: screen.id,
        url: urlOf(screen),
        via: recorder.via(screen.id),
        anonymous: screen.anonymous,
        storage: screen.storage,
      })),
    )
    server.broadcast({ type: 'pending', count: pool.pending() })
  }

  async function captureInWaves() {
    const done = new Set<string>()
    for (let wave = screens.filter(isReady); wave.length; ) {
      wave.forEach((screen) => done.add(screen.id))
      capture(wave)
      await pool.idle()
      wave = screens.filter((screen) => !done.has(screen.id) && isReady(screen))
    }
    capture(screens.filter((screen) => !done.has(screen.id)))
    await pool.idle()
  }

  console.log(`Map at ${server.url}`)
  await captureInWaves()
  if (flags.once) {
    await browser.close()
    await stopMetro()
    process.exit(0)
  }

  const changed = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined

  async function flush() {
    const files = new Set(changed)
    changed.clear()
    files.forEach((file) => graph.invalidate(file))
    const registryFile = config.pathRegistry && join(config.appRoot, config.pathRegistry.file)
    if (registryFile && files.has(registryFile))
      registry = await loadPathRegistry(config.appRoot, config.pathRegistry)
    if ([...files].some((file) => file.startsWith(config.appDir))) screens = loadScreens()
    edges = allEdges()
    server.broadcast({ type: 'map' })
    const targets = affectedScreens(graph, config.appDir, screens, files)
    console.log(`${files.size} file(s) changed → ${targets.length} screen(s)`)
    capture(targets)
  }

  for (const dir of config.watchDirs) {
    watch(dir, { recursive: true }, (_, name) => {
      if (!name || !/\.[jt]sx?$/.test(name) || /\.test\.[jt]sx?$/.test(name)) return
      changed.add(join(dir, name))
      clearTimeout(timer)
      timer = setTimeout(() => void flush(), DEBOUNCE_MS)
    })
  }

  process.on(
    'SIGINT',
    () =>
      void browser
        .close()
        .then(stopMetro)
        .then(() => process.exit(0)),
  )
}

if (positionals[0] === 'login') await login()
else await run()
