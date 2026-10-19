# expo-screenmap

A live map of every screen in an Expo Router app. It runs your app on Metro web,
screenshots each route in a phone-sized headless Chromium, draws the links between
screens and re-captures only the screens affected when you save a file.

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

  `withScreenmapWeb` adds the `web` platform with `output: 'single'`.
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
  pathRegistry: { file: 'src/constants/paths.ts', exportName: 'PATHS' },
  params: { 'settings/[tab]': '/settings/profile' },
  dynamicScreens: {
    'post/[id]': {
      sources: [{ endpoint: /^\/posts\?/, pick: (body: any) => body?.posts?.[0]?.id }],
      url: (id) => `/post/${id}`,
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
| `pathRegistry`   |                 | Module exporting an object of paths / path builders.                    |
| `dynamicScreens` | `{}`            | Per screen id: API `sources` to sniff an id from and the `url` to open. |
| `expandScreens`  |                 | `(screens, appRoot) => screens` to split a screen into variants.        |
| `extraEdges`     |                 | `(screens) => edges` for links the source scan cannot see.              |

A screen variant can set `anonymous: true` (captured without the saved session)
and `storage` (`localStorage` entries applied before the page loads) — useful
for multi-step flows such as onboarding.

<img width="2796" height="1649" alt="image" src="https://github.com/user-attachments/assets/dfc4a187-d9c7-4468-9146-3dd78c183888" />


## License

MIT
