/**
 * Test double for scripts/dashboard-github.js — used by dashboard-github-mock-hook.mjs
 * when serve-dashboard.js is spawned under integration tests.
 *
 * Mutable call counters reset per server process (fresh spawn per test).
 */

import fs from 'node:fs';
import path from 'node:path';
import { classifyGitError, gitErrorFlags } from '../../scripts/dashboard-github.js';

export { classifyGitError, gitErrorFlags };

const BASE_REPOS = [
  {
    id: 101,
    fullName: 'testuser/remote-only',
    owner: 'testuser',
    name: 'remote-only',
    description: 'Remote repo for clone tests',
    language: 'TypeScript',
    updatedAt: '2026-06-01T12:00:00Z',
    isPrivate: false,
    defaultBranch: 'main',
    url: 'https://github.com/testuser/remote-only',
  },
  {
    id: 102,
    fullName: 'testuser/already-local',
    owner: 'testuser',
    name: 'already-local',
    description: 'Repo that exists on disk',
    language: 'JavaScript',
    updatedAt: '2026-06-02T12:00:00Z',
    isPrivate: false,
    defaultBranch: 'main',
    url: 'https://github.com/testuser/already-local',
  },
  {
    id: 103,
    fullName: 'testuser/private-repo',
    owner: 'testuser',
    name: 'private-repo',
    description: 'Private repo visible via PAT',
    language: 'Rust',
    updatedAt: '2026-06-03T12:00:00Z',
    isPrivate: true,
    defaultBranch: 'main',
    url: 'https://github.com/testuser/private-repo',
  },
];

const NEW_REPO = {
  id: 999,
  fullName: 'testuser/brand-new',
  owner: 'testuser',
  name: 'brand-new',
  description: 'Just created on GitHub',
  language: null,
  updatedAt: '2026-06-07T12:00:00Z',
  isPrivate: false,
  defaultBranch: 'main',
  url: 'https://github.com/testuser/brand-new',
};

/** Increments on every listUserRepos call — simulates newly-created repo on refresh. */
let listCallCount = 0;

export function repoDirName(owner, repo) {
  return `${owner}-${repo}`;
}

export function repoClonePath(cloneBase, owner, repo) {
  return path.join(cloneBase, repoDirName(owner, repo));
}

export async function getGitHubUser(pat) {
  const token = String(pat || '').trim();
  if (!token || token === 'bad-token') {
    throw new Error('Bad credentials — authentication failed');
  }
  return { login: 'testuser', avatarUrl: 'https://avatars.test/u/testuser.png' };
}

export async function listUserRepos(pat, page = 1, perPage = 50) {
  listCallCount += 1;
  const token = String(pat || '').trim();
  if (!token) {
    throw new Error('Requires authentication');
  }
  if (token === 'bad-token') {
    throw new Error('Bad credentials — authentication failed');
  }

  let repos = [...BASE_REPOS];
  if (listCallCount > 1) {
    repos = [NEW_REPO, ...repos];
  }

  const start = (page - 1) * perPage;
  const slice = repos.slice(start, start + perPage);
  return { repos: slice, hasMore: start + perPage < repos.length };
}

function materializeClone(cloneBase, owner, repo, { withPackageJson = false } = {}) {
  const clonePath = repoClonePath(cloneBase, owner, repo);
  fs.mkdirSync(cloneBase, { recursive: true });

  if (fs.existsSync(clonePath)) {
    if (fs.existsSync(path.join(clonePath, '.git'))) {
      return clonePath;
    }
    fs.rmSync(clonePath, { recursive: true, force: true });
  }

  fs.mkdirSync(path.join(clonePath, '.git'), { recursive: true });
  if (withPackageJson) {
    fs.writeFileSync(
      path.join(clonePath, 'package.json'),
      JSON.stringify({ name: repo, private: true, version: '0.0.0' }),
      'utf-8',
    );
  }
  return clonePath;
}

export async function cloneRepo(pat, owner, repo, cloneBase) {
  if (!pat) throw new Error('PAT required for HTTPS clone');
  return materializeClone(cloneBase, owner, repo, { withPackageJson: owner === 'testuser' && repo === 'remote-only' });
}

export async function cloneRepoSsh(owner, repo, cloneBase) {
  return materializeClone(cloneBase, owner, repo);
}
