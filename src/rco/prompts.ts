/**
 * RCO Claude tool-calling prompts — generate prompts for Claude interface.
 * Used by agentWorker (and in production: manual Claude interface).
 */

import type { AgentYaml } from './types.js';
import type { FileBundle } from '../utils/file-gatherer.js';
import { formatBundleAsMarkdown } from '../utils/file-gatherer.js';
import { ClaudePromptPayloadSchema } from '../schemas.js';

export interface ToolCallingPromptInput {
  agentYaml: AgentYaml;
  taskContext: string;
  stepInput?: string;
  stateSummary?: Record<string, unknown>;
  fileBundle?: FileBundle;
}

/**
 * Build the prompt text sent to Claude: "As [agent-name], execute step: [input]. Tools: [yaml-tools]. Respond in JSON: {output: '...'}."
 */
export function buildClaudeToolCallingPrompt(input: ToolCallingPromptInput): string {
  const payload = ClaudePromptPayloadSchema.safeParse({
    agentName: input.agentYaml.name ?? 'agent',
    stepInput: input.stepInput,
    taskContext: input.taskContext,
    tools: input.agentYaml.tools ?? [],
    model: input.agentYaml.claude_model,
    stateSummary: input.stateSummary,
  });
  const p = payload.success ? payload.data : { agentName: 'agent', taskContext: input.taskContext, tools: [] as string[] };

  const toolsList = (p.tools && p.tools.length > 0) ? p.tools.join(', ') : 'none';
  const stepPart = p.stepInput ? `\nStep input from previous agent:\n${p.stepInput}\n` : '\n';
  const filePart = input.fileBundle && input.fileBundle.files.length > 0
    ? `\n${formatBundleAsMarkdown(input.fileBundle)}\n`
    : '';
  return [
    `As ${p.agentName}, execute this step.`,
    `Task context: ${p.taskContext}`,
    stepPart,
    filePart,
    `Tools available: ${toolsList}.`,
    `Respond in JSON only: {"output": "<your result text>", "success": true}. Optionally include "dotGraph" for dependency-mapper or graph-visualizer (Visualize dependencies as DOT: [state]).`,
  ].join('\n');
}
