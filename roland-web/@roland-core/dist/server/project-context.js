/**
 * Project Context Manager — Cross-session knowledge base for Roland.
 *
 * Persists conventions, patterns, decisions, and error resolutions to
 * `.roland/project-context.json` in the project root. Compounds knowledge
 * over time: repeated observations increase confidence, stale low-confidence
 * entries are pruned automatically.
 *
 * Designed to be wired into SessionContextManager so that knowledge
 * discovered during a session flows automatically into the persistent store.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
// ============================================================================
// ProjectContextManager
// ============================================================================
export class ProjectContextManager {
    contextPath;
    rolandDir;
    knowledge;
    constructor(projectRoot) {
        this.rolandDir = path.join(projectRoot, '.roland');
        this.contextPath = path.join(this.rolandDir, 'project-context.json');
        this.knowledge = this.loadSync();
    }
    // --------------------------------------------------------------------------
    // Persistence
    // --------------------------------------------------------------------------
    /**
     * Synchronous load used in constructor so the manager is ready immediately.
     */
    loadSync() {
        try {
            if (fs.existsSync(this.contextPath)) {
                const raw = fs.readFileSync(this.contextPath, 'utf-8');
                return JSON.parse(raw);
            }
        }
        catch {
            logger.warn('[ProjectContext] Corrupt project-context.json — starting fresh');
        }
        return this.emptyKnowledge();
    }
    /**
     * Re-read from disk (async). Useful if another process may have written.
     */
    async load() {
        try {
            if (fs.existsSync(this.contextPath)) {
                const raw = await fs.promises.readFile(this.contextPath, 'utf-8');
                this.knowledge = JSON.parse(raw);
            }
        }
        catch {
            logger.warn('[ProjectContext] Failed to load project-context.json');
        }
        return this.knowledge;
    }
    /**
     * Atomic-ish write: write to temp file then rename to avoid corruption.
     */
    async save() {
        try {
            if (!fs.existsSync(this.rolandDir)) {
                await fs.promises.mkdir(this.rolandDir, { recursive: true });
            }
            this.knowledge.last_updated = new Date().toISOString();
            const tmpPath = this.contextPath + '.tmp';
            await fs.promises.writeFile(tmpPath, JSON.stringify(this.knowledge, null, 2), 'utf-8');
            await fs.promises.rename(tmpPath, this.contextPath);
        }
        catch (error) {
            logger.error(`[ProjectContext] Failed to save: ${error}`);
        }
    }
    // --------------------------------------------------------------------------
    // Core API
    // --------------------------------------------------------------------------
    /**
     * Add or reinforce an entry. Fuzzy-matches on first 50 chars of description.
     * Reinforced entries get confidence += 0.1 (capped at 1.0) and updated last_seen.
     * New entries start at confidence 0.3.
     */
    observe(type, data) {
        const now = new Date().toISOString();
        switch (type) {
            case 'convention': {
                const description = data.description || '';
                const existing = this.findByDescription(this.knowledge.conventions, description);
                if (existing) {
                    existing.times_observed++;
                    existing.confidence = Math.min(1.0, existing.confidence + 0.1);
                    existing.last_seen = now;
                    if (data.examples && Array.isArray(data.examples)) {
                        existing.examples = Array.from(new Set([...existing.examples, ...data.examples]));
                    }
                }
                else {
                    const entry = {
                        id: crypto.randomUUID(),
                        category: data.category || 'general',
                        description,
                        examples: data.examples || [],
                        confidence: 0.3,
                        pinned: false,
                        first_seen: now,
                        last_seen: now,
                        times_observed: 1,
                    };
                    this.knowledge.conventions.push(entry);
                }
                break;
            }
            case 'pattern': {
                const description = data.description || '';
                const existing = this.findByDescription(this.knowledge.patterns, description);
                if (existing) {
                    existing.times_observed++;
                    existing.confidence = Math.min(1.0, existing.confidence + 0.1);
                    existing.last_seen = now;
                    if (data.files && Array.isArray(data.files)) {
                        existing.files = Array.from(new Set([...existing.files, ...data.files]));
                    }
                    if (data.name)
                        existing.name = data.name;
                }
                else {
                    const entry = {
                        id: crypto.randomUUID(),
                        name: data.name || description.slice(0, 40),
                        description,
                        files: data.files || [],
                        confidence: 0.3,
                        pinned: false,
                        first_seen: now,
                        last_seen: now,
                        times_observed: 1,
                    };
                    this.knowledge.patterns.push(entry);
                }
                break;
            }
            case 'decision': {
                const description = data.description || '';
                const existing = this.findByDescription(this.knowledge.decisions, description);
                if (!existing) {
                    const entry = {
                        id: crypto.randomUUID(),
                        description,
                        rationale: data.rationale || '',
                        date: now,
                        pinned: false,
                    };
                    this.knowledge.decisions.push(entry);
                }
                // Decisions don't compound — they're recorded once
                break;
            }
            case 'error': {
                const error_pattern = data.error_pattern || '';
                const existing = this.knowledge.errors.find(e => this.fuzzyMatch(e.error_pattern, error_pattern));
                if (existing) {
                    existing.occurrences++;
                    existing.last_seen = now;
                    if (data.resolution)
                        existing.resolution = data.resolution;
                }
                else {
                    const entry = {
                        id: crypto.randomUUID(),
                        error_pattern,
                        resolution: data.resolution || '',
                        occurrences: 1,
                        pinned: false,
                        first_seen: now,
                        last_seen: now,
                    };
                    this.knowledge.errors.push(entry);
                }
                break;
            }
        }
    }
    /**
     * Return entries optionally filtered by type.
     */
    query(type) {
        switch (type) {
            case 'convention': return this.knowledge.conventions;
            case 'pattern': return this.knowledge.patterns;
            case 'decision': return this.knowledge.decisions;
            case 'error': return this.knowledge.errors;
            default:
                return {
                    conventions: this.knowledge.conventions,
                    patterns: this.knowledge.patterns,
                    decisions: this.knowledge.decisions,
                    errors: this.knowledge.errors,
                };
        }
    }
    /**
     * Generate a concise ## Project Knowledge markdown block for prompt injection.
     * Max ~2000 chars, prioritized by confidence.
     */
    formatForPrompt() {
        const parts = ['## Project Knowledge'];
        const project = this.knowledge.project;
        if (project.name) {
            const meta = [`Project: ${project.name}`];
            if (project.language)
                meta.push(`Language: ${project.language}`);
            if (project.framework)
                meta.push(`Framework: ${project.framework}`);
            if (project.test_runner)
                meta.push(`Test runner: ${project.test_runner}`);
            parts.push(meta.join(' | '));
            parts.push('');
        }
        // Conventions (confidence > 0.3), sorted by confidence desc
        const conventions = this.knowledge.conventions
            .filter(c => c.confidence > 0.3 || c.pinned)
            .sort((a, b) => b.confidence - a.confidence);
        if (conventions.length > 0) {
            parts.push('### Conventions');
            for (const c of conventions) {
                const ex = c.examples.length > 0 ? ` (e.g. ${c.examples.slice(0, 2).join(', ')})` : '';
                parts.push(`- [${c.category}] ${c.description}${ex}`);
            }
            parts.push('');
        }
        // Patterns (confidence > 0.3), sorted by confidence desc
        const patterns = this.knowledge.patterns
            .filter(p => p.confidence > 0.3 || p.pinned)
            .sort((a, b) => b.confidence - a.confidence);
        if (patterns.length > 0) {
            parts.push('### Patterns');
            for (const p of patterns) {
                const files = p.files.length > 0 ? ` (${p.files.slice(0, 2).join(', ')})` : '';
                parts.push(`- **${p.name}**: ${p.description}${files}`);
            }
            parts.push('');
        }
        // All decisions
        if (this.knowledge.decisions.length > 0) {
            parts.push('### Decisions');
            for (const d of this.knowledge.decisions) {
                parts.push(`- ${d.description}${d.rationale ? `: ${d.rationale}` : ''}`);
            }
            parts.push('');
        }
        // Errors with occurrences > 1
        const errors = this.knowledge.errors.filter(e => e.occurrences > 1 || e.pinned);
        if (errors.length > 0) {
            parts.push('### Known Error Patterns');
            for (const e of errors) {
                parts.push(`- ${e.error_pattern} → ${e.resolution}`);
            }
            parts.push('');
        }
        const result = parts.join('\n');
        // Truncate to ~2000 chars
        if (result.length > 2000) {
            return result.slice(0, 1997) + '...';
        }
        return result;
    }
    /**
     * Pin an entry by ID across all entry types. Returns true if found.
     */
    pin(id) {
        return this.setPin(id, true);
    }
    /**
     * Unpin an entry by ID. Returns true if found.
     */
    unpin(id) {
        return this.setPin(id, false);
    }
    /**
     * Remove an entry by ID. Returns true if removed.
     */
    remove(id) {
        for (const key of ['conventions', 'patterns', 'decisions', 'errors']) {
            const arr = this.knowledge[key];
            const idx = arr.findIndex(e => e.id === id);
            if (idx !== -1) {
                arr.splice(idx, 1);
                return true;
            }
        }
        return false;
    }
    /**
     * Remove entries where confidence < 0.2 AND last_seen older than 30 days AND not pinned.
     * Returns count of removed entries.
     */
    prune() {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const cutoffStr = cutoff.toISOString();
        let removed = 0;
        const pruneArray = (arr) => {
            return arr.filter(entry => {
                if (entry.pinned)
                    return true;
                const tooOld = entry.last_seen ? entry.last_seen < cutoffStr : false;
                const lowConfidence = entry.confidence !== undefined ? entry.confidence < 0.2 : false;
                if (lowConfidence && tooOld) {
                    removed++;
                    return false;
                }
                return true;
            });
        };
        this.knowledge.conventions = pruneArray(this.knowledge.conventions);
        this.knowledge.patterns = pruneArray(this.knowledge.patterns);
        // Decisions and errors don't have confidence — skip pruning them
        this.knowledge.errors = this.knowledge.errors.filter(e => {
            if (e.pinned)
                return true;
            if (e.occurrences < 2 && e.last_seen < cutoffStr) {
                removed++;
                return false;
            }
            return true;
        });
        return removed;
    }
    /**
     * Clear all entries, preserving project metadata.
     */
    reset() {
        this.knowledge.conventions = [];
        this.knowledge.patterns = [];
        this.knowledge.decisions = [];
        this.knowledge.errors = [];
        this.knowledge.last_updated = new Date().toISOString();
    }
    /**
     * Return a copy of the full knowledge object.
     */
    getKnowledge() {
        return this.knowledge;
    }
    // --------------------------------------------------------------------------
    // Internal helpers
    // --------------------------------------------------------------------------
    emptyKnowledge() {
        return {
            version: '1.0',
            project: {
                name: path.basename(path.dirname(this.contextPath + '/..')),
            },
            conventions: [],
            patterns: [],
            decisions: [],
            errors: [],
            last_updated: new Date().toISOString(),
        };
    }
    fuzzyMatch(a, b) {
        const normalize = (s) => s.slice(0, 50).toLowerCase().trim();
        return normalize(a) === normalize(b);
    }
    findByDescription(arr, description) {
        return arr.find(e => this.fuzzyMatch(e.description, description));
    }
    setPin(id, pinned) {
        for (const key of ['conventions', 'patterns', 'decisions', 'errors']) {
            const arr = this.knowledge[key];
            const entry = arr.find(e => e.id === id);
            if (entry) {
                entry.pinned = pinned;
                return true;
            }
        }
        return false;
    }
}
//# sourceMappingURL=project-context.js.map