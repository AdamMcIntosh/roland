/**
 * CommandBlackboard — UNSC-style structured mission state for Roland orchestration.
 *
 * Evolves `.roland/memory.md` into a human-readable battlespace picture while
 * preserving machine-readable `blackboard.json` for the PM team orchestrator.
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

export const COMMAND_BLACKBOARD_FILE = 'command-blackboard.md';

export const BLACKBOARD_SECTIONS = [
  'Mission Objectives',
  'Key Decisions',
  'Active Tasks',
  'Agent Status',
  'Open Intel',
  'Artifacts',
  'Agent Logs',
] as const;

export type BlackboardSection = (typeof BLACKBOARD_SECTIONS)[number];

/** Callsign roster for Agent Status and Agent Logs subsections. */
export const UNSC_CALLSIGNS = [
  'Roland',
  'Sparrow',
  'Vanguard',
  'Oracle',
  'Sentinel',
  'Forge',
  'Specter',
] as const;

export type Callsign = (typeof UNSC_CALLSIGNS)[number];

export type AgentState = 'idle' | 'active' | 'blocked' | 'complete';

export interface MissionObjective {
  id: string;
  title: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  successCriteria: string[];
  status: 'active' | 'complete' | 'cancelled';
}

export interface ActiveTaskEntry {
  id: string;
  callsign: Callsign;
  title: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'done';
  dependsOn: string[];
  priority: 'P1' | 'P2' | 'P3' | 'P4';
}

export interface AgentStatusEntry {
  callsign: Callsign;
  state: AgentState;
  currentTaskId?: string;
  lastUpdated: number;
  note?: string;
}

