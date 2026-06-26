/**
 * ## Assumptions
 * - git-commit is a first-class between-iterations hook with dry_run default true.
 * - Real commits require explicit dry_run: false — never commit silently.
 * - Uses git-tools for mutating operations; preview uses status --short only.
 */

import { gitCommit, gitStatus } from '../utils/git-tools.js';

export interface GitCommitActionOptions {
  cwd: string;
  messageTemplate: string;
  includeFiles?: string[];
  autoStage?: boolean;
  dryRun: boolean;
  /** Template variables for message interpolation. */
  vars?: Record<string, string | number | undefined>;
  /** When set, use this literal message instead of interpolating messageTemplate. */
  literalMessage?: string;
}

export interface GitCommitActionResult {
  success: boolean;
  dryRun: boolean;
  message: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  sha?: string;
}

function interpolateMessage(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = vars[key];
    return val !== undefined ? String(val) : '';
  }).trim();
}

function safeStatusShort(cwd: string): { short: string; error?: string } {
  try {
    const status = gitStatus(cwd);
    const short = status.raw.trim() || '(clean working tree)';
    return { short };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { short: '', error: message };
  }
}

/**
 * Execute or preview the git-commit built-in hook.
 * dryRun (default true): show git status --short + proposed message without committing.
 */
export function runGitCommitAction(opts: GitCommitActionOptions): GitCommitActionResult {
  const message = opts.literalMessage?.trim()
    ? opts.literalMessage.trim()
    : interpolateMessage(opts.messageTemplate, opts.vars ?? {});
  const cwd = opts.cwd;

  if (opts.dryRun) {
    const { short, error } = safeStatusShort(cwd);
    if (error) {
      return {
        success: false,
        dryRun: true,
        message,
        stdout: '',
        stderr: error,
        exitCode: 1,
      };
    }
    const preview = [
      'git-commit hook (dry-run — no commit created)',
      '',
      'Proposed message:',
      message,
      '',
      'git status --short:',
      short,
    ].join('\n');
    return {
      success: true,
      dryRun: true,
      message,
      stdout: preview,
      stderr: '',
      exitCode: 0,
    };
  }

  try {
    const files =
      opts.includeFiles && opts.includeFiles.length > 0
        ? opts.includeFiles
        : opts.autoStage
          ? undefined
          : [];
    if (!opts.autoStage && (!files || files.length === 0)) {
      const { short, error } = safeStatusShort(cwd);
      if (error) {
        return {
          success: false,
          dryRun: false,
          message,
          stdout: '',
          stderr: error,
          exitCode: 1,
        };
      }
      return {
        success: false,
        dryRun: false,
        message,
        stdout: short,
        stderr:
          'git-commit: dry_run is false but auto_stage is false and include_files is empty — enable auto_stage or set include_files',
        exitCode: 1,
      };
    }
    const result = gitCommit(cwd, message, files);
    return {
      success: true,
      dryRun: false,
      message: result.message,
      stdout: `Committed ${result.sha}: ${result.message}`,
      stderr: '',
      exitCode: 0,
      sha: result.sha,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      dryRun: false,
      message,
      stdout: '',
      stderr: message,
      exitCode: 1,
    };
  }
}
