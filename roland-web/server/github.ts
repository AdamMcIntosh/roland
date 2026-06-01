import { Octokit } from '@octokit/rest';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

type GitErrorKind = 'network' | 'auth' | 'not_found' | 'unknown';

function classifyErrorKind(e: unknown): GitErrorKind {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (
    msg.includes('could not resolve host') ||
    msg.includes('unable to connect') ||
    msg.includes('connection refused') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('timed out') ||
    msg.includes('network unreachable')
  ) return 'network';
  if (
    msg.includes('authentication failed') ||
    msg.includes('bad credentials') ||
    msg.includes('permission denied') ||
    msg.includes('access denied') ||
    msg.includes(' 401') ||
    msg.includes(' 403')
  ) return 'auth';
  if (
    msg.includes('repository not found') ||
    msg.includes('not found') ||
    msg.includes(' 404')
  ) return 'not_found';
  return 'unknown';
}

/** Translate any git / Node / Octokit error into a plain-English message. */
export function classifyGitError(e: unknown): string {
  switch (classifyErrorKind(e)) {
    case 'network':
      return 'Could not reach GitHub. Check your internet connection and try again.';
    case 'auth':
      return 'Your GitHub connection has expired or is no longer valid. Please reconnect your account.';
    case 'not_found':
      return 'Repository not found. Check the owner and repository name.';
    default:
      return 'Something went wrong with GitHub. Please try again.';
  }
}

/** Flags that tell the UI which action buttons to offer. */
export function gitErrorFlags(e: unknown): { isTransient?: true; needsReconnect?: true } {
  const kind = classifyErrorKind(e);
  if (kind === 'auth') return { needsReconnect: true };
  if (kind === 'network' || kind === 'unknown') return { isTransient: true };
  return {};
}

// ── Existing (unchanged) ──────────────────────────────────────────────────────

export async function validateGithubPat(pat: string, owner: string, repo: string): Promise<boolean> {
  try {
    const octokit = new Octokit({ auth: pat });
    await octokit.repos.get({ owner, repo });
    return true;
  } catch {
    return false;
  }
}

export async function gitPull(cwd: string): Promise<string> {
  const { stdout, stderr } = await execAsync('git pull', { cwd });
  return stdout + stderr;
}

export async function gitPushBranch(
  cwd: string,
  branch: string,
  owner: string,
  repo: string,
  pat: string,
): Promise<string> {
  const origin = `https://${pat}@github.com/${owner}/${repo}.git`;
  await execAsync(
    `git checkout -b "${branch}" 2>/dev/null || git checkout "${branch}"`,
    { cwd },
  );
  const { stdout, stderr } = await execAsync(
    `git push "${origin}" "${branch}" --set-upstream`,
    { cwd },
  );
  return stdout + stderr;
}

// ── User info ─────────────────────────────────────────────────────────────────

export interface GitHubUser {
  login: string;
  avatarUrl: string;
}

export async function getGitHubUser(pat: string): Promise<GitHubUser> {
  const octokit = new Octokit({ auth: pat });
  const { data } = await octokit.users.getAuthenticated();
  return { login: data.login, avatarUrl: data.avatar_url };
}

// ── Repo listing ──────────────────────────────────────────────────────────────

export interface RepoItem {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  language: string | null;
  updatedAt: string;
  isPrivate: boolean;
  defaultBranch: string;
  url: string;
}

/** List the authenticated user's repos, sorted by recently updated. */
export async function listUserRepos(
  pat: string,
  page = 1,
  perPage = 50,
): Promise<{ repos: RepoItem[]; hasMore: boolean }> {
  const octokit = new Octokit({ auth: pat });
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: 'updated',
    direction: 'desc',
    per_page: perPage,
    page,
  });

  const repos: RepoItem[] = data.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    owner: r.owner?.login ?? '',
    name: r.name,
    description: r.description ?? null,
    language: r.language ?? null,
    updatedAt: r.updated_at ?? '',
    isPrivate: r.private,
    defaultBranch: r.default_branch,
    url: r.html_url,
  }));

  return { repos, hasMore: data.length === perPage };
}

