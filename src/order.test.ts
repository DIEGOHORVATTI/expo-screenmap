import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { discoverScreens } from './routes'
import { orderByLayouts } from './order'

test('orders screens the way their layouts declare them', () => {
  const appDir = mkdtempSync(join(tmpdir(), 'screenmap-order-'))
  mkdirSync(join(appDir, '(auth)/onboarding'), { recursive: true })
  const files = {
    '(auth)/_layout.tsx': `<Stack><Stack.Screen name="welcome" /><Stack.Screen name="login" /><Stack.Screen name="onboarding" /></Stack>`,
    '(auth)/welcome.tsx': '',
    '(auth)/login.tsx': '',
    '(auth)/forgot.tsx': '',
    '(auth)/onboarding/index.tsx': '',
  }
  for (const [file, source] of Object.entries(files)) writeFileSync(join(appDir, file), source)
  expect(orderByLayouts(appDir, discoverScreens(appDir)).map((s) => s.id)).toEqual([
    '(auth)/welcome',
    '(auth)/login',
    '(auth)/onboarding/index',
    '(auth)/forgot',
  ])
})
