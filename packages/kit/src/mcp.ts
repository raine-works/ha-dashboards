#!/usr/bin/env bun
/**
 * The setup MCP server, published as the `raineworks-dashboards-mcp` command: HA_URL and HA_TOKEN (an
 * administrator's long-lived token) from the environment, or the `.env` of the folder it's run in.
 *
 * @module
 */

import '@app/mcp';
