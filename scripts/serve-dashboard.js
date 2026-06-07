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
 *   POST /api/team-goal            → append team goal to blackboard + command board
 *   GET  /api/mission-dag          → .roland/mission-dag.json (task graph export)
 *   GET  /api/project-context      → cwd, git branch, remote, last commit
 *   GET  /api/projects               → discoverable Roland projects
 *   GET  /api/project-templates      → scaffold templates for new projects
 *   POST /api/create-project         → scaffold a new project directory
 *   POST /api/switch-project         → switch active project context
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
import { randomUUID } from 'crypto';
import { spawn, execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { WebSocketServer } from 'ws';
import {
  VALID_CURSOR_MODELS,
  DEFAULT_PM_MODEL,
  DEFAULT_ENGINEER_MODEL,
} from '../dist/rco/cursor-models.js';
import {
  sanitizeStaleMissionState,
  cleanupPreviousRuns,
  isolateProjectMissionState,
  readActiveMissionMeta,
  readActiveRunStateForClient,
  readMissionMetaFile,
  isSupervisorAlive,
  isRunStateActive,
  waitForSupervisorReady,
  buildSupervisorStartDiagnostics,
} from '../dist/rco/mission-state.js';
import { isComplexGoalForDag } from '../dist/rco/mission-dag.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Structured logging (production-friendly prefixes) ─────────────────────────

function logTs() { return new Date().toISOString(); }

/** Server lifecycle and static asset messages */
function logDashboard(msg, detail) {
  if (detail !== undefined) console.log(`[DASHBOARD] ${logTs()} ${msg}`, detail);
  else console.log(`[DASHBOARD] ${logTs()} ${msg}`);
}

/** Mission spawn, blackboard writes, supervisor state */
function logMission(msg, detail) {
  if (detail !== undefined) console.log(`[MISSION] ${logTs()} ${msg}`, detail);
  else console.log(`[MISSION] ${logTs()} ${msg}`);
}

/** Project switch, create, and mission migration */
function logProject(msg, detail) {
  if (detail !== undefined) console.log(`[PROJECT] ${logTs()} ${msg}`, detail);
  else console.log(`[PROJECT] ${logTs()} ${msg}`);
}

/** Blackboard read/write, mission context load, project isolation */
function logState(msg, detail) {
  if (detail !== undefined) console.log(`[STATE] ${logTs()} ${msg}`, detail);
  else console.log(`[STATE] ${logTs()} ${msg}`);
}

/** Per-task git branch / commit / push / draft PR workflow */
function logGit(msg, detail) {
  if (detail !== undefined) console.log(`[GIT] ${logTs()} ${msg}`, detail);
  else console.log(`[GIT] ${logTs()} ${msg}`);
}

/** Dashboard team-goal create / append operations */
function logGoal(msg, detail) {
  if (detail !== undefined) console.log(`[GOAL] ${logTs()} ${msg}`, detail);
  else console.log(`[GOAL] ${logTs()} ${msg}`);
}

/** HTTP API request/response tracing for mission-related routes */
function logApi(method, route, msg, detail) {
  const line = `[API] ${logTs()} ${method} ${route} — ${msg}`;
  if (detail !== undefined) console.log(line, detail);
  else console.log(line);
}

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function argValue(name) {
  const eq  = args.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1];
  return null;
}

const port        = Number(argValue('port') ?? 8081);
const host        = argValue('host') ?? '0.0.0.0';
const rolandInstallRoot = path.resolve(path.join(__dirname, '..'));
const rolandEntry = path.join(rolandInstallRoot, 'dist', 'index.js');

const cliStateDirArg    = argValue('state-dir');
const cliProjectRootArg = argValue('project-root');
const cliOverridesProject = Boolean(cliStateDirArg || cliProjectRootArg);

