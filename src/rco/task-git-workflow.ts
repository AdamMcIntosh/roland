/**
 * Task Git Workflow — per-executor-task branch, commit, push, and draft PR.
 *
 * Runs automatically from team-orchestrator on executor (coding-lane) tasks.
 * Respects `.roland/config.json` and env vars; fails gracefully with [GIT] logs.
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { laneForEngineer } from '../pm/model-policy.js';
import type { Blackboard } from './blackboard.js';
import type { CommandBlackboard } from './command-blackboard.js';
import type { TeamTask } from './team-orchestrator.js';
import {
  buildConventionalPrTitle,
  buildPrDescription,
  buildTaskCommitMessage,
} from './pr-format.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskGitPhase =
  | 'branch_created'
  | 'committed'
  | 'pushed'
  | 'pr_opened'
  | 'skipped'
  | 'failed';

export interface TaskGitInfo {
  branch?: string;
  phase?: TaskGitPhase;
  statusLabel?: string;
  prUrl?: string;
  prNumber?: number;
  error?: string;
}

export interface GitWorkflowConfig {
  enabled: boolean;
  createDraftPr: boolean;
  githubToken?: string;
  githubOwner?: string;
  githubRepo?: string;
}

export interface TaskGitWorkflowOptions {
  stateDir: string;
  projectRoot: string;
  goal: string;
  runId: string;
  blackboard: Blackboard;
  commandBoard: CommandBlackboard;
  missionUrl?: string;
}

const TASK_GIT_FILE = 'task-git.json';

// ── Logging ─────────────────────────────────────────────────────────────────

function logGit(msg: string, detail?: Record<string, unknown>): void {
  const line = `[GIT] ${msg}`;
  if (detail && Object.keys(detail).length > 0) {
    console.error(line, detail);
  } else {
    console.error(line);
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

function readJsonFile(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function envTruthy(name: string): boolean | undefined {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === undefined || v === '') return undefined;
  return !['0', 'false', 'no', 'off'].includes(v);
}

export function loadGitWorkflowConfig(stateDir: string): GitWorkflowConfig {
  const cfg = readJsonFile(path.join(stateDir, 'config.json'));
  const gitSection = (cfg.git ?? {}) as Record<string, unknown>;
  const ghSection = (cfg.github ?? {}) as Record<string, unknown>;

  const envEnabled = envTruthy('ROLAND_GIT_ENABLED');
  const envDraft = envTruthy('ROLAND_CREATE_DRAFT_PR');

  const token =
    (typeof ghSection.token === 'string' ? ghSection.token : undefined)
    ?? process.env.ROLAND_GITHUB_TOKEN
    ?? process.env.GITHUB_TOKEN
    ?? process.env.GH_TOKEN;

  const owner =
    (typeof ghSection.owner === 'string' ? ghSection.owner : undefined)
    ?? process.env.ROLAND_GITHUB_OWNER
    ?? process.env.GITHUB_OWNER;

  const repo =
    (typeof ghSection.repo === 'string' ? ghSection.repo : undefined)
    ?? process.env.ROLAND_GITHUB_REPO
    ?? process.env.GITHUB_REPO;

  return {
    enabled: envEnabled ?? gitSection.enabled !== false,
    createDraftPr: envDraft ?? gitSection.createDraftPr !== false,
    githubToken: token?.trim() || undefined,
    githubOwner: owner?.trim() || undefined,
    githubRepo: repo?.trim() || undefined,
  };
}

// ── Agent / branch helpers ────────────────────────────────────────────────────

/** True for coding-lane agents that implement changes (not test-only roles). */
export function isExecutorAgent(agent: string): boolean {
  const n = agent.toLowerCase().replace(/\s+/g, '-');
  if (/test-executor|test-author|qa-tester|lead-pm|review|architect|planner|critic|security|oracle|sentinel|analyst|research|explore|writer|doc/.test(n)) {
    return false;
  }
  return laneForEngineer(n) === 'coding';
}

export function shortTaskId(taskId: string): string {
  const stripped = taskId.replace(/^task[-_]?/i, '').trim();
  return (stripped || taskId).slice(0, 16);
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'task';
}

export function buildTaskBranchName(taskId: string, title: string): string {
  const slug = slugifyTitle(title);
  const short = shortTaskId(taskId);
  const name = `task-${short}-${slug}`;
  return name.slice(0, 120);
}

