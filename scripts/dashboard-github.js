/**
 * GitHub discovery + clone helpers for Dashboard 2.0.
 * Ported from roland-web/server/github.ts (plain ESM JavaScript).
 */

import { Octokit } from '@octokit/rest';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

function classifyErrorKind(e) {
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

export function classifyGitError(e) {
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

export function gitErrorFlags(e) {
  const kind = classifyErrorKind(e);
  if (kind === 'auth') return { needsReconnect: true };
  if (kind === 'network' || kind === 'unknown') return { isTransient: true };
  return {};
}

export async function getGitHubUser(pat) {
  const octokit = new Octokit({ auth: pat });
  const { data } = await octokit.users.getAuthenticated();
  return { login: data.login, avatarUrl: data.avatar_url };
}

export async function listUserRepos(pat, page = 1, perPage = 50) {
  const octokit = new Octokit({ auth: pat });
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: 'updated',
    direction: 'desc',
    per_page: perPage,
    page,
  });

  const repos = data.map((r) => ({
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

function authenticatedOrigin(pat, owner, repo) {
  return `https://${pat}@github.com/${owner}/${repo}.git`;
}

async function configureLocalGit(cwd, pat, owner, repo) {
  const origin = authenticatedOrigin(pat, owner, repo);
  await execAsync(
    [
      'git config user.email "roland@roland.ai"',
      'git config user.name "Roland"',
      `git remote set-url origin "${origin}" 2>/dev/null || git remote add origin "${origin}"`,
    ].join(' && '),
    { cwd },
  );
}

async function configureLocalGitSsh(cwd, owner, repo) {
  const origin = `git@github.com:${owner}/${repo}.git`;
  await execAsync(
    [
      'git config user.email "roland@roland.ai"',
      'git config user.name "Roland"',
      `git remote set-url origin "${origin}" 2>/dev/null || git remote add origin "${origin}"`,
    ].join(' && '),
    { cwd },
  );
}

export function repoDirName(owner, repo) {
  return `${owner}-${repo}`;
}

export function repoClonePath(cloneBase, owner, repo) {
  return path.join(cloneBase, repoDirName(owner, repo));
}

/** Clone via HTTPS + PAT. Returns clone path. */
export async function cloneRepo(pat, owner, repo, cloneBase) {
  const clonePath = repoClonePath(cloneBase, owner, repo);
  fs.mkdirSync(cloneBase, { recursive: true });

  if (fs.existsSync(clonePath)) {
    if (fs.existsSync(path.join(clonePath, '.git'))) {
      await configureLocalGit(clonePath, pat, owner, repo);
      return clonePath;
    }
    fs.rmSync(clonePath, { recursive: true, force: true });
  }

  const origin = authenticatedOrigin(pat, owner, repo);
  const dirName = repoDirName(owner, repo);
  try {
    await execAsync(`git clone "${origin}" "${dirName}"`, {
      cwd: cloneBase,
      timeout: 300_000,
    });
    await configureLocalGit(clonePath, pat, owner, repo);
    try {
      await execAsync('git remote set-head origin --auto', { cwd: clonePath });
    } catch { /* best-effort */ }
  } catch (e) {
    try { fs.rmSync(clonePath, { recursive: true, force: true }); } catch { /* ignore */ }
    throw e;
  }

  return clonePath;
}

/** Clone via SSH (no PAT). Returns clone path. */
export async function cloneRepoSsh(owner, repo, cloneBase) {
  const clonePath = repoClonePath(cloneBase, owner, repo);
  fs.mkdirSync(cloneBase, { recursive: true });

  if (fs.existsSync(clonePath)) {
    if (fs.existsSync(path.join(clonePath, '.git'))) {
      await configureLocalGitSsh(clonePath, owner, repo);
      return clonePath;
    }
    fs.rmSync(clonePath, { recursive: true, force: true });
  }

  const origin = `git@github.com:${owner}/${repo}.git`;
  const dirName = repoDirName(owner, repo);
  try {
    await execAsync(`git clone "${origin}" "${dirName}"`, {
      cwd: cloneBase,
      timeout: 300_000,
      env: { ...process.env, GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new' },
    });
    await configureLocalGitSsh(clonePath, owner, repo);
    try {
      await execAsync('git remote set-head origin --auto', { cwd: clonePath });
    } catch { /* best-effort */ }
  } catch (e) {
    try { fs.rmSync(clonePath, { recursive: true, force: true }); } catch { /* ignore */ }
    throw e;
  }

  return clonePath;
}
