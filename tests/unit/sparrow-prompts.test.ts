import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildClaudeToolCallingPrompt } from '../../src/rco/prompts.js';
import { buildLeadPMPlanningPrompt, buildLeadPMReviewPrompt } from '../../src/rco/pm-prompts.js';
import { buildRolandOrchestratorPrompt } from '../../src/rco/orchestrator-prompts.js';
import { loadUnscAgents } from '../../src/rco/unsc-agents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

describe('Sparrow hardening — agent yaml', () => {
  it('sparrow.yaml includes pattern adherence, defensive coding, and assumptions template', () => {
    const yamlPath = path.join(projectRoot, 'agents/unsc/sparrow.yaml');
    const content = fs.readFileSync(yamlPath, 'utf-8');
    expect(content).toContain('cors.js');
    expect(content).toContain('requestLogger.js');
    expect(content).toContain('## Defensive Coding');
    expect(content).toContain('**Patterns:**');
    expect(content).toContain('**Edge cases:**');
    expect(content).toContain('TODO(scope)');
    expect(content).toContain('child logger per request');
    expect(content).toContain('duration');
  });

  it('loadUnscAgents resolves sparrow role_prompt with hardening sections', () => {
    const agents = loadUnscAgents(path.join(projectRoot, 'agents/unsc'));
    const sparrow = agents.get('sparrow');
    expect(sparrow?.role_prompt).toContain('Defensive Coding');
    expect(sparrow?.role_prompt).toContain('Patterns');
  });
});

describe('Sparrow hardening — worker prompt injection', () => {
  const sparrowYaml = {
    name: 'sparrow',
    tools: ['search', 'code', 'terminal'],
    claude_model: 'composer-2.5',
    role_prompt: 'You are Sparrow.',
  };

  it('buildClaudeToolCallingPrompt injects expanded Sparrow Handoff Protocol for sparrow', () => {
    const prompt = buildClaudeToolCallingPrompt({
      agentYaml: sparrowYaml,
      taskContext: 'Improve request logging middleware with pino child logger and durationMs',
      commandBlackboardSnapshot: '**Key Decisions:** Use pino for woody Express',
    });

    expect(prompt).toContain('Sparrow Handoff Protocol');
    expect(prompt).toContain('cors.js');
    expect(prompt).toContain('requestLogger.js');
    expect(prompt).toContain('Edge cases');
    expect(prompt).toContain('Defensive coding');
    expect(prompt).toContain('TODO(scope)');
    expect(prompt).toContain('## Assumptions');
    expect(prompt).toContain('## Sparrow — Task Complete');
    expect(prompt).toContain('Use pino for woody Express');
  });

  it('buildClaudeToolCallingPrompt applies Sparrow format to legacy executor alias', () => {
    const prompt = buildClaudeToolCallingPrompt({
      agentYaml: { name: 'executor', tools: ['code'], claude_model: 'composer-2.5' },
      taskContext: 'Wire middleware',
    });
    expect(prompt).toContain('Sparrow Handoff Protocol');
    expect(prompt).toContain('Patterns');
  });

  it('non-implementer agents do not get Sparrow Handoff Protocol', () => {
    const prompt = buildClaudeToolCallingPrompt({
      agentYaml: { name: 'oracle', tools: ['search'], claude_model: 'claude-sonnet-4-6' },
      taskContext: 'Map auth flow',
    });
    expect(prompt).not.toContain('Sparrow Handoff Protocol');
    expect(prompt).not.toContain('## Sparrow — Task Complete');
  });
});

describe('Sparrow hardening — PM and orchestrator prompts', () => {
  const roster = [{ name: 'sparrow', role_prompt: 'Implementation specialist' }];

  it('planning prompt includes Sparrow code quality mandate', () => {
    const prompt = buildLeadPMPlanningPrompt({
      goal: 'Improve request logging middleware to use pino child logger per request with durationMs',
      blackboardSnapshot: '(Blackboard is empty)',
      roster,
    });
    expect(prompt).toContain('SPARROW CODE QUALITY');
    expect(prompt).toContain('requestLogger.js');
    expect(prompt).toContain('## Assumptions');
    expect(prompt).toContain('durationMs');
  });

  it('review prompt checks Sparrow quality bar', () => {
    const prompt = buildLeadPMReviewPrompt({
      goal: 'Add pino middleware',
      blackboardSnapshot: '(Blackboard is empty)',
      roster,
      waveNumber: 1,
      waveResults: [],
      remainingTasks: [],
    });
    expect(prompt).toContain('Sparrow quality bar');
    expect(prompt).toContain('durationMs');
  });

  it('orchestrator prompt includes execution path triage framework', () => {
    const prompt = buildRolandOrchestratorPrompt({});
    expect(prompt).toContain('Execution Path Triage');
    expect(prompt).toContain('roland team');
    expect(prompt).toContain('Sparrow delegation extras');
  });
});
