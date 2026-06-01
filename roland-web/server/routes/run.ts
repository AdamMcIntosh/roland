import { Router } from 'express';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { getDb } from '../db.js';
import { requireAuth } from '../auth.js';
import { createRolandBranch, pushBranchAndCreatePR } from '../github.js';
import { decrypt } from '../crypto.js';

export const runRouter = Router();

// Point directly at the JS entry point — avoids execute-permission issues with
// the node_modules/.bin/roland symlink (EACCES on Railway/Linux when committed from Windows).
const rolandEntry = resolve(process.cwd(), 'node_modules', '@roland', 'core', 'dist', 'index.js');

if (!existsSync(rolandEntry)) {
  console.error(`[Roland] FATAL: roland entry not found at ${rolandEntry}`);
  console.error('[Roland] Run: npm run build:core  (from roland-web/) to populate @roland-core/dist/');
}

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

  if (!existsSync(rolandEntry)) {
    res.status(503).json({ error: 'Roland binary is not installed on this server. Contact your administrator.' });
    return;
  }

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

  const child = spawn(process.execPath, [rolandEntry, ...args], {
    cwd: project.path,
    env: {
      ...process.env,
      CURSOR_API_KEY: cursorApiKey,
      ROLAND_SIMPLE_TUI: '1',
      ...modelEnv,
    },
  });

  const append = (text: string) => {
    if (!res.writableEnded) {
      res.write(text);
      (res as any).flush?.();
    }
    getDb()
      .prepare('UPDATE runs SET output = output || ? WHERE id = ?')
      .run(text, runId);
  };

  child.stdout.on('data', (chunk: Buffer) => append(chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => append(chunk.toString()));

  child.on('error', (err) => {
    append(`\n[Roland] Failed to start: ${err.message}\n`);
  });

  child.on('close', async (code) => {
    getDb()
      .prepare('UPDATE runs SET status=?, finished_at=unixepoch() WHERE id=?')
      .run(code === 0 ? 'success' : 'error', runId);

    // Auto-commit, push, and open a PR when the run had a prepared branch
    if (branchName && project.encrypted_pat && project.github_owner && project.github_repo) {
      try {
        const pat = decrypt(project.encrypted_pat);
        const prTitle = `Roland: ${goal.length > 72 ? goal.slice(0, 69) + '…' : goal}`;
        const prBody = [
          '## Roland Run',
          '',
          `**Goal:** ${goal}`,
          '',
          'Changes generated automatically by [Roland](https://github.com/AdamMcIntosh/roland).',
        ].join('\n');

        const pr = await pushBranchAndCreatePR(
          project.path,
          pat,
          project.github_owner,
          project.github_repo,
          branchName,
          prTitle,
          prBody,
        );

        try {
          getDb().prepare('UPDATE runs SET pr_url=? WHERE id=?').run(pr.url, runId);
        } catch { /* pr_url column may not exist on older DBs */ }

        append(`\n[ROLAND_PR]: ${pr.url}\n`);
      } catch (prErr) {
        const msg = prErr instanceof Error ? prErr.message : String(prErr);
        console.error(`[Run] auto-PR failed (run=${runId}):`, msg);
        append(`\n⚠️  Pull request creation failed: ${msg}\n`);
      }
    }

    if (!res.writableEnded) res.end();
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
