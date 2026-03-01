/**
 * RCO Skills — eco-optimizer, graph-visualizer, and related helpers.
 * Used by orchestrator and agent worker to switch models and generate DOT for dashboard.
 */

import type { RcoState } from './rco/types.js';
import { ComplexityClassifier } from './orchestrator/complexity-classifier.js';

const RCO_VERBOSE = process.env.RCO_VERBOSE !== '0' && process.env.RCO_VERBOSE !== 'false';

function log(msg: string): void {
  if (RCO_VERBOSE) console.error(`[RCO skills] ${msg}`);
}

/** Default Sonnet model id; Haiku for simple steps */
export const ECO_MODELS = {
  simple: 'claude-3-haiku-20240307',
  medium: 'claude-3-5-sonnet-20241022',
  complex: 'claude-3-5-sonnet-20241022',
} as const;

/**
 * Eco-optimizer: suggest Claude model from prompt length and complexity.
 * Use Haiku for short/simple steps to reduce token usage.
 */
export function ecoOptimizerSuggestModel(
  promptOrStepInput: string,
  defaultModel: string = ECO_MODELS.medium
): string {
  if (!promptOrStepInput || promptOrStepInput.length < 50) {
    log('eco-optimizer: short input -> Haiku');
    return ECO_MODELS.simple;
  }
  const analysis = ComplexityClassifier.analyzeQuery(promptOrStepInput);
  const suggested = ECO_MODELS[analysis.complexity] ?? defaultModel;
  log(`eco-optimizer: complexity=${analysis.complexity} -> ${suggested}`);
  return suggested;
}

/**
 * Graph-visualizer: generate DOT string for agent handoffs from state and workflow steps.
 * Export to dashboard for dependency visualization.
 */
export function graphVisualizerDOT(
  state: RcoState,
  workflowSteps: Array<{ agent: string; output_to?: string }>
): string {
  const lines: string[] = ['digraph RCO_handoffs {', '  rankdir=LR;', '  node [shape=box];'];
  const seen = new Set<string>();
  for (const step of workflowSteps) {
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
  lines.push('  "state" [shape=ellipse, label="state"];');
  if (workflowSteps.length > 0) {
    const first = workflowSteps[0].agent.replace(/\s+/g, '_');
    lines.push(`  "state" -> "${first}";`);
  }
  if (state.currentStep >= 0 && state.currentStep < workflowSteps.length) {
    const current = workflowSteps[state.currentStep].agent.replace(/\s+/g, '_');
    lines.push(`  "${current}" [style=filled, fillcolor=lightblue];`);
  }
  lines.push('}');
  return lines.join('\n');
}

/** Zod-friendly DOT line validator: basic sanity check for DOT output */
export function isValidDOT(dot: string): boolean {
  if (!dot || typeof dot !== 'string') return false;
  const trimmed = dot.trim();
  if (!trimmed.startsWith('digraph') && !trimmed.startsWith('graph')) return false;
  if (!trimmed.includes('{') || !trimmed.includes('}')) return false;
  return true;
}
