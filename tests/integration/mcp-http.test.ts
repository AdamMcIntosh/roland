/**
 * Integration tests: Roland general-purpose HTTP MCP endpoint.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import {
  authorizeMcpHttpRequest,
  buildMcpDiscovery,
  buildMcpHealth,
  isPublicMcpBind,
  mcpHttpRequiresToken,
  runMcpHttpServer,
} from '../../src/server/mcp-http.js';

describe('MCP HTTP', () => {
  let server: http.Server;
  const port = 18081;
  const tokenBackup = process.env.ROLAND_MCP_TOKEN;

  beforeAll(async () => {
    delete process.env.ROLAND_MCP_TOKEN;
    server = await runMcpHttpServer({ host: '127.0.0.1', port });
  });

  afterAll(async () => {
    if (tokenBackup === undefined) delete process.env.ROLAND_MCP_TOKEN;
    else process.env.ROLAND_MCP_TOKEN = tokenBackup;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  function get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
      http.get(
        {
          hostname: '127.0.0.1',
          port,
          path,
          headers,
        },
        (res) => {
          let raw = '';
          res.on('data', (c) => { raw += c.toString(); });
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
            } catch {
              resolve({ status: res.statusCode ?? 0, body: raw });
            }
          });
        },
      ).on('error', reject);
    });
  }

  it('buildMcpDiscovery returns protocol metadata', async () => {
    const discovery = await buildMcpDiscovery();
    expect(discovery.name).toBe('roland');
    expect(discovery.protocol).toBe('streamable-http');
    expect(discovery.tools_count).toBeGreaterThan(10);
  });

  it('GET /mcp returns discovery JSON (not 404)', async () => {
    const { status, body } = await get('/mcp');
    expect(status).toBe(200);
    const d = body as Record<string, unknown>;
    expect(d.name).toBe('roland');
    expect(d.protocol).toBe('streamable-http');
    expect(typeof d.tools_count).toBe('number');
  });

  it('GET /mcp/health returns healthy status', async () => {
    const { status, body } = await get('/mcp/health');
    expect(status).toBe(200);
    const h = body as Record<string, unknown>;
    expect(h.status).toBe('healthy');
    expect(h.server).toBe('roland');
  });

  it('GET /api/mcp alias returns discovery', async () => {
    const { status, body } = await get('/api/mcp');
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).name).toBe('roland');
  });

  it('buildMcpHealth includes active_sessions', async () => {
    const health = await buildMcpHealth();
    expect(health.status).toBe('healthy');
    expect(health.tools_count).toBeGreaterThan(0);
    expect(typeof health.active_sessions).toBe('number');
  });
});

describe('MCP HTTP auth', () => {
  let server: http.Server;
  let port: number;
  const token = 'test-mcp-secret';
  const tokenBackup = process.env.ROLAND_MCP_TOKEN;

  beforeEach(async () => {
    process.env.ROLAND_MCP_TOKEN = token;
    server = await runMcpHttpServer({ host: '0.0.0.0', port: 0 });
    const addr = server.address();
    port = typeof addr === 'object' && addr ? addr.port : 18082;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    if (tokenBackup === undefined) delete process.env.ROLAND_MCP_TOKEN;
    else process.env.ROLAND_MCP_TOKEN = tokenBackup;
  });

  function get(
    path: string,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path, headers }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c.toString(); });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) as Record<string, unknown> });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: { raw } });
          }
        });
      }).on('error', reject);
    });
  }

  it('isPublicMcpBind detects LAN bind addresses', () => {
    expect(isPublicMcpBind('0.0.0.0')).toBe(true);
    expect(isPublicMcpBind('127.0.0.1')).toBe(false);
    expect(mcpHttpRequiresToken('127.0.0.1')).toBe(true);
  });

  it('returns 401 on public bind without bearer token', async () => {
    const { status, body } = await get('/mcp');
    expect(status).toBe(401);
    expect(String(body.error)).toMatch(/Unauthorized/i);
  });

  it('accepts valid bearer token on public bind', async () => {
    const { status, body } = await get('/mcp', { Authorization: `Bearer ${token}` });
    expect(status).toBe(200);
    expect(body.name).toBe('roland');
  });

  it('authorizeMcpHttpRequest rejects invalid token', () => {
    const req = { headers: { authorization: 'Bearer wrong' } } as import('node:http').IncomingMessage;
    const result = authorizeMcpHttpRequest(req, '0.0.0.0');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });
});
