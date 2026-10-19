import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'bun:test'

import { loadConfig } from './config'

test('resolves paths relative to the config file and fills defaults', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'screenmap-'))
  writeFileSync(
    join(dir, 'screenmap.config.ts'),
    "export default { root: 'apps/mobile', appPort: 9000, locale: 'pt-BR' }",
  )

  const config = await loadConfig(join(dir, 'nested'), join(dir, 'screenmap.config.ts'))

  expect(config.appRoot).toBe(join(dir, 'apps/mobile'))
  expect(config.appDir).toBe(join(dir, 'apps/mobile/app'))
  expect(config.outDir).toBe(join(dir, '.screenmap'))
  expect(config.appOrigin).toBe('http://localhost:9000')
  expect(config.locale).toBe('pt-BR')
  expect(config.colorScheme).toBe('light')
  expect(config.concurrency).toBe(3)
})
