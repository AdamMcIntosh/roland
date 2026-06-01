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
export declare const DEFAULT_PERMISSIONS: PermissionPolicy;
export declare function readPermissions(projectRoot: string): PermissionPolicy;
export declare function scaffoldPermissionsFile(projectRoot: string): boolean;
/**
 * Convert a PermissionPolicy to a text block that can be prepended to any
 * Goose task prompt. Returns an empty string when all defaults are in place
 * (no restrictions to communicate).
 */
export declare function buildPermissionBlock(policy: PermissionPolicy): string;
/**
 * Load permissions from projectRoot and return the formatted block.
 * Returns empty string if no restrictions are configured.
 */
export declare function getPermissionBlock(projectRoot: string): string;
//# sourceMappingURL=permission-gate.d.ts.map