import { expect, test } from 'bun:test'

import { parseTabEntries } from './tabs'

test('reads layout tabs and flags hidden ones', () => {
  const layout = `
    <SwipeTabs.Screen name="index" options={{ title: 'a' }} />
    <SwipeTabs.Screen
      name="plans"
      options={{ tabBarHidden: true }}
    />
    <Tabs.Screen name="diet" options={{ href: null }} />
  `
  expect(parseTabEntries(layout)).toEqual([
    { name: 'index', hidden: false },
    { name: 'plans', hidden: true },
    { name: 'diet', hidden: true },
  ])
})
