# Setting up with an assistant

The repository has a small [MCP](https://modelcontextprotocol.io) server that lets an AI assistant
(Claude Code, Claude Desktop, or any MCP client) look at your Home Assistant and set the dashboards
up with you. It runs on your computer and talks to Home Assistant with a token you give it.

## What it can do

| Tool | Changes Home Assistant | |
| :--- | :---: | :--- |
| `integration_status` | | Is the integration installed and set up, its version, the household, your dashboards |
| `capability_report` | | Which features your house has, and what each missing one needs |
| `list_floors` | | Floors and their areas (a wall panel's `floor`, rooms without a floor) |
| `find_unlabeled_lights` | | Lights the lighting section doesn't list yet, with likely indicators flagged |
| `check_house_settings` | | Which `house` settings the dashboards understood |
| `label_household_lights` | yes | Labels lights "Household Light" |
| `create_dashboard` | yes | Creates a dashboard with the Home or wall panel card |

The assistant is told to ask you before anything that changes Home Assistant.

## Running it

You need [Bun](https://bun.sh) and a clone of this repository (`bun install` in it), and an
administrator's long-lived token (your profile in Home Assistant → Security → Long-lived access
tokens).

**Claude Code**: in the repository, add a `.mcp.json` (gitignored):

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

**Claude Desktop and other clients**: the same server, with the full path to
`packages/mcp/src/index.ts`. Instead of `env`, the server reads `HA_URL` and `HA_TOKEN` from the
repository's `.env`.

Then ask something like "Set up Raineworks Dashboards on my Home Assistant": it starts from
`integration_status` and works through what's missing.
