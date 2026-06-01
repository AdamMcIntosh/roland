/**
 * Session Context Manager — Persistent memory for long coding sessions.
 *
 * Tracks decisions, file changes, patterns, errors, and migration progress
 * across subagent calls. Persists to disk so context survives across
 * Goose session restarts.
 *
 * Solves the "long session context continuity" gap vs Claude Code:
 * each subagent gets the full structured context of everything that
 * happened before it, not just a lossy summary.
 */
import { ProjectContextManager } from './project-context.js';
export interface SessionDecision {
    text: string;
    step?: number;
    timestamp: string;
}
export interface SessionFileChange {
    path: string;
    action: 'created' | 'modified' | 'deleted';
    step?: number;
    summary: string;
    timestamp: string;
}
export interface SessionPattern {
    name: string;
    example_file?: string;
    description: string;
    timestamp: string;
}
export interface SessionMigrationEntry {
    source: string;
    target: string;
    status: 'pending' | 'in_progress' | 'completed' | 'skipped';
    notes?: string;
    timestamp: string;
}
export interface SessionError {
    step?: number;
    error: string;
    resolution: string;
    timestamp: string;
}
export interface SessionContext {
    id: string;
    task: string;
    started: string;
    last_updated: string;
    current_step: number;
    decisions: SessionDecision[];
    files_modified: SessionFileChange[];
    patterns: SessionPattern[];
    migration_map: SessionMigrationEntry[];
    errors_resolved: SessionError[];
    notes: string[];
}
export declare class SessionContextManager {
    private static readonly SESSION_DIR;
    private sessions;
    private projectContext;
    constructor();
    /**
     * Wire in a ProjectContextManager so session observations compound into
     * the cross-session knowledge base.
     */
    setProjectContext(ctx: ProjectContextManager): void;
    /**
     * Load all sessions from disk on startup.
     */
    private loadAllSessions;
    /**
     * Save a session to disk.
     */
    private save;
    /**
     * Start a new session.
     */
    start(task: string, id?: string): SessionContext;
    /**
     * Get a session by ID. Returns the most recent session if no ID provided.
     */
    get(sessionId?: string): SessionContext | null;
    /**
     * List all sessions.
     */
    list(): Array<{
        id: string;
        task: string;
        started: string;
        last_updated: string;
        step: number;
    }>;
    /**
     * Update a session with new context.
     */
    update(sessionId: string, updates: {
        decision?: string;
        file_change?: {
            path: string;
            action: 'created' | 'modified' | 'deleted';
            summary: string;
        };
        pattern?: {
            name: string;
            example_file?: string;
            description: string;
        };
        migration?: {
            source: string;
            target: string;
            status: 'pending' | 'in_progress' | 'completed' | 'skipped';
            notes?: string;
        };
        error_resolved?: {
            error: string;
            resolution: string;
        };
        note?: string;
        advance_step?: boolean;
    }): SessionContext | null;
    /**
     * Format session context as a structured prompt for subagents.
     * This is the key method — produces the context that closes the gap with Claude Code.
     */
    formatForSubagent(sessionId: string): string;
    /**
     * Delete a session.
     */
    delete(sessionId: string): boolean;
}
//# sourceMappingURL=session-context.d.ts.map