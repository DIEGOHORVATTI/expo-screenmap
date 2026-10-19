import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { withScreenmapMetro, withScreenmapWeb } from './expo.cjs'

type ExpoConfig = { platforms?: string[]; web?: { output: string } }

const NATIVE_ONLY = /ReactAndroid/

function appWithReact(version: string) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'screenmap-'))
  mkdirSync(join(projectRoot, 'node_modules/react'), { recursive: true })
  writeFileSync(join(projectRoot, 'node_modules/react/package.json'), JSON.stringify({ version }))
  return { projectRoot, resolver: { blockList: [NATIVE_ONLY], nodeModulesPaths: [] as string[] } }
}

afterEach(() => {
  delete process.env.SCREENMAP
})

test('keeps native-only platforms and metro config outside screenmap', () => {
  const config: ExpoConfig = { web: { output: 'static' } }
  expect(withScreenmapMetro(appWithReact('19.2.3')).resolver.blockList).toEqual([NATIVE_ONLY])
  expect(withScreenmapWeb(config)).toEqual({
    platforms: ['ios', 'android'],
    web: { output: 'static' },
  })
})

test('enables single-page web and blocks react-dom builds of another react version', () => {
  process.env.SCREENMAP = '1'
  const config: ExpoConfig = { web: { output: 'static' } }
  expect(withScreenmapWeb(config)).toEqual({
    platforms: ['ios', 'android', 'web'],
    web: { output: 'single' },
  })
  const app = withScreenmapMetro(appWithReact('19.2.3'))
  const mismatched = app.resolver.blockList[1]
  expect(mismatched.test('/node_modules/.bun/react-dom@19.3.0+abc/index.js')).toBe(true)
  expect(mismatched.test('/node_modules/.bun/react-dom@19.2.3+abc/index.js')).toBe(false)
  expect(app.resolver.nodeModulesPaths[0]).toBe(join(app.projectRoot, 'node_modules'))
})
