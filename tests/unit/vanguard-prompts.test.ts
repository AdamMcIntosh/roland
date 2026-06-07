import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildClaudeToolCallingPrompt } from '../../src/rco/prompts.js';
import { buildLeadPMPlanningPrompt, buildLeadPMReviewPrompt } from '../../src/rco/pm-prompts.js';
import { loadUnscAgents } from '../../src/rco/unsc-agents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

describe('Vanguard hardening — agent yaml', () => {
  it('vanguard.yaml includes pipeline testing, redaction, and handoff sections', () => {
    const yamlPath = path.join(projectRoot, 'agents/unsc/vanguard.yaml');
    const content = fs.readFileSync(yamlPath, 'utf-8');
    expect(content).toContain('scripts/test-*.mjs');
    expect(content).toContain('[Redacted]');
    expect(content).toContain('middleware pipeline');
    expect(content).toContain('## Vanguard — Author Handoff');
    expect(content).toContain('## Vanguard — Test Report');
    expect(content).toContain('Pipeline verified');
    expect(content).toContain('Preflight');
    expect(content).toContain('CORS');
  });

  it('loadUnscAgents resolves vanguard role_prompt with hardening sections', () => {
    const agents = loadUnscAgents(path.join(projectRoot, 'agents/unsc'));
    const vanguard = agents.get('vanguard');
    expect(vanguard?.role_prompt).toContain('Two-Phase Doctrine');
    expect(vanguard?.role_prompt).toContain('Redaction');
  });
});

describe('Vanguard hardening — worker prompt injection', () => {
  const testAuthorYaml = {
    name: 'test-author',
    tools: ['search', 'code'],
    claude_model: 'composer-2.5',
    role_prompt: 'You are test-author.',
  };

  const testExecutorYaml = {
    name: 'test-executor',
    tools: ['terminal', 'testing'],
    claude_model: 'composer-2.5',
    role_prompt: 'You are test-executor.',
  };

  it('buildClaudeToolCallingPrompt injects Vanguard Author Protocol for test-author', () => {
    const prompt = buildClaudeToolCallingPrompt({
      agentYaml: testAuthorYaml,
      taskContext: 'Expand smoke tests for request logging, CORS, and error handling',
    });

    expect(prompt).toContain('Vanguard Author Protocol');
    expect(prompt).toContain('scripts/test-*.mjs');
    expect(prompt).toContain('[Redacted]');
    expect(prompt).toContain('Pipeline scope');
    expect(prompt).toContain('## Vanguard — Author Handoff');
    expect(prompt).not.toContain('Sparrow Handoff Protocol');
  });

  it('buildClaudeToolCallingPrompt injects Vanguard Execute Protocol for test-executor', () => {
    const prompt = buildClaudeToolCallingPrompt({
      agentYaml: testExecutorYaml,
      taskContext: 'Run smoke tests from test-author handoff',
      stepInput: '## Vanguard — Author Handoff\n**Run command:** node scripts/test-middleware.mjs',
    });

    expect(prompt).toContain('Vanguard Execute Protocol');
    expect(prompt).toContain('Never rewrite assertions');
    expect(prompt).toContain('## Vanguard — Test Report');
    expect(prompt).not.toContain('Vanguard Author Protocol');
  });

  it('test-executor does not get Sparrow Handoff Protocol', () => {
    const prompt = buildClaudeToolCallingPrompt({
      agentYaml: testExecutorYaml,
      taskContext: 'Run tests',
    });
    expect(prompt).not.toContain('Sparrow Handoff Protocol');
  });

  it('vanguard alias gets Author Protocol', () => {
    const prompt = buildClaudeToolCallingPrompt({
      agentYaml: { name: 'vanguard', tools: ['code'], claude_model: 'composer-2.5' },
      taskContext: 'Write integration tests',
    });
    expect(prompt).toContain('Vanguard Author Protocol');
  });
});

describe('Vanguard hardening — PM prompts', () => {
  const roster = [
    { name: 'test-author', role_prompt: 'Test author' },
    { name: 'test-executor', role_prompt: 'Test executor' },
  ];

  it('planning prompt includes Vanguard test quality mandate', () => {
    const prompt = buildLeadPMPlanningPrompt({
      goal: 'Expand smoke tests for request logging, CORS, and error handling with redaction verification',
      blackboardSnapshot: '(Blackboard is empty)',
      roster,
    });
    expect(prompt).toContain('VANGUARD TEST QUALITY');
    expect(prompt).toContain('scripts/test-*.mjs');
    expect(prompt).toContain('[Redacted]');
    expect(prompt).toContain('## Vanguard — Author Handoff');
    expect(prompt).toContain('Middleware pipeline');
  });

  it('review prompt checks Vanguard quality bar', () => {
    const prompt = buildLeadPMReviewPrompt({
      goal: 'Expand middleware smoke tests',
      blackboardSnapshot: '(Blackboard is empty)',
      roster,
      waveNumber: 1,
      waveResults: [],
      remainingTasks: [],
    });
    expect(prompt).toContain('Vanguard quality bar');
    expect(prompt).toContain('[Redacted]');
    expect(prompt).toContain('## Vanguard — Author Handoff');
  });
});
