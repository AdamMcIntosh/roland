import { Router } from 'express';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { getDb } from '../db.js';
import { requireAuth } from '../auth.js';
import { createRolandBranch } from '../github.js';

export const runRouter = Router();

// Always resolve from cwd (roland-web/) — works in both tsx (dev) and compiled (prod)
const rolandBin = resolve(process.cwd(), 'node_modules', '.bin', 'roland');

/** Sanitise a goal string into a safe git branch slug (max 5 words). */
function goalToBranchSlug(goal: string): string {
  return goal
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')   // strip non-alphanumeric except spaces
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join('-') || 'run';
}

// POST /api/projects/:projectId/run
// Body: { goal: string }
// Response: chunked text stream; header X-Roland-Branch carries the branch name when set.
runRouter.post('/:projectId/run', requireAuth, async (req, res) => {
  const { goal } = (req.body ?? {}) as { goal?: string };
  if (!goal?.trim()) { res.status(400).json({ error: 'goal required' }); return; }

  const project = getDb()
    .prepare('SELECT * FROM projects WHERE id=?')
    .get(req.params.projectId as string) as any;
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  // ── Auto-create branch (best-effort — run proceeds even on failure) ─────────
  let branchName = '';
  if (project.encrypted_pat && project.github_owner) {
    const slug = goalToBranchSlug(goal);
    const candidate = `roland/${slug}`;
    try {
      await createRolandBranch(project.path, candidate);
      branchName = candidate;
      console.log(`[Run] branch ready: ${branchName}`);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      console.error(`[Run] branch creation failed for project ${project.id} (${project.path}): ${raw}`);
      // Run continues on main — branch header will be absent from the response
    }
  }

  const runId = randomUUID();
  getDb()
    .prepare('INSERT INTO runs (id, project_id, goal, branch) VALUES (?, ?, ?, ?)')
    .run(runId, project.id, goal, branchName);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Accel-Buffering', 'no');   // disable nginx/Railway proxy buffering
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (branchName) res.setHeader('X-Roland-Branch', branchName);
  res.flushHeaders();

  // Write a single byte immediately so Railway's proxy forwards this chunk
  // without waiting to accumulate a larger buffer. X-Accel-Buffering: no
  // should disable Nginx buffering, but the explicit write guarantees it.
  res.write('\n');
  (res as any).flush?.();

  const cursorApiKey = (req as any).cursorApiKey as string;

  const stateDir = process.env.NODE_ENV === 'production'
    ? `/data/roland-state/${project.id}`
    : undefined;

  const args = ['team', goal, '--web'];
  if (stateDir) args.push('--state-dir', stateDir);

  const pmModel       = req.headers['x-pm-model'] as string | undefined;
  const engineerModel = req.headers['x-engineer-model'] as string | undefined;

  const VALID_CURSOR_MODELS = new Set([
    'gpt-5.4-nano', 'gpt-5-mini', 'gpt-5.1-codex-mini',
    'gemini-2.5-flash', 'composer-2.5', 'composer-2',
  ]);

  const modelEnv: Record<string, string> = {};
  if (pmModel && VALID_CURSOR_MODELS.has(pmModel))
    modelEnv.ROLAND_PM_MODEL = pmModel;
  if (engineerModel && VALID_CURSOR_MODELS.has(engineerModel))
    modelEnv.ROLAND_ENGINEER_MODEL = engineerModel;

  const child = spawn(rolandBin, args, {
    cwd: project.path,
    env: {
      ...process.env,
      CURSOR_API_KEY: cursorApiKey,
      ROLAND_SIMPLE_TUI: '1',
      ...modelEnv,
    },
  });

  const append = (text: string) => {
    res.write(text);
    (res as any).flush?.();
    getDb()
      .prepare('UPDATE runs SET output = output || ? WHERE id = ?')
      .run(text, runId);
  };

  child.stdout.on('data', (chunk: Buffer) => append(chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => append(chunk.toString()));

  child.on('error', (err) => {
    append(`\n[Roland] Failed to start: ${err.message}\n`);
  });

  child.on('close', (code) => {
    getDb()
      .prepare('UPDATE runs SET status=?, finished_at=unixepoch() WHERE id=?')
      .run(code === 0 ? 'success' : 'error', runId);
    res.end();
  });

  res.on('close', () => child.kill());
});

// GET /api/projects/:projectId/runs — recent run history (last 50)
runRouter.get('/:projectId/runs', requireAuth, (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT id, goal, status, branch, started_at, finished_at
       FROM runs WHERE project_id=? ORDER BY started_at DESC LIMIT 50`,
    )
    .all(req.params.projectId as string);
  res.json(rows);
});
