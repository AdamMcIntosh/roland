/**
 * Integration tests: Roland general-purpose HTTP MCP endpoint.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { buildMcpDiscovery, buildMcpHealth, runMcpHttpServer } from '../../src/server/mcp-http.js';

describe('MCP HTTP', () => {
  let server: http.Server;
  const port = 18081;

  beforeAll(async () => {
    server = await runMcpHttpServer({ host: '127.0.0.1', port });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  function get(path: string): Promise<{ status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}${path}`, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c.toString(); });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: raw });
          }
        });
      }).on('error', reject);
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
