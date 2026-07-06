/**
 * ## P1 Honesty & Consolidation
 *
 * CommandBlackboard — human-readable mission state for Roland orchestration.
 *
 * Evolves `.roland/memory.md` into a battlespace picture while
 * machine-readable tasks live in `.roland/blackboard.json` (coordination store).
 *
 * File: `.roland/command-blackboard.md`
 *
 * Sections:
 *   Mission Objectives   — current goal, success criteria, priority
 *   Key Decisions        — dated decisions with rationale (shared across agents)
 *   Active Tasks         — task id, callsign, status, depends-on
 *   Agent Status         — per-callsign state (idle | active | blocked | complete)
 *   Open Intel           — unknowns, research questions, blockers awaiting intel
 *   Artifacts            — branches, PRs, files, run IDs
 *   Agent Logs           — per-callsign mission logs (append-only subsections)
 *
 * Lifecycle mirrors ProjectMemory:
 *   1. Roland reads snapshot at mission start (smart recall by keyword overlap)
 *   2. Sub-agents append to their Agent Log on completion
 *   3. Roland merges Key Decisions + Active Tasks after each wave
 *   4. Synthesis archives completed missions to memory.md Proven Patterns
 */
import fs from 'fs';
import path from 'path';
import { acquireLock } from './stateLock.js';
import { writeUtf8File } from '../utils/safe-write.js';
export const COMMAND_BLACKBOARD_FILE = 'command-blackboard.md';
export const BLACKBOARD_SECTIONS = [
    'Mission Objectives',
    'Key Decisions',
    'Active Tasks',
    'Mission Graph',
    'Agent Status',
    'Open Intel',
    'Artifacts',
    'Agent Logs',
];
/** Callsign roster for Agent Status and Agent Logs subsections. */
export const UNSC_CALLSIGNS = [
    'Roland',
    'Sparrow',
    'Vanguard',
    'Oracle',
    'Sentinel',
    'Forge',
    'Specter',
];
const SECTION_ALIASES = {
    'mission objectives': 'Mission Objectives',
    'objectives': 'Mission Objectives',
    'mission': 'Mission Objectives',
    'key decisions': 'Key Decisions',
    'decisions': 'Key Decisions',
    'active tasks': 'Active Tasks',
    'tasks': 'Active Tasks',
    'mission graph': 'Mission Graph',
    'dag': 'Mission Graph',
    'graph': 'Mission Graph',
    'agent status': 'Agent Status',
    'status': 'Agent Status',
    'open intel': 'Open Intel',
    'intel': 'Open Intel',
    'unknowns': 'Open Intel',
    'artifacts': 'Artifacts',
    'agent logs': 'Agent Logs',
    'logs': 'Agent Logs',
};
/** Per-callsign log subsection headers inside Agent Logs. */
const AGENT_LOG_HEADER_RE = /^### (Roland|Sparrow|Vanguard|Oracle|Sentinel|Forge|Specter)$/m;
export class CommandBlackboard {
    filePath;
    /** Companion lock file — stateLock expects a .json path. */
    lockFilePath;
    constructor(stateDir = '.roland') {
        fs.mkdirSync(stateDir, { recursive: true });
        this.filePath = path.join(stateDir, COMMAND_BLACKBOARD_FILE);
        this.lockFilePath = path.join(stateDir, 'command-blackboard.lock.json');
        if (!fs.existsSync(this.filePath)) {
            const release = acquireLock(this.lockFilePath);
            try {
                if (!fs.existsSync(this.filePath)) {
                    writeUtf8File(this.filePath, buildEmptyTemplate());
                }
            }
            finally {
                release();
            }
        }
    }
    withLock(fn) {
        const release = acquireLock(this.lockFilePath);
        try {
            return fn();
        }
        finally {
            release();
        }
    }
    readContent() {
        return this.withLock(() => fs.readFileSync(this.filePath, 'utf-8'));
    }
    writeContent(content) {
        this.withLock(() => {
            writeUtf8File(this.filePath, content);
        });
    }
    /** Full markdown snapshot for prompt injection. */
    snapshot(maxChars = 4_000) {
        const raw = this.readContent();
        if (raw.length <= maxChars)
            return raw;
        return raw.slice(0, maxChars) + '\n\n…(truncated — full board at `.roland/command-blackboard.md`)';
    }
    /** Keyword-scored excerpt for planning prompts (mirrors ProjectMemory.smartSnapshot). */
    smartSnapshot(goal, maxChars = 3_000) {
        const sections = parseSections(this.readContent());
        const tokens = tokenize(goal);
        const scored = [];
        for (const [section, bullets] of Object.entries(sections)) {
            if (section === 'Agent Logs')
                continue; // logs are rarely planning-relevant
            bullets.forEach((bullet, idx) => {
                const score = scoreBulletForRecall(bullet, section, tokens, idx);
                if (score < -100)
                    return; // filtered stale entries
                scored.push({ section: section, bullet, score });
            });
        }
        scored.sort((a, b) => b.score - a.score);
        const lines = ['## Command Blackboard (smart recall)\n'];
        let chars = lines.join('').length;
        const seen = new Set();
        for (const { section, bullet } of scored) {
            if (bullet.trim().length < 3)
                continue;
            const block = seen.has(section) ? `- ${bullet}\n` : `\n### ${section}\n- ${bullet}\n`;
            if (chars + block.length > maxChars)
                break;
            seen.add(section);
            lines.push(block);
            chars += block.length;
        }
        if (lines.length <= 1)
            return this.snapshot(maxChars);
        return lines.join('');
    }
    /** Replace section bullets in one write (used by board cleanup). */
    replaceSections(sections) {
        this.withLock(() => {
            const current = parseSections(fs.readFileSync(this.filePath, 'utf-8'));
            writeUtf8File(this.filePath, renderSections({ ...current, ...sections }));
        });
    }
    /** Read parsed sections for programmatic cleanup. */
    readSections() {
        return parseSections(this.readContent());
    }
    /** Append a bullet to any section. */
    appendBullet(section, bullet) {
        this.withLock(() => {
            const content = fs.readFileSync(this.filePath, 'utf-8');
            const sections = parseSections(content);
            const list = sections[section] ?? [];
            const normalized = bullet.trim();
            if (list.some((b) => b.slice(0, 50) === normalized.slice(0, 50)))
                return;
            list.push(normalized);
            writeUtf8File(this.filePath, renderSections(sections));
        });
    }
    /** Append timestamped entry to a callsign's Agent Log subsection. */
    appendAgentLog(callsign, entry) {
        const ts = new Date().toISOString();
        const line = `[${ts}] ${entry.trim()}`;
        const logHeader = `### ${callsign}`;
        const content = this.readContent();
        const logsIdx = content.indexOf('## Agent Logs');
        if (logsIdx === -1) {
            this.appendBullet('Agent Logs', `${logHeader}\n- ${line}`);
            return;
        }
        this.withLock(() => {
            const lockedContent = fs.readFileSync(this.filePath, 'utf-8');
            const lockedLogsIdx = lockedContent.indexOf('## Agent Logs');
            if (lockedLogsIdx === -1)
                return;
            const beforeLogs = lockedContent.slice(0, lockedLogsIdx);
            let logsBody = lockedContent.slice(lockedLogsIdx);
            const headerPos = logsBody.indexOf(logHeader);
            if (headerPos === -1) {
                logsBody += `\n${logHeader}\n- ${line}\n`;
            }
            else {
                const afterHeader = logsBody.slice(headerPos + logHeader.length);
                const nextSection = afterHeader.search(/\n### /);
                const insertAt = nextSection === -1
                    ? logsBody.length
                    : headerPos + logHeader.length + nextSection;
                logsBody =
                    logsBody.slice(0, insertAt).trimEnd() +
                        `\n- ${line}\n` +
                        (nextSection === -1 ? '' : logsBody.slice(insertAt));
            }
            writeUtf8File(this.filePath, beforeLogs + logsBody);
        });
    }
    /** Replace Mission Graph section with current DAG summary (single bullet). */
    setMissionGraph(summary) {
        this.withLock(() => {
            const content = fs.readFileSync(this.filePath, 'utf-8');
            const sections = parseSections(content);
            sections['Mission Graph'] = summary.trim() ? [summary.trim()] : ['_(no active graph)_'];
            writeUtf8File(this.filePath, renderSections(sections));
        });
    }
    /** Update Agent Status table row for a callsign. */
    setAgentStatus(entry) {
        const ts = new Date(entry.lastUpdated).toISOString();
        const task = entry.currentTaskId ? ` task:${entry.currentTaskId}` : '';
        const note = entry.note ? ` — ${entry.note}` : '';
        const bullet = `**${entry.callsign}**: ${entry.state}${task} (updated ${ts})${note}`;
        this.withLock(() => {
            const content = fs.readFileSync(this.filePath, 'utf-8');
            const sections = parseSections(content);
            const status = sections['Agent Status'] ?? [];
            const idx = status.findIndex((b) => b.includes(`**${entry.callsign}**`));
            if (idx >= 0)
                status[idx] = bullet;
            else
                status.push(bullet);
            sections['Agent Status'] = status;
            writeUtf8File(this.filePath, renderSections(sections));
        });
    }
    /** Parse ## Memory Extract block from synthesis output (Roland PM phase). */
    extractAndMerge(extractBlock) {
        const sections = parseExtractBlock(extractBlock);
        let added = 0;
        for (const section of BLACKBOARD_SECTIONS) {
            const bullets = sections[section];
            if (!bullets)
                continue;
            for (const b of bullets) {
                const before = parseSections(fs.readFileSync(this.filePath, 'utf-8'))[section]?.length ?? 0;
                this.appendBullet(section, b);
                const after = parseSections(fs.readFileSync(this.filePath, 'utf-8'))[section]?.length ?? 0;
                if (after > before)
                    added++;
            }
        }
        return added;
    }
}
// ── Template ──────────────────────────────────────────────────────────────────
export function buildEmptyTemplate() {
    const agentStatus = UNSC_CALLSIGNS.map((c) => `- **${c}**: idle`).join('\n');
    const agentLogs = UNSC_CALLSIGNS.map((c) => `### ${c}\n- _(no entries)_`).join('\n\n');
    return `# UNSC Command Blackboard

> Maintained by Roland. Human-readable battlespace picture.
> Machine-readable tasks remain in \`.roland/blackboard.json\`.

## Mission Objectives

- _(no active mission)_

## Key Decisions

- _(none)_

## Active Tasks

- _(none)_

## Mission Graph

- _(no active graph)_

## Agent Status

${agentStatus}

## Open Intel

- _(none)_

## Artifacts

- _(none)_

## Agent Logs

${agentLogs}
`;
}
// ── Parsing helpers ───────────────────────────────────────────────────────────
function parseSections(content) {
    const result = {};
    const parts = content.split(/^## /m).slice(1);
    for (const part of parts) {
        const nl = part.indexOf('\n');
        if (nl === -1)
            continue;
        const rawHeader = part.slice(0, nl).trim();
        const key = SECTION_ALIASES[rawHeader.toLowerCase()] ?? rawHeader;
        if (!BLACKBOARD_SECTIONS.includes(key))
            continue;
        const body = part.slice(nl + 1);
        if (key === 'Agent Logs') {
            result[key] = [body.trim()];
        }
        else {
            result[key] = body
                .split('\n')
                .map((l) => l.replace(/^-\s*/, '').trim())
                .filter((l) => l.length > 0 && !l.startsWith('_('));
        }
    }
    return result;
}
function renderSections(sections) {
    const blocks = ['# UNSC Command Blackboard\n'];
    for (const section of BLACKBOARD_SECTIONS) {
        blocks.push(`## ${section}\n`);
        const items = sections[section];
        if (section === 'Agent Logs') {
            blocks.push((items?.[0] ?? '_(no entries)_') + '\n');
        }
        else if (!items?.length) {
            blocks.push('- _(none)_\n');
        }
        else {
            blocks.push(items.map((b) => `- ${b}`).join('\n') + '\n');
        }
    }
    return blocks.join('\n');
}
function parseExtractBlock(text) {
    const match = text.match(/## Command Blackboard Update([\s\S]*?)(?:##|$)/i);
    if (!match)
        return {};
    const result = {};
    const lines = match[1].split('\n');
    let current = null;
    for (const line of lines) {
        const header = line.match(/^\*\*(.+?):\*\*$/);
        if (header) {
            const key = SECTION_ALIASES[header[1].trim().toLowerCase()];
            current = key ?? null;
            if (current)
                result[current] = result[current] ?? [];
            continue;
        }
        const bullet = line.match(/^-\s+(.+)/);
        if (bullet && current) {
            result[current].push(bullet[1].trim());
        }
    }
    return result;
}
function tokenize(text) {
    return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2));
}
function tokenOverlap(a, b) {
    let n = 0;
    for (const t of a)
        if (b.has(t))
            n++;
    return n;
}
const STALE_TASK_RE = /\[(done|complete|cancelled|archived)\]/i;
const STALE_PENDING_RE = /\[(pending)\]/i;
const CLEARED_INTEL_RE = /\[(blocker\s+)?cleared\]|deferred\s+—|fixed in task-/i;
function isGoalRelevant(text, goalTokens) {
    if (goalTokens.size === 0)
        return false;
    return tokenOverlap(goalTokens, tokenize(text)) >= 2;
}
/** Score a bullet for smart recall; return -999 to exclude stale noise. */
function scoreBulletForRecall(bullet, section, goalTokens, index) {
    const b = bullet.trim();
    if (!b || b.startsWith('_('))
        return -999;
    let score = tokenOverlap(goalTokens, tokenize(b)) + index * 0.01;
    if (section === 'Active Tasks') {
        if (STALE_TASK_RE.test(b))
            return -999;
        if (STALE_PENDING_RE.test(b) && !isGoalRelevant(b, goalTokens))
            return -999;
        if (/\[in_progress\]/i.test(b))
            score += 2;
    }
    if (section === 'Mission Objectives') {
        if (/\[(complete|cancelled|archived)\]/i.test(b))
            return -999;
        if (/\[(P[1-4]\s+)?active\]/i.test(b))
            score += 3;
        else if (!isGoalRelevant(b, goalTokens))
            score -= 2;
    }
    if (section === 'Open Intel') {
        if (CLEARED_INTEL_RE.test(b))
            return -999;
        if (/\[BLOCKER\]/i.test(b) && !/\bcleared\b/i.test(b))
            score += 4;
    }
    if (section === 'Agent Status') {
        if (/\b(idle|complete)\b/i.test(b))
            return -999;
        if (/\b(active|blocked)\b/i.test(b))
            score += 1;
    }
    return score;
}
export { AGENT_LOG_HEADER_RE, isGoalRelevant, tokenize, tokenOverlap };
//# sourceMappingURL=command-blackboard.js.map