/**
 * A Model Context Protocol server over stdio, small enough to need no SDK: newline-delimited
 * JSON-RPC 2.0 with the methods a tools-only server answers (initialize, ping, tools/list,
 * tools/call). The SDK's other transports (HTTP, SSE, OAuth) would bring Express and Hono along
 * for nothing. `handle()` is pure: one message in, its response (or none, for a notification) out.
 */

/** The MCP protocol version the server speaks, answered to `initialize`. */
export const PROTOCOL_VERSION = '2025-06-18';

/** A JSON Schema for a tool's arguments. */
export type InputSchema = {
	type: 'object';
	properties?: Record<string, unknown>;
	required?: string[];
	additionalProperties?: boolean;
};

/** One tool the server offers (`tools/list`) and runs (`tools/call`). */
export interface Tool {
	/** Its name, unique on the server. */
	name: string;
	/** What it does and when to use it, for the assistant. */
	description: string;
	/** Its arguments. */
	inputSchema: InputSchema;
	/** True when it changes Home Assistant (shown to the assistant as not read-only). */
	writes?: boolean;
	/** Its result as text (JSON for data); throws for a failure the assistant should see. */
	run: (args: Record<string, unknown>) => Promise<string>;
}

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type Response = { jsonrpc: '2.0'; id: string | number | null } & (
	| { result: unknown }
	| { error: { code: number; message: string } }
);

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INVALID_REQUEST = -32600;

/**
 * A server offering `tools`, introduced by `info` on `initialize`. Its `handle()` answers one
 * message: a JSON-RPC error for an unknown method or tool or bad arguments, a tool's thrown
 * failure as an `isError` result, and nothing for a notification.
 */
export function createServer(tools: Tool[], info: { name: string; version: string; instructions?: string }) {
	const byName = new Map(tools.map((tool) => [tool.name, tool]));

	async function handle(message: Message): Promise<Response | undefined> {
		// A notification (no id) gets no answer
		if (message.id === undefined) return undefined;
		const id = message.id;
		const ok = (result: unknown): Response => ({ jsonrpc: '2.0', id, result });
		const fail = (code: number, text: string): Response => ({ jsonrpc: '2.0', id, error: { code, message: text } });

		switch (message.method) {
			case 'initialize':
				return ok({
					protocolVersion: PROTOCOL_VERSION,
					capabilities: { tools: {} },
					serverInfo: { name: info.name, version: info.version },
					...(info.instructions ? { instructions: info.instructions } : {}),
				});
			case 'ping':
				return ok({});
			case 'tools/list':
				return ok({
					tools: tools.map(({ name, description, inputSchema, writes }) => ({
						name,
						description,
						inputSchema,
						annotations: { readOnlyHint: !writes },
					})),
				});
			case 'tools/call': {
				const name = message.params?.name;
				const tool = typeof name === 'string' ? byName.get(name) : undefined;
				if (!tool) return fail(INVALID_PARAMS, `No tool named ${String(name)}`);
				const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
				for (const key of tool.inputSchema.required ?? [])
					if (args[key] === undefined) return fail(INVALID_PARAMS, `${tool.name} needs ${key}`);
				try {
					return ok({ content: [{ type: 'text', text: await tool.run(args) }] });
				} catch (err) {
					// A tool's own failure is a result the assistant reads, not a protocol error
					return ok({ content: [{ type: 'text', text: (err as Error).message }], isError: true });
				}
			}
			case undefined:
				return fail(INVALID_REQUEST, 'No method');
			default:
				return fail(METHOD_NOT_FOUND, `Unknown method ${message.method}`);
		}
	}

	return { handle };
}

/** Serves `handle` on stdin/stdout, one JSON message a line, until stdin ends. */
export async function serveStdio(handle: (m: Message) => Promise<Response | undefined>) {
	const decoder = new TextDecoder();
	let buffered = '';
	const reply = (response: Response | undefined) => {
		if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
	};
	const reader = Bun.stdin.stream().getReader();
	for (;;) {
		const { value: chunk, done } = await reader.read();
		if (done) break;
		buffered += decoder.decode(chunk, { stream: true });
		let newline = buffered.indexOf('\n');
		while (newline >= 0) {
			const line = buffered.slice(0, newline).trim();
			buffered = buffered.slice(newline + 1);
			if (line) {
				let message: Message | undefined;
				try {
					message = JSON.parse(line) as Message;
				} catch {
					reply({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
				}
				// Answered as they finish; a slow tool doesn't hold up a ping
				if (message) void handle(message).then(reply);
			}
			newline = buffered.indexOf('\n');
		}
	}
}