// ── Clone ─────────────────────────────────────────────────────────────────────

/**
 * Clone a GitHub repo into `{cloneBase}/{owner}-{repo}`.
 * If the directory already exists, runs git pull instead.
 * Returns the absolute clone path.
 */
export async function cloneRepo(
  pat: string,
  owner: string,
  repo: string,
  cloneBase: string,
): Promise<string> {
  const dirName = `${owner}-${repo}`;
  const clonePath = `${cloneBase}/${dirName}`;
  mkdirSync(cloneBase, { recursive: true });

  try {
    if (existsSync(`${clonePath}/.git`)) {
      await execAsync('git pull', { cwd: clonePath, timeout: 60_000 });
      return clonePath;
    }

    // x-access-token:TOKEN format is the recommended HTTPS auth method for GitHub PATs.
    const url = `https://x-access-token:${pat}@github.com/${owner}/${repo}.git`;
    await execAsync(`git clone "${url}" "${clonePath}"`, { timeout: 120_000 });
    return clonePath;
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error(`[GitHub] cloneRepo failed (${owner}/${repo}):`, raw);
    throw e;
  }
}

// ── Branch management ─────────────────────────────────────────────────────────

/** Detect the remote default branch (main / master / etc.). */
export async function getDefaultBranch(cwd: string): Promise<string> {
  // 1. Try symbolic-ref — fast if remote HEAD is already set
  try {
    const { stdout } = await execAsync(
      'git symbolic-ref refs/remotes/origin/HEAD --short',
      { cwd },
    );
    const branch = stdout.trim().replace(/^origin\//, '');
    if (branch) {
      console.log(`[Roland] default branch (symbolic-ref): ${branch}`);
      return branch;
    }
  } catch { /* not set yet */ }

  // 2. Auto-set the remote HEAD and retry (needs network, tolerate failure)
  try {
    await execAsync('git remote set-head origin --auto', { cwd });
    const { stdout } = await execAsync(
      'git symbolic-ref refs/remotes/origin/HEAD --short',
      { cwd },
    );
    const branch = stdout.trim().replace(/^origin\//, '');
    if (branch) {
      console.log(`[Roland] default branch (set-head --auto): ${branch}`);
      return branch;
    }
  } catch { /* no network or no remote */ }

  // 3. Probe common default names
  for (const candidate of ['main', 'master', 'develop', 'trunk']) {
    try {
      await execAsync(`git show-ref --verify refs/remotes/origin/${candidate}`, { cwd });
      console.log(`[Roland] default branch (probe): ${candidate}`);
      return candidate;
    } catch { /* not this one */ }
  }

  // 4. Parse `git branch -r` — take the first non-HEAD remote branch
  try {
    const { stdout } = await execAsync('git branch -r', { cwd });
    const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    const headLine = lines.find((l) => l.startsWith('origin/HEAD'));
    if (headLine) {
      const branch = headLine.split('->').pop()?.trim().replace(/^origin\//, '');
      if (branch) {
        console.log(`[Roland] default branch (branch -r HEAD): ${branch}`);
        return branch;
      }
    }
    const first = lines.find((l) => !l.includes('HEAD') && l.startsWith('origin/'));
    if (first) {
      const branch = first.replace(/^origin\//, '').trim();
      console.log(`[Roland] default branch (first remote): ${branch}`);
      return branch;
    }
  } catch { /* ignore */ }

  console.warn('[Roland] Could not detect default branch; falling back to "main"');
  return 'main';
}

/**
 * Switch to the default branch, pull latest, then create `branchName`.
 * - Pull is best-effort: failure only logs a warning (branch is still created).
 * - If `branchName` already exists, switches to it instead of failing.
 */
export async function createRolandBranch(cwd: string, branchName: string): Promise<void> {
  const defaultBranch = await getDefaultBranch(cwd);
  console.log(`[Roland] createRolandBranch: base=${defaultBranch} new=${branchName} cwd=${cwd}`);

  // Step 1: switch to default branch (tolerate "already on it")
  try {
    await execAsync(`git checkout "${defaultBranch}"`, { cwd });
  } catch (e) {
    const raw = (e instanceof Error ? e.message : String(e));
    // "Already on 'main'" or "Switched to branch 'main'" both come via stderr on success;
    // only a genuine failure (dirty index, unknown branch) actually throws here.
    if (!raw.toLowerCase().includes('already on')) {
      console.warn(`[Roland] checkout ${defaultBranch} failed (${raw}); proceeding from current HEAD`);
    }
  }

  // Step 2: pull latest — best-effort
  try {
    await execAsync('git pull', { cwd });
  } catch (e) {
    const raw = (e instanceof Error ? e.message : String(e));
    console.warn(`[Roland] git pull failed (proceeding without latest): ${raw}`);
  }

  // Step 3: create branch (hard requirement — surface the real error if this fails)
  try {
    await execAsync(`git checkout -b "${branchName}"`, { cwd });
    console.log(`[Roland] branch created: ${branchName}`);
  } catch (e) {
    const raw = (e instanceof Error ? e.message : String(e));
    // Branch already exists — just switch to it
    if (raw.toLowerCase().includes('already exists')) {
      console.log(`[Roland] branch already exists, switching to: ${branchName}`);
      await execAsync(`git checkout "${branchName}"`, { cwd });
      return;
    }
    // Genuine failure — log raw error then throw a user-friendly one
    console.error(`[Roland] git checkout -b "${branchName}" failed: ${raw}`);
    throw new Error(`Branch creation failed: ${classifyGitError(e)}`);
  }
}

// ── PR creation ───────────────────────────────────────────────────────────────

export interface PullRequest {
  number: number;
  url: string;
  title: string;
}

/** Ensure git user identity is set locally (fallback to Roland defaults). */
async function ensureGitUser(cwd: string): Promise<void> {
  try {
    await execAsync('git config user.email', { cwd });
  } catch {
    await execAsync('git config user.email "roland@roland.ai"', { cwd });
    await execAsync('git config user.name "Roland"', { cwd });
  }
}

/**
 * Stage all changes, commit, push the branch, and open a GitHub PR.
 * Never touches main/master — the branch must already exist locally.
 * Returns the created PR metadata.
 */
export async function pushBranchAndCreatePR(
  cwd: string,
  pat: string,
  owner: string,
  repo: string,
  branch: string,
  title: string,
  body: string,
): Promise<PullRequest> {
  await ensureGitUser(cwd);

  // Write commit message to a temp file to avoid shell injection
  const msgFile = join(tmpdir(), `roland-msg-${Date.now()}.txt`);
  writeFileSync(msgFile, title, 'utf-8');
  try {
    await execAsync('git add -A', { cwd });
    await execAsync(`git commit -F "${msgFile}" --allow-empty`, { cwd });
  } catch {
    // Nothing to commit — carry on, the PR body still describes the run
  } finally {
    try { unlinkSync(msgFile); } catch { /* ignore */ }
  }

  // Push branch to remote using authenticated URL
  const origin = `https://${pat}@github.com/${owner}/${repo}.git`;
  await execAsync(`git push "${origin}" "${branch}" --set-upstream --force-with-lease`, { cwd });

  const defaultBranch = await getDefaultBranch(cwd);
  const octokit = new Octokit({ auth: pat });
  const { data } = await octokit.pulls.create({
    owner,
    repo,
    title,
    body,
    head: branch,
    base: defaultBranch,
  });

  return { number: data.number, url: data.html_url, title: data.title };
}
