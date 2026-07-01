/**
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

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from '../config/config-loader.js';
import { logger } from '../utils/logger.js';
import { McpServer } from './mcp-server.js';

/** Roland MCP HTTP server metadata version (matches package). */
export const MCP_HTTP_SERVER_VERSION = '2.0.0';

export interface McpHttpOptions {
  /** Base path prefix, default `/mcp`. */
  basePath?: string;
  /** Public URL shown in discovery (default derived from host/port). */
  publicUrl?: string;
}

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

/** Active Streamable HTTP sessions keyed by MCP session id. */
const sessions = new Map<string, StreamableHTTPServerTransport>();

let cachedToolCount: number | null = null;

async function probeToolCount(): Promise<number> {
  if (cachedToolCount !== null) return cachedToolCount;
  try {
    const config = await loadConfig();
    const probe = new McpServer(config, { skipSidecars: true });
    cachedToolCount = probe.getTools().length;
    return cachedToolCount;
  } catch {
    return 0;
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, mcp-session-id, Mcp-Session-Id');
  res.end(JSON.stringify(body, null, 2));
}

function isMcpProtocolRequest(req: IncomingMessage): boolean {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'POST' || method === 'DELETE') return true;
  const accept = String(req.headers.accept ?? '');
  if (accept.includes('text/event-stream')) return true;
  const sessionId = req.headers['mcp-session-id'] ?? req.headers['Mcp-Session-Id'];
  if (sessionId) return true;
  return false;
}

async function createSessionServer(): Promise<McpServer> {
  const config = await loadConfig();
  return new McpServer(config, { skipSidecars: true });
}

/**
 * Build discovery payload for plain GET /mcp (non-protocol clients like curl / Hermes setup).
 */
export async function buildMcpDiscovery(options: McpHttpOptions = {}): Promise<McpHttpDiscovery> {
  const base = options.basePath ?? '/mcp';
  const endpoint = options.publicUrl ?? base;
  const health = `${base.replace(/\/$/, '')}/health`;
  const toolsCount = await probeToolCount();

  return {
    name: 'roland',
    version: MCP_HTTP_SERVER_VERSION,
    protocol: 'streamable-http',
    protocolVersion: '2025-11-25',
    endpoint,
    health,
    transport: 'MCP Streamable HTTP',
    tools_count: toolsCount,
    instructions:
      'Connect with an MCP Streamable HTTP client. POST an initialize request to open a session; ' +
      'subsequent requests include the mcp-session-id response header. Cursor users should keep ' +
      'the stdio entry from `roland mcp-config --write`.',
    cursor_stdio: 'roland mcp-config --write',
  };
}

/** Health check payload for GET /mcp/health. */
export async function buildMcpHealth(): Promise<{
  status: 'healthy';
  server: string;
  version: string;
  protocol: string;
  tools_count: number;
  active_sessions: number;
  timestamp: string;
}> {
  const toolsCount = await probeToolCount();
  return {
    status: 'healthy',
    server: 'roland',
    version: MCP_HTTP_SERVER_VERSION,
    protocol: 'streamable-http',
    tools_count: toolsCount,
    active_sessions: sessions.size,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Handle MCP Streamable HTTP traffic (GET/POST/DELETE on /mcp).
 * Returns true when the request was handled.
 */
export async function handleMcpHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody?: unknown,
): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, mcp-session-id, Mcp-Session-Id');
    res.end();
    return;
  }

  // Plain GET → discovery JSON (success criteria: curl http://localhost:8081/mcp)
  if (method === 'GET' && !isMcpProtocolRequest(req)) {
    writeJson(res, 200, await buildMcpDiscovery());
    return;
  }

  try {
    const sessionHeader = req.headers['mcp-session-id'] ?? req.headers['Mcp-Session-Id'];
    const sessionId = typeof sessionHeader === 'string' ? sessionHeader : undefined;

    let transport: StreamableHTTPServerTransport | undefined;

    if (sessionId && sessions.has(sessionId)) {
      transport = sessions.get(sessionId);
    } else if (!sessionId && method === 'POST' && isInitializeRequest(parsedBody)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          if (transport) sessions.set(sid, transport);
          logger.info(`MCP HTTP session initialized: ${sid}`);
        },
      });

      transport.onclose = () => {
        const sid = transport?.sessionId;
        if (sid && sessions.has(sid)) {
          sessions.delete(sid);
          logger.info(`MCP HTTP session closed: ${sid}`);
        }
      };

      const mcpServer = await createSessionServer();
      await mcpServer.connectTransport(transport);
    } else {
      writeJson(res, 400, {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: send POST initialize to /mcp or include mcp-session-id header',
        },
        id: null,
      });
      return;
    }

    if (!transport) {
      writeJson(res, 404, {
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Session not found' },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, parsedBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`MCP HTTP request failed: ${message}`);
    if (!res.headersSent) {
      writeJson(res, 500, {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
}

/** Route matcher — returns 'health' | 'mcp' | null. */
export function matchMcpHttpPath(
  urlPath: string,
  basePath = '/mcp',
): 'health' | 'mcp' | null {
  const normalized = urlPath.split('?')[0].replace(/\/$/, '') || '/';
  const base = basePath.replace(/\/$/, '') || '/mcp';
  if (normalized === `${base}/health`) return 'health';
  if (normalized === base || normalized === '/api/mcp') return 'mcp';
  return null;
}

/** Standalone HTTP MCP server on host:port (roland mcp / roland serve --mcp). */
export async function runMcpHttpServer(options: {
  host?: string;
  port?: number;
  basePath?: string;
} = {}): Promise<import('node:http').Server> {
  const http = await import('node:http');
  const host = options.host ?? process.env.ROLAND_MCP_HOST ?? '0.0.0.0';
  const port = options.port ?? Number(process.env.ROLAND_MCP_PORT ?? 8081);
  const basePath = options.basePath ?? '/mcp';

  const server = http.createServer(async (req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0];
    const match = matchMcpHttpPath(urlPath, basePath) ?? matchMcpHttpPath(urlPath, '/api/mcp');

    if (match === 'health') {
      writeJson(res, 200, await buildMcpHealth());
      return;
    }

    if (match === 'mcp') {
      let body: unknown;
      if ((req.method ?? 'GET').toUpperCase() === 'POST') {
        body = await readJsonBody(req);
      }
      await handleMcpHttpRequest(req, res, body);
      return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found', hint: `Try GET ${basePath} or ${basePath}/health` }));
  });

  await new Promise<void>((resolve) => {
    server.listen(port, host, () => resolve());
  });

  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  logger.success(`Roland MCP HTTP listening on http://${displayHost}:${port}${basePath}`);
  console.log(`\n  🔌  Roland MCP (Streamable HTTP)`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  MCP       : http://${displayHost}:${port}${basePath}`);
  console.log(`  Health    : http://${displayHost}:${port}${basePath}/health`);
  console.log(`  Alias     : http://${displayHost}:${port}/api/mcp`);
  console.log(`  Bind      : ${host}:${port}`);
  console.log(`\n  Hermes    : hermes mcp add roland --url http://${displayHost}:${port}${basePath}`);
  console.log(`  Cursor    : roland mcp-config --write  (stdio — unchanged)\n`);

  return server;
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(raw.trim() ? JSON.parse(raw) : undefined);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/** Build Hermes / general HTTP MCP client config snippet. */
export function buildGeneralMcpClientConfig(baseUrl: string): Record<string, unknown> {
  const url = baseUrl.replace(/\/$/, '');
  return {
    mcpServers: {
      roland: {
        url,
        transport: 'streamable-http',
      },
    },
  };
}
