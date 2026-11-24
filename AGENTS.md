# AGENTS.md

A guide for developers and AI coding assistants working on Raineworks Dashboards: how the code is
laid out, how it's built, and the rules it keeps.

## Raineworks base rules

This repository follows Raineworks' base rules, in [`.raineworks/base.md`](.raineworks/base.md): read them before
changing anything. They're a copy of `base.md` in `raine-works/agents`, kept current by its sync: change them there,
not here. Where this file is more specific, it wins.

@.raineworks/base.md

## Layout

```text
ha-dashboards/
├── custom_components/raineworks_dashboards/   # the Home Assistant integration (Python, the Home Assistant Marketplace)
├── tests/                                     # the integration's tests (pytest)
├── packages/                                  # Bun workspaces
│   ├── ui/            # @app/ui: every section, dialog and primitive the cards share
│   │   └── src/
│   │       ├── components/ui/    # shadcn/ui (new-york v4) ported to Preact, plus panel extensions
│   │       ├── components/<area>/# sections and dialogs: lighting, security, climate, music, camera…
│   │       ├── context/          # HassContext (the hass store and selector hooks), house config, modules
│   │       ├── lib/              # pure logic: discovery and data shaping, unit tested
│   │       ├── panel/            # definePanelElement(): the custom element, ShadowRoot and providers
│   │       └── styles/theme.css  # the design tokens
│   ├── dashboards/    # @app/dashboards: the cards (src/home, src/wall-panel), one bundle
│   ├── dashboard-build/ # the Bun build: React Compiler, CSS into the ShadowRoot, chunks
│   ├── ha-client/     # the tools' websocket client (HA_URL / HA_TOKEN) and house snapshot
│   ├── mcp/           # the setup MCP server (stdio, no SDK): `bun run mcp`
│   └── demo/          # a made-up house and mock hass: `bun run demo`
└── scripts/           # house-audit, capability report, brand icons, holiday fixture, Tailwind lint
```

## Build, test, deploy

```bash
bun run demo            # the cards on the demo house, no Home Assistant
bun run dev             # build on every change; never deploys
bun run build:local     # build packages/dashboards/dist/dashboards.js
bun run build           # build and upload to Home Assistant (POST /api/raineworks_dashboards/bundle)
bun run build:integration  # pack the build into the integration's www/ (what a release ships)
bun test && bun run typecheck && bun run lint
bun run audit:house -- --strict   # no house's entity ids or personal names in the source
bun run report          # which modules a real Home Assistant would show
```

- **One bundle** serves every card (`dashboards-<hash>.js`, named by its content, with `.br` / `.gz`
  copies and `version.json`). The integration serves it from `/config/raineworks_dashboards/www` on
  every page (`frontend.add_extra_js_url`). A release's packaged build is copied in when it's newer;
  `bun run build` uploads one there at once. Open pages notice a new build themselves
  (`BundleUpdates`, comparing their own file with `version.json`).
- **Chunks:** code imported with `import()` becomes a chunk of its own, loaded on demand. Keep heavy
  libraries (Leaflet, Recharts) behind `import()` + `lazy`; `bundle.test.ts` budgets the bundle.
- **React Compiler** runs over every package (`REACT_COMPILER_REPORT=1` lists what it skipped). Keep
  code compilable: no ref reads or writes during render, no hooks after an early return, no
  `try`/`catch` around optional chaining in a component.
- **Dependencies** come from the root `catalog`, pinned to exact versions (`dependencies.test.ts`).
- **Releases:** bumping `custom_components/raineworks_dashboards/manifest.json`'s version on master
  publishes a release (after the tests pass) whose zip carries the built bundle.

## Themes

A theme is data (`packages/ui/src/themes`): shadcn's tokens for light and dark, the status,
chart and sidebar colors, and optional effects (a two-color gradient, edges, glow). Presets in
`themes/presets/` (Raineworks, the default; Neutral; Blue, Green, Orange, Rose, Violet).

- **The dashboards**: the card writes the active theme's tokens into its ShadowRoot
  (`themes/css.ts`) and its effects as `data-effects` on the mount point, which the effect styles
  at the end of `styles/theme.css` key off (gradient edges on primary buttons, selected toggles and
  active tabs; cards' edges on hover or focus; the glow; the header's hairline). The active theme
  (`themes/catalog.ts`): a card's `theme` option, else the theme Home Assistant applies when it's
  one of ours, else the house theme.