function statusLabelForPhase(phase: TaskGitPhase, branch?: string, prUrl?: string): string {
  switch (phase) {
    case 'branch_created':
      return branch ? `Branch created → ${branch}` : 'Branch created';
    case 'committed':
      return 'Changes committed';
    case 'pushed':
      return branch ? `Changes pushed → origin/${branch}` : 'Changes pushed';
    case 'pr_opened':
      return prUrl ? `Draft PR opened → ${prUrl}` : 'Draft PR opened';
    case 'skipped':
      return 'Git workflow skipped';
    case 'failed':
      return 'Git workflow failed (see logs)';
    default:
      return '';
  }
}

// ── Git primitives (quiet, non-throwing) ─────────────────────────────────────

function runGit(args: string, cwd: string): string | null {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

function hasOriginRemote(cwd: string): boolean {
  const url = runGit('remote get-url origin', cwd);
  return Boolean(url);
}

function parseGithubRemote(url: string): { owner: string; repo: string } | null {
  const patterns = [
    /github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/i,
    /^([^/]+)\/([^/]+)$/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return { owner: m[1], repo: m[2] };
  }
  return null;
}

function resolveGithubTarget(cwd: string, cfg: GitWorkflowConfig): { owner: string; repo: string } | null {
  if (cfg.githubOwner && cfg.githubRepo) {
    return { owner: cfg.githubOwner, repo: cfg.githubRepo.replace(/\.git$/, '') };
  }
  const remote = runGit('remote get-url origin', cwd);
  if (!remote) return null;
  return parseGithubRemote(remote);
}

function ghAvailable(): boolean {
  try {
    const r = spawnSync('gh', ['--version'], { stdio: 'ignore' });
    return r.status === 0;
  } catch {
    return false;
  }
}

function ensureGitUser(cwd: string): void {
  if (!runGit('config user.email', cwd)) {
    runGit('config user.email "roland@roland.ai"', cwd);
    runGit('config user.name "Roland"', cwd);
  }
}

function getDefaultBranch(cwd: string): string {
  const sym = runGit('symbolic-ref refs/remotes/origin/HEAD --short', cwd);
  if (sym) return sym.replace(/^origin\//, '');
  for (const candidate of ['main', 'master', 'develop']) {
    if (runGit(`show-ref --verify refs/heads/${candidate}`, cwd)
      || runGit(`show-ref --verify refs/remotes/origin/${candidate}`, cwd)) {
      return candidate;
    }
  }
  const current = runGit('rev-parse --abbrev-ref HEAD', cwd);
  return current && current !== 'HEAD' ? current : 'main';
}

// ── Persistence ───────────────────────────────────────────────────────────────

interface TaskGitStore {
  updatedAt: number;
  runId: string;
  tasks: Record<string, TaskGitInfo>;
}

export function readTaskGitPayload(stateDir: string): TaskGitStore {
  return readTaskGitStore(stateDir);
}

function readTaskGitStore(stateDir: string): TaskGitStore {
  const file = path.join(stateDir, TASK_GIT_FILE);
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as TaskGitStore;
    return {
      updatedAt: raw.updatedAt ?? 0,
      runId: raw.runId ?? '',
      tasks: raw.tasks ?? {},
    };
  } catch {
    return { updatedAt: 0, runId: '', tasks: {} };
  }
}

function writeTaskGitStore(stateDir: string, store: TaskGitStore): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, TASK_GIT_FILE),
    JSON.stringify({ ...store, updatedAt: Date.now() }, null, 2),
    'utf-8',
  );
}

// ── Workflow class ────────────────────────────────────────────────────────────

export class TaskGitWorkflow {
  private readonly opts: TaskGitWorkflowOptions;
  private readonly cfg: GitWorkflowConfig;

  constructor(opts: TaskGitWorkflowOptions) {
    this.opts = opts;
    this.cfg = loadGitWorkflowConfig(opts.stateDir);
  }

  getConfig(): GitWorkflowConfig {
    return { ...this.cfg };
  }

  private persist(taskId: string, info: TaskGitInfo): TaskGitInfo {
    const store = readTaskGitStore(this.opts.stateDir);
    if (store.runId !== this.opts.runId) {
      store.runId = this.opts.runId;
      store.tasks = {};
    }
    store.tasks[taskId] = { ...store.tasks[taskId], ...info };
    writeTaskGitStore(this.opts.stateDir, store);
    return store.tasks[taskId];
  }

  private postBlackboard(task: TeamTask, info: TaskGitInfo): void {
    const lines = [
      `Task ${task.id}: ${task.title}`,
      info.branch ? `Branch: ${info.branch}` : null,
      info.statusLabel ?? statusLabelForPhase(info.phase ?? 'skipped', info.branch, info.prUrl),
      info.prUrl ? `PR: ${info.prUrl}` : null,
    ].filter(Boolean);

    this.opts.blackboard.post({
      type: 'decision',
      title: `Git: ${task.id} — ${info.phase ?? 'update'}`,
      content: lines.join('\n'),
      status: 'done',
      author: 'roland-git',
      priority: 'medium',
      tags: ['git', task.id, info.phase ?? 'git'],
      relatedIds: [task.id],
    });

    if (info.branch) {
      this.opts.commandBoard.appendBullet(
        'Artifacts',
        `[${task.id}] branch \`${info.branch}\`${info.prUrl ? ` · PR ${info.prUrl}` : ''}`,
      );
    }
  }