const SECTION_ALIASES: Record<string, BlackboardSection> = {
  'mission objectives': 'Mission Objectives',
  'objectives': 'Mission Objectives',
  'mission': 'Mission Objectives',
  'key decisions': 'Key Decisions',
  'decisions': 'Key Decisions',
  'active tasks': 'Active Tasks',
  'tasks': 'Active Tasks',
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
  private readonly filePath: string;

  constructor(stateDir: string = '.roland') {
    fs.mkdirSync(stateDir, { recursive: true });
    this.filePath = path.join(stateDir, COMMAND_BLACKBOARD_FILE);
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, buildEmptyTemplate(), 'utf-8');
    }
  }

  /** Full markdown snapshot for prompt injection. */
  snapshot(maxChars = 4_000): string {
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    if (raw.length <= maxChars) return raw;
    return raw.slice(0, maxChars) + '\n\n…(truncated — full board at `.roland/command-blackboard.md`)';
  }

  /** Keyword-scored excerpt for planning prompts (mirrors ProjectMemory.smartSnapshot). */
  smartSnapshot(goal: string, maxChars = 3_000): string {
    const sections = parseSections(fs.readFileSync(this.filePath, 'utf-8'));
    const tokens = tokenize(goal);
    const scored: Array<{ section: BlackboardSection; bullet: string; score: number }> = [];

    for (const [section, bullets] of Object.entries(sections)) {
      if (section === 'Agent Logs') continue; // logs are rarely planning-relevant
      bullets.forEach((bullet, idx) => {
        const score = scoreBulletForRecall(bullet, section as BlackboardSection, tokens, idx);
        if (score < -100) return; // filtered stale entries
        scored.push({ section: section as BlackboardSection, bullet, score });
      });
    }

    scored.sort((a, b) => b.score - a.score);
    const lines: string[] = ['## Command Blackboard (smart recall)\n'];
    let chars = lines.join('').length;
    const seen = new Set<BlackboardSection>();

    for (const { section, bullet } of scored) {
      if (bullet.trim().length < 3) continue;
      const block = seen.has(section) ? `- ${bullet}\n` : `\n### ${section}\n- ${bullet}\n`;
      if (chars + block.length > maxChars) break;
      seen.add(section);
      lines.push(block);
      chars += block.length;
    }

    if (lines.length <= 1) return this.snapshot(maxChars);
    return lines.join('');
  }

  /** Replace section bullets in one write (used by board cleanup). */
  replaceSections(sections: Partial<Record<BlackboardSection, string[]>>): void {
    const current = parseSections(fs.readFileSync(this.filePath, 'utf-8'));
    fs.writeFileSync(this.filePath, renderSections({ ...current, ...sections }), 'utf-8');
  }

  /** Read parsed sections for programmatic cleanup. */
  readSections(): Partial<Record<BlackboardSection, string[]>> {
    return parseSections(fs.readFileSync(this.filePath, 'utf-8'));
  }

  /** Append a bullet to any section. */
  appendBullet(section: BlackboardSection, bullet: string): void {
    const content = fs.readFileSync(this.filePath, 'utf-8');
    const sections = parseSections(content);
    const list = sections[section] ?? [];
    const normalized = bullet.trim();
    if (list.some((b) => b.slice(0, 50) === normalized.slice(0, 50))) return;
    list.push(normalized);
    fs.writeFileSync(this.filePath, renderSections(sections), 'utf-8');
  }

  /** Append timestamped entry to a callsign's Agent Log subsection. */
  appendAgentLog(callsign: Callsign, entry: string): void {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${entry.trim()}`;
    const content = fs.readFileSync(this.filePath, 'utf-8');
    const logHeader = `### ${callsign}`;
    const logsIdx = content.indexOf('## Agent Logs');

    if (logsIdx === -1) {
      this.appendBullet('Agent Logs', `${logHeader}\n- ${line}`);
      return;
    }

    const beforeLogs = content.slice(0, logsIdx);
    let logsBody = content.slice(logsIdx);
    const headerPos = logsBody.indexOf(logHeader);

    if (headerPos === -1) {
      logsBody += `\n${logHeader}\n- ${line}\n`;
    } else {
      const afterHeader = logsBody.slice(headerPos + logHeader.length);
      const nextSection = afterHeader.search(/\n### /);
      const insertAt =
        nextSection === -1
          ? logsBody.length
          : headerPos + logHeader.length + nextSection;
      logsBody =
        logsBody.slice(0, insertAt).trimEnd() +
        `\n- ${line}\n` +
        (nextSection === -1 ? '' : logsBody.slice(insertAt));
    }

    fs.writeFileSync(this.filePath, beforeLogs + logsBody, 'utf-8');
  }

  /** Update Agent Status table row for a callsign. */
  setAgentStatus(entry: AgentStatusEntry): void {
    const ts = new Date(entry.lastUpdated).toISOString();
    const task = entry.currentTaskId ? ` task:${entry.currentTaskId}` : '';
    const note = entry.note ? ` — ${entry.note}` : '';
    const bullet = `**${entry.callsign}**: ${entry.state}${task} (updated ${ts})${note}`;

    const content = fs.readFileSync(this.filePath, 'utf-8');
    const sections = parseSections(content);
    const status = sections['Agent Status'] ?? [];
    const idx = status.findIndex((b) => b.includes(`**${entry.callsign}**`));
    if (idx >= 0) status[idx] = bullet;
    else status.push(bullet);
    sections['Agent Status'] = status;
    fs.writeFileSync(this.filePath, renderSections(sections), 'utf-8');
  }

  /** Parse ## Memory Extract block from synthesis output (Roland PM phase). */
  extractAndMerge(extractBlock: string): number {
    const sections = parseExtractBlock(extractBlock);
    let added = 0;
    for (const section of BLACKBOARD_SECTIONS) {
      const bullets = sections[section];
      if (!bullets) continue;
      for (const b of bullets) {
        const before = parseSections(fs.readFileSync(this.filePath, 'utf-8'))[section]?.length ?? 0;
        this.appendBullet(section, b);
        const after = parseSections(fs.readFileSync(this.filePath, 'utf-8'))[section]?.length ?? 0;
        if (after > before) added++;
      }
    }
    return added;
  }
}

// ── Template ──────────────────────────────────────────────────────────────────

