/**
 * RCO Blackboard — shared persistent state for the PM agent team.
 *
 * The Blackboard is the team's single source of truth: tasks, decisions,
 * artifacts, blockers, and results all live here. Every agent can read it;
 * only the Lead PM and the orchestrator write to it directly (workers post
 * results that are then written by the orchestrator on their behalf).
 *
 * Persistence: `.roland/blackboard.json` in the project directory.
 * All mutations are rev-stamped for lightweight optimistic concurrency.
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
export class Blackboard {
    filePath;
    entries = new Map();
    constructor(stateDir = '.roland') {
        fs.mkdirSync(stateDir, { recursive: true });
        this.filePath = path.join(stateDir, 'blackboard.json');
        this.load();
    }
    // ── Persistence ────────────────────────────────────────────────────────────
    load() {
        try {
            const raw = fs.readFileSync(this.filePath, 'utf-8');
            const data = JSON.parse(raw);
            this.entries = new Map(data.map((e) => [e.id, e]));
        }
        catch (err) {
            if (err.code !== 'ENOENT') {
                // File exists but is corrupt (e.g. partial write after a crash) — warn so
                // the operator knows state was lost rather than silently starting empty.
                console.error('[Blackboard] State file could not be parsed; starting empty.', err);
            }
            this.entries = new Map();
        }
    }
    save() {
        const data = Array.from(this.entries.values());
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    }
    // ── Mutations ──────────────────────────────────────────────────────────────
    post(entry) {
        const now = Date.now();
        const full = { ...entry, id: randomUUID(), rev: 1, createdAt: now, updatedAt: now };
        this.entries.set(full.id, full);
        this.save();
        return full;
    }
    patch(id, updates) {
        const existing = this.entries.get(id);
        if (!existing)
            return null;
        const updated = { ...existing, ...updates, rev: existing.rev + 1, updatedAt: Date.now() };
        this.entries.set(id, updated);
        this.save();
        return updated;
    }
    archive(id) {
        return this.patch(id, { status: 'archived' });
    }
    // ── Queries ────────────────────────────────────────────────────────────────
    get(id) {
        return this.entries.get(id);
    }
    read(filter) {
        let list = Array.from(this.entries.values());
        if (!filter)
            return list;
        for (const [k, v] of Object.entries(filter)) {
            if (v !== undefined)
                list = list.filter((e) => e[k] === v);
        }
        return list;
    }
    /**
     * Human-readable snapshot of active entries (non-archived).
     * Injected into every agent prompt so agents share situational awareness.
     */
    snapshot() {
        const active = this.read().filter((e) => e.status !== 'archived');
        if (active.length === 0)
            return '(Blackboard is empty)';
        const grouped = {};
        for (const e of active) {
            (grouped[e.type] ??= []).push(e);
        }
        const sections = [];
        const order = ['blocker', 'task', 'decision', 'result', 'artifact'];
        for (const type of order) {
            const items = grouped[type];
            if (!items?.length)
                continue;
            sections.push(`### ${type.toUpperCase()}S\n` +
                items.map((e) => `- [${e.status}] **${e.title}**${e.assignee ? ` (→ ${e.assignee})` : ''}\n  ${e.content.slice(0, 200)}`).join('\n'));
        }
        return sections.join('\n\n');
    }
}
//# sourceMappingURL=blackboard.js.map