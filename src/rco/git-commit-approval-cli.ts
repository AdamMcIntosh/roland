/**
 * ## Assumptions
 * - Git-commit HITL uses `.roland/git-commit-approval.json` (same file as dashboard API).
 * - CLI writes decisions via GitCommitApprovalQueue; the loop polls and resumes automatically.
 * - Only one pending approval file exists per state dir; id is optional when status is pending.
 * - Missing, expired, or id-mismatch approvals exit non-zero with actionable messages.
 */

import fs from 'fs';
import path from 'path';
import {
  GitCommitApprovalQueue,
  GIT_COMMIT_APPROVAL_FILE,
  type GitCommitApprovalRequest,
} from '../loop-engine/git-commit-approval.js';

export type GitCommitApprovalCliDecision = 'approve' | 'reject';

export interface GitCommitApprovalCliOptions {
  stateDir?: string;
  id?: string;
  message?: string;
  reason?: string;
  /** When true, print pending approval details (interactive listing). */
  interactive?: boolean;
}

export interface GitCommitApprovalCliResult {
  ok: boolean;
  exitCode: number;
  decision?: GitCommitApprovalCliDecision;
  id?: string;
  message?: string;
  reason?: string;
  error?: string;
}

function isTTY(): boolean {
  return Boolean((process.stderr as NodeJS.WriteStream).isTTY);
}

function formatExpiry(request: GitCommitApprovalRequest): string {
  const remainingMs = request.timeoutAt - Date.now();
  const expiresAt = new Date(request.timeoutAt).toLocaleString();
  if (remainingMs <= 0) {
    return `${expiresAt} (expired)`;
  }
  const mins = Math.ceil(remainingMs / 60_000);
  return `${expiresAt} (in ~${mins} min)`;
}

function truncatePreview(preview: string, maxLines = 6): string {
  const lines = preview.split('\n').slice(0, maxLines);
  if (preview.split('\n').length > maxLines) {
    lines.push('  …');
  }
  return lines.map((l) => `    ${l}`).join('\n');
}

/** Read pending approval from disk; returns null when none or not pending. */
export function readPendingGitCommitApproval(stateDir: string): GitCommitApprovalRequest | null {
  const queue = new GitCommitApprovalQueue(stateDir);
  const current = queue.read();
  if (!current || current.status !== 'pending') {
    return null;
  }
  return current;
}

/** Resolve approval id — explicit arg or single pending request in state dir. */
export function resolveGitCommitApprovalId(
  stateDir: string,
  explicitId?: string,
): { id: string; request: GitCommitApprovalRequest } | { error: string; exitCode: number } {
  const queue = new GitCommitApprovalQueue(stateDir);
  const current = queue.read();

  if (!current) {
    const filePath = path.join(stateDir, GIT_COMMIT_APPROVAL_FILE);
    const exists = fs.existsSync(filePath);
    if (!exists) {
      return {
        error: `No git-commit approval in ${stateDir}. The loop may not be waiting for commit approval.`,
        exitCode: 1,
      };
    }
    return {
      error: `No pending git-commit approval in ${stateDir} (status may be resolved or expired).`,
      exitCode: 1,
    };
  }

  if (current.status !== 'pending') {
    return {
      error: `Git-commit approval ${current.id} is already ${current.status} — nothing to do.`,
      exitCode: 1,
    };
  }

  if (explicitId && explicitId !== current.id) {
    return {
      error: `Approval id mismatch: expected ${current.id}, got ${explicitId}.`,
      exitCode: 1,
    };
  }

  return { id: explicitId ?? current.id, request: current };
}

/** Print pending approval details for interactive terminal use. */
export function printPendingGitCommitApproval(stateDir: string): boolean {
  const pending = readPendingGitCommitApproval(stateDir);
  if (!pending) {
    process.stderr.write(`No pending git-commit approval in ${stateDir}.\n`);
    return false;
  }

  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const cy = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const y = (s: string) => `\x1b[33m${s}\x1b[0m`;

  process.stderr.write('\n');
  process.stderr.write(`  ${y('Pending git-commit approval')}\n\n`);
  process.stderr.write(`  ID:         ${pending.id}\n`);
  process.stderr.write(`  Iteration:  ${pending.iteration}\n`);
  process.stderr.write(`  Hook:       ${pending.hookLabel}\n`);
  process.stderr.write(`  Message:    ${pending.message}\n`);
  process.stderr.write(`  Expires:    ${formatExpiry(pending)}\n`);
  if (pending.statusPreview?.trim()) {
    process.stderr.write(`  Preview:\n${truncatePreview(pending.statusPreview)}\n`);
  }
  process.stderr.write('\n');
  process.stderr.write(`  ${cy('roland approve-commit')} ${pending.id} [--message "..."]\n`);
  process.stderr.write(`  ${cy('roland reject-commit')} ${pending.id} [--reason "..."]\n`);
  process.stderr.write('\n');

  if (Date.now() >= pending.timeoutAt) {
    process.stderr.write(`  ${dim('Note: approval window expired — loop may auto-reject on next poll.')}\n\n`);
  }

  return true;
}

