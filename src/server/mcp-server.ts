/**
 * MCP Server Implementation (v2)
 *
 * Roland MCP Server — exposes cost routing, analytics, budget management,
 * and recipe execution as MCP tools for IDE agents (VS Code, Cursor, etc.).
 *
 * Tool registration is delegated to src/server/tools/* modules.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AppConfig } from '../utils/types.js';
import { McpServerError, McpToolError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { AdvancedCostTracker, getGlobalTracker } from '../orchestrator/advanced-cost-tracker.js';
import { BudgetManager } from '../utils/budget-manager.js';
import { RecipeSessionManager } from './recipe-session.js';
import {
  applyMcpProjectEnv,
  resolveMcpProjectContext,
  type McpProjectContext,
} from '../utils/mcp-project-context.js';
import { configureSdkProcessLimits } from '../utils/sdk-lifecycle.js';
import { getDiffStreamServer, initDiffStreamServer } from './diff-stream.js';
import { SessionContextManager } from './session-context.js';
import { ProjectContextManager } from './project-context.js';
import { CoordinationManager } from '../coordination/index.js';
import { LeadPM, type LeadPMOptions } from '../pm/lead-pm.js';
import { QualityTracker, initializeQualityTracker } from '../orchestrator/quality-tracker.js';
import { readPackageVersion } from '../utils/package-version.js';
import { modelPolicyFromRouter } from '../pm/model-policy.js';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createRegistrar,
  registerAllTools,
  resolveRecipesDir,
  type McpToolContext,
} from './tools/index.js';

// ============================================================================
// Cursor MCP configuration helpers
// ============================================================================

/** Read-only / low-risk tools safe for Cursor autoApprove in ~/.cursor/mcp.json */
export const MCP_AUTO_APPROVE_TOOLS = [
  'health_check',
  'roland_hello',
  'board_status',
  'hitl_status',
  'poll_hitl_events',
  'mission_summary',
  'report_completion',
  'pm_standup',
  'triage',
  'list_team',
  'list_team_recipes',
  'list_recipes',
  'get_team_context',
  'get_pm_playbook',
  'get_team_usage',
  'get_pm_events',
  'get_analytics',
  'suggest_mode',
  'route_model',
  'blackboard_read',
  'bus_poll',
  'git_status',
  'git_diff',
  'git_log',
  'read_context',
] as const;

/** Resolve the built MCP server entry (dist/server/mcp-server.js). */
export function resolveMcpServerEntry(): string {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    return path.resolve(path.dirname(thisFile), 'mcp-server.js');
  } catch {
    return path.join(process.cwd(), 'dist', 'server', 'mcp-server.js');
  }
}

export interface McpServerOptions {
  /** Skip diff-stream sidecar (ephemeral HTTP sessions). */
  skipSidecars?: boolean;
}

/** Build the `mcpServers.roland` block for ~/.cursor/mcp.json (stdio — Cursor / VS Code). */
export function buildCursorMcpServerEntry(options?: {
  rolandRoot?: string;
  projectRoot?: string;
  includeAutoApprove?: boolean;
}): Record<string, unknown> {
  const entry = options?.rolandRoot
    ? path.join(options.rolandRoot, 'dist', 'server', 'mcp-server.js').replace(/\\/g, '/')
    : resolveMcpServerEntry().replace(/\\/g, '/');
  const env: Record<string, string> = { ROLAND_QUIET: '1' };
  if (options?.projectRoot) {
    env.ROLAND_PROJECT_ROOT = options.projectRoot.replace(/\\/g, '/');
  }
  const block: Record<string, unknown> = {
    command: 'node',
    args: [entry],
    env,
  };
  if (options?.includeAutoApprove !== false) {
    block.autoApprove = [...MCP_AUTO_APPROVE_TOOLS];
  }
  return block;
}

