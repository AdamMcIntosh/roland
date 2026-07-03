/**
 * MCP Server Implementation (v2)
 *
 * Roland MCP Server — exposes cost routing, analytics, budget management,
 * and recipe execution as MCP tools for IDE agents (VS Code, Cursor, etc.).
 *
 * Tools provided:
 *   health_check    — server status
 *   triage          — auto-pilot: analyze message → agent + recipe recommendation
 *   route_model     — complexity-based model recommendation
 *   track_cost      — log token usage and return session totals
 *   manage_budget   — get/set/reset spending limits
 *   get_analytics   — session cost & token breakdowns
 *   suggest_mode    — advisory: quick vs. standard vs. deep
 *   list_recipes    — available workflow recipes
 *   start_recipe    — begin a recipe session, return first step prompt
 *   advance_recipe  — submit step output, get next step or summary
 *   preview_changes — generate markdown diff + optional HTML preview of file changes
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
export declare function buildGeneralMcpHttpEntry(baseUrl?: string): Record<string, unknown>;
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
    private registerTools;
    private registerHealthCheck;
    /**
     * Agent metadata for triage matching.
     * Each entry maps an agent name to its role description and keyword triggers.
     */
    private static readonly AGENT_CATALOG;
    /**
     * Recipe metadata for triage matching.
     */
    private static readonly RECIPE_CATALOG;
    private registerTriage;
    /**
     * Build human-readable reasoning for the triage decision.
     */
    private buildTriageReasoning;
    /**
     * Resolve the agents directory. Delegates to the shared implementation in loadConfig.ts.
     */
    private static resolveAgentsDir;
    /**
     * Load the role_prompt from an agent's YAML file.
     * Returns a fallback prompt if the file doesn't exist.
     */
    private loadAgentRolePrompt;
    private registerRouteModel;
    private registerTrackCost;
    private registerManageBudget;
    private registerGetAnalytics;
    private registerSuggestMode;
    private registerListRecipes;
    /**
     * Scan the recipes/ directory and parse each YAML for name/description/agents.
     */
    private scanRecipeFiles;
    private registerStartRecipe;
    private registerAdvanceRecipe;
    private registerSessionContext;
    private registerProjectContext;
    private registerQualitySignal;
    private parseRecipeForSession;
    private setupHandlers;
    private registerLoadMigrationContext;
    private registerUpdateMigrationContext;
    private registerPreviewChanges;
    start(options?: {
        maxConnectRetries?: number;
    }): Promise<void>;
    /** Connect an arbitrary MCP transport (HTTP Streamable, stdio, etc.). */
    connectTransport(transport: Transport, mode?: 'stdio' | 'http'): Promise<void>;
    private connectStdioTransport;
    private startDiffStreamSidecar;
    isShuttingDown(): boolean;
    isConnected(): boolean;
    private registerGitTools;
    private registerAnalyzeScreenshot;
    private registerReadContext;
    stop(): Promise<void>;
    /** Shared schema fragment for project-scoped MCP tools. */
    private static readonly PROJECT_CONTEXT_SCHEMA;
    private resolveToolProjectContext;
    private scopedCoordination;
    private scopedLeadPm;
    private registerCoordinationTools;
    private registerPmTools;
    private registerChatTools;
    registerTool(name: string, description: string, handler: (args: Record<string, unknown>) => Promise<unknown>, inputSchema?: Record<string, unknown>): void;
    getTool(name: string): ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
    getTools(): string[];
    getConfig(): AppConfig;
    getServer(): Server;
    /**
     * Resolve the recipes directory relative to this file's location.
     * Search order:
     *   1. <installDir>/dist/recipes  (bundled in dist after build)
     *   2. <installDir>/recipes       (development / source layout)
     *   3. process.cwd()/recipes      (legacy fallback)
     */
    private static resolveRecipesDir;
    /**
     * Return the resolved Roland installation root directory.
     * Useful for other tools that need to locate bundled assets.
     */
    static getRolandRoot(): string;
}
/** Run Roland as a stdio MCP server — used by `npm run mcp`, Cursor, and `roland serve`. */
export declare function runMcpServer(): Promise<void>;
//# sourceMappingURL=mcp-server.d.ts.map