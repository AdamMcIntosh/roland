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
 *   GET  /api/mission-dag          → .roland/mission-dag.json (task graph export)
 *   GET  /api/board-status         → UNSC concise summary (blackboard + command board)
 *   POST /api/board-cleanup        → archive stale board entries before a new mission
 *   GET  /api/models               → available Cursor PM / engineer models
 *   POST /api/mission              → spawn `roland team` in background
 *   GET  /api/supervisor           → background supervisor PID + status
 *   WS   /                         → push run-state on file changes (200 ms debounce)
 *
 * Usage:
 *   node scripts/serve-dashboard.js
 *   node scripts/serve-dashboard.js --state-dir /path/to/.roland --port 8082
 *   node scripts/serve-dashboard.js --host 0.0.0.0   # Tailscale / LAN access
 */

import http from 'http';
import fs   from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { WebSocketServer } from 'ws';
import {
  VALID_CURSOR_MODELS,
  DEFAULT_PM_MODEL,
  DEFAULT_ENGINEER_MODEL,
} from '../dist/rco/cursor-models.js';

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

const stateDir    = path.resolve(argValue('state-dir') ?? '.roland');
const port        = Number(argValue('port') ?? 8081);
const host        = argValue('host') ?? '0.0.0.0';
const projectRoot = path.resolve(argValue('project-root') ?? path.join(__dirname, '..'));
const rolandEntry = path.join(projectRoot, 'dist', 'index.js');

/** Model groups for /api/models — ordered for UI display */
const MODEL_GROUPS = [
  { id: 'recommended', label: 'Recommended',  description: 'Best defaults for Roland team missions' },
  { id: 'reasoning',   label: 'Reasoning',    description: 'Planning, architecture, and deep analysis' },
  { id: 'coding',      label: 'Agentic Coding', description: 'Implementation, tests, and tool use' },
  { id: 'fast',        label: 'Fast',         description: 'Low latency and quick iterations' },
  { id: 'budget',      label: 'Budget',       description: 'Lowest cost per token' },
  { id: 'vision',      label: 'Vision',       description: 'Multimodal / image-capable models' },
];

/**
 * Cursor SDK model catalog for the dashboard.
 * Pricing is estimated USD per 1M tokens (input / output) — update when you have contract rates.
 */
