/**
 * ## P0 Security & Context Fixes (v1.4.0)
 *
 * MCP Server Implementation (v2) *
 * Roland MCP Server — exposes cost routing, analytics, budget management,
 * and recipe execution as MCP tools for IDE agents (VS Code, Cursor, etc.).
 *
 * Tool registration is delegated to src/server/tools/* modules.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { AppConfig } from '../utils/types.js';
/** Read-only / low-risk tools safe for Cursor autoApprove in ~/.cursor/mcp.json */
export declare const MCP_AUTO_APPROVE_TOOLS: readonly ["health_check", "roland_hello", "board_status", "hitl_status", "poll_hitl_events", "mission_summary", "report_completion", "pm_standup", "triage", "list_team", "list_team_recipes", "list_recipes", "get_team_context", "get_pm_playbook", "get_team_usage", "get_pm_events", "get_analytics", "suggest_mode", "route_model", "blackboard_read", "bus_poll", "git_status", "git_diff", "git_log", "read_context"];
/** Resolve the built MCP server entry (dist/server/mcp-server.js). */
export declare function resolveMcpServerEntry(): string;
export interface McpServerOptions {
    /** Skip diff-stream sidecar (ephemeral HTTP sessions). */
    skipSidecars?: boolean;
}
/** Build the `mcpServers.roland` block for ~/.cursor/mcp.json (stdio — Cursor / VS Code). */
export declare function buildCursorMcpServerEntry(options?: {
    rolandRoot?: string;
    projectRoot?: string;
    includeAutoApprove?: boolean;
}): Record<string, unknown>;
/** Build HTTP MCP client config for Hermes and other Streamable HTTP clients. */
export declare function buildGeneralMcpHttpEntry(baseUrl?: string, options?: {
    token?: string;
}): Record<string, unknown>;
export declare class McpServer {
    private server;
    private config;
    private tools;
    private toolDefinitions;
    private costTracker;
    private recipeSessionManager;
    private sessionContextManager;
    private projectContextManager;
    private qualityTracker;
    private coordination;
    private leadPm;
    private readonly leadPmOpts;
    private recipesDir;
    private transport;
    private shuttingDown;
    private connected;
    private transportMode;
    private readonly skipSidecars;
    constructor(config: AppConfig, options?: McpServerOptions);
    private buildToolContext;
    private setupHandlers;
    start(options?: {
        maxConnectRetries?: number;
    }): Promise<void>;
    connectTransport(transport: Transport, mode?: 'stdio' | 'http'): Promise<void>;
    private connectStdioTransport;
    private startDiffStreamSidecar;
    stop(): Promise<void>;
    isShuttingDown(): boolean;
    isConnected(): boolean;
    registerTool(name: string, description: string, handler: (args: Record<string, unknown>) => Promise<unknown>, inputSchema?: Record<string, unknown>): void;
    getTool(name: string): ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
    getTools(): string[];
    getConfig(): AppConfig;
    getServer(): Server;
    /** Invoke a tool with project-context scoping (same path as MCP CallTool). */
    callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
    private resolveToolProjectContext;
    private scopedCoordination;
    private scopedLeadPm;
    /** Return the resolved Roland installation root directory. */
    static getRolandRoot(): string;
}
/** Run Roland as a stdio MCP server — used by `npm run mcp`, Cursor, and `roland serve`. */
export declare function runMcpServer(): Promise<void>;
//# sourceMappingURL=mcp-server.d.ts.map