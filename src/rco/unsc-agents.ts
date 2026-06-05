/**
 * UNSC sub-agent loader — maps agents/unsc/*.yaml to Cursor SDK AgentDefinition records.
 *
 * Used by team-orchestrator and standalone SDK orchestration scripts to register
 * inline sub-agents on Agent.create({ agents: { ... } }).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { toCursorModelId } from './model-routing.js';
import type { AgentYaml } from './types.js';
import { AgentYamlSchema } from './types.js';

/** Cursor SDK AgentDefinition shape (subset we populate). */
export interface SdkAgentDefinition {
  description: string;
  prompt: string;
  model?: 'inherit' | { id: string };
}

export interface UnscAgentYaml extends AgentYaml {
  callsign?: string;
  designation?: string;
  spawn_when?: string;
  legacy_aliases?: string[];
}

const UNSC_DIR = 'unsc';

/**
 * Resolve agents/unsc/ relative to install dir or project root.
 */
export function resolveUnscAgentsDir(referenceUrl?: string): string {
  try {
    const ref = referenceUrl ?? import.meta.url;
    const refDir = path.dirname(fileURLToPath(ref));
    const installDir = path.resolve(refDir, '..');
    const rootDir = path.resolve(installDir, '..');
    const candidates = [
      path.join(installDir, 'agents', UNSC_DIR),
      path.join(rootDir, 'agents', UNSC_DIR),
      path.join(process.cwd(), 'agents', UNSC_DIR),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  } catch { /* fall through */ }
  return path.join(process.cwd(), 'agents', UNSC_DIR);
}

/** Load all UNSC agent YAML files. */
export function loadUnscAgents(agentsDir?: string): Map<string, UnscAgentYaml> {
  const dir = agentsDir ?? resolveUnscAgentsDir();
  const map = new Map<string, UnscAgentYaml>();
  if (!fs.existsSync(dir)) return map;

  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.yaml') || x.endsWith('.yml'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
    const doc = yaml.load(raw) as Record<string, unknown>;
    const parsed = AgentYamlSchema.safeParse(doc);
    if (!parsed.success) continue;
    map.set(parsed.data.name ?? f.replace(/\.ya?ml$/, ''), parsed.data as UnscAgentYaml);
  }
  return map;
}

/** Build SDK `agents` map keyed by callsign slug (lowercase). */
export function toSdkAgentDefinitions(
  unscAgents: Map<string, UnscAgentYaml>,
): Record<string, SdkAgentDefinition> {
  const out: Record<string, SdkAgentDefinition> = {};

  for (const [, agent] of unscAgents) {
    const key = (agent.name ?? 'unknown').toLowerCase();
    const spawnWhen = agent.spawn_when ?? '';
    const designation = agent.designation ?? agent.name ?? key;
    const rolePrompt = agent.role_prompt ?? '';

    out[key] = {
      description: spawnWhen.trim() || `${designation} — delegate when task matches specialty.`,
      prompt: [
        `# ${agent.callsign ?? agent.name}`,
        '',
        rolePrompt.trim(),
        '',
        '## Command Discipline',
        '- Read Mission Objectives and Key Decisions on the Command Blackboard before acting.',
        '- On completion, append a summary to your Agent Log section.',
        '- Emit BLOCKER if you cannot proceed without Roland or operator decision.',
        '',
        '## Handoff Protocol',
        '- **Task complete:** Use your callsign completion report format. List files changed and verification steps.',
        '- **Request intel:** `## 📨 MESSAGE TO Oracle` with specific questions and file paths to inspect.',
        '- **Hand off implementation:** `## 📨 MESSAGE TO Sparrow` with concrete acceptance criteria and target files.',
        '- **Hand off tests:** `## 📨 MESSAGE TO Vanguard` after Sparrow completes — include wired path to exercise.',
        '- **Request review:** `## 📨 MESSAGE TO Sentinel` with diff scope before merge.',
        '- **Escalation chain:** callsign → Roland (Lead PM) → operator (scope, priority, irreversible actions).',
        '- **BLOCKER format:** `## 🚨 BLOCKER` with Description, Needs from (roland | callsign | operator), Impact.',
      ].join('\n'),
      model: agent.claude_model
        ? { id: toCursorModelId(agent.claude_model, agent.name ?? key) }
        : 'inherit',
    };
  }

  return out;
}

/** Map legacy roster agent names → UNSC callsign for PM team compatibility. */
export function legacyAgentToCallsign(agentName: string): string {
  const lower = agentName.toLowerCase();
  const aliases: Record<string, string> = {
    executor: 'sparrow',
    'test-author': 'vanguard',
    'test-executor': 'vanguard',
    researcher: 'oracle',
    explore: 'oracle',
    analyst: 'oracle',
    'code-reviewer': 'sentinel',
    'security-reviewer': 'sentinel',
    critic: 'sentinel',
    'build-fixer': 'forge',
    'devops-agent': 'forge',
    designer: 'specter',
    'ui-designer': 'specter',
    'accessibility-auditor': 'specter',
    architect: 'oracle',
    planner: 'oracle',
  };
  return aliases[lower] ?? lower;
}
