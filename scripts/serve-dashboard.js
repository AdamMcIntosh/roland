#!/usr/bin/env node
/**
 * Roland Dashboard Server — Dashboard 2.0
 *
 * HTTP + WebSocket server for the Roland command center.
 *
 * Endpoints:
 *   GET  /                         → dashboard-ui/index.html (+ static assets)
 *   GET  /api/run-state            → .roland/run-state.json  (live job state)
 *   GET  /api/usage                → .roland/usage-history.json
 *   GET  /api/usage/summary        → aggregate totals
 *   GET  /api/memory               → .roland/memory.md content
 *   POST /api/memory               → write .roland/memory.md
 *   GET  /api/hitl-state           → .roland/hitl-state.json
 *   POST /api/hitl/:cmd            → append to .roland/hitl.json  (pause|resume|replan|abort|unblock|inject)
 *   GET  /api/blackboard           → .roland/blackboard.json
 *   WS   /                         → push run-state on file changes (200 ms debounce)
 *
 * Usage:
 *   node scripts/serve-dashboard.js
 *   node scripts/serve-dashboard.js --state-dir /path/to/.roland --port 8082
 */

import http from 'http';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

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

const uiRoot = path.join(__dirname, '..', 'dashboard-ui');
const MIME   = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ── Shared helpers ────────────────────────────────────────────────────────────

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return fallback; }
}

function jsonOk(res, data) {
  setCors(res);
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify(data));
}

function jsonErr(res, message, status = 400) {
  setCors(res);
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify({ error: message }));
}

/** Read JSON body from an IncomingMessage. Resolves to parsed object. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data',  chunk => raw += chunk.toString());
    req.on('end',   () => {
      try { resolve(raw.trim() ? JSON.parse(raw) : {}); }
      catch (e) { reject(new Error('Invalid JSON body: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

// ── HITL helpers — mirrors src/rco/hitl.ts write-side logic ──────────────────

function writeHitlCommand(cmd) {
  fs.mkdirSync(stateDir, { recursive: true });

  const queueFile = path.join(stateDir, 'hitl.json');
  const queue     = readJson(queueFile, []);
  const arr       = Array.isArray(queue) ? queue : [];
  arr.push({ ...cmd, timestamp: Date.now() });
  fs.writeFileSync(queueFile, JSON.stringify(arr, null, 2), 'utf-8');

  _syncHitlObserverState(cmd.cmd, arr.length);
}

function _syncHitlObserverState(cmdType, queueLen = 0) {
  const stateFile = path.join(stateDir, 'hitl-state.json');
  const s = readJson(stateFile, { paused: false, updatedAt: 0 });

  s.updatedAt    = Date.now();
  s.pendingCount = queueLen;

  if (cmdType === 'pause')  { s.paused = true;  s.pausedAt = Date.now(); }
  if (cmdType === 'resume') { s.paused = false;  delete s.pausedAt; delete s.abortPending; }
  if (cmdType === 'abort')  { s.abortPending = true; }

  try { fs.writeFileSync(stateFile, JSON.stringify(s, null, 2), 'utf-8'); }
  catch (e) { console.error('[HITL] state write error:', e.message); }
}

// ── WebSocket broadcast ───────────────────────────────────────────────────────

const wsClients = new Set();

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const ws of wsClients) {
    try { if (ws.readyState === 1 /* OPEN */) ws.send(msg); } catch {}
  }
}

function pushCurrentState() {
  const runState  = readJson(path.join(stateDir, 'run-state.json'),  null);
  const hitlState = readJson(path.join(stateDir, 'hitl-state.json'), null);
  broadcast({ type: 'state-update', runState, hitlState });
}

// ── File watcher (debounced push) ─────────────────────────────────────────────

const WATCH_TARGETS = new Set(['run-state.json', 'hitl-state.json', 'memory.md', 'hitl.json']);
let watchTimer = null;

try {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.watch(stateDir, { persistent: false }, (_event, filename) => {
    if (!filename || !WATCH_TARGETS.has(filename)) return;
    clearTimeout(watchTimer);
    watchTimer = setTimeout(pushCurrentState, 200);
  });
} catch {
  // State dir may not exist yet — that's fine; watch will just be inactive.
}

