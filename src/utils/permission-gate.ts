/**
 * Permission Gate — policy-based constraints for Goose coding sessions.
 *
 * Reads `.roland-permissions.json` from the project root and converts it
 * to a text instruction block that is prepended to every Goose task prompt.
 * This is a prompt-level gate (not a process-level interceptor), so it works
 * with any Goose session without requiring extension hooks.
 *
 * Default permissions file is scaffolded by `scripts/init.ts`.
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface PermissionPolicy {
  /** Allow shell/terminal commands (default: true) */
  allow_shell?: boolean;
  /** Allow file write operations (default: true) */
  allow_write?: boolean | string[];
  /** Allow file read operations (default: true) */
  allow_read?: boolean | string[];
  /** Explicit list of shell commands that are NEVER allowed */
  deny_commands?: string[];
  /** Explicit list of paths that must never be modified */
  deny_paths?: string[];
  /** Free-form extra instructions appended after the policy block */
  extra_instructions?: string;
}

// ============================================================================
// Defaults
// ============================================================================

export const DEFAULT_PERMISSIONS: PermissionPolicy = {
  allow_shell: true,
  allow_write: true,
  allow_read: true,
  deny_commands: ['rm -rf /', 'shutdown', 'reboot', 'format'],
  deny_paths: ['.git/objects', '.env', '.roland-permissions.json'],
  extra_instructions: '',
};

// ============================================================================
// File I/O
// ============================================================================

const PERMISSIONS_FILE = '.roland-permissions.json';

export function readPermissions(projectRoot: string): PermissionPolicy {
  const filePath = path.join(projectRoot, PERMISSIONS_FILE);
  if (!fs.existsSync(filePath)) return DEFAULT_PERMISSIONS;

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PermissionPolicy;
  } catch {
    return DEFAULT_PERMISSIONS;
  }
}

export function scaffoldPermissionsFile(projectRoot: string): boolean {
  const filePath = path.join(projectRoot, PERMISSIONS_FILE);
  if (fs.existsSync(filePath)) return false;

  fs.writeFileSync(filePath, JSON.stringify(DEFAULT_PERMISSIONS, null, 2), 'utf-8');
  return true;
}

// ============================================================================
// Policy → prompt instructions
// ============================================================================

/**
 * Convert a PermissionPolicy to a text block that can be prepended to any
 * Goose task prompt. Returns an empty string when all defaults are in place
 * (no restrictions to communicate).
 */
export function buildPermissionBlock(policy: PermissionPolicy): string {
  const lines: string[] = [];

  const hasRestrictions =
    policy.allow_shell === false ||
    Array.isArray(policy.allow_write) ||
    policy.allow_write === false ||
    Array.isArray(policy.allow_read) ||
    policy.allow_read === false ||
    (policy.deny_commands && policy.deny_commands.length > 0) ||
    (policy.deny_paths && policy.deny_paths.length > 0);

  if (!hasRestrictions && !policy.extra_instructions) return '';

  lines.push('## Roland Permission Policy');
  lines.push('> The following constraints apply to this session. Respect them strictly.');
  lines.push('');

  if (policy.allow_shell === false) {
    lines.push('- **Shell execution is DISABLED.** Do not run shell commands.');
  }

  if (policy.allow_write === false) {
    lines.push('- **File writes are DISABLED.** Read files only; do not modify anything.');
  } else if (Array.isArray(policy.allow_write)) {
    lines.push(`- **File writes are restricted to**: ${policy.allow_write.join(', ')}`);
  }

  if (policy.allow_read === false) {
    lines.push('- **File reads are DISABLED.** Do not read any files.');
  } else if (Array.isArray(policy.allow_read)) {
    lines.push(`- **File reads are restricted to**: ${policy.allow_read.join(', ')}`);
  }

  if (policy.deny_commands && policy.deny_commands.length > 0) {
    lines.push(`- **Never run these commands**: ${policy.deny_commands.join(', ')}`);
  }

  if (policy.deny_paths && policy.deny_paths.length > 0) {
    lines.push(`- **Never modify these paths**: ${policy.deny_paths.join(', ')}`);
  }

  if (policy.extra_instructions) {
    lines.push('');
    lines.push(policy.extra_instructions);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Load permissions from projectRoot and return the formatted block.
 * Returns empty string if no restrictions are configured.
 */
export function getPermissionBlock(projectRoot: string): string {
  const policy = readPermissions(projectRoot);
  return buildPermissionBlock(policy);
}
