import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import type { DynamicScreen } from './ids'
import type { Edge, Screen } from './routes'
import type { Variant } from './variants'

export type { DynamicScreen, IdSource, TapThrough } from './ids'
export type { Edge, Screen } from './routes'
export type { Variant } from './variants'

export type ScreenmapConfig = {
  root?: string
  outDir?: string
  watch?: string[]
  appPort?: number
  mapPort?: number
  concurrency?: number
  locale?: string
  colorScheme?: 'light' | 'dark'
  loginPath?: string
  chromePath?: string
  params?: Record<string, string>
  storage?: Record<string, string>
  loggedOut?: (screen: Screen) => boolean
  variants?: Record<string, Variant[]>
  pathRegistry?: { file: string; exportName: string }
  dynamicScreens?: Record<string, DynamicScreen>
  expandScreens?: (screens: Screen[], appRoot: string) => Screen[]
  extraEdges?: (screens: Screen[]) => Edge[]
}

export type ResolvedConfig = Required<
  Pick<
    ScreenmapConfig,
    'concurrency' | 'locale' | 'colorScheme' | 'loginPath' | 'params' | 'dynamicScreens'
  >
> &
  Omit<ScreenmapConfig, 'root' | 'outDir' | 'watch'> & {
    appRoot: string
    appDir: string
    outDir: string
    watchDirs: string[]
    appOrigin: string
    mapPort: number
  }

const CONFIG_FILES = ['screenmap.config.ts', 'screenmap.config.js', 'screenmap.config.mjs']

export function defineConfig(config: ScreenmapConfig) {
  return config
}

function findConfig(cwd: string, explicit?: string) {
  if (explicit) return resolve(cwd, explicit)
  return CONFIG_FILES.map((name) => resolve(cwd, name)).find((path) => existsSync(path))
}

export async function loadConfig(cwd: string, explicit?: string): Promise<ResolvedConfig> {
  const path = findConfig(cwd, explicit)
  const config: ScreenmapConfig = path ? ((await import(path)).default ?? {}) : {}
  const base = path ? dirname(path) : cwd
  const appRoot = resolve(base, config.root ?? '.')

  return {
    ...config,
    concurrency: config.concurrency ?? 3,
    locale: config.locale ?? 'en-US',
    colorScheme: config.colorScheme ?? 'light',
    loginPath: config.loginPath ?? '/login',
    params: config.params ?? {},
    dynamicScreens: config.dynamicScreens ?? {},
    appRoot,
    appDir: resolve(appRoot, 'app'),
    outDir: resolve(base, config.outDir ?? '.screenmap'),
    watchDirs: (config.watch ?? ['app', 'src'])
      .map((dir) => resolve(appRoot, dir))
      .filter((dir) => existsSync(dir)),
    appOrigin: `http://localhost:${config.appPort ?? 8099}`,
    mapPort: Number(process.env.SCREENMAP_PORT ?? config.mapPort ?? 8100),
  }
}
