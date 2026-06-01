/**
 * Global GitHub routes — PAT management, repo browser, clone-and-register.
 *
 * Routes:
 *   GET  /api/github/status          — connected? returns login + avatar
 *   POST /api/github/connect         — validate + store PAT
 *   DELETE /api/github/disconnect    — remove stored PAT
 *   GET  /api/github/repos           — list user repos (page, per_page, q)
 *   POST /api/github/clone           — clone repo + register as project
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { getDb } from '../db.js';
import { requireAuth } from '../auth.js';
import { encrypt, decrypt } from '../crypto.js';
import { getGitHubUser, listUserRepos, cloneRepo, classifyGitError, gitErrorFlags } from '../github.js';

export const githubRouter = Router();
githubRouter.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the stored PAT, null if not stored, or throws with code PAT_CORRUPTED. */
function getStoredPat(): string | null {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key=?')
    .get('github_pat') as { value: string } | undefined;
  if (!row) return null;
  return decrypt(row.value); // throws PAT_CORRUPTED if key changed or data is malformed
}

function isPatCorrupted(e: unknown): boolean {
  return (e as { code?: string })?.code === 'PAT_CORRUPTED';
}

const projectsBase = (): string =>
  process.env.PROJECTS_DIR ??
  (process.env.NODE_ENV === 'production'
    ? '/data/projects'
    : resolve(process.cwd(), 'projects'));

// ── Status ────────────────────────────────────────────────────────────────────

githubRouter.get('/status', async (_req, res) => {
  let pat: string | null;
  try {
    pat = getStoredPat();
  } catch (e) {
    if (isPatCorrupted(e)) {
      res.json({ connected: false, needsReconnect: true });
      return;
    }
    throw e;
  }
  if (!pat) { res.json({ connected: false }); return; }

  try {
    const user = await getGitHubUser(pat);
    res.json({ connected: true, login: user.login, avatarUrl: user.avatarUrl });
  } catch {
    res.json({ connected: false });
  }
});

// ── Connect ───────────────────────────────────────────────────────────────────

githubRouter.post('/connect', async (req, res) => {
  const { pat } = (req.body ?? {}) as { pat?: string };
  if (!pat?.trim()) { res.status(400).json({ error: 'pat required' }); return; }

  try {
    const user = await getGitHubUser(pat.trim());
    getDb()
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run('github_pat', encrypt(pat.trim()));
    res.json({ ok: true, login: user.login, avatarUrl: user.avatarUrl });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error('[GitHub /connect] error:', raw);
    const flags = gitErrorFlags(e);
    const status = flags.needsReconnect ? 401 : 500;
    res.status(status).json({ error: classifyGitError(e), ...flags });
  }
});

// ── Disconnect ────────────────────────────────────────────────────────────────

githubRouter.delete('/disconnect', (_req, res) => {
  getDb().prepare('DELETE FROM settings WHERE key=?').run('github_pat');
  res.json({ ok: true });
});

// ── Repo list ─────────────────────────────────────────────────────────────────

githubRouter.get('/repos', async (req, res) => {
  let pat: string | null;
  try {
    pat = getStoredPat();
  } catch (e) {
    if (isPatCorrupted(e)) {
      res.status(400).json({ error: 'GitHub PAT is invalid or corrupted. Please disconnect and reconnect your GitHub account.', needsReconnect: true });
      return;
    }
    throw e;
  }
  if (!pat) { res.status(400).json({ error: 'GitHub not connected' }); return; }

  const page    = Math.max(1, parseInt((req.query.page    as string) ?? '1',  10));
  const perPage = Math.min(50, parseInt((req.query.per_page as string) ?? '50', 10));
  const q       = ((req.query.q as string) ?? '').toLowerCase().trim();

  try {
    let { repos, hasMore } = await listUserRepos(pat, page, perPage);

    // Client-side filter so we avoid GitHub search-API rate limits
    if (q) {
      repos = repos.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q),
      );
    }

    res.json({ repos, hasMore });
  } catch (e) {
    res.status(500).json({ error: classifyGitError(e), ...gitErrorFlags(e) });
  }
});

// ── Clone + register ──────────────────────────────────────────────────────────

githubRouter.post('/clone', async (req, res) => {
  const { owner, repo } = (req.body ?? {}) as { owner?: string; repo?: string };
  if (!owner?.trim() || !repo?.trim()) {
    res.status(400).json({ error: 'owner and repo required' });
    return;
  }

  let pat: string | null;
  try {
    pat = getStoredPat();
  } catch (e) {
    if (isPatCorrupted(e)) {
      res.status(400).json({ error: 'GitHub PAT is invalid or corrupted. Please disconnect and reconnect your GitHub account.', needsReconnect: true });
      return;
    }
    throw e;
  }
  if (!pat) { res.status(400).json({ error: 'GitHub not connected' }); return; }

  // Check if already registered
  const existing = getDb()
    .prepare('SELECT id, path FROM projects WHERE github_owner=? AND github_repo=?')
    .get(owner, repo) as { id: string; path: string } | undefined;

  if (existing) {
    res.json({ projectId: existing.id, path: existing.path, alreadyExists: true });
    return;
  }

  try {
    const clonePath = await cloneRepo(pat, owner, repo, projectsBase());

    const projectId = randomUUID();
    getDb()
      .prepare(
        'INSERT INTO projects (id, name, path, github_owner, github_repo, encrypted_pat) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(projectId, `${owner}/${repo}`, clonePath, owner, repo, encrypt(pat));

    res.json({ projectId, path: clonePath, alreadyExists: false });
  } catch (e) {
    res.status(500).json({ error: classifyGitError(e), ...gitErrorFlags(e) });
  }
});
