# expo-screenmap

A live map of every screen in an Expo Router app. It runs your app on Metro web,
screenshots each route in a phone-sized headless Chromium, draws the links between
screens and re-captures only the screens affected when you save a file.

<img width="2793" height="1644" alt="image" src="https://github.com/user-attachments/assets/d2e97145-35c5-488b-b52d-22d301bc5b76" />


- Screens come from the `app/` directory (groups, `index`, dynamic segments).
- Links come from the source: `router.push('/x')`, `href="/x"`, `pathname: '/x'`
  and, optionally, a path registry object such as `PATHS.workout.detail(id)`.
- Tab bars become dashed links between every visible tab.
- Dynamic routes (`[id]`) get real ids sniffed from your API responses.

## Requirements

- [Bun](https://bun.sh) ≥ 1.2 (the CLI runs on Bun).
- Playwright Chromium: `bunx playwright install chromium chromium-headless-shell`.
- Your app must build for web. Wrap your configs; both helpers are no-ops unless
  `SCREENMAP=1` (set by the CLI when it starts Metro), so native builds are untouched:

```ts
// app.config.ts
import { withScreenmapWeb } from 'expo-screenmap/expo'

export default withScreenmapWeb({ ...expo })
```

```js
// metro.config.js
const { withScreenmapMetro } = require('expo-screenmap/expo')

module.exports = withScreenmapMetro(getDefaultConfig(__dirname))
```

  `withScreenmapWeb` is for apps that do not ship web: it adds the `web` platform
  with `output: 'single'` under screenmap and otherwise pins `['ios', 'android']`,
  so installing `react-native-web` does not change your Expo fingerprint.
  `withScreenmapMetro` blocks `react-dom` copies built for another React version
  (Bun isolated installs link several) and lets Metro find the web deps installed
  higher up in a monorepo.

- Install the web deps where Metro can reach them:
  `bun add -d react-dom react-native-web @expo/metro-runtime` (match your React version).

## Usage

```sh
bun add -d expo-screenmap

bunx expo-screenmap login   # opens a browser, sign in, close the tab
bunx expo-screenmap         # captures everything, then watches for changes
bunx expo-screenmap --once  # captures everything and exits
```

The map is served at `http://localhost:8100`. Output (screenshots, saved session,
Metro log) goes to `.screenmap/` — add it to `.gitignore`, `auth.json` holds your
session.

## Config

`screenmap.config.ts` next to where you run the CLI (or `--config <path>`).
Paths are relative to the config file.

```ts
import { defineConfig } from 'expo-screenmap'

export default defineConfig({
  root: 'apps/mobile',
  locale: 'pt-BR',
  colorScheme: 'dark',
  storage: { language: 'pt-BR' },
  loggedOut: (screen) => screen.group === 'auth',
  pathRegistry: { file: 'src/constants/paths.ts', exportName: 'PATHS' },
  variants: {
    '(auth)/onboarding/index': [
      { name: 'goal', storage: { onboardingStep: '0' } },
      { name: 'height', storage: { onboardingStep: '1' } },
    ],
  },
  dynamicScreens: {
    'post/[id]': { sources: [{ endpoint: '/posts', pick: 'posts.0.id' }] },
    'post/edit': {
      sources: [{ endpoint: '/posts', pick: (body) => body.posts.find((p) => p.mine)?.id }],
      url: (id) => `/post/edit?id=${id}`,
    },
  },
})
```

| Option           | Default         | Description                                                             |
| ---------------- | --------------- | ----------------------------------------------------------------------- |
| `root`           | `.`             | App directory (the one with `app/` and `node_modules/.bin/expo`).       |
| `outDir`         | `.screenmap`    | Screenshots, session and logs.                                          |
| `watch`          | `['app','src']` | Directories watched for changes, relative to `root`.                    |
| `appPort`        | `8099`          | Metro web port.                                                         |
| `mapPort`        | `8100`          | Map viewer port (`SCREENMAP_PORT` overrides).                           |
| `concurrency`    | `3`             | Parallel captures.                                                      |
| `locale`         | `en-US`         | Browser locale.                                                         |
| `colorScheme`    | `light`         | `light` or `dark`.                                                      |
| `loginPath`      | `/login`        | Route opened by `expo-screenmap login`.                                 |
| `chromePath`     |                 | Chromium executable, when Playwright's cache is not found.              |
| `params`         | `{}`            | Fixed URL per screen id.                                                |
| `storage`        | `{}`            | `localStorage` entries set before every page loads.                     |
| `loggedOut`      |                 | `(screen) => boolean`: capture these screens without the saved session. |
| `variants`       |                 | Per screen id, a list of `{ name, storage?, anonymous? }` captured as separate, chained nodes (multi-step flows). |
| `pathRegistry`   |                 | Module exporting an object of paths / path builders.                    |
| `dynamicScreens` | `{}`            | Per screen id: API `sources` (`endpoint` path or RegExp, `pick` dotted path or function) and an optional `url` (defaults to the route with the id filled in). |
| `expandScreens`  |                 | `(screens, appRoot) => screens` to split a screen into variants.        |
| `extraEdges`     |                 | `(screens) => edges` for links the source scan cannot see.              |

The map reads like the app: signed-out screens first, then one row per variant
flow, then one row per tab (tab bar order) holding the screens opened from it,
each right after the screen that opens it. Screens nothing links to end up in
`unlinked`. Order between siblings follows `<Stack.Screen name>` in `_layout.tsx`.

<img width="2796" height="1649" alt="image" src="https://github.com/user-attachments/assets/dfc4a187-d9c7-4468-9146-3dd78c183888" />


## License

MIT
