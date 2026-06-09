import { Router } from 'express';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { getDb } from '../db.js';
import { requireAuth } from '../auth.js';
import { encrypt, decrypt } from '../crypto.js';
import { logger } from '../logger.js';
import { validateGithubPat, gitPull, gitPushBranch, pushBranchAndCreatePR, classifyGitError, gitErrorFlags } from '../github.js';
import {
  formatPrFromGoal,
  isLegacyPrTitle,
  suggestPrCleanup,
} from '../../@roland-core/dist/rco/pr-format.js';

function isPatCorrupted(e: unknown): boolean {
  return (e as { code?: string })?.code === 'PAT_CORRUPTED';
}

function safeDecrypt(blob: string): string | null {
  try {
    return decrypt(blob);
  } catch (e) {
    if (isPatCorrupted(e)) return null;
    throw e;
  }
}

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

projectsRouter.get('/', (_req, res) => {
  const rows = getDb().prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  res.json(rows);
});

projectsRouter.post('/', (req, res) => {
  const { name, path } = req.body ?? {};
  if (!name || !path) { res.status(400).json({ error: 'name and path required' }); return; }
  mkdirSync(path, { recursive: true });
  const id = randomUUID();
  getDb().prepare('INSERT INTO projects (id, name, path) VALUES (?, ?, ?)').run(id, name, path);
  res.json({ id });
});

projectsRouter.get('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(row);
});

projectsRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  db.exec('BEGIN');
  try {
    // Delete child rows first — handles both cascade-aware and legacy DBs
    db.prepare('DELETE FROM runs WHERE project_id = ?').run(req.params.id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* ignore rollback error */ }
    logger.error('Project delete failed', { error: e instanceof Error ? e.message : String(e) });
    res.status(500).json({ error: 'Could not delete project. Please try again.' });
  }
});

// ── GitHub ──────────────────────────────────────────────────────────────────

projectsRouter.post('/:id/github/connect', async (req, res) => {
  const { pat, owner, repo } = req.body ?? {};
  if (!pat || !owner || !repo) {
    res.status(400).json({ error: 'pat, owner, and repo required' });
    return;
  }

  if (!(await validateGithubPat(pat, owner, repo))) {
    res.status(401).json({
      error: 'Could not connect — the token is invalid or the repository was not found. Check the owner, repo name, and token scopes.',
    });
    return;
  }

  getDb()
    .prepare('UPDATE projects SET github_owner=?, github_repo=?, encrypted_pat=? WHERE id=?')
    .run(owner, repo, encrypt(pat), req.params.id);

  res.json({ ok: true });
});

projectsRouter.post('/:id/github/pull', async (req, res) => {
  const project = getDb().prepare('SELECT * FROM projects WHERE id=?').get(req.params.id) as any;
  if (!project?.encrypted_pat) { res.status(400).json({ error: 'GitHub not connected' }); return; }

  const pat = safeDecrypt(project.encrypted_pat);
  if (!pat) {
    res.status(400).json({ error: 'GitHub PAT is invalid or corrupted. Please reconnect your GitHub account.', needsReconnect: true });
    return;
  }

  try {
    const cloneBase = dirname(project.path);
    const output = await gitPull(pat, project.github_owner, project.github_repo, cloneBase);
    res.json({ ok: true, output });
  } catch (e) {
    res.status(500).json({ error: classifyGitError(e), ...gitErrorFlags(e) });
  }
});

projectsRouter.post('/:id/github/push', async (req, res) => {
  const { branch } = req.body ?? {};
  if (!branch) { res.status(400).json({ error: 'branch required' }); return; }

  const project = getDb().prepare('SELECT * FROM projects WHERE id=?').get(req.params.id) as any;
  if (!project?.encrypted_pat) { res.status(400).json({ error: 'GitHub not connected' }); return; }

  const pat = safeDecrypt(project.encrypted_pat);
  if (!pat) {
    res.status(400).json({ error: 'GitHub PAT is invalid or corrupted. Please reconnect your GitHub account.', needsReconnect: true });
    return;
  }

  try {
    const output = await gitPushBranch(
      project.path, branch, project.github_owner, project.github_repo, pat,
    );
    res.json({ ok: true, output });
  } catch (e) {
    res.status(500).json({ error: classifyGitError(e), ...gitErrorFlags(e) });
  }
});

// POST /api/projects/:id/github/pr
// Body: { branch, title?, body?, goal? }
// Returns: { prUrl, prNumber }
projectsRouter.post('/:id/github/pr', async (req, res) => {
  const { branch, title, body, goal } = (req.body ?? {}) as {
    branch?: string; title?: string; body?: string; goal?: string;
  };
  if (!branch?.trim()) {
    res.status(400).json({ error: 'branch required' });
    return;
  }

  const seed = goal?.trim() || title?.trim();
  if (!seed) {
    res.status(400).json({ error: 'goal or title required' });
    return;
  }

  let prTitle = title?.trim() || '';
  let prBody = body?.trim() || '';
  if (!prTitle || isLegacyPrTitle(prTitle)) {
    const formatted = formatPrFromGoal(seed, { runId: `web-${req.params.id}` });
    prTitle = formatted.title;
    if (!prBody) prBody = formatted.body;
  } else if (!prBody) {
    const suggestion = suggestPrCleanup(prTitle, '');
    prBody = suggestion.body ?? formatPrFromGoal(seed, { runId: `web-${req.params.id}` }).body;
  }

  const project = getDb().prepare('SELECT * FROM projects WHERE id=?').get(req.params.id) as any;

  // Resolve PAT — prefer per-project, fall back to global
  let pat: string | null = null;
  if (project?.encrypted_pat) {
    pat = safeDecrypt(project.encrypted_pat);
  } else {
    const row = getDb()
      .prepare('SELECT value FROM settings WHERE key=?')
      .get('github_pat') as { value: string } | undefined;
    if (row) pat = safeDecrypt(row.value);
  }

  if (!pat) {
    const wasCorrupted = project?.encrypted_pat || getDb()
      .prepare('SELECT value FROM settings WHERE key=?')
      .get('github_pat');
    if (wasCorrupted) {
      res.status(400).json({ error: 'GitHub PAT is invalid or corrupted. Please reconnect your GitHub account.', needsReconnect: true });
    } else {
      res.status(400).json({ error: 'GitHub not connected' });
    }
    return;
  }
  if (!project?.github_owner) { res.status(400).json({ error: 'Project has no GitHub repo linked' }); return; }

  try {
    const pr = await pushBranchAndCreatePR(
      project.path,
      pat,
      project.github_owner,
      project.github_repo,
      branch.trim(),
      prTitle,
      prBody,
    );
    res.json({ ok: true, prUrl: pr.url, prNumber: pr.number });
  } catch (e) {
    res.status(500).json({ error: classifyGitError(e), ...gitErrorFlags(e) });
  }
});
