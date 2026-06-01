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
import { AppConfig } from '../utils/types.js';
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
    private recipesDir;
    constructor(config: AppConfig);
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
    private registerRunGooseTask;
    private registerPreviewChanges;
    start(): Promise<void>;
    private registerGitTools;
    private registerAnalyzeScreenshot;
    private registerReadContext;
    stop(): Promise<void>;
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
//# sourceMappingURL=mcp-server.d.ts.map