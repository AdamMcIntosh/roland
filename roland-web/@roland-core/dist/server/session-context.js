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
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
// ============================================================================
// Session Context Manager
// ============================================================================
export class SessionContextManager {
    static SESSION_DIR = '.cache/sessions';
    sessions = new Map();
    projectContext = null;
    constructor() {
        this.loadAllSessions();
    }
    /**
     * Wire in a ProjectContextManager so session observations compound into
     * the cross-session knowledge base.
     */
    setProjectContext(ctx) {
        this.projectContext = ctx;
    }
    /**
     * Load all sessions from disk on startup.
     */
    loadAllSessions() {
        try {
            if (!fs.existsSync(SessionContextManager.SESSION_DIR)) {
                fs.mkdirSync(SessionContextManager.SESSION_DIR, { recursive: true });
                return;
            }
            const files = fs.readdirSync(SessionContextManager.SESSION_DIR)
                .filter(f => f.endsWith('.json'));
            for (const file of files) {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(SessionContextManager.SESSION_DIR, file), 'utf-8'));
                    if (data.id) {
                        this.sessions.set(data.id, data);
                    }
                }
                catch {
                    logger.warn(`[SessionContext] Skipping corrupt session file: ${file}`);
                }
            }
            logger.debug(`[SessionContext] Loaded ${this.sessions.size} session(s)`);
        }
        catch (error) {
            logger.warn(`[SessionContext] Failed to load sessions: ${error}`);
        }
    }
    /**
     * Save a session to disk.
     */
    save(session) {
        try {
            if (!fs.existsSync(SessionContextManager.SESSION_DIR)) {
                fs.mkdirSync(SessionContextManager.SESSION_DIR, { recursive: true });
            }
            const filePath = path.join(SessionContextManager.SESSION_DIR, `${session.id}.json`);
            fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
        }
        catch (error) {
            logger.error(`[SessionContext] Failed to save session ${session.id}: ${error}`);
        }
    }
    /**
     * Start a new session.
     */
    start(task, id) {
        const sessionId = id || `session-${Date.now().toString(36)}`;
        const session = {
            id: sessionId,
            task,
            started: new Date().toISOString(),
            last_updated: new Date().toISOString(),
            current_step: 0,
            decisions: [],
            files_modified: [],
            patterns: [],
            migration_map: [],
            errors_resolved: [],
            notes: [],
        };
        this.sessions.set(sessionId, session);
        this.save(session);
        logger.info(`[SessionContext] Started session "${sessionId}": ${task}`);
        return session;
    }
    /**
     * Get a session by ID. Returns the most recent session if no ID provided.
     */
    get(sessionId) {
        if (sessionId) {
            return this.sessions.get(sessionId) || null;
        }
        // Return most recently updated session
        let latest = null;
        for (const session of this.sessions.values()) {
            if (!latest || session.last_updated > latest.last_updated) {
                latest = session;
            }
        }
        return latest;
    }
    /**
     * List all sessions.
     */
    list() {
        return Array.from(this.sessions.values()).map(s => ({
            id: s.id,
            task: s.task,
            started: s.started,
            last_updated: s.last_updated,
            step: s.current_step,
        }));
    }
    /**
     * Update a session with new context.
     */
    update(sessionId, updates) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return null;
        const now = new Date().toISOString();
        session.last_updated = now;
        if (updates.advance_step) {
            session.current_step++;
        }
        if (updates.decision) {
            session.decisions.push({
                text: updates.decision,
                step: session.current_step,
                timestamp: now,
            });
            this.projectContext?.observe('decision', {
                description: updates.decision,
                rationale: '',
            });
        }
        if (updates.file_change) {
            // Update existing entry or add new
            const existing = session.files_modified.find(f => f.path === updates.file_change.path);
            if (existing) {
                existing.action = updates.file_change.action;
                existing.summary = updates.file_change.summary;
                existing.step = session.current_step;
                existing.timestamp = now;
            }
            else {
                session.files_modified.push({
                    ...updates.file_change,
                    step: session.current_step,
                    timestamp: now,
                });
            }
        }
        if (updates.pattern) {
            // Update existing pattern or add new
            const existing = session.patterns.find(p => p.name === updates.pattern.name);
            if (existing) {
                existing.description = updates.pattern.description;
                existing.example_file = updates.pattern.example_file;
                existing.timestamp = now;
            }
            else {
                session.patterns.push({ ...updates.pattern, timestamp: now });
            }
            this.projectContext?.observe('pattern', {
                name: updates.pattern.name,
                description: updates.pattern.description,
                files: updates.pattern.example_file ? [updates.pattern.example_file] : [],
            });
        }
        if (updates.migration) {
            // Update existing migration entry or add new
            const existing = session.migration_map.find(m => m.source === updates.migration.source);
            if (existing) {
                existing.target = updates.migration.target;
                existing.status = updates.migration.status;
                existing.notes = updates.migration.notes || existing.notes;
                existing.timestamp = now;
            }
            else {
                session.migration_map.push({ ...updates.migration, timestamp: now });
            }
        }
        if (updates.error_resolved) {
            session.errors_resolved.push({
                ...updates.error_resolved,
                step: session.current_step,
                timestamp: now,
            });
            this.projectContext?.observe('error', {
                error_pattern: updates.error_resolved.error,
                resolution: updates.error_resolved.resolution,
            });
        }
        if (updates.note) {
            session.notes.push(updates.note);
        }
        this.save(session);
        return session;
    }
    /**
     * Format session context as a structured prompt for subagents.
     * This is the key method — produces the context that closes the gap with Claude Code.
     */
    formatForSubagent(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return '';
        const parts = [];
        // Prepend cross-session project knowledge if available
        if (this.projectContext) {
            const projectBlock = this.projectContext.formatForPrompt();
            if (projectBlock) {
                parts.push(projectBlock);
                parts.push('');
            }
        }
        parts.push(`## Session Context`);
        parts.push(`Task: ${session.task}`);
        parts.push(`Step: ${session.current_step}`);
        parts.push('');
        if (session.decisions.length > 0) {
            parts.push(`### Key Decisions`);
            for (const d of session.decisions) {
                parts.push(`- [Step ${d.step}] ${d.text}`);
            }
            parts.push('');
        }
        if (session.patterns.length > 0) {
            parts.push(`### Established Patterns`);
            for (const p of session.patterns) {
                parts.push(`- **${p.name}**: ${p.description}${p.example_file ? ` (see ${p.example_file})` : ''}`);
            }
            parts.push('');
        }
        if (session.migration_map.length > 0) {
            parts.push(`### Migration Map`);
            for (const m of session.migration_map) {
                const status = m.status === 'completed' ? '[done]' :
                    m.status === 'in_progress' ? '[in progress]' :
                        m.status === 'skipped' ? '[skipped]' : '[pending]';
                parts.push(`- ${status} ${m.source} → ${m.target}${m.notes ? ` (${m.notes})` : ''}`);
            }
            parts.push('');
        }
        if (session.files_modified.length > 0) {
            parts.push(`### Files Modified`);
            for (const f of session.files_modified) {
                parts.push(`- ${f.action}: ${f.path} [Step ${f.step}] — ${f.summary}`);
            }
            parts.push('');
        }
        if (session.errors_resolved.length > 0) {
            parts.push(`### Errors Resolved`);
            for (const e of session.errors_resolved) {
                parts.push(`- [Step ${e.step}] ${e.error} → ${e.resolution}`);
            }
            parts.push('');
        }
        if (session.notes.length > 0) {
            parts.push(`### Notes`);
            for (const n of session.notes) {
                parts.push(`- ${n}`);
            }
            parts.push('');
        }
        return parts.join('\n');
    }
    /**
     * Delete a session.
     */
    delete(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return false;
        this.sessions.delete(sessionId);
        try {
            const filePath = path.join(SessionContextManager.SESSION_DIR, `${sessionId}.json`);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        catch (error) {
            logger.warn(`[SessionContext] Failed to delete session file: ${error}`);
        }
        return true;
    }
}
//# sourceMappingURL=session-context.js.map