// ── Request handler ───────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url    = (req.url ?? '/').split('?')[0];
  const method = (req.method ?? 'GET').toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    setCors(res); res.statusCode = 204; res.end(); return;
  }

  // ── /api/run-state ───────────────────────────────────────────────────────
  if (url === '/api/run-state' && method === 'GET') {
    const file = path.join(stateDir, 'run-state.json');
    fs.readFile(file, (err, data) => {
      setCors(res);
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(err ? 'null' : data);
    });
    return;
  }

  // ── /api/usage ───────────────────────────────────────────────────────────
  if (url === '/api/usage' && method === 'GET') {
    const file = path.join(stateDir, 'usage-history.json');
    fs.readFile(file, (err, data) => {
      setCors(res);
      res.setHeader('Content-Type', 'application/json');
      if (err) { res.statusCode = 200; res.end(err.code === 'ENOENT' ? '[]' : JSON.stringify({ error: err.message })); return; }
      res.statusCode = 200; res.end(data);
    });
    return;
  }

  // ── /api/usage/summary ───────────────────────────────────────────────────
  if (url === '/api/usage/summary' && method === 'GET') {
    const file = path.join(stateDir, 'usage-history.json');
    fs.readFile(file, (err, data) => {
      setCors(res);
      res.setHeader('Content-Type', 'application/json');
      if (err) {
        const empty = { runs: 0, totalTokens: 0, totalCostUsd: 0, lastRunAt: null };
        res.statusCode = 200;
        res.end(err.code === 'ENOENT' ? JSON.stringify(empty) : JSON.stringify({ error: err.message }));
        return;
      }
      try {
        const raw  = JSON.parse(data.toString());
        const runs = Array.isArray(raw) ? raw : [];
        res.statusCode = 200;
        res.end(JSON.stringify({
          runs:         runs.length,
          totalTokens:  runs.reduce((s, r) => s + (r.totalTokens  ?? 0), 0),
          totalCostUsd: runs.reduce((s, r) => s + (r.totalCostUsd ?? 0), 0),
          lastRunAt:    runs.length ? Math.max(...runs.map(r => r.timestamp ?? 0)) : null,
        }));
      } catch { res.statusCode = 500; res.end(JSON.stringify({ error: 'parse error' })); }
    });
    return;
  }

  // ── /api/memory GET ──────────────────────────────────────────────────────
  if (url === '/api/memory' && method === 'GET') {
    const file = path.join(stateDir, 'memory.md');
    fs.readFile(file, 'utf-8', (err, data) => {
      jsonOk(res, { content: err ? '' : data });
    });
    return;
  }

  // ── /api/memory POST ─────────────────────────────────────────────────────
  if (url === '/api/memory' && method === 'POST') {
    try {
      const body = await readBody(req);
      if (typeof body.content !== 'string') throw new Error('content must be a string');
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(path.join(stateDir, 'memory.md'), body.content, 'utf-8');
      jsonOk(res, { ok: true });
    } catch (e) { jsonErr(res, e.message); }
    return;
  }

  // ── /api/hitl-state GET ──────────────────────────────────────────────────
  if (url === '/api/hitl-state' && method === 'GET') {
    jsonOk(res, readJson(path.join(stateDir, 'hitl-state.json'), {}));
    return;
  }

  // ── /api/blackboard GET ──────────────────────────────────────────────────
  if (url === '/api/blackboard' && method === 'GET') {
    jsonOk(res, readJson(path.join(stateDir, 'blackboard.json'), {}));
    return;
  }

  // ── /api/hitl/:cmd POST ──────────────────────────────────────────────────
  const hitlMatch = url.match(/^\/api\/hitl\/([a-z]+)$/);
  if (hitlMatch && method === 'POST') {
    const cmdType   = hitlMatch[1];
    const validCmds = ['pause', 'resume', 'replan', 'abort', 'unblock', 'inject'];
    if (!validCmds.includes(cmdType)) {
      jsonErr(res, 'unknown HITL command: ' + cmdType); return;
    }
    try {
      const body = await readBody(req);
      const cmd  = { cmd: cmdType };
      if (body.taskId)  cmd.taskId  = String(body.taskId);
      if (body.message) cmd.message = String(body.message);
      if (body.text)    cmd.text    = String(body.text);
      writeHitlCommand(cmd);
      jsonOk(res, { ok: true, cmd: cmdType });
    } catch (e) { jsonErr(res, e.message); }
    return;
  }

  // ── Static files ─────────────────────────────────────────────────────────
  const relPath  = url === '/' ? '/index.html' : url;
  const filePath = path.join(uiRoot, path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, ''));

  if (!filePath.startsWith(uiRoot)) {
    res.statusCode = 403; res.end(); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.statusCode = 404; res.end(); return; }
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
    res.statusCode = 200;
    res.end(data);
  });
});

// ── WebSocket server ──────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  wsClients.add(ws);
  // Send the current state snapshot immediately on connection
  try {
    const runState  = readJson(path.join(stateDir, 'run-state.json'),  null);
    const hitlState = readJson(path.join(stateDir, 'hitl-state.json'), null);
    ws.send(JSON.stringify({ type: 'state-update', runState, hitlState }));
  } catch {}
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(port, '127.0.0.1', () => {
  const base = `http://127.0.0.1:${port}`;
  console.log(`\n  🎛  Roland Dashboard 2.0`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  UI        : ${base}`);
  console.log(`  WebSocket : ws://127.0.0.1:${port}`);
  console.log(`  State dir : ${stateDir}`);
  console.log(`  APIs      : ${base}/api/usage  ${base}/api/run-state`);
  console.log(`              ${base}/api/memory  ${base}/api/hitl/:cmd`);
  console.log(`\n  Open the URL above in your browser.\n`);
});