const CURSOR_MODELS = [
  {
    id: 'auto', label: 'Auto', group: 'recommended',
    roles: ['pm', 'engineer'],
    description: 'Balanced cost and intelligence — let Cursor choose the best model per task',
    pricing: null,
  },
  {
    id: 'grok-4.3', label: 'Grok 4.3', group: 'recommended',
    roles: ['pm'], recommendedFor: ['pm'],
    description: 'Strongest orchestration and multi-wave planning',
    pricing: { inputUsdPerMTok: 5.00, outputUsdPerMTok: 15.00 },
  },
  {
    id: 'composer-2.5', label: 'Composer 2.5', group: 'recommended',
    roles: ['engineer'], recommendedFor: ['engineer'],
    description: 'Best for agentic coding — default for all engineer agents',
    pricing: { inputUsdPerMTok: 3.00, outputUsdPerMTok: 12.00 },
  },
  {
    id: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', group: 'recommended',
    roles: ['pm', 'engineer'],
    description: 'Fast, low-cost orchestration alternative',
    pricing: { inputUsdPerMTok: 0.20, outputUsdPerMTok: 1.25 },
  },
  {
    id: 'claude-opus-4-7', label: 'Claude Opus 4.7', group: 'reasoning',
    roles: ['pm', 'engineer'],
    description: 'Highest reasoning depth — architecture and security review',
    pricing: { inputUsdPerMTok: 15.00, outputUsdPerMTok: 75.00 },
  },
  {
    id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', group: 'reasoning',
    roles: ['pm', 'engineer'],
    description: 'Strong reasoning at moderate cost — review and planning',
    pricing: { inputUsdPerMTok: 3.00, outputUsdPerMTok: 15.00 },
  },
  {
    id: 'gpt-5.2', label: 'GPT-5.2', group: 'reasoning',
    roles: ['pm', 'engineer'],
    description: 'General-purpose reasoning and analysis',
    pricing: { inputUsdPerMTok: 2.50, outputUsdPerMTok: 10.00 },
  },
  {
    id: 'gpt-5.5-medium', label: 'GPT-5.5 Medium', group: 'reasoning',
    roles: ['pm', 'engineer'],
    description: 'Balanced GPT-5.5 tier for complex tasks',
    pricing: { inputUsdPerMTok: 3.50, outputUsdPerMTok: 14.00 },
  },
  {
    id: 'composer-2', label: 'Composer 2', group: 'coding',
    roles: ['engineer'],
    description: 'Lighter composer — faster edits and smaller diffs',
    pricing: { inputUsdPerMTok: 2.50, outputUsdPerMTok: 10.00 },
  },
  {
    id: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini', group: 'coding',
    roles: ['engineer'],
    description: 'Code-focused mini model for targeted fixes',
    pricing: { inputUsdPerMTok: 1.50, outputUsdPerMTok: 6.00 },
  },
  {
    id: 'gpt-5-mini', label: 'GPT-5 Mini', group: 'fast',
    roles: ['engineer'],
    description: 'Quick engineer override for simple tasks',
    pricing: { inputUsdPerMTok: 0.40, outputUsdPerMTok: 2.00 },
  },
  {
    id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', group: 'fast',
    roles: ['engineer'],
    description: 'Very fast flash model — great for light tasks',
    pricing: { inputUsdPerMTok: 0.15, outputUsdPerMTok: 0.60 },
  },
  {
    id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', group: 'budget',
    roles: ['engineer'],
    description: 'Low-cost Claude tier for docs and simple edits',
    pricing: { inputUsdPerMTok: 0.80, outputUsdPerMTok: 4.00 },
  },
  {
    id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', group: 'vision',
    roles: ['engineer'],
    description: 'Multimodal pro tier — screenshots and UI review',
    pricing: { inputUsdPerMTok: 1.25, outputUsdPerMTok: 5.00 },
  },
];

/** Explicit model picks passed to ROLAND_*_MODEL env vars (not "auto"). */
const VALID_MODEL_IDS = VALID_CURSOR_MODELS;

function formatPricing(p) {
  if (!p) return null;
  return {
    inputUsdPerMTok: p.inputUsdPerMTok,
    outputUsdPerMTok: p.outputUsdPerMTok,
    label: `$${p.inputUsdPerMTok.toFixed(2)} / $${p.outputUsdPerMTok.toFixed(2)} per MTok`,
  };
}

function buildModelsApiPayload() {
  const models = CURSOR_MODELS.map(m => ({
    ...m,
    pricing: formatPricing(m.pricing),
    recommended: Boolean(m.recommendedFor?.length),
  }));
  return {
    groups: MODEL_GROUPS,
    models,
    defaults: { pm: DEFAULT_PM_MODEL, engineer: DEFAULT_ENGINEER_MODEL },
  };
}

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
  const boardStatus = readBoardStatusPayload();
  const missionDag = readMissionDagPayload();
  broadcast({ type: 'state-update', runState, hitlState, boardStatus, missionDag });
}

async function loadBoardReportModule() {
  const modPath = path.join(__dirname, '..', 'dist', 'rco', 'board-report.js');
  try {
    return await import(pathToFileURL(modPath).href);
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!pid || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function readSupervisorRecord() {
  return readJson(path.join(stateDir, 'supervisor.pid'), null);
}

function readMissionMeta() {
  return readJson(path.join(stateDir, 'mission-meta.json'), null);
}

function writeMissionMeta(meta) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'mission-meta.json'),
    JSON.stringify({ ...meta, updatedAt: Date.now() }, null, 2),
    'utf-8',
  );
}

