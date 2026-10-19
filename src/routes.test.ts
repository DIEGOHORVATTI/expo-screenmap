import { describe, expect, test } from 'bun:test'

import { matchScreen, routePattern, type Screen } from './routes'

const screen = (id: string): Screen => ({ id, file: id, pattern: routePattern(id), group: 'root' })

describe('routes', () => {
  test('strips groups and index from the route pattern', () => {
    expect(routePattern('(tabs)/index')).toBe('/')
    expect(routePattern('(auth)/onboarding/index')).toBe('/onboarding')
    expect(routePattern('workout/[id]')).toBe('/workout/[id]')
  })

  test('matches static hrefs before dynamic ones and ignores the query', () => {
    const screens = [screen('workout/[id]'), screen('workout/builder'), screen('(tabs)/diet')]
    expect(matchScreen(screens, '/workout/builder')?.id).toBe('workout/builder')
    expect(matchScreen(screens, '/workout/abc')?.id).toBe('workout/[id]')
    expect(matchScreen(screens, '/(tabs)/diet?x=1')?.id).toBe('(tabs)/diet')
  })
})
