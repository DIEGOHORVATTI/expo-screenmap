import { expect, test } from 'bun:test'

import type { Screen } from './routes'
import { applyRules, variantEdges } from './variants'

const screen = (id: string, group = 'auth'): Screen => ({ id, file: id, pattern: `/${id}`, group })

test('splits a screen into chained variants and signs out the rest of the group', () => {
  const variants = { flow: [{ name: 'a' }, { name: 'b', storage: { step: '1' } }] }
  const screens = applyRules([screen('flow'), screen('login'), screen('home', 'tabs')], {
    variants,
    loggedOut: (s) => s.group === 'auth',
  })
  expect(screens.map((s) => [s.id, !!s.anonymous])).toEqual([
    ['flow', false],
    ['flow#1-b', false],
    ['login', true],
    ['home', false],
  ])
  expect(screens[1].storage).toEqual({ step: '1' })
  expect(variantEdges(screens, variants)).toEqual([{ from: 'flow', to: 'flow#1-b' }])
})