function summarizeRunState() {
  const rs = readJson(path.join(stateDir, 'run-state.json'), null);
  if (!rs?.runId) return null;
  const ACTIVE = new Set(['planning', 'running', 'reviewing', 'synthesizing']);
  const fresh = rs.updatedAt && (Date.now() - rs.updatedAt) < 600_000;
  const active = ACTIVE.has(rs.status) && fresh;
  const total = Math.max(rs.totalTasks ?? 0, 0);
  const done = Math.min(rs.completedTasks ?? 0, total);
  return {
    runId: rs.runId,
    goal: rs.goal ?? '',
    status: rs.status ?? 'unknown',
    currentWave: rs.currentWave ?? 0,
    completedTasks: done,
    totalTasks: total,
    progressPct: total > 0 ? Math.min(Math.round((done / total) * 100), 100) : 0,
    startedAt: rs.startedAt ?? null,
    updatedAt: rs.updatedAt ?? null,
    active,
  };
}

function tailLogFile(logFile, lines = 40) {
  if (!logFile || !fs.existsSync(logFile)) return '';
  try {
    const content = fs.readFileSync(logFile, 'utf-8');
    return content.split('\n').slice(-Math.max(1, lines)).join('\n');
  } catch {
    return '';
  }
}

function buildMissionGoal(rawGoal, { priority, runName, forceTeam }) {
  let goal = String(rawGoal || '').trim();
  if (!goal) return '';
  const parts = [];
  if (runName?.trim()) parts.push(`[Mission: ${runName.trim()}]`);
  if (priority && priority !== 'P3') parts.push(`[${priority}]`);
  if (forceTeam) parts.push('force team:');
  if (parts.length) goal = `${parts.join(' ')} ${goal}`.trim();
  return goal;
}

async function loadBoardCleanupModule() {
  const modPath = path.join(projectRoot, 'dist', 'rco', 'board-cleanup.js');
  try {
    return await import(pathToFileURL(modPath).href);
  } catch {
    return null;
  }
}

function spawnTeamMission(effectiveGoal, options = {}) {
  if (!fs.existsSync(rolandEntry)) {
    throw new Error(`Roland not built — run \`npm run build\` in ${projectRoot}`);
  }

  const {
    pmModel,
    engineerModel,
    notify = false,
    clean = false,
  } = options;

  const args = [
    rolandEntry,
    'team',
    effectiveGoal,
    '--background',
    '--quiet',
    '--no-tui',
    '--state-dir',
    stateDir,
  ];
  if (notify) args.push('--notify');
  if (clean) args.push('--clean');

  const env = {
    ...process.env,
    ROLAND_STATE_DIR: stateDir,
    ROLAND_SIMPLE_TUI: '1',
  };
  if (pmModel && pmModel !== 'auto' && VALID_MODEL_IDS.has(pmModel)) env.ROLAND_PM_MODEL = pmModel;
  if (engineerModel && engineerModel !== 'auto' && VALID_MODEL_IDS.has(engineerModel)) {
    env.ROLAND_ENGINEER_MODEL = engineerModel;
  }

  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    env,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return { pid: child.pid ?? null };
}

