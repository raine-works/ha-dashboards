# Setting up with an assistant

The integration comes with setup tools that let an AI assistant (Claude, ChatGPT, or any app or agent
that speaks [MCP](https://modelcontextprotocol.io)) look at your Home Assistant and set the dashboards up
with you. Home Assistant's own **Model Context Protocol Server** serves them, so there's nothing to
install on your computer, and they're always the version of the integration you have: upgrading it in the
Marketplace upgrades them too.

## What it can do

From an empty dashboard list to Home Assistant's whole interface replaced: the Home dashboard as
everyone's landing page, the house theme on every page, a wall panel on each tablet, and the lights in
their rooms.

| Tool | Changes Home Assistant | |
| :--- | :---: | :--- |
| `integration_status` | | The integration's version, the household, its house settings, each dashboard with the custom cards it uses, the default dashboard, the house theme and the themes to pick from, and the wall panels |
| `capability_report` | | Which features your house has, and what each missing one needs |
| `list_floors` | | Floors and their areas (a wall panel's `floor`, rooms without a floor) |
| `find_unlabeled_lights` | | Lights the lighting section doesn't list yet, with likely indicators flagged |
| `check_house_settings` | | Which `house` settings the dashboards understood |
| `find_wall_panel_devices` | | Tablets the integration can drive (a wake or screen control, a restart button, a status light), and which are wall panels already |
| `label_household_lights` | yes | Labels lights "Household Light" |
| `create_dashboard` | yes | Creates a dashboard with the Home or wall panel card |
| `set_default_dashboard` | yes | Makes a dashboard everyone's default, the page Home Assistant opens on (anyone who picked their own in their profile keeps it) |
| `set_house_theme` | yes | The house theme, for the dashboards and Home Assistant's own pages, for anyone without one of their own |
| `add_wall_panel` | yes | A tablet end to end: its dashboard, and its device registered for its status light and wake on the doorbell |

The assistant is told to ask you before anything that changes Home Assistant. Only an administrator can use
the tools: they read the registries, and the ones that change things go through Home Assistant's own
commands or the integration's own settings, as you, with the checks its own UI makes.

A tablet still needs signing in as the user the panels share, and its kiosk browser pointed at its
dashboard: that's done on the tablet ([Wall panels](wall-panels.md)).

## Connecting an assistant

1. **Install the integration** and add it (see [Installation](installation.md)).
2. **Add Home Assistant's MCP server**: Settings → Devices & services → Add integration → **Model Context
   Protocol Server**. It's part of Home Assistant; nothing to download.
3. **Make a token**: your profile in Home Assistant → Security → **Long-lived access tokens** → Create
   token. It has to be an administrator's. Keep it like a password.
4. **Point the assistant at** `https://<your Home Assistant>/api/mcp/raineworks_dashboards_setup`, with the
   token as a bearer token. That address serves only the setup tools, whatever else the MCP server exposes.

**Claude Code:**

```bash
claude mcp add --transport http raineworks-dashboards \
  https://homeassistant.example.com/api/mcp/raineworks_dashboards_setup \
  --header "Authorization: Bearer $HA_TOKEN"
```

**Other clients** take the same address and header in their MCP settings, usually as:

```json
{
  "mcpServers": {
    "raineworks-dashboards": {
      "type": "http",
      "url": "https://homeassistant.example.com/api/mcp/raineworks_dashboards_setup",
      "headers": { "Authorization": "Bearer ${HA_TOKEN}" }
    }
  }
}
```

Keep the token in an environment variable, as here, so a config file you commit has nothing secret in it.
An assistant that can sign in with OAuth can use Home Assistant's own login instead of a token: see
Home Assistant's [MCP Server documentation](https://www.home-assistant.io/integrations/mcp_server/).

Then ask something like "Set up Raineworks Dashboards on my Home Assistant and make it my whole
interface": it starts from `integration_status` and works through what's missing.

The MCP server's own address, `/api/mcp`, serves every LLM API it's set to expose (all of them, by
default), the setup tools among them as **Raineworks Dashboards setup**. The same tools also show up
wherever Home Assistant lets you pick an LLM API for a conversation agent; they refuse anyone who isn't an
administrator, voice satellites included.

## From a clone, or your configuration repository

The repository also has the same tools as a small MCP server you run yourself, from a clone or from the
[`@raineworks/ha-dashboards`](https://www.npmjs.com/package/@raineworks/ha-dashboards) package. Unlike the
integration's, it has to be kept at the version of the integration you have installed. Prefer the
integration's; this one stays for now for setups already using it.

You need [Bun](https://bun.sh) and an administrator's long-lived token.

**From a clone** (`bun install` in it), in a `.mcp.json` (gitignored) for Claude Code:

```json
{
  "mcpServers": {
    "raineworks-dashboards": {
      "command": "bun",
      "args": ["packages/mcp/src/index.ts"],
      "env": { "HA_URL": "http://homeassistant.local:8123", "HA_TOKEN": "${HA_TOKEN}" }
    }
  }
}
```

Other clients take the full path to `packages/mcp/src/index.ts`; instead of `env`, the server reads
`HA_URL` and `HA_TOKEN` from the repository's `.env`.

**From your own configuration repository** (with [GitOps](https://github.com/raine-works/ha-gitops), say):
add the package, pinned to the version you have installed, and run the server from it. It reads `HA_URL`
and `HA_TOKEN` from the environment or that repository's `.env` (gitignored):

```bash
bun add --dev --exact @raineworks/ha-dashboards@<version>
```

```json
{
  "mcpServers": {
    "raineworks-dashboards": {
      "command": "bunx",
      "args": ["--bun", "raineworks-dashboards-mcp"],
      "env": { "HA_URL": "https://homeassistant.example.com" }
    }
  }
}
```

The package also has the parser the dashboards read `house.yaml` with (`@raineworks/ha-dashboards/house`), for a
test that your settings lose nothing to it. Each release of the integration publishes it, the same version.

## How the two stay the same

The integration's tools are Python (`llm_api.py`, `modules.py`); the dashboards' feature detection and
house settings parser are TypeScript. `modules.json`, shipped with the integration, carries each feature's
name and what it needs, written from the TypeScript, and the Python detection is tested against made-up
houses with the TypeScript's answers (`tests/fixtures/modules.json`). `bun scripts/modules-fixture.ts`
writes both after a change to `lib/modules.ts` or `lib/house-config.ts`, and a test fails until you do.
