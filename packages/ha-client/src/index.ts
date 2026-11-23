/**
 * The repo's tools talk to Home Assistant through this: the loader sync, the capability report and
 * the setup MCP. Where Home Assistant is and how to sign in come from the environment, never the
 * source: HA_URL (https://homeassistant.local:8123) and HA_TOKEN (a long-lived token), else
 * HA_MCP_CONFIG, an MCP client's config whose `homeassistant` server holds HOMEASSISTANT_TOKEN.
 * A `.env` at the repo's root (gitignored) is read too, since workspace scripts run in their own
 * package's folder, where Bun's own .env loading doesn't look.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ENV = resolve(import.meta.dir, '../../../.env');

/** KEY=VALUE lines (quotes trimmed, `#` comments skipped). */
export function parseEnv(text: string): Record<string, string> {
	const env: Record<string, string> = {};
	for (const line of text.split('\n')) {
		const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
		if (!match || line.trim().startsWith('#')) continue;
		env[match[1] as string] = (match[2] as string).replace(/^(['"])(.*)\1$/, '$2');
	}
	return env;
}

let repoEnv: Record<string, string> | undefined;
/** A setting from the environment, else the repo's .env. */
export function setting(name: string): string | undefined {
	if (Bun.env[name]) return Bun.env[name];
	repoEnv ??= existsSync(REPO_ENV) ? parseEnv(readFileSync(REPO_ENV, 'utf8')) : {};
	return repoEnv[name] || undefined;
}

/** Home Assistant's base URL (no trailing slash), or undefined when HA_URL isn't set. */
export const homeAssistantUrl = () => setting('HA_URL')?.replace(/\/+$/, '');

/**
 * A long-lived Home Assistant token: HA_TOKEN, else the one in HA_MCP_CONFIG (undefined when
 * neither has one). Throws when HA_MCP_CONFIG names a file that isn't JSON.
 */
export function homeAssistantToken(): string | undefined {
	const token = setting('HA_TOKEN');
	if (token) return token;
	const config = setting('HA_MCP_CONFIG');
	if (!config || !existsSync(config)) return undefined;
	const parsed = JSON.parse(readFileSync(config, 'utf8'));
	return parsed?.mcpServers?.homeassistant?.env?.HOMEASSISTANT_TOKEN ?? undefined;
}

/** A signed-in websocket connection to Home Assistant (`connectHomeAssistant`). */
export interface HomeAssistantConnection {
	/** One websocket command (its `id` added); resolves with its result, rejects with its error. */
	call<T = unknown>(message: Record<string, unknown>): Promise<T>;
	/** Close the websocket; calls still waiting reject. */
	close(): void;
}

/** Signs in over the websocket; rejects without HA_URL or a token, or when Home Assistant refuses. */
export function connectHomeAssistant(timeoutMs = 10_000): Promise<HomeAssistantConnection> {
	const url = homeAssistantUrl();
	const token = homeAssistantToken();
	if (!url) return Promise.reject(new Error('Set HA_URL to your Home Assistant (in the environment or .env)'));
	if (!token) return Promise.reject(new Error('Set HA_TOKEN to a long-lived Home Assistant token'));

	return new Promise((resolveConnection, rejectConnection) => {
		const ws = new WebSocket(`${url.replace(/^http/, 'ws')}/api/websocket`);
		let nextId = 1;
		const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
		const timer = setTimeout(() => {
			ws.close();
			rejectConnection(new Error(`No answer from Home Assistant at ${url}`));
		}, timeoutMs);

		const connection: HomeAssistantConnection = {
			call: <T>(message: Record<string, unknown>) =>
				new Promise<T>((resolve, reject) => {
					const id = nextId++;
					pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
					ws.send(JSON.stringify({ ...message, id }));
				}),
			close: () => ws.close(),
		};

		ws.onmessage = (event) => {
			const msg = JSON.parse(String(event.data));
			if (msg.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: token }));
			else if (msg.type === 'auth_invalid') {
				clearTimeout(timer);
				ws.close();
				rejectConnection(new Error('Home Assistant refused the token'));
			} else if (msg.type === 'auth_ok') {
				clearTimeout(timer);
				resolveConnection(connection);
			} else if (msg.type === 'result' && pending.has(msg.id)) {
				const call = pending.get(msg.id);
				pending.delete(msg.id);
				if (msg.success) call?.resolve(msg.result);
				else call?.reject(new Error(msg.error?.message ?? 'Home Assistant refused the command'));
			}
		};
		ws.onerror = () => {
			clearTimeout(timer);
			rejectConnection(new Error(`Couldn't reach Home Assistant at ${url}`));
		};
		ws.onclose = () => {
			for (const call of pending.values()) call.reject(new Error('Home Assistant closed the connection'));
			pending.clear();
		};
	});
}