function expandTilde(p) {
  if (!p || !p.startsWith('~')) return p;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return home ? path.join(home, p.slice(1).replace(/^\//, '')) : p;
}

function resolveInitialStateDir() {
  return path.resolve(cliStateDirArg ?? '.roland');
}

function resolveInitialProjectRoot(initialStateDir) {
  if (cliProjectRootArg) return path.resolve(cliProjectRootArg);
  for (const key of ['ROLAND_PROJECT_ROOT', 'ROLAND_ROOT']) {
    const val = process.env[key]?.trim();
    if (val) return path.resolve(val);
  }
  if (path.basename(initialStateDir) === '.roland') return path.dirname(initialStateDir);
  return rolandInstallRoot;
}

/** Fixed anchor — dashboard config.json lives here across project switches */
const anchorProjectRoot = resolveInitialProjectRoot(resolveInitialStateDir());
const dashboardConfigPath = path.join(anchorProjectRoot, '.roland', 'config.json');

function readDashboardConfig() {
  const cfg = readJson(dashboardConfigPath, {});
  return {
    lastProjectPath: typeof cfg.lastProjectPath === 'string' ? cfg.lastProjectPath : null,
    knownProjects: Array.isArray(cfg.knownProjects)
      ? cfg.knownProjects.filter(p => typeof p === 'string')
      : [],
    scanDirs: Array.isArray(cfg.scanDirs)
      ? cfg.scanDirs.filter(p => typeof p === 'string')
      : [],
  };
}

function writeDashboardConfig(patch) {
  const prev = readDashboardConfig();
  const next = {
    ...prev,
    ...patch,
    updatedAt: Date.now(),
  };
  fs.mkdirSync(path.dirname(dashboardConfigPath), { recursive: true });
  fs.writeFileSync(dashboardConfigPath, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

function isValidProjectRoot(dir) {
  try {
    if (!dir || !fs.existsSync(dir)) return false;
    if (!fs.statSync(dir).isDirectory()) return false;
    if (fs.existsSync(path.join(dir, '.roland'))) return true;
    if (fs.existsSync(path.join(dir, '.git'))) return true;
    return false;
  } catch {
    return false;
  }
}

function projectHasRoland(dir) {
  return fs.existsSync(path.join(dir, '.roland'));
}

function bootstrapActiveProject() {
  const initialStateDir = resolveInitialStateDir();
  let bootProjectRoot = resolveInitialProjectRoot(initialStateDir);
  let bootStateDir = initialStateDir;

  if (!cliOverridesProject) {
    const cfg = readDashboardConfig();
    if (cfg.lastProjectPath && isValidProjectRoot(cfg.lastProjectPath)) {
      bootProjectRoot = path.resolve(cfg.lastProjectPath);
      bootStateDir = path.join(bootProjectRoot, '.roland');
    }
  } else if (path.basename(bootStateDir) === '.roland') {
    bootProjectRoot = path.dirname(bootStateDir);
  } else if (cliProjectRootArg) {
    bootStateDir = path.join(bootProjectRoot, '.roland');
  }

  return { projectRoot: bootProjectRoot, stateDir: bootStateDir };
}

/** Mutable runtime context — updated by POST /api/switch-project */
const _boot = bootstrapActiveProject();
let activeProjectRoot = _boot.projectRoot;
let activeStateDir    = _boot.stateDir;

function getRolandEntryForProject(projectPath) {
  const localEntry = path.join(projectPath, 'dist', 'index.js');
  if (fs.existsSync(localEntry)) return localEntry;
  return rolandEntry;
}

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

function jsonErr(res, message, status = 400, extra = {}) {
  setCors(res);
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify({ error: message, ...extra }));
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
  fs.mkdirSync(activeStateDir, { recursive: true });

  const queueFile = path.join(activeStateDir, 'hitl.json');
  const queue     = readJson(queueFile, []);
  const arr       = Array.isArray(queue) ? queue : [];
  arr.push({ ...cmd, timestamp: Date.now() });
  fs.writeFileSync(queueFile, JSON.stringify(arr, null, 2), 'utf-8');

  _syncHitlObserverState(cmd.cmd, arr.length);
}

function _syncHitlObserverState(cmdType, queueLen = 0) {
  const stateFile = path.join(activeStateDir, 'hitl-state.json');
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

function summarizeSupervisorPayload() {
  sanitizeStaleMissionState(activeStateDir, (msg, detail) => logState(msg, detail));
  const rec = readSupervisorRecord();
  const alive = rec?.pid ? isProcessAlive(rec.pid) : false;
  const run = summarizeRunState();
  const meta = readMissionMeta();
  return {
    record: alive ? rec : null,
    alive,
    logFile: alive ? (rec?.logFile ?? null) : null,
    run,
    missionMeta: meta,
    missionActive: Boolean(alive || run?.active),
    projectRoot: activeProjectRoot,
    stateDir: activeStateDir,
  };
}

function readTaskGitPayload() {
  return readJson(path.join(activeStateDir, 'task-git.json'), null);
}

function pushCurrentState() {
  sanitizeStaleMissionState(activeStateDir, (msg, detail) => logState(msg, detail));
  const runState  = readActiveRunStateForClient(activeStateDir);
  const hitlState = readJson(path.join(activeStateDir, 'hitl-state.json'), null);
  const boardStatus = readBoardStatusPayload();
  const missionDag = readMissionDagPayload();
  const projectContext = readProjectContextPayload();
  const taskGit = readTaskGitPayload();
  const supervisor = summarizeSupervisorPayload();
  broadcast({
    type: 'state-update',
    runState,
    hitlState,
    boardStatus,
    missionDag,
    projectContext,
    taskGit,
    supervisor,
  });
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
  return readJson(path.join(activeStateDir, 'supervisor.pid'), null);
}

function readMissionMeta() {
  return readActiveMissionMeta(activeStateDir);
}

function writeMissionMeta(meta) {
  fs.mkdirSync(activeStateDir, { recursive: true });
  fs.writeFileSync(
    path.join(activeStateDir, 'mission-meta.json'),
    JSON.stringify({ ...meta, updatedAt: Date.now() }, null, 2),
    'utf-8',
  );
}

function summarizeRunState() {
  const rs = readActiveRunStateForClient(activeStateDir);
  if (!rs?.runId) return null;
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
    active: true,
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

/** Read blackboard.json as an array — always returns an array. */
function readBlackboardEntries() {
  const bbPath = path.join(activeStateDir, 'blackboard.json');
  const raw = readJson(bbPath, []);
  return Array.isArray(raw) ? raw : [];
}

/**
 * Persist blackboard.json synchronously with mkdir + error handling.
 * Throws on write failure so callers can surface a 500 to the client.
 */
function writeBlackboardEntries(entries) {
  const bbPath = path.join(activeStateDir, 'blackboard.json');
  fs.mkdirSync(activeStateDir, { recursive: true });
  try {
    fs.writeFileSync(bbPath, JSON.stringify(entries, null, 2), 'utf-8');
    logState('Blackboard write', {
      stateDir: activeStateDir,
      count: entries.length,
      active: entries.filter(e => e.status !== 'archived').length,
    });
  } catch (e) {
    logMission(`Failed to write blackboard.json: ${e.message}`, { path: bbPath, count: entries.length });
    throw e;
  }
}

/** Record a dashboard mission launch on the blackboard for immediate UI visibility. */
function appendMissionLaunchEntry({ goal, runName, priority, pid }) {
  const entries = readBlackboardEntries();
  const beforeCount = entries.filter(e => e.status !== 'archived').length;
  const now = Date.now();
  const title = runName?.trim()
    ? `Mission launched: ${runName.trim()}`
    : 'Mission launched from dashboard';

  entries.push({
    id: randomUUID(),
    type: 'decision',
    title,
    content: [
      'Dashboard started a background team mission.',
      `Goal: ${goal}`,
      `Priority: ${priority || 'P3'}`,
      pid ? `Supervisor PID: ${pid}` : null,
    ].filter(Boolean).join('\n'),
    status: 'done',
    author: 'dashboard',
    priority: priority === 'P1' ? 'critical' : priority === 'P2' ? 'high' : 'medium',
    tags: ['mission-launch', 'dashboard'],
    relatedIds: [],
    rev: 1,
    createdAt: now,
    updatedAt: now,
  });

  writeBlackboardEntries(entries);
  const afterCount = entries.filter(e => e.status !== 'archived').length;
  logMission(`Blackboard updated for mission launch`, { beforeCount, afterCount, title });
  return { beforeCount, afterCount, title };
}

const VALID_GOAL_PRIORITIES = new Set(['P1', 'P2', 'P3', 'P4']);

function goalPriorityToBlackboard(priority) {
  switch (priority) {
    case 'P1': return 'critical';
    case 'P2': return 'high';
    case 'P4': return 'low';
    default: return 'medium';
  }
}

async function loadCommandBlackboardModule() {
  const modPath = path.join(rolandInstallRoot, 'dist', 'rco', 'command-blackboard.js');
  try {
    return await import(pathToFileURL(modPath).href);
  } catch {
    return null;
  }
}

/**
 * Append a team goal during an active mission — blackboard.json + Mission Objectives.
 * Returns the new blackboard entry.
 */
async function appendTeamGoalEntry({ goal, priority = 'P3', author = 'dashboard' }) {
  const trimmed = String(goal || '').trim();
  if (!trimmed) throw new Error('goal is required');

  const prio = VALID_GOAL_PRIORITIES.has(priority) ? priority : 'P3';
  const entries = readBlackboardEntries();
  const now = Date.now();
  const title = trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;

  const entry = {
    id: randomUUID(),
    type: 'task',
    title: 'TEAM GOAL',
    content: trimmed,
    status: 'pending',
    author,
    priority: goalPriorityToBlackboard(prio),
    tags: ['goal', 'dashboard', prio.toLowerCase()],
    relatedIds: [],
    rev: 1,
    createdAt: now,
    updatedAt: now,
  };

  entries.push(entry);
  writeBlackboardEntries(entries);

  const cbMod = await loadCommandBlackboardModule();
  if (cbMod?.CommandBlackboard) {
    try {
      const board = new cbMod.CommandBlackboard(activeStateDir);
      board.appendBullet('Mission Objectives', `[${prio} active] ${trimmed}`);
    } catch (e) {
      logGoal(`Command board update failed: ${e.message}`, { stateDir: activeStateDir });
    }
  } else {
    logGoal('CommandBlackboard module unavailable — blackboard entry only', {
      hint: 'run npm run build',
    });
  }

  logGoal('Team goal created', {
    id: entry.id,
    priority: prio,
    title,
    stateDir: activeStateDir,
    projectRoot: activeProjectRoot,
    missionActive: isMissionActive(),
    activeEntries: entries.filter(e => e.status !== 'archived').length,
  });

  return entry;
}

async function loadBoardCleanupModule() {
  const modPath = path.join(rolandInstallRoot, 'dist', 'rco', 'board-cleanup.js');
  try {
    return await import(pathToFileURL(modPath).href);
  } catch {
    return null;
  }
}

function spawnTeamMission(effectiveGoal, options = {}) {
  const entry = getRolandEntryForProject(activeProjectRoot);
  if (!fs.existsSync(entry)) {
    throw new Error(`Roland not built — run \`npm run build\` in ${rolandInstallRoot}`);
  }

  const {
    pmModel,
    engineerModel,
    notify = false,
    clean = false,
  } = options;

  const args = [
    entry,
    'team',
    effectiveGoal,
    '--background',
    '--quiet',
    '--no-tui',
    '--state-dir',
    activeStateDir,
  ];
  if (notify) args.push('--notify');
  if (clean) args.push('--clean');

  const env = {
    ...process.env,
    ROLAND_STATE_DIR: activeStateDir,
    ROLAND_PROJECT_ROOT: activeProjectRoot,
    ROLAND_ROOT: activeProjectRoot,
    ROLAND_SIMPLE_TUI: '1',
  };
  if (pmModel && pmModel !== 'auto' && VALID_MODEL_IDS.has(pmModel)) env.ROLAND_PM_MODEL = pmModel;
  if (engineerModel && engineerModel !== 'auto' && VALID_MODEL_IDS.has(engineerModel)) {
    env.ROLAND_ENGINEER_MODEL = engineerModel;
  }

  const child = spawn(process.execPath, args, {
    cwd: activeProjectRoot,
    env,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  logMission('Spawned background team mission', {
    pid: child.pid ?? null,
    projectRoot: activeProjectRoot,
    stateDir: activeStateDir,
  });
  return { pid: child.pid ?? null, spawnPid: child.pid ?? null };
}

class SupervisorStartError extends Error {
  constructor(message, diagnostics) {
    super(message);
    this.name = 'SupervisorStartError';
    this.code = 'SUPERVISOR_START_FAILED';
    this.diagnostics = diagnostics;
  }
}

/**
 * After spawnTeamMission, poll supervisor.pid until live or fail with diagnostics.
 * Writes mission-meta only when the real supervisor PID is confirmed.
 */
async function confirmSupervisorAndWriteMissionMeta(metaFields) {
  const ready = await waitForSupervisorReady(activeStateDir);
  if (!ready.ready || !ready.record?.pid) {
    const diag = buildSupervisorStartDiagnostics(
      activeStateDir,
      ready.error ?? 'Background supervisor did not become ready',
    );
    logMission('Supervisor readiness failed', {
      stateDir: activeStateDir,
      waitedMs: ready.waitedMs,
      error: ready.error ?? null,
      logFile: diag.logFile,
    });
    throw new SupervisorStartError(diag.message, {
      ...diag,
      waitedMs: ready.waitedMs,
      supervisorError: ready.error ?? null,
    });
  }

  writeMissionMeta({
    ...metaFields,
    pid: ready.record.pid,
    logFile: ready.record.logFile ?? null,
    supervisorStartedAt: ready.record.startedAt ?? Date.now(),
  });

  logMission('Supervisor confirmed ready', {
    pid: ready.record.pid,
    waitedMs: ready.waitedMs,
    logFile: ready.record.logFile ?? null,
  });

  return { pid: ready.record.pid, record: ready.record, waitedMs: ready.waitedMs };
}

function readBoardStatusPayload() {
  try {
    const bbPath = path.join(activeStateDir, 'blackboard.json');
    const cmdPath = path.join(activeStateDir, 'command-blackboard.md');
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

function shortenHome(p) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home && (p === home || p.startsWith(home + path.sep))) {
    return '~' + p.slice(home.length);
  }
  return p;
}

function runGitQuiet(args, cwd) {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function readProjectContextPayload() {
  const cwd = activeProjectRoot;
  const exists = Boolean(cwd && fs.existsSync(cwd));

  if (!exists) {
    return {
      cwd: cwd || null,
      displayPath: cwd || null,
      projectName: null,
      isGitRepo: false,
      branch: null,
      remote: null,
      lastCommit: null,
      gitStatusSummary: null,
      stateDir: activeStateDir,
      updatedAt: Date.now(),
      warning: 'No project context — running in unknown directory',
    };
  }

  const projectName = path.basename(cwd);
  const displayPath = shortenHome(cwd);
  const isGitRepo = fs.existsSync(path.join(cwd, '.git'));
  let branch = null;
  let remote = null;
  let lastCommit = null;
  let gitStatusSummary = null;

  if (isGitRepo) {
    branch = runGitQuiet('rev-parse --abbrev-ref HEAD', cwd);
    remote = runGitQuiet('remote get-url origin', cwd)
      ?? runGitQuiet('remote', cwd);
    const sha = runGitQuiet('rev-parse --short HEAD', cwd);
    const subject = runGitQuiet('log -1 --pretty=%s', cwd);
    if (sha) {
      lastCommit = {
        sha,
        subject: subject || null,
        date: runGitQuiet('log -1 --pretty=%cI', cwd),
      };
    }
    const porcelain = runGitQuiet('status --porcelain', cwd);
    if (porcelain !== null) {
      const changed = porcelain.split('\n').filter(Boolean).length;
      gitStatusSummary = changed === 0 ? 'clean' : `${changed} changed`;
    }
  }

  return {
    cwd,
    displayPath,
    projectName,
    isGitRepo,
    branch,
    remote,
    lastCommit,
    gitStatusSummary,
    stateDir: activeStateDir,
    updatedAt: Date.now(),
    warning: null,
  };
}

function dirLastModified(dir) {
  try {
    if (!fs.existsSync(dir)) return 0;
    return fs.statSync(dir).mtimeMs;
  } catch {
    return 0;
  }
}

function summarizeProjectEntry(dir) {
  const resolved = path.resolve(dir);
  const isGit = fs.existsSync(path.join(resolved, '.git'));
  const branch = isGit ? runGitQuiet('rev-parse --abbrev-ref HEAD', resolved) : null;
  const rolandDir = path.join(resolved, '.roland');
  const lastModified = Math.max(
    dirLastModified(resolved),
    dirLastModified(rolandDir),
  );
  const missionActive = isMissionActiveInStateDir(rolandDir);
  return {
    name: path.basename(resolved),
    path: resolved,
    displayPath: shortenHome(resolved),
    isGit,
    branch,
    hasRoland: projectHasRoland(resolved),
    lastModified,
    isActive: resolved === path.resolve(activeProjectRoot),
    missionActive,
  };
}

function defaultScanDirs(cfg) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const defaults = home
    ? [path.join(home, 'projects'), path.join(home, 'code'), path.join(home, 'dev')]
    : [];
  const envDirs = (process.env.ROLAND_DASHBOARD_SCAN_DIRS ?? '')
    .split(/[:;,]/)
    .map(s => expandTilde(s.trim()))
    .filter(Boolean);
  const cfgDirs = (cfg.scanDirs ?? []).map(expandTilde);
  return [...new Set([...envDirs, ...cfgDirs, ...defaults])];
}

function discoverProjectPaths() {
  const cfg = readDashboardConfig();
  const paths = new Set();

  paths.add(path.resolve(activeProjectRoot));
  paths.add(path.resolve(anchorProjectRoot));
  for (const p of cfg.knownProjects) {
    if (p) paths.add(path.resolve(expandTilde(p)));
  }
  if (cfg.lastProjectPath) paths.add(path.resolve(expandTilde(cfg.lastProjectPath)));

  for (const scanRoot of defaultScanDirs(cfg)) {
    try {
      if (!fs.existsSync(scanRoot)) continue;
      for (const ent of fs.readdirSync(scanRoot, { withFileTypes: true })) {
        if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
        paths.add(path.join(scanRoot, ent.name));
      }
    } catch { /* unreadable scan root */ }
  }

  const projects = [];
  for (const p of paths) {
    if (!isValidProjectRoot(p)) continue;
    projects.push(summarizeProjectEntry(p));
  }

  projects.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return (b.lastModified ?? 0) - (a.lastModified ?? 0);
  });

  return projects;
}

function readProjectsPayload() {
  return {
    activePath: activeProjectRoot,
    activeDisplayPath: shortenHome(activeProjectRoot),
    projects: discoverProjectPaths(),
    configPath: dashboardConfigPath,
    updatedAt: Date.now(),
  };
}

function isMissionActiveInStateDir(dir) {
  sanitizeStaleMissionState(dir, (msg, detail) => logState(msg, detail));
  return isSupervisorAlive(dir) || isRunStateActive(dir);
}

function isMissionActive() {
  return isMissionActiveInStateDir(activeStateDir);
}

/** Read mission payload from a specific state dir (for migration). */
function extractMigrationPayload(stateDir) {
  const missionMeta = readJson(path.join(stateDir, 'mission-meta.json'), null);
  const runState = readJson(path.join(stateDir, 'run-state.json'), null);
  const supervisor = readJson(path.join(stateDir, 'supervisor.pid'), null);

  const goal = missionMeta?.effectiveGoal || missionMeta?.goal || runState?.goal || supervisor?.goal;
  if (!goal) return null;

  return {
    goal,
    rawGoal: missionMeta?.goal || goal,
    effectiveGoal: missionMeta?.effectiveGoal || goal,
    runName: missionMeta?.runName ?? null,
    priority: missionMeta?.priority || 'P3',
    forceTeam: Boolean(missionMeta?.forceTeam),
    pmModel: missionMeta?.pmModel,
    engineerModel: missionMeta?.engineerModel,
    fromProjectRoot: missionMeta?.projectRoot || null,
    previousMissionId: missionMeta?.id || null,
  };
}

/** Send HITL abort to a background mission in the given state dir. */
function abortMissionInStateDir(stateDir) {
  const supervisor = readJson(path.join(stateDir, 'supervisor.pid'), null);
  if (!supervisor?.pid || !isProcessAlive(supervisor.pid)) return false;

  fs.mkdirSync(stateDir, { recursive: true });
  const queueFile = path.join(stateDir, 'hitl.json');
  const queue = readJson(queueFile, []);
  const arr = Array.isArray(queue) ? queue : [];
  arr.push({ cmd: 'abort', timestamp: Date.now() });
  fs.writeFileSync(queueFile, JSON.stringify(arr, null, 2), 'utf-8');

  const stateFile = path.join(stateDir, 'hitl-state.json');
  const s = readJson(stateFile, { paused: false, updatedAt: 0 });
  s.abortPending = true;
  s.updatedAt = Date.now();
  fs.writeFileSync(stateFile, JSON.stringify(s, null, 2), 'utf-8');

  logProject('Abort sent for mission migration', { stateDir, pid: supervisor.pid });
  return true;
}

/** Record mission migration on the active project's blackboard. */
function appendMigrationEntry({ fromProjectRoot, goal, pid }) {
  const entries = readBlackboardEntries();
  const now = Date.now();
  entries.push({
    id: randomUUID(),
    type: 'decision',
    title: 'Mission migrated to this project',
    content: [
      'Dashboard migrated an active background mission into this project context.',
      fromProjectRoot ? `From: ${shortenHome(fromProjectRoot)}` : null,
      `Goal: ${goal}`,
      pid ? `New supervisor PID: ${pid}` : null,
    ].filter(Boolean).join('\n'),
    status: 'done',
    author: 'dashboard',
    priority: 'high',
    tags: ['mission-migration', 'dashboard'],
    relatedIds: [],
    rev: 1,
    createdAt: now,
    updatedAt: now,
  });
  writeBlackboardEntries(entries);
}

/**
 * Re-spawn an active mission in the current activeProjectRoot after a project switch.
 * Caller must have already switched activeProjectRoot / activeStateDir to the target.
 */
async function spawnMigratedMission(payload, fromProjectRoot) {
  const effectiveGoal = payload.effectiveGoal || payload.goal;
  spawnTeamMission(effectiveGoal, {
    pmModel: payload.pmModel,
    engineerModel: payload.engineerModel,
    notify: false,
    clean: false,
  });

  const missionId = randomUUID();
  const { pid } = await confirmSupervisorAndWriteMissionMeta({
    id: missionId,
    goal: payload.rawGoal,
    effectiveGoal,
    runName: payload.runName,
    priority: payload.priority || 'P3',
    forceTeam: payload.forceTeam || false,
    pmModel: payload.pmModel,
    engineerModel: payload.engineerModel,
    projectRoot: activeProjectRoot,
    stateDir: activeStateDir,
    status: 'active',
    startedAt: Date.now(),
    migratedFrom: fromProjectRoot,
    migratedAt: Date.now(),
    previousMissionId: payload.previousMissionId,
  });

  try {
    appendMigrationEntry({ fromProjectRoot, goal: payload.rawGoal, pid });
  } catch (e) {
    logProject(`Blackboard migration entry failed: ${e.message}`);
  }

  logProject('Mission respawned in target project', {
    from: fromProjectRoot,
    to: activeProjectRoot,
    pid,
    goal: payload.rawGoal.slice(0, 80),
  });

  return { missionId, pid, goal: payload.rawGoal, migrated: true };
}

/**
 * Migrate an active mission from one project's .roland/ to another project root.
 * Aborts the source supervisor and respawns in the target (active context must be target).
 */
async function migrateActiveMission(fromStateDir, fromProjectRoot, toProjectRoot) {
  if (!isMissionActiveInStateDir(fromStateDir)) {
    return { migrated: false, reason: 'no_active_mission' };
  }

  const payload = extractMigrationPayload(fromStateDir);
  if (!payload) {
    return { migrated: false, reason: 'no_goal' };
  }

  logProject('Migrating active mission', {
    from: fromProjectRoot,
    to: toProjectRoot,
    goal: payload.rawGoal.slice(0, 80),
  });

  abortMissionInStateDir(fromStateDir);
  return spawnMigratedMission(payload, fromProjectRoot);
}

function rememberProjectPath(resolvedPath) {
  const cfg = readDashboardConfig();
  const known = new Set(cfg.knownProjects.map(p => path.resolve(expandTilde(p))));
  known.add(path.resolve(resolvedPath));
  writeDashboardConfig({
    lastProjectPath: path.resolve(resolvedPath),
    knownProjects: [...known],
  });
}

// ── Project creation / scaffolding ────────────────────────────────────────────

const templatesRoot = path.join(__dirname, 'dashboard-templates');

const PROJECT_TEMPLATES = [
  {
    id: 'empty',
    label: 'Empty',
    description: 'README only — bring your own stack',
    hasPackageJson: false,
  },
  {
    id: 'node-express-minimal',
    label: 'Node + Express (minimal)',
    description: 'ESM Express API with / and /health routes',
    hasPackageJson: true,
  },
  {
    id: 'node-typescript',
    label: 'Node + TypeScript',
    description: 'TypeScript Express API with tsx dev script',
    hasPackageJson: true,
  },
];

function defaultProjectsParentDir() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return home ? path.join(home, 'projects') : process.cwd();
}

function sanitizeProjectName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Project name is required');
  if (trimmed === '.' || trimmed === '..') throw new Error('Invalid project name');
  if (/[/\\]/.test(trimmed)) throw new Error('Project name cannot contain path separators');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmed)) {
    throw new Error('Project name must start with a letter or digit and use only letters, digits, dots, hyphens, or underscores');
  }
  return trimmed;
}

function validateParentDirectory(parentDir) {
  const resolved = path.resolve(expandTilde(String(parentDir || '').trim()) || defaultProjectsParentDir());
  if (!fs.existsSync(resolved)) {
    throw new Error(`Parent directory does not exist: ${shortenHome(resolved)}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Parent path is not a directory: ${shortenHome(resolved)}`);
  }
  try {
    fs.accessSync(resolved, fs.constants.W_OK);
  } catch {
    throw new Error(`Parent directory is not writable: ${shortenHome(resolved)}`);
  }
  return resolved;
}

function copyTemplateDir(templateId, destDir, projectName) {
  const srcRoot = path.join(templatesRoot, templateId);
  if (!fs.existsSync(srcRoot)) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  function walk(rel = '') {
    const srcPath = path.join(srcRoot, rel);
    const destPath = path.join(destDir, rel);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      for (const ent of fs.readdirSync(srcPath)) walk(rel ? path.join(rel, ent) : ent);
      return;
    }
    let content = fs.readFileSync(srcPath, 'utf-8');
    content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, content, 'utf-8');
  }

  walk();
}