export function buildEmptyTemplate(): string {
  const agentStatus = UNSC_CALLSIGNS.map(
    (c) => `- **${c}**: idle`,
  ).join('\n');
  const agentLogs = UNSC_CALLSIGNS.map(
    (c) => `### ${c}\n- _(no entries)_`,
  ).join('\n\n');

  return `# UNSC Command Blackboard

> Maintained by Roland. Human-readable battlespace picture.
> Machine-readable tasks remain in \`.roland/blackboard.json\`.

## Mission Objectives

- _(no active mission)_

## Key Decisions

- _(none)_

## Active Tasks

- _(none)_

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

function parseSections(content: string): Partial<Record<BlackboardSection, string[]>> {
  const result: Partial<Record<BlackboardSection, string[]>> = {};
  const parts = content.split(/^## /m).slice(1);

  for (const part of parts) {
    const nl = part.indexOf('\n');
    if (nl === -1) continue;
    const rawHeader = part.slice(0, nl).trim();
    const key = SECTION_ALIASES[rawHeader.toLowerCase()] ?? (rawHeader as BlackboardSection);
    if (!BLACKBOARD_SECTIONS.includes(key as BlackboardSection)) continue;

    const body = part.slice(nl + 1);
    if (key === 'Agent Logs') {
      result[key] = [body.trim()];
    } else {
      result[key] = body
        .split('\n')
        .map((l) => l.replace(/^-\s*/, '').trim())
        .filter((l) => l.length > 0 && !l.startsWith('_('));
    }
  }

  return result;
}

function renderSections(sections: Partial<Record<BlackboardSection, string[]>>): string {
  const blocks: string[] = ['# UNSC Command Blackboard\n'];

  for (const section of BLACKBOARD_SECTIONS) {
    blocks.push(`## ${section}\n`);
    const items = sections[section];
    if (section === 'Agent Logs') {
      blocks.push((items?.[0] ?? '_(no entries)_') + '\n');
    } else if (!items?.length) {
      blocks.push('- _(none)_\n');
    } else {
      blocks.push(items.map((b) => `- ${b}`).join('\n') + '\n');
    }
  }

  return blocks.join('\n');
}

function parseExtractBlock(text: string): Partial<Record<BlackboardSection, string[]>> {
  const match = text.match(/## Command Blackboard Update([\s\S]*?)(?:##|$)/i);
  if (!match) return {};
  const result: Partial<Record<BlackboardSection, string[]>> = {};
  const lines = match[1].split('\n');
  let current: BlackboardSection | null = null;

  for (const line of lines) {
    const header = line.match(/^\*\*(.+?):\*\*$/);
    if (header) {
      const key = SECTION_ALIASES[header[1].trim().toLowerCase()];
      current = key ?? null;
      if (current) result[current] = result[current] ?? [];
      continue;
    }
    const bullet = line.match(/^-\s+(.+)/);
    if (bullet && current) {
      result[current]!.push(bullet[1].trim());
    }
  }

  return result;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2),
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

const STALE_TASK_RE = /\[(done|complete|cancelled|archived)\]/i;
const STALE_PENDING_RE = /\[(pending)\]/i;
const CLEARED_INTEL_RE = /\[(blocker\s+)?cleared\]|deferred\s+—|fixed in task-/i;

function isGoalRelevant(text: string, goalTokens: Set<string>): boolean {
  if (goalTokens.size === 0) return false;
  return tokenOverlap(goalTokens, tokenize(text)) >= 2;
}

/** Score a bullet for smart recall; return -999 to exclude stale noise. */
function scoreBulletForRecall(
  bullet: string,
  section: BlackboardSection,
  goalTokens: Set<string>,
  index: number,
): number {
  const b = bullet.trim();
  if (!b || b.startsWith('_(')) return -999;

  let score = tokenOverlap(goalTokens, tokenize(b)) + index * 0.01;

  if (section === 'Active Tasks') {
    if (STALE_TASK_RE.test(b)) return -999;
    if (STALE_PENDING_RE.test(b) && !isGoalRelevant(b, goalTokens)) return -999;
    if (/\[in_progress\]/i.test(b)) score += 2;
  }

  if (section === 'Mission Objectives') {
    if (/\[(complete|cancelled|archived)\]/i.test(b)) return -999;
    if (/\[(P[1-4]\s+)?active\]/i.test(b)) score += 3;
    else if (!isGoalRelevant(b, goalTokens)) score -= 2;
  }

  if (section === 'Open Intel') {
    if (CLEARED_INTEL_RE.test(b)) return -999;
    if (/\[BLOCKER\]/i.test(b) && !/\bcleared\b/i.test(b)) score += 4;
  }

  if (section === 'Agent Status') {
    if (/\b(idle|complete)\b/i.test(b)) return -999;
    if (/\b(active|blocked)\b/i.test(b)) score += 1;
  }

  return score;
}

export { AGENT_LOG_HEADER_RE, isGoalRelevant, tokenize, tokenOverlap };