function readBoardStatusPayload() {
  try {
    const bbPath = path.join(stateDir, 'blackboard.json');
    const cmdPath = path.join(stateDir, 'command-blackboard.md');
    const entries = readJson(bbPath, []);
    const active = Array.isArray(entries) ? entries.filter(e => e.status !== 'archived') : [];
    const blockers = active.filter(e => e.type === 'blocker' || e.status === 'blocked');
    let commandExcerpt = '';
    try { commandExcerpt = fs.readFileSync(cmdPath, 'utf-8').split('\n').slice(0, 30).join('\n'); } catch {}
    return {
      counts: { total: active.length, blockers: blockers.length, done: active.filter(e => e.status === 'done').length },
      blockers: blockers.slice(0, 5).map(b => ({ title: b.title, content: (b.content || '').slice(0, 120) })),
      commandExcerpt,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

function readMissionDagPayload() {
  try {
    const file = path.join(stateDir, 'mission-dag.json');
    if (!fs.existsSync(file)) {
      return { dag: null, message: 'DAG planning not enabled for this mission — using wave mode' };
    }
    const dag = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return { dag, updatedAt: dag.updatedAt ?? Date.now() };
  } catch {
    return { dag: null, message: 'Mission DAG unreadable' };
  }
}

// ── File watcher (debounced push) ─────────────────────────────────────────────

const WATCH_TARGETS = new Set(['run-state.json', 'hitl-state.json', 'memory.md', 'hitl.json', 'blackboard.json', 'command-blackboard.md', 'mission-dag.json']);
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

  // ── /api/models GET ──────────────────────────────────────────────────────
  if (url === '/api/models' && method === 'GET') {
    jsonOk(res, buildModelsApiPayload());
    return;
  }

  // ── /api/mission-meta GET ────────────────────────────────────────────────
  if (url === '/api/mission-meta' && method === 'GET') {
    jsonOk(res, { meta: readMissionMeta() });
    return;
  }

  // ── /api/supervisor GET ──────────────────────────────────────────────────
  if (url === '/api/supervisor' && method === 'GET') {
    const rec = readSupervisorRecord();
    const alive = rec?.pid ? isProcessAlive(rec.pid) : false;
    const runSummary = summarizeRunState();
    const missionMeta = readMissionMeta();
    jsonOk(res, {
      record: rec,
      alive,
      logFile: rec?.logFile ?? null,
      run: runSummary,
      missionMeta,
      missionActive: Boolean(alive || runSummary?.active),
    });
    return;
  }

  // ── /api/supervisor/logs GET ─────────────────────────────────────────────
  if (url === '/api/supervisor/logs' && method === 'GET') {
    const rec = readSupervisorRecord();
    const q = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams;
    const lines = Math.min(Math.max(Number(q.get('lines') ?? 40), 5), 200);
    jsonOk(res, {
      logFile: rec?.logFile ?? null,
      tail: tailLogFile(rec?.logFile, lines),
    });
    return;
  }

  // ── /api/board-cleanup POST ──────────────────────────────────────────────
  if (url === '/api/board-cleanup' && method === 'POST') {
    try {
      const body = await readBody(req);
      const goal = typeof body.goal === 'string' ? body.goal : '';
      const dryRun = Boolean(body.dryRun);
      const mod = await loadBoardCleanupModule();
      if (!mod) {
        jsonErr(res, 'Board cleanup unavailable — run `npm run build` first', 503);
        return;
      }
      const result = mod.cleanupBoardsForNewMission(stateDir, goal, { dryRun, goal });
      jsonOk(res, {
        ok: true,
        dryRun,
        report: mod.formatCleanupReport(result),
        result,
      });
    } catch (e) { jsonErr(res, e.message, 500); }
    return;
  }

  // ── /api/mission POST ────────────────────────────────────────────────────
  if (url === '/api/mission' && method === 'POST') {
    try {
      const body = await readBody(req);
      const rawGoal = typeof body.goal === 'string' ? body.goal.trim() : '';
      if (!rawGoal) { jsonErr(res, 'goal is required'); return; }

      const supervisor = readSupervisorRecord();
      if (supervisor?.pid && isProcessAlive(supervisor.pid)) {
        jsonErr(res, `A background mission is already running (PID ${supervisor.pid}). Stop it with \`roland bg-stop\` or wait for completion.`, 409);
        return;
      }

      const runState = readJson(path.join(stateDir, 'run-state.json'), null);
      const ACTIVE = new Set(['planning', 'running', 'reviewing', 'synthesizing']);
      const runFresh = runState?.updatedAt && (Date.now() - runState.updatedAt) < 600_000;
      if (runState?.runId && ACTIVE.has(runState.status) && runFresh) {
        jsonErr(res, `A team mission is already active (${runState.status}). Wait for completion or use HITL controls.`, 409);
        return;
      }

      const priority = ['P1', 'P2', 'P3', 'P4'].includes(body.priority) ? body.priority : 'P3';
      const runName = typeof body.runName === 'string' ? body.runName.trim() : '';
      const forceTeam = Boolean(body.forceTeam);
      const pmModel = typeof body.pmModel === 'string' ? body.pmModel : DEFAULT_PM_MODEL;
      const engineerModel = typeof body.engineerModel === 'string' ? body.engineerModel : DEFAULT_ENGINEER_MODEL;
      const notify = Boolean(body.notify);
      const cleanup = Boolean(body.cleanup);

      if (cleanup) {
        const mod = await loadBoardCleanupModule();
        if (mod) mod.cleanupBoardsForNewMission(stateDir, rawGoal, { goal: rawGoal });
      }

      const effectiveGoal = buildMissionGoal(rawGoal, { priority, runName, forceTeam });
      const { pid } = spawnTeamMission(effectiveGoal, { pmModel, engineerModel, notify, clean: cleanup });

      writeMissionMeta({
        goal: rawGoal,
        effectiveGoal,
        runName: runName || null,
        priority,
        forceTeam,
        pmModel,
        engineerModel,
        pid,
        startedAt: Date.now(),
      });

      jsonOk(res, {
        ok: true,
        pid,
        goal: rawGoal,
        effectiveGoal,
        message: 'Mission launched in background',
        logHint: 'roland bg-logs --follow',
        boardStatusUrl: '/api/board-status',
      });
    } catch (e) { jsonErr(res, e.message, 500); }
    return;
  }

  // ── /api/mission-dag GET ─────────────────────────────────────────────────
  if (url === '/api/mission-dag' && method === 'GET') {
    try {
      jsonOk(res, readMissionDagPayload());
    } catch (e) { jsonErr(res, e.message, 500); }
    return;
  }

  // ── /api/board-status GET ────────────────────────────────────────────────
  if (url === '/api/board-status' && method === 'GET') {
    try {
      const mod = await loadBoardReportModule();
      if (mod) {
        const report = mod.buildBoardStatusReport(stateDir);
        const concise = mod.formatConciseUnscSummary(report);
        jsonOk(res, { report, concise, markdown: concise, updatedAt: Date.now() });
        return;
      }
      jsonOk(res, { fallback: readBoardStatusPayload(), markdown: '(Run npm run build for full board-status API)' });
    } catch (e) { jsonErr(res, e.message, 500); }
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
    const boardStatus = readBoardStatusPayload();
    const missionDag = readMissionDagPayload();
    ws.send(JSON.stringify({ type: 'state-update', runState, hitlState, boardStatus, missionDag }));
  } catch {}
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(port, host, () => {
  const localBase = `http://127.0.0.1:${port}`;
  const bindBase  = host === '0.0.0.0' ? localBase : `http://${host}:${port}`;
  console.log(`\n  🎛  Roland Dashboard 2.0`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  UI        : ${bindBase}`);
  console.log(`  Local     : ${localBase}`);
  if (host === '0.0.0.0') {
    console.log(`  Tailscale : http://<your-tailscale-ip>:${port}`);
  }
  console.log(`  WebSocket : ws://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
  console.log(`  State dir : ${stateDir}`);
  console.log(`  Project   : ${projectRoot}`);
  console.log(`  APIs      : ${localBase}/api/usage  ${localBase}/api/run-state`);
  console.log(`              ${localBase}/api/memory  ${localBase}/api/hitl/:cmd`);
  console.log(`              ${localBase}/api/board-status  ${localBase}/api/mission-dag`);
  console.log(`\n  Open the URL above in your browser (Tailscale: use machine IP).\n`);
});
