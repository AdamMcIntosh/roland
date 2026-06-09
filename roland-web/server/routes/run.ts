import { Router } from 'express';
import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { getDb } from '../db.js';
import { requireAuth } from '../auth.js';
import { createRolandBranch, pushBranchAndCreatePR, ensureGitRepo } from '../github.js';
import { decrypt } from '../crypto.js';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';
import { isValidCursorModel } from '../../@roland-core/dist/rco/cursor-models.js';
import { formatPrFromGoal } from '../../@roland-core/dist/rco/pr-format.js';

export const runRouter = Router();

// Point directly at the JS entry point — avoids execute-permission issues with
// the node_modules/.bin/roland symlink on Linux (e.g. when installed from Windows).
const rolandEntry = resolve(process.cwd(), 'node_modules', '@roland', 'core', 'dist', 'index.js');

if (!existsSync(rolandEntry)) {
  logger.error('Roland entry not found', { path: rolandEntry });
  logger.error('Run npm run build:core from roland-web/ to populate @roland-core/dist/');
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

/** Strip ANSI escape codes and internal Roland markers before display. */
function sanitizeOutput(text: string): string {
  return text
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    .replace(/\n?\[ROLAND_DONE\]\n?/g, '')
    .replace(/\n?\[ROLAND_PR\]: https?:\/\/\S+\n?/g, '');
}

interface RolandRunResult {
  exitCode: number | null;
  output: string;
  cancelled: boolean;
}

// Single-replica deployment — one active Roland process per project at a time.
const activeRunsByProject = new Map<string, ChildProcess>();

/** Projects explicitly cancelled via POST /run/cancel — not inferred from signals. */
const explicitlyCancelledProjects = new Set<string>();

/** Disable socket timeouts for a long-running request/response cycle. */
function disableSocketTimeout(req: { socket?: { setTimeout?: (ms: number) => void; setKeepAlive?: (v: boolean) => void } }, res: { setTimeout?: (ms: number) => void }): void {
  req.socket?.setTimeout?.(0);
  req.socket?.setKeepAlive?.(true);
  res.setTimeout?.(0);
}

/** Run Roland to completion and return captured stdout + stderr. */
function runRolandSync(
  args: string[],
  cwd: string,
  env: Record<string, string | undefined>,
  projectId: string,
): Promise<RolandRunResult> {
  return new Promise((resolvePromise, reject) => {
    let output = '';

    const child = spawn(process.execPath, [rolandEntry, ...args], {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
    });

    activeRunsByProject.set(projectId, child);
    logger.info('Run child spawned', { pid: child.pid, projectId });

    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.on('error', (err) => {
      activeRunsByProject.delete(projectId);
      logger.error('Run child error', { projectId, error: err.message });
      reject(err);
    });
    child.on('close', (exitCode, signal) => {
      activeRunsByProject.delete(projectId);
      const cancelled = explicitlyCancelledProjects.delete(projectId);
      logger.info('Run child closed', {
        projectId,
        pid: child.pid,
        exitCode,
        signal: signal ?? 'none',
        cancelled,
      });
      resolvePromise({ exitCode, output, cancelled });
    });
  });
}

// POST /api/projects/:projectId/run/cancel — stop the active run (user-initiated only)
runRouter.post('/:projectId/run/cancel', requireAuth, (req, res) => {
  const projectId = req.params.projectId as string;
  logger.info('Run cancel requested', { projectId });

  explicitlyCancelledProjects.add(projectId);

  const child = activeRunsByProject.get(projectId);
  if (child) {
    logger.info('Run sending SIGTERM', { pid: child.pid, projectId });
    child.kill('SIGTERM');
  } else {
    logger.info('Run cancel: no active child', { projectId });
  }

  getDb()
    .prepare("UPDATE runs SET status='error', finished_at=unixepoch() WHERE project_id=? AND status='running'")
    .run(projectId);
  res.json({ ok: true });
});

// POST /api/projects/:projectId/run
// Runs Roland synchronously and returns the full result when done.
runRouter.post('/:projectId/run', requireAuth, async (req, res) => {
  disableSocketTimeout(req, res);

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

  const projectId = project.id as string;
  const startedAt = Date.now();

  // ── Auto-create branch (best-effort — run proceeds even on failure) ─────────
  let branchName = '';
  if (project.encrypted_pat && project.github_owner && project.github_repo) {
    const pat = decrypt(project.encrypted_pat);
    const slug = goalToBranchSlug(goal);
    const candidate = `roland/${slug}`;
    try {
      await ensureGitRepo(project.path, pat, project.github_owner, project.github_repo);
      await createRolandBranch(project.path, candidate);
      branchName = candidate;
      logger.info('Run branch ready', { branchName, projectId });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      logger.error('Branch setup failed', { projectId, path: project.path, error: raw });
    }
  }

  const runId = randomUUID();
  getDb()
    .prepare('INSERT INTO runs (id, project_id, goal, branch) VALUES (?, ?, ?, ?)')
    .run(runId, projectId, goal, branchName);

  const cursorApiKey = (req as any).cursorApiKey as string;

  const { rolandStateDir, nodeEnv } = getConfig();
  const stateDir = nodeEnv === 'production'
    ? `${rolandStateDir}/${projectId}`
    : undefined;

  const args = ['team', goal, '--web'];
  if (stateDir) args.push('--state-dir', stateDir);

  const pmModel       = req.headers['x-pm-model'] as string | undefined;
  const engineerModel = req.headers['x-engineer-model'] as string | undefined;

  const modelEnv: Record<string, string> = {
    CURSOR_API_KEY: cursorApiKey,
    ROLAND_SIMPLE_TUI: '1',
  };
  if (pmModel && pmModel !== 'auto' && isValidCursorModel(pmModel))
    modelEnv.ROLAND_PM_MODEL = pmModel;
  if (engineerModel && engineerModel !== 'auto' && isValidCursorModel(engineerModel))
    modelEnv.ROLAND_ENGINEER_MODEL = engineerModel;

  logger.info('Run starting', { runId, projectId, branch: branchName || null });

  // NOTE: Do NOT kill the child on req.on('close'). That event fires when the
  // request body stream ends (immediately after POST body is read), not when the
  // client disconnects — it was causing every run to be SIGTERM'd on startup.
  // Runs only stop via POST /run/cancel (user clicks Stop) or natural completion.

  let rawOutput = '';
  let exitCode: number | null = 1;
  let cancelled = false;
  let prUrl: string | null = null;

  try {
    const result = await runRolandSync(args, project.path, modelEnv, projectId);
    exitCode = result.exitCode;
    rawOutput = result.output;
    cancelled = result.cancelled;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Run spawn failed', { runId, error: msg });
    rawOutput = `[Roland] Failed to start: ${msg}\n`;
    exitCode = 1;
  }

  if (cancelled) {
    logger.info('Run explicitly cancelled', { runId });
    rawOutput += '\n⏹ Run stopped.\n';
  }

  // Auto-commit, push, and open a PR when the run succeeded and had a prepared branch.
  if (!cancelled && exitCode === 0 && branchName && project.encrypted_pat && project.github_owner && project.github_repo) {
    try {
      const pat = decrypt(project.encrypted_pat);
      const { title: prTitle, body: prBody } = formatPrFromGoal(goal, {
        runId,
        impactNote: 'Automated Roland web run — review before merge.',
      });

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

      prUrl = pr.url;
      rawOutput += `\n✅ Pull request created: ${pr.url}\n`;
    } catch (prErr) {
      const msg = prErr instanceof Error ? prErr.message : String(prErr);
      logger.error('Auto-PR failed', { runId, error: msg });
      rawOutput += `\n⚠️  Pull request creation failed: ${msg}\n`;
    }
  }

  const status = cancelled ? 'error' : (exitCode === 0 ? 'success' : 'error');
  const output = sanitizeOutput(rawOutput);
  const durationSec = Math.round((Date.now() - startedAt) / 1000);

  getDb()
    .prepare('UPDATE runs SET status=?, output=?, finished_at=unixepoch() WHERE id=?')
    .run(status, output, runId);

  if (prUrl) {
    try {
      getDb().prepare('UPDATE runs SET pr_url=? WHERE id=?').run(prUrl, runId);
    } catch { /* pr_url column may not exist on older DBs */ }
  }

  logger.info('Run finished', {
    runId,
    status,
    cancelled,
    exitCode,
    durationSec,
    outputLen: output.length,
  });

  if (!res.writableEnded) {
    res.json({
      runId,
      status,
      output,
      branch: branchName,
      prUrl,
      cancelled,
    });
  } else {
    logger.warn('Run response already closed', { runId });
  }
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
