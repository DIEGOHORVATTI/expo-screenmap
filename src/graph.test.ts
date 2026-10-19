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
