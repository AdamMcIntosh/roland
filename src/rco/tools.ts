/**
 * RCO tool stubs and dependency-mapper skill
 */

import type { RcoState } from './types.js';

/** Stub: logs search query and returns mock result */
export function stubSearch(query: string): string {
  console.error(`[RCO tool] search("${query}")`);
  return `[mock search result for: ${query}]`;
}

/** Stub: logs code action */
export function stubCode(action: string, path?: string): string {
  console.error(`[RCO tool] code(${action}, ${path ?? 'N/A'})`);
  return `[mock code ${action}${path ? ` @ ${path}` : ''}]`;
}

/** Stub: logs terminal command */
export function stubTerminal(cmd: string): string {
  console.error(`[RCO tool] terminal("${cmd}")`);
  return `[mock terminal: ${cmd}]`;
}

/**
 * Original RCO skill: generates a DOT graph string for agent handoffs.
 * Used for visualizing workflow and dependencies between agents.
 */
export function dependencyMapper(state: RcoState, recipeSteps: Array<{ agent: string; output_to?: string }>): string {
  const lines: string[] = ['digraph RCO_handoffs {', '  rankdir=LR;', '  node [shape=box];'];
  const seen = new Set<string>();
  for (const step of recipeSteps) {
    const from = step.agent.replace(/\s+/g, '_');
    if (!seen.has(from)) {
      lines.push(`  "${from}" [label="${step.agent}"];`);
      seen.add(from);
    }
    if (step.output_to) {
      const to = step.output_to.replace(/\s+/g, '_');
      if (!seen.has(to)) {
        lines.push(`  "${to}" [label="${step.output_to}"];`);
        seen.add(to);
      }
      lines.push(`  "${from}" -> "${to}";`);
    }
  }
  // Add session/state node
  lines.push('  "state" [shape=ellipse, label="state"];');
  if (recipeSteps.length > 0) {
    const first = recipeSteps[0].agent.replace(/\s+/g, '_');
    lines.push(`  "state" -> "${first}";`);
  }
  lines.push('}');
  return lines.join('\n');
}

const TOOL_MAP: Record<string, (arg: string, state?: RcoState, steps?: Array<{ agent: string; output_to?: string }>) => string> = {
  search: (q) => stubSearch(q),
  code: (a, _s, _st) => stubCode(a),
  terminal: (c) => stubTerminal(c),
  'dependency-mapper': (_arg, state, steps) => dependencyMapper(state ?? { sessionId: '', recipe: '', task: '', currentStep: 0, loopCount: 0, outputs: {}, agentLogs: [], startedAt: 0, updatedAt: 0 }, steps ?? []),
};

export function runTool(
  name: string,
  arg: string,
  state?: RcoState,
  steps?: Array<{ agent: string; output_to?: string }>
): string {
  const fn = TOOL_MAP[name];
  if (!fn) {
    console.error(`[RCO tool] unknown tool: ${name}`);
    return `[unknown tool: ${name}]`;
  }
  return fn(arg, state, steps);
}
