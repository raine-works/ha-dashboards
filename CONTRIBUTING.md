# Contributing

Issues and pull requests are welcome. For anything larger than a fix, open an issue first so we can
agree on the approach.

## Setting up

```bash
bun install
bun run build:local && bun run demo    # the cards on the demo house: http://localhost:4173
```

You don't need any particular devices: the demo house has lights, thermostats, a lock, a garage
door, a blind, a fan, people, weather, to-do lists and a calendar. To try a change on your own Home
Assistant, see [docs/development.md](docs/development.md).

## Before a pull request

```bash
bun run lint && bun run typecheck && bun test
bun run audit:house -- --strict
```

and for the integration, `.venv/bin/ruff check custom_components tests` and
`.venv/bin/python -m pytest -q` (see the development guide for the environment).

- Read [AGENTS.md](AGENTS.md): the layout and the rules the code keeps (shadcn/ui components with
  layout-only overrides, discovery in tested pure functions, nothing specific to one house in the
  source, every feature a module).
- A new feature is a module with its detection tested; a change to the modules or the integration's
  options or actions means running `bun scripts/docs.ts`.
- Check layouts at 1280×800 and 960×600 (wall panels) and 540px wide (phones).
- Use made-up names and places in examples and tests.

By contributing you agree your work is released under the [MIT license](LICENSE).
