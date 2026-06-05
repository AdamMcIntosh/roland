/**
 * Export RCO session state to Cursor rules + MCP JSON artifacts.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { RcoState } from './types.js';

export interface ExportCursorOptions {
  state: RcoState;
  outputDir?: string;
  /** When true, also writes into ~/.cursor/rules (best effort). */
  writeToCursor?: boolean;
  /** When true, append triage hints derived from session outputs. */
  dynamicRules?: boolean;
}

function suggestedAgents(state: RcoState): string[] {
  const fromOutputs = Object.keys(state.outputs);
  const fromLogs = state.agentLogs.map((l) => l.agent);
  const merged = [...new Set([...fromOutputs, ...fromLogs])];
  return merged.length > 0 ? merged : ['Planner'];
}

function buildDynamicHints(state: RcoState): string {
  const blob = `${state.task} ${Object.values(state.outputs).join(' ')}`.toLowerCase();
  const hints: string[] = ['## Dynamic hints'];
  if (/bug|fix|regression|broken/.test(blob)) hints.push('- Consider the BugFix recipe for follow-up work.');
  if (/security|audit|vuln/.test(blob)) hints.push('- Consider SecurityAudit for deeper review.');
  if (/refactor|cleanup|debt/.test(blob)) hints.push('- Consider Refactor for structural cleanup.');
  return hints.length > 1 ? `${hints.join('\n')}\n` : '';
}

export function exportCursor(opts: ExportCursorOptions): { rulePath: string; mcpPath: string } {
  const { state, outputDir = '.roland', writeToCursor = false, dynamicRules = false } = opts;
  fs.mkdirSync(outputDir, { recursive: true });

  const baseName = `rco-export-${state.sessionId}`;
  const rulePath = path.join(outputDir, `${baseName}.mdc`);
  const mcpPath = path.join(outputDir, `${baseName}.mcp.json`);

  const agents = suggestedAgents(state);
  let ruleContent = [
    `# RCO Session ${state.sessionId}`,
    '',
    `Task: ${state.task}`,
    `Recipe: ${state.recipe}`,
    `Step: ${state.currentStep}`,
    '',
    'Suggested agents from this session:',
    ...agents.map((a) => `- ${a}`),
    '',
  ].join('\n');

  if (dynamicRules) {
    const hints = buildDynamicHints(state);
    if (hints) ruleContent += `\n${hints}`;
  }

  fs.writeFileSync(rulePath, ruleContent, 'utf-8');
  fs.writeFileSync(
    mcpPath,
    JSON.stringify(
      {
        rco_session: state.sessionId,
        task: state.task,
        recipe: state.recipe,
        suggested_agents: agents,
      },
      null,
      2,
    ),
    'utf-8',
  );

  if (writeToCursor) {
    try {
      const cursorRulesDir = path.join(os.homedir(), '.cursor', 'rules');
      fs.mkdirSync(cursorRulesDir, { recursive: true });
      fs.copyFileSync(rulePath, path.join(cursorRulesDir, path.basename(rulePath)));
    } catch {
      // best effort only
    }
  }

  return { rulePath, mcpPath };
}