  /** Create and checkout task branch before the executor agent runs. */
  onTaskStart(task: TeamTask): TaskGitInfo {
    const skipped: TaskGitInfo = {
      phase: 'skipped',
      statusLabel: statusLabelForPhase('skipped'),
    };

    if (!this.cfg.enabled) {
      logGit('Workflow disabled — skipping branch creation', { taskId: task.id });
      return this.persist(task.id, skipped);
    }

    const cwd = this.opts.projectRoot;
    if (!isGitRepo(cwd)) {
      logGit('Not a git repository — skipping branch creation', { cwd });
      return this.persist(task.id, { ...skipped, error: 'not a git repo' });
    }

    if (!hasOriginRemote(cwd)) {
      logGit('No origin remote — skipping branch creation', { cwd });
      return this.persist(task.id, { ...skipped, error: 'no origin remote' });
    }

    const branch = buildTaskBranchName(task.id, task.title);
    logGit(`Creating branch for task ${task.id}`, { branch, title: task.title });

    const existing = runGit(`show-ref --verify refs/heads/${branch}`, cwd);
    if (existing !== null) {
      const switched = runGit(`checkout "${branch}"`, cwd);
      if (switched === null) {
        logGit(`Branch exists but checkout failed — continuing on current branch`, { branch });
        const info: TaskGitInfo = {
          branch,
          phase: 'failed',
          statusLabel: statusLabelForPhase('failed', branch),
          error: 'checkout failed',
        };
        this.postBlackboard(task, info);
        return this.persist(task.id, info);
      }
      logGit(`Switched to existing branch`, { branch });
    } else {
      const created = runGit(`checkout -b "${branch}"`, cwd);
      if (created === null) {
        logGit(`Branch creation failed — executor will run on current branch`, { branch });
        const info: TaskGitInfo = {
          branch,
          phase: 'failed',
          statusLabel: statusLabelForPhase('failed', branch),
          error: 'branch creation failed',
        };
        this.postBlackboard(task, info);
        return this.persist(task.id, info);
      }
      logGit(`Branch created`, { branch });
    }

    const info: TaskGitInfo = {
      branch,
      phase: 'branch_created',
      statusLabel: statusLabelForPhase('branch_created', branch),
    };
    this.postBlackboard(task, info);
    return this.persist(task.id, info);
  }

