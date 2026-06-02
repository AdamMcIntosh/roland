import { Router } from 'express';
import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { getDb } from '../db.js';
import { requireAuth } from '../auth.js';
import { createRolandBranch, pushBranchAndCreatePR, ensureGitRepo } from '../github.js';
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
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join('-') || 'run';
}

// In-memory registry of active child processes — used by the cancel endpoint.
// Single-replica Railway deployment, so in-process state is safe.
const activeRuns = new Map<string, ChildProcess>();

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: /runs/:runId and /runs/:runId/cancel MUST be registered before
// /:projectId/runs — Express matches routes in order, and both patterns have
// two path segments. Registering the specific literal "runs" first prevents
// /:projectId/runs from greedily consuming poll/cancel requests.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/projects/runs/:runId — poll a run's current status and output
runRouter.get('/runs/:runId', requireAuth, (req, res) => {
  const run = getDb()
    .prepare('SELECT id, status, output, branch, pr_url, finished_at FROM runs WHERE id=?')
    .get(req.params.runId as string) as any;
  if (!run) { res.status(404).json({ error: 'Run not found' }); return; }
  res.json({
    status:     run.status     as string,
    output:     run.output     as string,
    branch:     run.branch     as string,
    prUrl:      (run.pr_url ?? null) as string | null,
    finishedAt: run.finished_at ?? null,
  });
});

// POST /api/projects/runs/:runId/cancel — stop a running job
runRouter.post('/runs/:runId/cancel', requireAuth, (req, res) => {
  const child = activeRuns.get(req.params.runId as string);
  if (child) {
    child.kill('SIGTERM');
    activeRuns.delete(req.params.runId as string);
  }
  getDb()
    .prepare("UPDATE runs SET status='error', finished_at=unixepoch() WHERE id=? AND status='running'")
    .run(req.params.runId as string);
  res.json({ ok: true });
});

// POST /api/projects/:projectId/run
// Returns { runId, branch } immediately; client polls /runs/:runId for progress.
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
  if (project.encrypted_pat && project.github_owner && project.github_repo) {
    const pat = decrypt(project.encrypted_pat);
    const slug = goalToBranchSlug(goal);
    const candidate = `roland/${slug}`;
    try {
      // Repair missing .git — happens for projects cloned before git-init was added
      // or when a previous init attempt failed on a network hiccup.
      await ensureGitRepo(project.path, pat, project.github_owner, project.github_repo);
      await createRolandBranch(project.path, candidate);
      branchName = candidate;
      console.log(`[Run] branch ready: ${branchName}`);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      console.error(`[Run] branch/git-init failed for project ${project.id} (${project.path}): ${raw}`);
      // Run continues without a branch — no PR will be created
    }
  }

  const runId = randomUUID();
  getDb()
    .prepare('INSERT INTO runs (id, project_id, goal, branch) VALUES (?, ?, ?, ?)')
    .run(runId, project.id, goal, branchName);

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

  activeRuns.set(runId, child);

  // Append text to the DB-backed output log (no HTTP response involved).
  const append = (text: string) => {
    getDb()
      .prepare('UPDATE runs SET output = output || ? WHERE id = ?')
      .run(text, runId);
  };

  child.stdout.on('data', (chunk: Buffer) => append(chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => append(chunk.toString()));
  child.on('error', (err) => append(`\n[Roland] Failed to start: ${err.message}\n`));

  child.on('close', async (code) => {
    activeRuns.delete(runId);

    // Auto-commit, push, and open a PR when the run had a prepared branch.
    // Status stays 'running' during this phase so the client keeps polling
    // and picks up pr_url before the run is marked complete.
    if (code === 0 && branchName && project.encrypted_pat && project.github_owner && project.github_repo) {
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

        // Race against a 90 s hard timeout — a hung git push must never freeze the run.
        const pr = await Promise.race([
          pushBranchAndCreatePR(
            project.path,
            pat,
            project.github_owner,
            project.github_repo,
            branchName,
            prTitle,
            prBody,
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('PR creation timed out after 90 s')), 90_000),
          ),
        ]);

        try {
          getDb().prepare('UPDATE runs SET pr_url=? WHERE id=?').run(pr.url, runId);
        } catch { /* pr_url column may not exist on older DBs */ }

        append(`\n✅ Pull request created: ${pr.url}\n`);
      } catch (prErr) {
        const msg = prErr instanceof Error ? prErr.message : String(prErr);
        console.error(`[Run] auto-PR failed (run=${runId}):`, msg);
        append(`\n⚠️  Pull request creation failed: ${msg}\n`);
      }
    }

    // Mark complete only after the PR workflow — ensures pr_url is in the DB
    // before the client's next poll sees status !== 'running'.
    getDb()
      .prepare('UPDATE runs SET status=?, finished_at=unixepoch() WHERE id=?')
      .run(code === 0 ? 'success' : 'error', runId);
  });

  // Respond immediately — client polls for updates via GET /api/projects/runs/:runId
  res.json({ runId, branch: branchName });
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
