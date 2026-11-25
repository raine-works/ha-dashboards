# Development

```bash
bun install
bun run demo          # the cards on a made-up house, no Home Assistant (http://localhost:4173/?card=kitchen)
bun run dev           # build on every change into packages/dashboards/dist
bun test              # unit tests
bun run typecheck
bun run lint          # Biome, then the Tailwind lint
bun run audit:house -- --strict   # no house's entity ids or personal names in the source
```

[AGENTS.md](../AGENTS.md) describes the layout and the rules the code follows.

### Your editor

Editor settings are each person's own: `.vscode/` and `.zed/` are gitignored. What helps:
format on save with Biome (`biome.json` is the configuration), the Tailwind CSS and Bun extensions,
and, for Home Assistant YAML, the custom tags `!include`, `!include_dir_list`,
`!include_dir_merge_list`, `!include_dir_merge_named`, `!include_dir_named`, `!input` and `!secret`.

## Trying it on your Home Assistant

Put an administrator's long-lived token in `.env` (gitignored):

```bash
HA_URL=https://homeassistant.local:8123
HA_TOKEN=…
```

`bun run build` builds and uploads the bundle to the integration, which serves it at once and tells
open dashboards (`--force` uploads even when Home Assistant already serves that build).
`bun run report` lists which modules your Home Assistant would show.

## The integration

Python is pinned in `.python-version` (the release CI runs too); `uv venv` picks it up.

```bash
uv venv .venv && uv pip install -r requirements-test.txt
.venv/bin/python -m pytest -q
.venv/bin/ruff check custom_components tests && .venv/bin/ruff format custom_components tests
```

Copy `custom_components/raineworks_dashboards` into your Home Assistant's `custom_components`, with
`bun run build:integration` first so it carries a build, and restart.

## Docs

`docs/reference/` is written from the code: `bun scripts/docs.ts` after changing the modules or the
integration's options or actions (a test fails until you do).

## Releasing

Bump `version` in `custom_components/raineworks_dashboards/manifest.json` and `packages/kit/package.json`
on `master` (a test fails while they differ). Once the tests pass, the release workflow builds the bundle
into the integration, publishes the npm package `@raineworks/ha-dashboards` (`packages/kit`: `house.yaml`'s
parser, the bedtime routines and the setup MCP, bundled) at the same version with npm's trusted publishing,
then the release the Home Assistant Marketplace installs. A failed npm publish leaves no release; re-running
the workflow tries both again.