/** Build HTTP MCP client config for Hermes and other Streamable HTTP clients. */
export function buildGeneralMcpHttpEntry(baseUrl = 'http://127.0.0.1:8081/mcp'): Record<string, unknown> {
  const url = baseUrl.replace(/\/$/, '');
  return {
    url,
    transport: 'streamable-http',
  };
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

// ============================================================================
// MCP Server Implementation (v2)
// ============================================================================

export class McpServer {
  private server: Server;
  private config: AppConfig;
  private tools: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;
  private toolDefinitions: Map<string, Tool>;
  private costTracker: AdvancedCostTracker;
  private recipeSessionManager: RecipeSessionManager;
  private sessionContextManager: SessionContextManager;
  private projectContextManager: ProjectContextManager;
  private qualityTracker: QualityTracker;
  private coordination: CoordinationManager;
  private leadPm: LeadPM;
  private readonly leadPmOpts: LeadPMOptions;
  private recipesDir: string;
  private transport: Transport | null = null;
  private shuttingDown = false;
  private connected = false;
  private transportMode: 'stdio' | 'http' = 'stdio';
  private readonly skipSidecars: boolean;

  constructor(config: AppConfig, options: McpServerOptions = {}) {
    this.skipSidecars = options.skipSidecars ?? false;
    this.config = config;
    this.tools = new Map();
    this.toolDefinitions = new Map();
    this.recipesDir = resolveRecipesDir();

    this.costTracker = getGlobalTracker();
    this.recipeSessionManager = new RecipeSessionManager();
    this.sessionContextManager = new SessionContextManager();

    const projectRoot = process.env.ROLAND_PROJECT_ROOT || process.cwd();
    this.projectContextManager = new ProjectContextManager(projectRoot);
    this.sessionContextManager.setProjectContext(this.projectContextManager);
    this.qualityTracker = initializeQualityTracker(projectRoot);
    this.coordination = new CoordinationManager();

    const pmCfg = (config as {
      pm?: {
        lead_model?: string;
        fast_model?: string;
        standard_model?: string;
        lane_overrides?: Record<string, 'pm' | 'reasoning' | 'coding' | 'light'>;
      };
    }).pm;
    const loopPolicy = modelPolicyFromRouter();
    this.leadPmOpts = {
      policy: pmCfg
        ? {
            pm: pmCfg.lead_model ?? loopPolicy.pm,
            fast: pmCfg.fast_model ?? loopPolicy.fast,
            standard: pmCfg.standard_model ?? loopPolicy.standard,
          }
        : loopPolicy,
      laneOverrides: pmCfg?.lane_overrides,
    };
    this.leadPm = new LeadPM(this.coordination, this.leadPmOpts);

    BudgetManager.initialize();
    if (config.budget) {
      BudgetManager.configureFromAppConfig({
        monthlyBudget: config.budget.monthly_budget,
        warningThreshold: config.budget.budget_degradation_threshold,
        billingCycleDay: config.budget.billing_cycle_day,
        enabled: true,
      });
    }

    const registrar = createRegistrar({ tools: this.tools, toolDefinitions: this.toolDefinitions });
    registerAllTools(registrar, this.buildToolContext());

    this.server = new Server(
      { name: 'roland', version: readPackageVersion(import.meta.url) },
      { capabilities: { tools: {} } },
    );

    this.setupHandlers();
  }

  private buildToolContext(): McpToolContext {
    return {
      config: this.config,
      costTracker: this.costTracker,
      recipeSessionManager: this.recipeSessionManager,
      sessionContextManager: this.sessionContextManager,
      projectContextManager: this.projectContextManager,
      qualityTracker: this.qualityTracker,
      coordination: this.coordination,
      leadPm: this.leadPm,
      leadPmOpts: this.leadPmOpts,
      recipesDir: this.recipesDir,
      getTools: () => this.getTools(),
      resolveToolProjectContext: (args) => this.resolveToolProjectContext(args),
      scopedCoordination: (args) => this.scopedCoordination(args),
      scopedLeadPm: (args) => this.scopedLeadPm(args),
    };
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('📋 ListTools request received');
      return { tools: Array.from(this.toolDefinitions.values()) };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments || {};

      try {
        logger.debug(`🔧 CallTool request: ${toolName}`);
        const toolHandler = this.tools.get(toolName);
        if (!toolHandler) throw new McpToolError(toolName, 'Tool not found');

        const result = await toolHandler(args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        logger.error(`Tool "${toolName}" failed: ${message}`, stack ? { stack } : undefined);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: message }, null, 2) }],
          isError: true,
        };
      }
    });

    this.server.onerror = (error) => {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error(`MCP protocol error: ${message}`, stack ? { stack } : undefined);
    };

    this.server.onclose = () => {
      this.connected = false;
      logger.info(`MCP ${this.transportMode} transport closed`);
      if (this.transportMode === 'stdio' && !this.shuttingDown) {
        logger.warn('Client disconnected — exiting for Cursor to restart the MCP server');
        process.exit(0);
      }
    };
  }

  async start(options: { maxConnectRetries?: number } = {}): Promise<void> {
    const maxRetries = options.maxConnectRetries ?? 5;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.connectStdioTransport();
        return;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        logger.error(`MCP stdio connect failed (attempt ${attempt}/${maxRetries}): ${message}`, stack ? { stack } : undefined);

        if (attempt < maxRetries) {
          const delay = Math.min(500 * 2 ** (attempt - 1), 8000);
          logger.warn(`Retrying MCP connection in ${delay}ms…`);
          await sleep(delay);
        }
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new McpServerError(`Failed to start MCP server after ${maxRetries} attempts: ${message}`);
  }

  async connectTransport(transport: Transport, mode: 'stdio' | 'http' = 'http'): Promise<void> {
    this.transportMode = mode;
    this.transport = transport;
    await this.server.connect(transport);
    this.connected = true;
    logger.success(`MCP server connected via ${mode} (${this.getTools().length} tools)`);

    if (!this.skipSidecars && mode === 'stdio') {
      this.startDiffStreamSidecar();
    }
  }

  private async connectStdioTransport(): Promise<void> {
    logger.info('Connecting Roland MCP server via stdio transport…');
    const stdio = new StdioServerTransport();
    await this.connectTransport(stdio, 'stdio');
    logger.info(`Tools: ${this.getTools().join(', ')}`);
  }

  private startDiffStreamSidecar(): void {
    const diffStreamPort = this.config.diff_stream?.port ?? 8089;
    const diffStreamEnabled = this.config.diff_stream?.enabled !== false;
    if (!diffStreamEnabled) return;
    try {
      const diffServer = initDiffStreamServer(diffStreamPort);
      diffServer.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Diff stream server unavailable (non-fatal): ${message}`);
    }
  }

  async stop(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    try {
      logger.info('Stopping MCP server…');
      const diffServer = getDiffStreamServer();
      if (diffServer) {
        try {
          diffServer.stop();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn(`Error stopping diff stream server: ${message}`);
        }
      }
      await this.server.close();
      this.connected = false;
      this.transport = null;
      logger.success('MCP server stopped cleanly');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error(`Error during MCP shutdown: ${message}`, stack ? { stack } : undefined);
    }
  }

  isShuttingDown(): boolean { return this.shuttingDown; }
  isConnected(): boolean { return this.connected; }
  registerTool(name: string, description: string, handler: (args: Record<string, unknown>) => Promise<unknown>, inputSchema?: Record<string, unknown>): void {
    createRegistrar({ tools: this.tools, toolDefinitions: this.toolDefinitions }).registerTool(name, description, handler, inputSchema);
  }
  getTool(name: string) { return this.tools.get(name); }
  getTools(): string[] { return Array.from(this.tools.keys()); }
  getConfig(): AppConfig { return this.config; }
  getServer(): Server { return this.server; }

  private resolveToolProjectContext(args: Record<string, unknown>): McpProjectContext {
    const ctx = resolveMcpProjectContext(args);
    applyMcpProjectEnv(ctx);
    return ctx;
  }

  private scopedCoordination(args: Record<string, unknown>): CoordinationManager {
    const ctx = this.resolveToolProjectContext(args);
    return new CoordinationManager({ dir: ctx.stateDir });
  }

  private scopedLeadPm(args: Record<string, unknown>): LeadPM {
    return new LeadPM(this.scopedCoordination(args), this.leadPmOpts);
  }

  /** Return the resolved Roland installation root directory. */
  static getRolandRoot(): string {
    try {
      const thisFile = fileURLToPath(import.meta.url);
      return path.resolve(path.dirname(thisFile), '..', '..');
    } catch {
      return process.cwd();
    }
  }
}

// ============================================================================
// Standalone MCP entry (node dist/server/mcp-server.js)
// ============================================================================

function isMcpMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

/** Run Roland as a stdio MCP server — used by `npm run mcp`, Cursor, and `roland serve`. */
export async function runMcpServer(): Promise<void> {
  configureSdkProcessLimits();

  const { loadConfig } = await import('../config/config-loader.js');

  if (process.env.ROLAND_QUIET === '1' || process.env.ROLAND_QUIET === 'true') {
    logger.setLevel('warn');
  }

  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.message}`, err.stack ? { stack: err.stack } : undefined);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logger.error(`Unhandled rejection: ${message}`, stack ? { stack } : undefined);
  });

  logger.info('Starting Roland MCP server…');
  const config = await loadConfig();
  const server = new McpServer(config);

  let shutdownPromise: Promise<void> | null = null;
  const shutdown = (signal: string) => {
    if (shutdownPromise) return;
    logger.info(`Received ${signal} — shutting down gracefully`);
    shutdownPromise = server.stop().finally(() => process.exit(0));
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  await server.start();
  logger.info('Waiting for MCP client on stdio…');
}

if (isMcpMainModule()) {
  runMcpServer().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error(`Fatal MCP startup error: ${message}`, stack ? { stack } : undefined);
    process.exit(1);
  });
}
