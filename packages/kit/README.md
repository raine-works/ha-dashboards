# @raineworks/ha-dashboards

What a house's own Home Assistant config repository needs from [Raineworks Dashboards](https://github.com/raine-works/ha-dashboards),
released with the integration, the same version.

- **`@raineworks/ha-dashboards/house`**: `parseHouseConfig()` (the parser the dashboards read a card's `house`
  option with, so a test can check `house.yaml` loses nothing to it), `mergeHouseSources()`, and the bedtime
  routines (`HOME_ROUTINE`, `BEDTIME_STEP_KINDS`), to check a house's bedtime automations against.
- **`raineworks-dashboards-mcp`**: the setup MCP server (stdio), for an AI assistant to check and set up the
  dashboards on a Home Assistant. The integration has the same tools built in, served by Home Assistant's own MCP
  server and always its version ([Setting up with an assistant](https://github.com/raine-works/ha-dashboards/blob/master/docs/assistant.md)):
  prefer those. It reads `HA_URL` and `HA_TOKEN` (an administrator's long-lived token) from the
  environment or the `.env` of the folder it's run in. In an MCP client's config:

  ```json
  { "command": "bunx", "args": ["--bun", "raineworks-dashboards-mcp"] }
  ```

Needs [Bun](https://bun.sh) 1.4.5 or later. Pin it to an exact version.
