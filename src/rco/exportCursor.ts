/**
 * RCO Hybrid Cursor Integration
 * Generates .cursor rules and MCP JSON from completed sessions.
 * Phase 2: dynamic rules from agent results (e.g. auto-triage suggestions).
 */

import fs from 'fs';
import path from 'path';
import type { RcoState } from './types.js';

export interface ExportCursorOptions {
  state: RcoState;
  outputDir?: string;
  /** If true, write to .cursor/rules/ and a dedicated MCP snippet file */
  writeToCursor?: boolean;
  /** If true, add dynamic triage/agent hints from session outputs */
  dynamicRules?: boolean;
}

const DEFAULT_CURSOR_RULES = '.cursor/rules';
const DEFAULT_MCP_SNIPPET_DIR = '.cursor';

/**
 * Derive triage/agent hints from session outputs (e.g. last agent suggests next step).
 */
function deriveTriageFromOutputs(state: RcoState): string[] {
  const hints: string[] = [];
  const agents = [...new Set(state.agentLogs.map((l) => l.agent))];
  const lastOutput = state.agentLogs.length > 0
    ? state.outputs[state.agentLogs[state.agentLogs.length - 1].agent]
    : undefined;
  if (typeof lastOutput === 'string' && lastOutput.length > 0) {
    if (lastOutput.toLowerCase().includes('bug') || lastOutput.toLowerCase().includes('fix')) {
      hints.push('Consider triage: BugFix recipe or @build-fixer for follow-up.');
    }
    if (lastOutput.toLowerCase().includes('security') || lastOutput.toLowerCase().includes('audit')) {
      hints.push('Consider triage: SecurityAudit or @security-reviewer.');
    }
    if (lastOutput.toLowerCase().includes('refactor') || lastOutput.toLowerCase().includes('plan')) {
      hints.push('Consider triage: PlanExecRevEx or @architect for next steps.');
    }
  }
  hints.push(`Agents used this session: ${agents.join(', ')}.`);
  return hints;
}

/**
 * Generate rule content from session (agents used, task, summary).
 * If dynamicRules: add auto-triage suggestions from agent outputs.
 */
function generateRuleContent(state: RcoState, dynamicRules?: boolean): string {
  const agents = [...new Set(state.agentLogs.map((l) => l.agent))];
  const lines = [
    `# RCO Session Export: ${state.sessionId}`,
    `# Recipe: ${state.recipe} | Task: ${state.task}`,
    '',
    '## Agents used',
    ...agents.map((a) => `- ${a}`),
    '',
    '## Session summary',
    `Started: ${new Date(state.startedAt).toISOString()}`,
    `Steps: ${state.currentStep + 1}, Loops: ${state.loopCount}`,
    '',
    '## Outputs (by agent)',
    ...Object.entries(state.outputs).map(([agent, out]) => `### ${agent}\n${String(out).slice(0, 500)}${String(out).length > 500 ? '...' : ''}`),
  ];
  if (dynamicRules) {
    const triageHints = deriveTriageFromOutputs(state);
    if (triageHints.length > 0) {
      lines.push('', '## Dynamic hints (from agent results)', ...triageHints.map((h) => `- ${h}`));
    }
  }
  return lines.join('\n');
}

/**
 * Generate MCP JSON snippet for this session (tools/agents to suggest).
 */
function generateMcpSnippet(state: RcoState): Record<string, unknown> {
  const agents = [...new Set(state.agentLogs.map((l) => l.agent))];
  return {
    rco_session: state.sessionId,
    recipe: state.recipe,
    task: state.task,
    suggested_agents: agents,
    exported_at: new Date().toISOString(),
  };
}

/**
 * Write .cursor rule file and MCP JSON from completed session.
 */
export function exportCursor(options: ExportCursorOptions): { rulePath: string; mcpPath: string } {
  const { state, outputDir = process.cwd(), writeToCursor = true, dynamicRules = true } = options;
  const base = writeToCursor ? outputDir : path.join(outputDir, 'rco-export');
  const rulesDir = path.join(base, DEFAULT_CURSOR_RULES);
  const mcpDir = path.join(base, DEFAULT_MCP_SNIPPET_DIR);

  const ruleName = `rco-${state.sessionId}.mdc`;
  const rulePath = path.join(rulesDir, ruleName);
  const mcpPath = path.join(mcpDir, `rco-mcp-${state.sessionId}.json`);

  const ruleContent = generateRuleContent(state, dynamicRules);
  const mcpSnippet = generateMcpSnippet(state);

  fs.mkdirSync(rulesDir, { recursive: true });
  fs.mkdirSync(mcpDir, { recursive: true });
  fs.writeFileSync(rulePath, ruleContent, 'utf-8');
  fs.writeFileSync(mcpPath, JSON.stringify(mcpSnippet, null, 2), 'utf-8');

  return { rulePath, mcpPath };
}
