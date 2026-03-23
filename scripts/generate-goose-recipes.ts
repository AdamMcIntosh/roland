#!/usr/bin/env tsx
/**
 * Generate Goose-native recipe YAML files from Roland agent personas.
 *
 * Reads all agents/*.yaml files and transforms each into a Goose recipe
 * format in goose/recipes/. Also generates consolidated multi-agent recipes
 * from Roland's recipe workflows.
 *
 * Usage:
 *   npx tsx scripts/generate-goose-recipes.ts
 *   npm run generate-goose-recipes
 */

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
const AGENTS_DIR = path.join(ROOT, 'agents');
const RECIPES_DIR = path.join(ROOT, 'recipes');
const OUTPUT_DIR = path.join(ROOT, 'goose', 'recipes');

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ============================================================================
// Generate per-agent recipes
// ============================================================================

const agentFiles = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.yaml'));
let agentCount = 0;

for (const file of agentFiles) {
  const raw = YAML.parse(fs.readFileSync(path.join(AGENTS_DIR, file), 'utf-8'));
  if (!raw?.name) continue;

  // Skip tiered variants — they'll use the base agent recipe with dynamic model selection
  if (raw.name.match(/-(low|medium|high)$/)) continue;

  const recipe = {
    id: `roland-${raw.name}`,
    version: '1.0.0',
    title: `Roland ${raw.name} agent`,
    description: raw.role_prompt || `${raw.name} agent persona`,
    instructions: [
      `You are the Roland "${raw.name}" agent.`,
      '',
      raw.role_prompt || `Apply your ${raw.name} expertise to the task.`,
      '',
      'Before starting work, call the Roland `triage` tool with the user\'s message to get',
      'complexity analysis and confirm the best model for this task. Use the returned',
      '`openrouter_model` when spawning subagents for complex subtasks.',
    ].join('\n'),
    extensions: [
      { name: 'developer', timeout: 300 },
      { name: 'roland', timeout: 60 },
    ],
  };

  const outPath = path.join(OUTPUT_DIR, `roland-${raw.name}.yaml`);
  fs.writeFileSync(outPath, YAML.stringify(recipe, { lineWidth: 100 }));
  agentCount++;
}

console.log(`Generated ${agentCount} agent recipes in goose/recipes/`);

// ============================================================================
// Generate multi-agent workflow recipes
// ============================================================================

interface WorkflowRecipe {
  id: string;
  version: string;
  title: string;
  description: string;
  instructions: string;
  extensions: Array<{ name: string; timeout: number }>;
}

const workflows: WorkflowRecipe[] = [
  {
    id: 'roland-plan-exec-rev-ex',
    version: '1.0.0',
    title: 'Roland PlanExecRevEx — 4-Agent Coding Loop',
    description: 'Autonomous coding loop: plan → execute → review → explain',
    instructions: [
      'You are orchestrating a 4-agent coding workflow using Roland.',
      '',
      '## Workflow',
      '',
      '1. **Plan**: Call `triage` with the task, then as the planner persona, break the task into',
      '   detailed steps, required files, dependencies, and best practices.',
      '',
      '2. **Execute**: Switch to executor persona. Implement the plan: edit/create files,',
      '   install deps, run tests. Handle errors autonomously.',
      '',
      '3. **Review**: Switch to critic persona. Analyze the implementation for bugs,',
      '   performance issues, security vulnerabilities, and code smells. If issues found,',
      '   loop back to Execute (max 3 loops).',
      '',
      '4. **Explain**: Summarize what was done, why each key decision was made, and',
      '   any trade-offs. Use clear language and diagrams if helpful.',
      '',
      '## Model Selection',
      '',
      'Call Roland\'s `triage` tool at the start to get the recommended `openrouter_model`.',
      'Use capable models (e.g., anthropic/claude-sonnet-4) for planning and review steps,',
      'and balanced models (e.g., google/gemini-2.5-flash) for execution.',
      '',
      'Alternatively, use `start_recipe` with recipe_name="PlanExecRevEx" for server-managed',
      'step-by-step orchestration.',
    ].join('\n'),
    extensions: [
      { name: 'developer', timeout: 300 },
      { name: 'roland', timeout: 60 },
    ],
  },
  {
    id: 'roland-bugfix',
    version: '1.0.0',
    title: 'Roland BugFix — Systematic Bug Resolution',
    description: 'Triage → research → architect → fix → test → review → document',
    instructions: [
      'You are orchestrating a systematic bug resolution workflow using Roland.',
      '',
      '## Workflow',
      '',
      '1. **Triage**: Analyze the bug report. Classify severity, identify affected components.',
      '2. **Research**: Investigate root cause. Search codebase, check logs, trace execution.',
      '3. **Architect**: Design the fix. Consider side effects, breaking changes, alternatives.',
      '4. **Execute**: Implement the fix with minimal, targeted changes.',
      '5. **Test**: Write and run tests covering the fix and edge cases.',
      '6. **Review**: Verify the fix is correct, complete, and doesn\'t introduce regressions.',
      '7. **Document**: Update docs/changelog if needed. Summarize the fix.',
      '',
      'If tests fail or review finds issues, loop back to Execute (max 3 loops).',
      '',
      'Call Roland\'s `triage` tool at the start. For server-managed orchestration,',
      'use `start_recipe` with recipe_name="BugFix".',
    ].join('\n'),
    extensions: [
      { name: 'developer', timeout: 300 },
      { name: 'roland', timeout: 60 },
    ],
  },
  {
    id: 'roland-security-audit',
    version: '1.0.0',
    title: 'Roland Security Audit',
    description: 'Threat modeling → code review → remediation → documentation',
    instructions: [
      'You are orchestrating a security audit workflow using Roland.',
      '',
      '## Workflow',
      '',
      '1. **Threat Model**: As architect, identify attack surfaces, trust boundaries,',
      '   and potential threats (STRIDE framework).',
      '2. **Code Review**: As security-reviewer, scan for OWASP Top 10 vulnerabilities,',
      '   hardcoded secrets, insecure dependencies, injection points.',
      '3. **Remediate**: As executor, fix identified vulnerabilities with minimal changes.',
      '4. **Document**: As writer, produce a security audit report with findings,',
      '   severity ratings, and remediation status.',
      '',
      'Call Roland\'s `triage` tool at the start. For server-managed orchestration,',
      'use `start_recipe` with recipe_name="SecurityAudit".',
    ].join('\n'),
    extensions: [
      { name: 'developer', timeout: 300 },
      { name: 'roland', timeout: 60 },
    ],
  },
];

for (const recipe of workflows) {
  const outPath = path.join(OUTPUT_DIR, `${recipe.id}.yaml`);
  fs.writeFileSync(outPath, YAML.stringify(recipe, { lineWidth: 100 }));
}

console.log(`Generated ${workflows.length} workflow recipes in goose/recipes/`);
console.log(`Total: ${agentCount + workflows.length} recipes`);
