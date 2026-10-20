import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'bun:test'

import { SourceGraph } from './graph'

test('a file mid-edit that does not parse is skipped, then picked up once fixed', () => {
  const root = mkdtempSync(join(tmpdir(), 'screenmap-graph-'))
  const screen = join(root, 'screen.tsx')
  const helper = join(root, 'helper.ts')
  writeFileSync(helper, 'export const x = 1\n')
  writeFileSync(screen, "import { x } from './helper'\nconst a = 1\nconst a = 2\n")

  const graph = new SourceGraph(root)
  expect([...graph.closure([screen])]).toEqual([screen])

  writeFileSync(screen, "import { x } from './helper'\nexport default x\n")
  graph.invalidate(screen)
  expect([...graph.closure([screen])].sort()).toEqual([helper, screen].sort())
})

test('a barrel only brings in the modules a screen imports from it', () => {
  const root = mkdtempSync(join(tmpdir(), 'screenmap-graph-'))
  const screen = join(root, 'screen.tsx')
  const barrel = join(root, 'hooks.ts')
  const used = join(root, 'use-login.ts')
  const unused = join(root, 'use-register.ts')
  const typed = join(root, 'types.ts')
  writeFileSync(used, 'export const useLogin = 1\n')
  writeFileSync(unused, 'export const useRegister = 1\n')
  writeFileSync(typed, 'export type Login = { a: 1 }\n')
  writeFileSync(
    barrel,
    "export { useLogin } from './use-login'\nexport { useRegister as useSignUp } from './use-register'\n",
  )
  writeFileSync(
    screen,
    "import type { Login } from './types'\nimport { useLogin } from './hooks'\nexport default useLogin\n",
  )

  const graph = new SourceGraph(root)
  expect([...graph.closure([screen])].sort()).toEqual([barrel, screen, used].sort())

  writeFileSync(screen, "import { useSignUp } from './hooks'\nexport default useSignUp\n")
  graph.invalidate(screen)
  expect([...graph.closure([screen])].sort()).toEqual([barrel, screen, unused].sort())
})
