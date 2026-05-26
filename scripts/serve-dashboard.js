#!/usr/bin/env node
/**
 * Serve the RCO dashboard UI on port 8081.
 *
 * Static files:  dashboard-ui/  → GET /
 * Usage API:     .roland/usage-history.json → GET /api/usage
 * Summary API:   .roland/usage-history.json → GET /api/usage/summary
 *
 * Usage:
 *   node scripts/serve-dashboard.js
 *   node scripts/serve-dashboard.js --state-dir=/path/to/.roland
 *   node scripts/serve-dashboard.js --state-dir .roland --port 8082
 */

import http from 'http';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function argValue(name) {
  const eq  = args.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1];
  return null;
}

const stateDir = path.resolve(argValue('state-dir') ?? '.roland');
const port     = Number(argValue('port') ?? 8081);

// ── Static file root ──────────────────────────────────────────────────────────

const root = path.join(__dirname, '..', 'dashboard-ui');
const mime = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
};

// ── CORS headers helper ───────────────────────────────────────────────────────

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Request handler ───────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];   // strip query string

  // ── CORS preflight ──────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  // ── /api/run-state — live run state ─────────────────────────────────────
  if (url === '/api/run-state') {
    const file = path.join(stateDir, 'run-state.json');
    fs.readFile(file, (err, data) => {
      setCors(res);
      res.setHeader('Content-Type', 'application/json');
      // Return null (not 404) when file doesn't exist — clean idle state
      res.statusCode = 200;
      res.end(err ? 'null' : data);
    });
    return;
  }

  // ── /api/usage — full history ────────────────────────────────────────────
  if (url === '/api/usage') {
    const file = path.join(stateDir, 'usage-history.json');
    fs.readFile(file, (err, data) => {
      setCors(res);
      res.setHeader('Content-Type', 'application/json');
      if (err) {
        res.statusCode = err.code === 'ENOENT' ? 200 : 500;
        res.end(err.code === 'ENOENT' ? '[]' : JSON.stringify({ error: err.message }));
        return;
      }
      res.statusCode = 200;
      res.end(data);
    });
    return;
  }

  // ── /api/usage/summary — quick stats ────────────────────────────────────
  if (url === '/api/usage/summary') {
    const file = path.join(stateDir, 'usage-history.json');
    fs.readFile(file, (err, data) => {
      setCors(res);
      res.setHeader('Content-Type', 'application/json');
      if (err) {
        const empty = { runs: 0, totalTokens: 0, totalCostUsd: 0, lastRunAt: null };
        res.statusCode = err.code === 'ENOENT' ? 200 : 500;
        res.end(err.code === 'ENOENT' ? JSON.stringify(empty) : JSON.stringify({ error: err.message }));
        return;
      }
      try {
        const history = JSON.parse(data.toString());
        const runs    = Array.isArray(history) ? history : [];
        const summary = {
          runs:         runs.length,
          totalTokens:  runs.reduce((s, r) => s + (r.totalTokens  ?? 0), 0),
          totalCostUsd: runs.reduce((s, r) => s + (r.totalCostUsd ?? 0), 0),
          lastRunAt:    runs.length ? Math.max(...runs.map(r => r.timestamp ?? 0)) : null,
        };
        res.statusCode = 200;
        res.end(JSON.stringify(summary));
      } catch {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Failed to parse usage-history.json' }));
      }
    });
    return;
  }

  // ── Static files ─────────────────────────────────────────────────────────
  const p    = url === '/' ? '/index.html' : url;
  const file = path.join(root, path.normalize(p).replace(/^(\.\.(\/|\\|$))+/, ''));

  if (!file.startsWith(root)) {
    res.statusCode = 403;
    res.end();
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
    res.statusCode = 200;
    res.end(data);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Dashboard UI  : http://127.0.0.1:${port}`);
  console.log(`Usage API     : http://127.0.0.1:${port}/api/usage`);
  console.log(`State dir     : ${stateDir}`);
  console.log(`WebSocket feed: ws://127.0.0.1:8080  (start with: npm run rco)`);
});
