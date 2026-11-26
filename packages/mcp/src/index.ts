#!/usr/bin/env bun
/**
 * The setup MCP server, on stdio: `bun packages/mcp/src/index.ts` (or `bun run mcp`) with HA_URL
 * and HA_TOKEN (an administrator's long-lived token) in the environment or the repo's .env.
 */

import { connectHomeAssistant } from '@app/ha-client';
import { createServer, serveStdio } from './server';
import { setupTools } from './tools';

const server = createServer(setupTools(connectHomeAssistant), {
	name: 'raineworks-dashboards',
	version: '1.0.0',
	instructions:
		'Sets up Raineworks Dashboards on a Home Assistant. Start with integration_status, then capability_report. Tools that change Home Assistant (label_household_lights, create_dashboard) need the user to agree first. Docs: https://github.com/raine-works/ha-dashboards/tree/master/docs',
});

await serveStdio(server.handle);
