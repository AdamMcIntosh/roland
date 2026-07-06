/**
 * ## P1 Honesty & Consolidation
 *
 * Git read/write tools for MCP agents.
 */

import { McpToolError } from '../../utils/errors.js';
import { gitStatus, gitDiff, gitLog, gitCommit } from '../../utils/git-tools.js';
import type { McpToolRegistrar } from './types.js';

function resolveCwd(args: Record<string, unknown>): string {
  return typeof args.project_root === 'string' && args.project_root
    ? args.project_root
    : (process.env['ROLAND_PROJECT_ROOT']?.trim() || process.cwd());
}

export function registerGitTools(registrar: McpToolRegistrar): void {
  registrar.registerTool(
    'git_status',
    'Read-only: current git status (staged, unstaged, untracked). Use before planning edits or commits. Pass project_root to target a repo other than ROLAND_PROJECT_ROOT/cwd.',
    async (args: Record<string, unknown>) => {
      const result = gitStatus(resolveCwd(args));
      return {
        staged: result.staged,
        unstaged: result.unstaged,
        untracked: result.untracked,
        summary: `${result.staged.length} staged, ${result.unstaged.length} unstaged, ${result.untracked.length} untracked`,
        raw: result.raw,
      };
    },
  );

  registrar.registerTool(
    'git_diff',
    'Read-only: unified diff of working-tree changes. Pass staged:true for index-only, file_path to limit scope, max_lines to cap output.',
    async (args: Record<string, unknown>) => {
      const cwd = resolveCwd(args);
      const staged = args.staged === true;
      const filePath = typeof args.file_path === 'string' ? args.file_path : undefined;
      const maxLines = typeof args.max_lines === 'number' ? args.max_lines : 500;
      const diff = gitDiff(cwd, { staged, filePath, maxLines });
      return { diff: diff || '(no changes)', staged, file_path: filePath ?? null };
    },
  );

  registrar.registerTool(
    'git_log',
    'Read-only: recent commit history (one-line format). Defaults to 10 commits. Use to understand recent changes before editing.',
    async (args: Record<string, unknown>) => {
      const limit = typeof args.limit === 'number' ? args.limit : 10;
      const log = gitLog(resolveCwd(args), limit);
      return { log: log || '(no commits)', limit };
    },
  );

  registrar.registerTool(
    'git_commit',
    'Create a git commit (mutating). Stages files[] or all changes (git add -A) then commits with message. Requires explicit user approval in Cursor.',
    async (args: Record<string, unknown>) => {
      const message = args.message as string;
      if (!message) throw new McpToolError('git_commit', 'message is required');
      const files = Array.isArray(args.files) ? (args.files as string[]) : undefined;
      const result = gitCommit(resolveCwd(args), message, files);
      return { sha: result.sha, message: result.message, success: true };
    },
  );
}
