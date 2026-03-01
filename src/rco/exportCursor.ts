/**
 * RCO Hybrid Cursor Integration
 * Generates .cursor rules and MCP JSON from completed sessions.
 */

import fs from 'fs';
import path from 'path';
import type { RcoState } from './types.js';

export interface ExportCursorOptions {
  state: RcoState;
  outputDir?: string;
  /** If true, write to .cursor/rules/ and a dedicated MCP snippet file */
  writeToCursor?: boolean;
}

const DEFAULT_CURSOR_RULES = '.cursor/rules';
const DEFAULT_MCP_SNIPPET_DIR = '.cursor';

/**
 * Generate rule content from session (agents used, task, summary).
 */
function generateRuleContent(state: RcoState): string {
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
  const { state, outputDir = process.cwd(), writeToCursor = true } = options;
  const base = writeToCursor ? outputDir : path.join(outputDir, 'rco-export');
  const rulesDir = path.join(base, DEFAULT_CURSOR_RULES);
  const mcpDir = path.join(base, DEFAULT_MCP_SNIPPET_DIR);

  const ruleName = `rco-${state.sessionId}.mdc`;
  const rulePath = path.join(rulesDir, ruleName);
  const mcpPath = path.join(mcpDir, `rco-mcp-${state.sessionId}.json`);

  const ruleContent = generateRuleContent(state);
  const mcpSnippet = generateMcpSnippet(state);

  fs.mkdirSync(rulesDir, { recursive: true });
  fs.mkdirSync(mcpDir, { recursive: true });
  fs.writeFileSync(rulePath, ruleContent, 'utf-8');
  fs.writeFileSync(mcpPath, JSON.stringify(mcpSnippet, null, 2), 'utf-8');

  return { rulePath, mcpPath };
}