function initRolandState(projectPath) {
  const stateDir = path.join(projectPath, '.roland');
  fs.mkdirSync(stateDir, { recursive: true });

  const memoryPath = path.join(stateDir, 'memory.md');
  if (!fs.existsSync(memoryPath)) {
    fs.writeFileSync(
      memoryPath,
      [
        '# Project Memory',
        '',
        '## Architecture Decisions',
        '',
        '## Coding Standards',
        '',
        '## Past Mistakes',
        '',
        '## Preferences',
        '',
        '## Project Gotchas',
        '',
      ].join('\n'),
      'utf-8',
    );
  }

  const bbPath = path.join(stateDir, 'blackboard.json');
  if (!fs.existsSync(bbPath)) {
    fs.writeFileSync(bbPath, '[]', 'utf-8');
  }
}

function initGitRepo(projectPath, projectName) {
  runGitQuiet('init', projectPath);
  runGitQuiet(`add -A`, projectPath);
  runGitQuiet(`commit -m "Initial commit: ${projectName}"`, projectPath);
}

function templateHasPackageJson(templateId) {
  return PROJECT_TEMPLATES.find(t => t.id === templateId)?.hasPackageJson ?? false;
}

function spawnNpmInstall(projectPath) {
  const child = spawn('npm', ['install', '--no-fund', '--no-audit'], {
    cwd: projectPath,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  return child.pid ?? null;
}

function readProjectTemplatesPayload() {
  const parent = defaultProjectsParentDir();
  return {
    templates: PROJECT_TEMPLATES,
    defaults: {
      parentDir: parent,
      displayParentDir: shortenHome(parent),
      template: 'node-typescript',
      initGit: true,
      initRoland: true,
      installDeps: true,
      switchContext: true,
    },
    updatedAt: Date.now(),
  };
}

async function createProject(body = {}) {
  const projectName = sanitizeProjectName(body.name);
  const templateId = typeof body.template === 'string' ? body.template.trim() : 'empty';
  if (!PROJECT_TEMPLATES.some(t => t.id === templateId)) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  const parentDir = validateParentDirectory(
    typeof body.parentDir === 'string' && body.parentDir.trim()
      ? body.parentDir.trim()
      : defaultProjectsParentDir(),
  );
  const projectPath = path.join(parentDir, projectName);

  if (fs.existsSync(projectPath)) {
    throw new Error(`Project already exists: ${shortenHome(projectPath)}`);
  }

  const initGit = body.initGit !== false;
  const initRoland = body.initRoland !== false;
  const installDeps = body.installDeps !== false && templateHasPackageJson(templateId);
  const switchContext = body.switchContext !== false;

  fs.mkdirSync(projectPath, { recursive: false });
  copyTemplateDir(templateId, projectPath, projectName);

  if (initRoland) initRolandState(projectPath);
  if (initGit) {
    try {
      initGitRepo(projectPath, projectName);
    } catch (e) {
      runGitQuiet('init', projectPath);
    }
  }

  if (!initGit && !initRoland) {
    initRolandState(projectPath);
  }

  if (!isValidProjectRoot(projectPath)) {
    throw new Error('Project created but is not a valid Roland project root');
  }

  rememberProjectPath(projectPath);
  logProject('Created project', { path: projectPath, template: templateId, switchContext });

  let installPid = null;
  if (installDeps) {
    installPid = spawnNpmInstall(projectPath);
  }

  let switchResult = null;
  if (switchContext) {
    const migrateMission = isMissionActive();
    if (migrateMission) {
      logProject('Create-project with active mission — will migrate after switch', {
        from: activeProjectRoot,
        to: projectPath,
      });
    }
    switchResult = await switchActiveProject(projectPath, { force: true, migrateMission });
  }

  return {
    ok: true,
    path: projectPath,
    displayPath: shortenHome(projectPath),
    name: projectName,
    template: templateId,
    initGit,
    initRoland: initRoland || (!initGit && !initRoland),
    installDeps,
    installPid,
    switched: Boolean(switchResult?.switched ?? switchContext),
    migration: switchResult?.migration ?? null,
    projectContext: switchResult?.projectContext ?? readProjectContextPayload(),
    projects: switchResult?.projects ?? readProjectsPayload(),
  };
}

if (!readDashboardConfig().lastProjectPath) {
  rememberProjectPath(activeProjectRoot);
}

let stateWatcher = null;
let watchTimer = null;

function setupStateWatcher() {
  if (stateWatcher) {
    try { stateWatcher.close(); } catch {}
    stateWatcher = null;
  }
  try {
    fs.mkdirSync(activeStateDir, { recursive: true });
    stateWatcher = fs.watch(activeStateDir, { persistent: false }, (_event, filename) => {
      if (!filename || !WATCH_TARGETS.has(filename)) return;
      clearTimeout(watchTimer);
      watchTimer = setTimeout(pushCurrentState, 200);
    });
  } catch {
    // State dir may not exist yet — watcher inactive until switch/create.
  }
}

async function switchActiveProject(targetPath, { force = false, migrateMission = false } = {}) {
  const resolved = path.resolve(expandTilde(String(targetPath || '').trim()));
  if (!resolved) throw new Error('path is required');
  if (!isValidProjectRoot(resolved)) {
    throw new Error(
      'Invalid project — path must exist and contain a .roland/ folder or be a git repository root',
    );
  }

  if (path.resolve(resolved) === path.resolve(activeProjectRoot)) {
    logProject('Switch skipped — already active', { projectRoot: resolved });
    return { switched: false, projectContext: readProjectContextPayload(), projects: readProjectsPayload() };
  }

  if (!force && isMissionActive()) {
    const err = new Error(
      'A mission is running in the current project. Stop it or confirm switch with force: true.',
    );
    err.code = 'MISSION_ACTIVE';
    throw err;
  }

  const fromRoot = activeProjectRoot;
  const fromStateDir = activeStateDir;
  let migration = null;

  logProject('Switching project context', {
    from: fromRoot,
    to: resolved,
    force,
    migrateMission,
  });

  activeProjectRoot = resolved;
  activeStateDir = path.join(resolved, '.roland');
  fs.mkdirSync(activeStateDir, { recursive: true });
  rememberProjectPath(resolved);
  setupStateWatcher();

  if (migrateMission) {
    logState('Project switch with mission migration — sanitizing target before handoff', {
      from: fromRoot,
      to: resolved,
    });
    sanitizeStaleMissionState(activeStateDir, (msg, detail) => logState(msg, detail));
    if (path.resolve(fromStateDir) !== path.resolve(activeStateDir)) {
      try {
        migration = await migrateActiveMission(fromStateDir, fromRoot, resolved);
      } catch (e) {
        if (e instanceof SupervisorStartError) {
          migration = {
            migrated: false,
            reason: 'supervisor_start_failed',
            error: e.message,
            code: e.code,
            ...e.diagnostics,
          };
          logProject('Mission migration failed — supervisor did not start', migration);
        } else {
          throw e;
        }
      }
    }
  } else {
    const isolation = isolateProjectMissionState(activeStateDir, (msg, detail) => logState(msg, detail));
    logState('Project switch isolation complete', {
      to: resolved,
      archived: isolation.archived,
      actions: isolation.actions,
    });
  }

  pushCurrentState();

  logProject('Project context switched', {
    projectRoot: activeProjectRoot,
    stateDir: activeStateDir,
    migrated: Boolean(migration?.migrated),
  });
  const bbEntries = readBlackboardEntries();
  logState('Mission context loaded for project', {
    projectRoot: activeProjectRoot,
    stateDir: activeStateDir,
    missionActive: isMissionActive(),
    goal: readMissionMeta()?.goal?.slice(0, 60) ?? null,
    blackboardActive: bbEntries.filter(e => e.status !== 'archived').length,
  });

  return {
    switched: true,
    migration,
    projectContext: readProjectContextPayload(),
    projects: readProjectsPayload(),
  };
}

function readMissionDagPayload() {
  try {
    const file = path.join(activeStateDir, 'mission-dag.json');
    if (!fs.existsSync(file)) {
      const meta = readMissionMetaFile(activeStateDir);
      const goal = meta?.effectiveGoal || meta?.goal || '';
      const dagLikely = goal ? isComplexGoalForDag(goal) : false;
      return {
        dag: null,
        planningMode: dagLikely ? 'dag-pending' : 'wave',
        message: dagLikely
          ? 'DAG planning will activate during Lead PM planning for this multi-step goal'
          : 'Wave mode — parallel task waves. DAG auto-enables for complex multi-step goals.',
      };
    }
    const dag = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return { dag, updatedAt: dag.updatedAt ?? Date.now(), planningMode: 'dag' };
  } catch {
    return { dag: null, message: 'Mission DAG unreadable' };
  }
}

// ── File watcher (debounced push) ─────────────────────────────────────────────

const WATCH_TARGETS = new Set([
  'run-state.json', 'hitl-state.json', 'memory.md', 'hitl.json',
  'blackboard.json', 'command-blackboard.md', 'mission-dag.json', 'mission-meta.json',
  'supervisor.pid', 'task-git.json',
]);

setupStateWatcher();

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
    sanitizeStaleMissionState(activeStateDir, (msg, detail) => logState(msg, detail));
    const rs = readActiveRunStateForClient(activeStateDir);
    if (rs) {
      logApi('GET', url, 'ok', { runId: rs.runId ?? null, status: rs.status ?? null });
    } else {
      logApi('GET', url, 'no active run-state', { stateDir: activeStateDir });
    }
    setCors(res);
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(rs ? JSON.stringify(rs) : 'null');
    return;
  }

  // ── /api/usage ───────────────────────────────────────────────────────────
  if (url === '/api/usage' && method === 'GET') {
    const file = path.join(activeStateDir, 'usage-history.json');
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
    const file = path.join(activeStateDir, 'usage-history.json');
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
    const file = path.join(activeStateDir, 'memory.md');
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
      fs.mkdirSync(activeStateDir, { recursive: true });
      fs.writeFileSync(path.join(activeStateDir, 'memory.md'), body.content, 'utf-8');
      jsonOk(res, { ok: true });
    } catch (e) { jsonErr(res, e.message); }
    return;
  }

  // ── /api/hitl-state GET ──────────────────────────────────────────────────
  if (url === '/api/hitl-state' && method === 'GET') {
    jsonOk(res, readJson(path.join(activeStateDir, 'hitl-state.json'), {}));
    return;
  }

  // ── /api/blackboard GET ──────────────────────────────────────────────────
  if (url === '/api/blackboard' && method === 'GET') {
    const entries = readBlackboardEntries();
    const active = entries.filter(e => e.status !== 'archived');
    logApi('GET', url, 'ok', { total: entries.length, active: active.length });
    jsonOk(res, entries);
    return;
  }

  // ── /api/team-goal POST ──────────────────────────────────────────────────
  if (url === '/api/team-goal' && method === 'POST') {
    try {
      const body = await readBody(req);
      const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
      if (!goal) {
        logGoal('POST /api/team-goal — rejected: missing goal');
        jsonErr(res, 'goal is required');
        return;
      }

      const priority = VALID_GOAL_PRIORITIES.has(body.priority) ? body.priority : 'P3';
      sanitizeStaleMissionState(activeStateDir, (msg, detail) => logState(msg, detail));

      if (!isMissionActive()) {
        logGoal('POST /api/team-goal — rejected: no active mission', {
          stateDir: activeStateDir,
          projectRoot: activeProjectRoot,
        });
        jsonErr(res, 'No active mission — start a team run before adding goals', 409);
        return;
      }

      logGoal('POST /api/team-goal — request received', {
        goal: goal.slice(0, 120),
        priority,
        stateDir: activeStateDir,
      });

      const entry = await appendTeamGoalEntry({ goal, priority });
      pushCurrentState();

      logApi('POST', url, 'ok', { id: entry.id, priority });
      jsonOk(res, {
        ok: true,
        entry: {
          id: entry.id,
          title: entry.title,
          content: entry.content,
          status: entry.status,
          priority: entry.priority,
          createdAt: entry.createdAt,
        },
        message: 'Team goal added to command board',
      });
    } catch (e) {
      logGoal(`POST /api/team-goal — error: ${e.message}`);
      jsonErr(res, e.message, 500);
    }
    return;
  }

  // ── /api/models GET ──────────────────────────────────────────────────────
  if (url === '/api/models' && method === 'GET') {
    jsonOk(res, buildModelsApiPayload());
    return;
  }

  // ── /api/mission-meta GET ────────────────────────────────────────────────
  if (url === '/api/mission-meta' && method === 'GET') {
    const meta = readMissionMeta();
    logApi('GET', url, 'ok', { goal: meta?.goal?.slice(0, 60) ?? null, startedAt: meta?.startedAt ?? null });
    jsonOk(res, { meta });
    return;
  }

  // ── /api/project-context GET ─────────────────────────────────────────────
  if (url === '/api/project-context' && method === 'GET') {
    try {
      jsonOk(res, readProjectContextPayload());
    } catch (e) { jsonErr(res, e.message, 500); }
    return;
  }

  // ── /api/task-git GET ────────────────────────────────────────────────────
  if (url === '/api/task-git' && method === 'GET') {
    try {
      const payload = readTaskGitPayload();
      logApi('GET', url, 'ok', { tasks: payload?.tasks ? Object.keys(payload.tasks).length : 0 });
      jsonOk(res, payload ?? { tasks: {}, runId: null, updatedAt: Date.now() });
    } catch (e) { jsonErr(res, e.message, 500); }
    return;
  }

  // ── /api/projects GET ────────────────────────────────────────────────────
  if (url === '/api/projects' && method === 'GET') {
    try {
      jsonOk(res, readProjectsPayload());
    } catch (e) { jsonErr(res, e.message, 500); }
    return;
  }

  // ── /api/project-templates GET ───────────────────────────────────────────
  if (url === '/api/project-templates' && method === 'GET') {
    try {
      jsonOk(res, readProjectTemplatesPayload());
    } catch (e) { jsonErr(res, e.message, 500); }
    return;
  }

  // ── /api/create-project POST ─────────────────────────────────────────────
  if (url === '/api/create-project' && method === 'POST') {
    try {
      const body = await readBody(req);
      const result = await createProject(body);
      jsonOk(res, result);
    } catch (e) { jsonErr(res, e.message, 400); }
    return;
  }

  // ── /api/switch-project POST ─────────────────────────────────────────────
  if (url === '/api/switch-project' && method === 'POST') {
    try {
      const body = await readBody(req);
      const targetPath = typeof body.path === 'string' ? body.path.trim() : '';
      if (!targetPath) { jsonErr(res, 'path is required'); return; }
      const result = await switchActiveProject(targetPath, {
        force: Boolean(body.force),
        migrateMission: Boolean(body.migrateMission),
      });
      jsonOk(res, { ok: true, ...result });
    } catch (e) {
      if (e.code === 'MISSION_ACTIVE') {
        jsonErr(res, e.message, 409);
        return;
      }
      jsonErr(res, e.message, 400);
    }
    return;
  }

  // ── /api/supervisor GET ──────────────────────────────────────────────────
  if (url === '/api/supervisor' && method === 'GET') {
    const payload = summarizeSupervisorPayload();
    logApi('GET', url, 'ok', {
      alive: payload.alive,
      pid: payload.record?.pid ?? null,
      runStatus: payload.run?.status ?? null,
      missionActive: payload.missionActive,
      projectRoot: payload.projectRoot,
    });
    jsonOk(res, payload);
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
      const result = mod.cleanupBoardsForNewMission(activeStateDir, goal, { dryRun, goal });
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
      logMission('POST /api/mission — request received', {
        goal: typeof body.goal === 'string' ? body.goal.slice(0, 120) : null,
        runName: body.runName ?? null,
        priority: body.priority ?? 'P3',
        cleanup: Boolean(body.cleanup),
      });

      const rawGoal = typeof body.goal === 'string' ? body.goal.trim() : '';
      if (!rawGoal) {
        logMission('POST /api/mission — rejected: missing goal');
        jsonErr(res, 'goal is required');
        return;
      }

      sanitizeStaleMissionState(activeStateDir, (msg, detail) => logState(msg, detail));

      if (isSupervisorAlive(activeStateDir)) {
        const supervisor = readSupervisorRecord();
        logMission(`POST /api/mission — rejected: supervisor already running PID ${supervisor?.pid}`);
        jsonErr(res, `A background mission is already running (PID ${supervisor?.pid}). Stop it with \`roland bg-stop\` or wait for completion.`, 409);
        return;
      }

      if (isRunStateActive(activeStateDir)) {
        const runState = readJson(path.join(activeStateDir, 'run-state.json'), null);
        logMission(`POST /api/mission — rejected: active run ${runState?.runId} (${runState?.status})`);
        jsonErr(res, `A team mission is already active (${runState?.status}). Wait for completion or use HITL controls.`, 409);
        return;
      }

      const priority = ['P1', 'P2', 'P3', 'P4'].includes(body.priority) ? body.priority : 'P3';
      const runName = typeof body.runName === 'string' ? body.runName.trim() : '';
      const forceTeam = Boolean(body.forceTeam);
      const pmModel = typeof body.pmModel === 'string' ? body.pmModel : DEFAULT_PM_MODEL;
      const engineerModel = typeof body.engineerModel === 'string' ? body.engineerModel : DEFAULT_ENGINEER_MODEL;
      const notify = Boolean(body.notify);
      const cleanup = Boolean(body.cleanup);

      const bbBefore = readBlackboardEntries().filter(e => e.status !== 'archived').length;
      logMission('Blackboard before mission launch', { activeEntries: bbBefore });

      const boardCleanupMod = await loadBoardCleanupModule();
      cleanupPreviousRuns(
        activeStateDir,
        rawGoal,
        {
          runBoardCleanup: cleanup && boardCleanupMod
            ? (dir, g) => boardCleanupMod.cleanupBoardsForNewMission(dir, g, { goal: g })
            : undefined,
        },
        (msg, detail) => logState(msg, detail),
      );

      const effectiveGoal = buildMissionGoal(rawGoal, { priority, runName, forceTeam });
      spawnTeamMission(effectiveGoal, { pmModel, engineerModel, notify, clean: cleanup });

      const missionId = randomUUID();
      const { pid } = await confirmSupervisorAndWriteMissionMeta({
        id: missionId,
        goal: rawGoal,
        effectiveGoal,
        runName: runName || null,
        priority,
        forceTeam,
        pmModel,
        engineerModel,
        projectRoot: activeProjectRoot,
        stateDir: activeStateDir,
        status: 'active',
        startedAt: Date.now(),
      });

      let bbAfter = bbBefore;
      try {
        const bbResult = appendMissionLaunchEntry({ goal: rawGoal, runName, priority, pid });
        bbAfter = bbResult.afterCount;
      } catch (bbErr) {
        logMission(`Blackboard write failed (mission still spawned): ${bbErr.message}`);
      }

      // Push WebSocket update so connected clients see the launch immediately
      pushCurrentState();

      const title = runName || rawGoal.slice(0, 60);
      logMission(`Started mission: ${missionId} — ${title} at ${new Date().toISOString()}`, {
        pid,
        priority,
        blackboardBefore: bbBefore,
        blackboardAfter: bbAfter,
        stateDir: activeStateDir,
        projectRoot: activeProjectRoot,
      });

      jsonOk(res, {
        ok: true,
        missionId,
        pid,
        goal: rawGoal,
        effectiveGoal,
        startedAt: Date.now(),
        message: 'Mission launched in background',
        logHint: 'roland bg-logs --follow',
        boardStatusUrl: '/api/board-status',
      });
    } catch (e) {
      logMission(`POST /api/mission — error: ${e.message}`);
      if (e instanceof SupervisorStartError) {
        jsonErr(res, e.message, 500, {
          code: e.code,
          ...e.diagnostics,
        });
        return;
      }
      jsonErr(res, e.message, 500);
    }
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
        const report = mod.buildBoardStatusReport(activeStateDir);
        const concise = mod.formatConciseUnscSummary(report);
        logApi('GET', url, 'ok (full report)', {
          blockers: report?.blockers?.length ?? 0,
          tasks: report?.tasks?.length ?? 0,
        });
        jsonOk(res, { report, concise, markdown: concise, updatedAt: Date.now() });
        return;
      }
      const fallback = readBoardStatusPayload();
      logApi('GET', url, 'ok (fallback payload)', fallback?.counts ?? null);
      jsonOk(res, { fallback, markdown: '(Run npm run build for full board-status API)' });
    } catch (e) {
      logApi('GET', url, `error: ${e.message}`);
      jsonErr(res, e.message, 500);
    }
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
    sanitizeStaleMissionState(activeStateDir, (msg, detail) => logState(msg, detail));
    const runState  = readActiveRunStateForClient(activeStateDir);
    const hitlState = readJson(path.join(activeStateDir, 'hitl-state.json'), null);
    const boardStatus = readBoardStatusPayload();
    const missionDag = readMissionDagPayload();
    const projectContext = readProjectContextPayload();
    const taskGit = readTaskGitPayload();
    const supervisor = summarizeSupervisorPayload();
    ws.send(JSON.stringify({
      type: 'state-update',
      runState,
      hitlState,
      boardStatus,
      missionDag,
      projectContext,
      taskGit,
      supervisor,
    }));
  } catch {}
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(port, host, () => {
  const localBase = `http://127.0.0.1:${port}`;
  const bindBase  = host === '0.0.0.0' ? localBase : `http://${host}:${port}`;
  logDashboard('Roland Dashboard 2.0 listening', { port, host, stateDir: activeStateDir, project: activeProjectRoot });
  console.log(`\n  🎛  Roland Dashboard 2.0`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  UI        : ${bindBase}`);
  console.log(`  Local     : ${localBase}`);
  if (host === '0.0.0.0') {
    console.log(`  Tailscale : http://<your-tailscale-ip>:${port}`);
  }
  console.log(`  WebSocket : ws://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
  console.log(`  State dir : ${activeStateDir}`);
  console.log(`  Project   : ${activeProjectRoot}`);
  console.log(`  APIs      : ${localBase}/api/usage  ${localBase}/api/run-state`);
  console.log(`              ${localBase}/api/memory  ${localBase}/api/hitl/:cmd`);
  console.log(`              ${localBase}/api/board-status  ${localBase}/api/mission-dag`);
  console.log(`              ${localBase}/api/project-context  ${localBase}/api/task-git`);
  console.log(`              ${localBase}/api/team-goal`);
  console.log(`              ${localBase}/api/projects`);
  console.log(`              ${localBase}/api/project-templates  ${localBase}/api/create-project`);
  console.log(`\n  Open the URL above in your browser (Tailscale: use machine IP).\n`);
});
