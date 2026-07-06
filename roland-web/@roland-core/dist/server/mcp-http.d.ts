/**
 * ## P0 Security & Context Fixes (v1.4.0)
 *
 * ## MCP Server Implementation
 *
 * General-purpose HTTP MCP transport for Roland.
 *
 * Exposes the standard MCP Streamable HTTP protocol at `/mcp` so external
 * clients (Hermes, Claude Desktop HTTP mode, custom agents) can discover and
 * invoke Roland tools without the Cursor stdio integration.
 *
 * Endpoints:
 *   GET  /mcp         → discovery metadata (plain GET) or MCP SSE stream
 *   POST /mcp         → MCP JSON-RPC (initialize, tools/list, tools/call, …)
 *   DELETE /mcp       → session teardown (MCP protocol)
 *   GET  /mcp/health  → liveness + tool count
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
/** Roland MCP HTTP server metadata version (matches package). */
export declare const MCP_HTTP_SERVER_VERSION: string;
export interface McpHttpOptions {
    /** Base path prefix, default `/mcp`. */
    basePath?: string;
    /** Public URL shown in discovery (default derived from host/port). */
    publicUrl?: string;
    /** Bind address — used to decide whether bearer auth is required. */
    bindHost?: string;
}
/** True when the server listens on all interfaces (LAN / Tailscale). */
export declare function isPublicMcpBind(host: string): boolean;
/** Bearer token required on public bind or when ROLAND_MCP_TOKEN is set. */
export declare function mcpHttpRequiresToken(host: string): boolean;
export type McpHttpAuthResult = {
    ok: true;
} | {
    ok: false;
    status: 401;
    message: string;
};
/** Validate Authorization bearer token when auth is required for this bind. */
export declare function authorizeMcpHttpRequest(req: IncomingMessage, bindHost: string): McpHttpAuthResult;
export interface McpHttpDiscovery {
    name: string;
    version: string;
    protocol: 'streamable-http';
    protocolVersion: '2025-11-25';
    endpoint: string;
    health: string;
    transport: string;
    tools_count: number;
    instructions: string;
    cursor_stdio: string;
}
/**
 * Build discovery payload for plain GET /mcp (non-protocol clients like curl / Hermes setup).
 */
export declare function buildMcpDiscovery(options?: McpHttpOptions): Promise<McpHttpDiscovery>;
/** Health check payload for GET /mcp/health. */
export declare function buildMcpHealth(): Promise<{
    status: 'healthy';
    server: string;
    version: string;
    protocol: string;
    tools_count: number;
    active_sessions: number;
    timestamp: string;
}>;
/**
 * Handle MCP Streamable HTTP traffic (GET/POST/DELETE on /mcp).
 * Returns true when the request was handled.
 */
export declare function handleMcpHttpRequest(req: IncomingMessage, res: ServerResponse, parsedBody?: unknown, options?: McpHttpOptions): Promise<void>;
/** Route matcher — returns 'health' | 'mcp' | null. */
export declare function matchMcpHttpPath(urlPath: string, basePath?: string): 'health' | 'mcp' | null;
/** Standalone HTTP MCP server on host:port (roland mcp / roland serve --mcp). */
export declare function runMcpHttpServer(options?: {
    host?: string;
    port?: number;
    basePath?: string;
}): Promise<import('node:http').Server>;
/** Build Hermes / general HTTP MCP client config snippet. */
export declare function buildGeneralMcpClientConfig(baseUrl: string, options?: {
    token?: string;
}): Record<string, unknown>;
//# sourceMappingURL=mcp-http.d.ts.map