/** Apply approve/reject decision (same backend as dashboard API). */
export function decideGitCommitApprovalCli(
  decision: GitCommitApprovalCliDecision,
  opts: GitCommitApprovalCliOptions = {},
): GitCommitApprovalCliResult {
  const stateDir = opts.stateDir ?? '.roland';
  const explicitId = opts.id?.trim() || undefined;
  const hasDecisionPayload =
    (decision === 'approve' && Boolean(opts.message?.trim())) ||
    (decision === 'reject' && Boolean(opts.reason?.trim()));

  // Interactive listing: no id and no decision payload → show pending and exit.
  if (!explicitId && !hasDecisionPayload && opts.interactive !== false && isTTY()) {
    printPendingGitCommitApproval(stateDir);
    return {
      ok: false,
      exitCode: 1,
      error: 'Approval id required — use the id shown above, or pass it as the first argument.',
    };
  }

  const resolved = resolveGitCommitApprovalId(stateDir, explicitId);
  if ('error' in resolved) {
    if (!explicitId && opts.interactive !== false) {
      printPendingGitCommitApproval(stateDir);
    }
    return { ok: false, exitCode: resolved.exitCode, error: resolved.error };
  }

  const { id, request } = resolved;

  if (Date.now() >= request.timeoutAt) {
    process.stderr.write(
      `⚠️  Approval window expired at ${new Date(request.timeoutAt).toLocaleString()} — attempting decision anyway.\n`,
    );
  }

  const queue = new GitCommitApprovalQueue(stateDir);
  const ok = queue.decide(id, decision, {
    message: opts.message,
    reason: opts.reason,
  });

  if (!ok) {
    return {
      ok: false,
      exitCode: 1,
      error: `Could not ${decision} git-commit ${id} — not pending or id mismatch (may have been decided concurrently).`,
    };
  }

  const updated = queue.read();
  const approvedMessage =
    decision === 'approve'
      ? (opts.message?.trim() || updated?.approvedMessage || request.message)
      : undefined;

  return {
    ok: true,
    exitCode: 0,
    decision,
    id,
    message: approvedMessage,
    reason: decision === 'reject' ? (opts.reason?.trim() || updated?.reason || 'Operator rejected commit') : undefined,
  };
}

function parseCliArgs(argv: string[]): {
  stateDir: string;
  id?: string;
  message?: string;
  reason?: string;
  positional: string[];
} {
  const stateDir = argv.find((_, i) => argv[i - 1] === '--state-dir') ?? '.roland';
  const sdIdx = argv.indexOf('--state-dir');
  const filtered = sdIdx >= 0 ? [...argv.slice(0, sdIdx), ...argv.slice(sdIdx + 2)] : [...argv];

  const messageIdx = filtered.indexOf('--message');
  const reasonIdx = filtered.indexOf('--reason');
  const message = messageIdx >= 0 ? filtered[messageIdx + 1] : undefined;
  const reason = reasonIdx >= 0 ? filtered[reasonIdx + 1] : undefined;

  const positional = filtered.filter(
    (_, i) =>
      i !== messageIdx &&
      i !== messageIdx + 1 &&
      i !== reasonIdx &&
      i !== reasonIdx + 1,
  );

  const id = positional[0]?.startsWith('-') ? undefined : positional[0];

  return { stateDir, id, message, reason, positional };
}

function printDecisionFeedback(result: GitCommitApprovalCliResult): void {
  if (!result.ok) {
    process.stderr.write(`❌ ${result.error ?? 'Git-commit approval failed.'}\n`);
    return;
  }

  if (result.decision === 'approve') {
    process.stderr.write(`✅ Git-commit approved (${result.id})\n`);
    if (result.message) {
      process.stderr.write(`   Message: "${result.message.slice(0, 120)}${result.message.length > 120 ? '…' : ''}"\n`);
    }
  } else {
    process.stderr.write(`🚫 Git-commit rejected (${result.id})\n`);
    if (result.reason) {
      process.stderr.write(`   Reason: ${result.reason}\n`);
    }
  }
  process.stderr.write('   Loop will resume automatically when it picks up the decision.\n');
}

/** CLI entry: `roland approve-commit [id] [--message "..."]` */
export function runApproveCommitCli(argv: string[]): number {
  const { stateDir, id, message } = parseCliArgs(argv);
  const result = decideGitCommitApprovalCli('approve', {
    stateDir,
    id,
    message,
    interactive: true,
  });
  printDecisionFeedback(result);
  return result.exitCode;
}

/** CLI entry: `roland reject-commit [id] [--reason "..."]` */
export function runRejectCommitCli(argv: string[]): number {
  const { stateDir, id, reason } = parseCliArgs(argv);
  const result = decideGitCommitApprovalCli('reject', {
    stateDir,
    id,
    reason,
    interactive: true,
  });
  printDecisionFeedback(result);
  return result.exitCode;
}

/** Print git-commit approval section for `roland hitl-status`. */
export function printGitCommitApprovalStatus(stateDir: string): void {
  const pending = readPendingGitCommitApproval(stateDir);
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const y = (s: string) => `\x1b[33m${s}\x1b[0m`;
  const cy = (s: string) => `\x1b[36m${s}\x1b[0m`;

  process.stderr.write(`  Git-commit:    ${pending ? y(`pending (${pending.id})`) : dim('none')}\n`);
  if (pending) {
    process.stderr.write(`  ${cy('roland approve-commit')} / ${cy('roland reject-commit')}\n`);
  }
}