- **Home Assistant**: each theme becomes a full Home Assistant theme (`themes/ha-theme.ts`: hex
  where the Companion apps or `--rgb-*` need it, the primary palette, cards, inputs), written to
  the integration's `themes.json` by `bun scripts/themes.ts` (a test fails when it's stale). The
  integration (`themes.py`) registers them at runtime, again after `frontend.reload_themes`, makes
  the house theme (its Theme option) the default (again after a reload, which puts a default no YAML
  defines back to Home Assistant's own; a default set to another theme is left alone), and keeps custom themes (each person's own, or an
  administrator's for the house).
- **Picking**: the Appearance dialog (`components/appearance/`) saves a person's theme to their
  Home Assistant profile (a `settheme` event, as Home Assistant's Profile page does).
- **Making**: the theme editor (`ThemeEditor.tsx`, loaded on demand) builds a theme from choices
  (`themes/build.ts`: a starting theme, an accent color or gradient, a gray base, a radius,
  effects; shadcn CSS in and out), previews it on the real components, and saves it with its Home
  Assistant theme generated in the browser (`raineworks_dashboards/themes/save`). Each effect reads
  its own colors (`--edge-from/to`, `--glow-from/to`, falling back to the gradient), since the page's
  `data-effects` reaches into a preview: the preview makes the ones its theme lacks transparent.
- Statuses keep their own colors in every theme; the gradient is decoration, never a status.
  Effects can't use `@property` (it doesn't work in a ShadowRoot): edges fade with opacity.

## No house in the source

The dashboards name no entity of any particular house. They discover (`lib/`), then read what
discovery can't tell from the house settings: the integration's options, under a card's `house`
YAML option, which wins key by key (`lib/house-config.ts`, `useHouseConfig()`). A new
house-specific value is a house setting, never a literal. `bun run audit:house` finds entity ids and
personal names (from a gitignored `.house-terms` list); a discovery convention carries
`// house-audit: discovery`. Examples and tests use made-up names.

**Modules** (`lib/modules.ts`): every feature has an id, what it needs, and a `detect()` over the
states and registries the frontend has. A module is on while detected and not turned off
(`house.modules`). Gate its UI with `<ModuleGate id="…">` or `useModule(id)`; a new feature is a new
module, with its detection tested.

## Rules

### Components (shadcn/ui, Preact)
- `components/ui/*` mirrors shadcn **new-york v4** (classes, variants, `data-slot`), ported to
  `preact/compat` without Radix: stateful primitives are small hand-written equivalents keeping
  shadcn's markup and `data-state`. Add primitives by porting shadcn's source.
- A consumer's `className` is for layout only. A new look is a new variant.
- Theme tokens only (`bg-background`, `text-muted-foreground`, status tokens `success`, `warning`,
  `info`, `alarm`), never raw palette colors for surfaces and text.
- Dialog sizes: `workspace` for feature dialogs, `default` for confirmations and pickers, `sheet`
  for a picker that rises from the bottom edge on phones (`default` elsewhere), `compact` for a
  narrow column (the alarm keypad), `fullscreen` for the whole screen under the toolbar (Party
  mode). A dialog never sets its own width or height.
- Buttons never squish: share a row with `flex-1`, never equal grid columns.
- Wall panels are a size up for fingers (`touch:` variant, nothing under 44px). Check layouts at
  1280×800 and 960×600, and phones at 540px wide.
- Words: dialog titles in Title Case, everything else sentence case, "…" never "...".

### Shadow DOM
- Each card renders in a ShadowRoot with its CSS injected. Tailwind's `@property` fallbacks are
  unwrapped at build time; fonts are registered on the document (`panel/fonts.ts`).
- Dialogs portal into the mount point (`DialogPortalContainer`), never `document.body`.
- Nothing renders over Home Assistant's toolbar but an open dialog's overlay; heights use
  `--panel-height`, never `vh`.

### Discovery and data (`lib/`)
- Discovery and data shaping are pure functions in `packages/ui/src/lib/`, tested in
  `lib/__tests__/` against made-up houses (`house-fixture.ts`).

### Real time and resilience
- **Subscribe to what you show.** The card's `hass` goes into a store; components select from it
  (`useEntity`, `useHassSelector` with a narrow `watch`), never the whole `hass`.
- **Every tap shows something at once:** optimistic state (`useOptimistic`) or a busy button
  (`useBusy` + `waitFor`) until Home Assistant reports the effect.
- **A crash stays local:** every section and dialog sits in an `ErrorBoundary`.
- **Failed service calls say so** (`useHassApi().callService` toasts them).
- Never open Home Assistant's own more-info dialogs; build a panel dialog instead.

## The integration

`custom_components/raineworks_dashboards` (Python 3.14, Home Assistant 2026.10+):

- `serve.py` / `bundle.py`: the served bundle and the admin-only upload
- `websocket_api.py`, `household.py`: `raineworks_dashboards/info` (the household and house settings)
- `panels.py`, `hardware.py`, `status_light.py`: wall panels as config subentries and their hardware
- `switch.py`, `datetime.py`, `binary_sensor.py`, `sensor.py`: bedtime, the holiday mute, lock
  faults, affirmations
- `notify.py`, `announce.py`, `todo.py`, `printer.py`, `clips.py`: actions and the clip upload
- `push.py`: each household member's phone alerts (push categories `notify_people` skips for them;
  Security always comes through), see [docs/phone-alerts.md](docs/phone-alerts.md)

Tests: `.venv/bin/python -m pytest -q`; lint: `.venv/bin/ruff check custom_components tests` and
`ruff format`. Each test has its own `/config` (`tests/conftest.py`).