  /** Commit, push, and optionally open a draft PR after a successful executor task. */
  async onTaskComplete(task: TeamTask, startInfo?: TaskGitInfo): Promise<TaskGitInfo> {
    const base = startInfo ?? readTaskGitStore(this.opts.stateDir).tasks[task.id] ?? {};
    const skipped: TaskGitInfo = {
      ...base,
      phase: 'skipped',
      statusLabel: statusLabelForPhase('skipped'),
    };

    if (!this.cfg.enabled) {
      return this.persist(task.id, skipped);
    }

    const cwd = this.opts.projectRoot;
    const branch = base.branch;
    if (!branch || !isGitRepo(cwd) || !hasOriginRemote(cwd)) {
      logGit('Skipping task complete git ops — prerequisites missing', { taskId: task.id, branch });
      return this.persist(task.id, skipped);
    }

    const current = runGit('rev-parse --abbrev-ref HEAD', cwd);
    if (current !== branch) {
      logGit('Not on task branch at completion — skipping commit/push', { expected: branch, current });
      const info: TaskGitInfo = {
        ...base,
        phase: 'failed',
        statusLabel: 'Git workflow incomplete — wrong branch at completion',
        error: `expected ${branch}, on ${current ?? 'unknown'}`,
      };
      return this.persist(task.id, info);
    }

    ensureGitUser(cwd);

    const commitMsg = buildTaskCommitMessage(task);

    runGit('add .', cwd);
    const committed = runGit(`commit -m ${JSON.stringify(commitMsg)}`, cwd);
    if (committed === null) {
      const porcelain = runGit('status --porcelain', cwd);
      if (!porcelain) {
        logGit('Nothing to commit — skipping push/PR', { taskId: task.id, branch });
        const info: TaskGitInfo = {
          ...base,
          phase: 'pushed',
          statusLabel: 'No file changes — branch ready',
        };
        return this.persist(task.id, info);
      }
      logGit('Commit failed', { taskId: task.id });
      const info: TaskGitInfo = {
        ...base,
        phase: 'failed',
        statusLabel: statusLabelForPhase('failed', branch),
        error: 'commit failed',
      };
      this.postBlackboard(task, info);
      return this.persist(task.id, info);
    }
    logGit('Committed task changes', { taskId: task.id, branch });

    let info: TaskGitInfo = {
      ...base,
      phase: 'committed',
      statusLabel: statusLabelForPhase('committed', branch),
    };
    this.persist(task.id, info);

    const pushed = runGit(`push -u origin "${branch}"`, cwd);
    if (pushed === null) {
      logGit('Push failed — changes committed locally only', { branch });
      info = {
        ...info,
        phase: 'failed',
        statusLabel: 'Changes committed locally — push failed',
        error: 'push failed',
      };
      this.postBlackboard(task, info);
      return this.persist(task.id, info);
    }
    logGit('Pushed branch to origin', { branch });

    info = {
      ...info,
      phase: 'pushed',
      statusLabel: statusLabelForPhase('pushed', branch),
    };
    this.persist(task.id, info);

    if (!this.cfg.createDraftPr) {
      info.statusLabel = 'Branch created → Changes pushed';
      this.postBlackboard(task, info);
      return this.persist(task.id, info);
    }

    const ghTarget = resolveGithubTarget(cwd, this.cfg);
    if (!ghTarget) {
      logGit('Could not resolve GitHub owner/repo — skipping PR', { taskId: task.id });
      info.statusLabel = 'Branch created → Changes pushed (no GitHub target for PR)';
      this.postBlackboard(task, info);
      return this.persist(task.id, info);
    }

    const prTitle = buildConventionalPrTitle(task);
    const prBody = buildPrDescription(task, {
      goal: this.opts.goal,
      runId: this.opts.runId,
      missionUrl: this.opts.missionUrl,
    });

    const pr = await this.createDraftPr(cwd, branch, prTitle, prBody, ghTarget);
    if (!pr) {
      info = {
        ...info,
        phase: 'pushed',
        statusLabel: 'Branch created → Changes pushed (draft PR failed)',
        error: 'draft PR failed',
      };
      this.postBlackboard(task, info);
      return this.persist(task.id, info);
    }

    info = {
      ...info,
      phase: 'pr_opened',
      prUrl: pr.url,
      prNumber: pr.number,
      statusLabel: 'Branch created → Changes pushed → Draft PR opened',
    };
    logGit('Draft PR opened', { url: pr.url, number: pr.number });
    this.postBlackboard(task, info);
    return this.persist(task.id, info);
  }

  private async createDraftPr(
    cwd: string,
    branch: string,
    title: string,
    body: string,
    target: { owner: string; repo: string },
  ): Promise<{ url: string; number: number } | null> {
    if (ghAvailable()) {
      try {
        const bodyFile = path.join(this.opts.stateDir, `.pr-body-${Date.now()}.md`);
        fs.writeFileSync(bodyFile, body, 'utf-8');
        try {
          const out = execSync(
            `gh pr create --draft --title ${JSON.stringify(title)} --body-file ${JSON.stringify(bodyFile)} --head ${JSON.stringify(branch)}`,
            { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
          ).trim();
          const urlMatch = out.match(/https:\/\/github\.com\/[^\s]+/);
          if (urlMatch) {
            const numMatch = urlMatch[0].match(/\/pull\/(\d+)/);
            return { url: urlMatch[0], number: numMatch ? Number(numMatch[1]) : 0 };
          }
          const view = execSync(
            `gh pr view --head ${JSON.stringify(branch)} --json url,number`,
            { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
          );
          const parsed = JSON.parse(view) as { url?: string; number?: number };
          if (parsed.url) return { url: parsed.url, number: parsed.number ?? 0 };
        } finally {
          try { fs.unlinkSync(bodyFile); } catch { /* ignore */ }
        }
      } catch (e) {
        logGit('gh pr create failed — trying GitHub API', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const token = this.cfg.githubToken;
    if (!token) {
      logGit('No GitHub token and gh unavailable — cannot create draft PR');
      return null;
    }

    try {
      const base = getDefaultBranch(cwd);
      const res = await fetch(`https://api.github.com/repos/${target.owner}/${target.repo}/pulls`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          title,
          body,
          head: branch,
          base,
          draft: true,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        logGit('GitHub API PR create failed', { status: res.status, body: errText.slice(0, 200) });
        return null;
      }

      const data = await res.json() as { html_url?: string; number?: number };
      if (data.html_url) {
        return { url: data.html_url, number: data.number ?? 0 };
      }
      return null;
    } catch (e) {
      logGit('GitHub API PR create error', { error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }
}

