/**
 * Migration Context Manager
 *
 * Reads and writes roland-context.json (structured) and MIGRATION.md (human-readable).
 * Merges with .rco-state.json for per-session state.
 *
 * File resolution order (project root):
 *   1. roland-context.json   — machine-readable, primary source of truth
 *   2. MIGRATION.md          — human-readable companion (auto-generated or hand-written)
 *   3. .rco-state.json       — lightweight per-session state overlay
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface MigrationRule {
  id: string;
  pattern: string;
  replacement: string;
  notes?: string;
  addedAt: string;
}

export interface MigrationDecision {
  id: string;
  description: string;
  rationale: string;
  addedAt: string;
}

export interface TestPattern {
  id: string;
  name: string;
  description: string;
  example?: string;
  addedAt: string;
}

export interface RolandContext {
  schemaVersion: string;
  project: {
    name: string;
    sourceLanguage: string;
    targetLanguage: string;
    description: string;
    createdAt: string;
    lastUpdated: string;
  };
  rules: MigrationRule[];
  decisions: MigrationDecision[];
  testPatterns: TestPattern[];
  customSections: Record<string, string>;
}

export interface RcoState {
  sessionId: string;
  startedAt: string;
  activeRecipe: string | null;
  stepIndex: number;
  context: Record<string, unknown>;
}

export type AppendTarget = 'rules' | 'decisions' | 'testPatterns' | 'customSections';

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CONTEXT: RolandContext = {
  schemaVersion: '1.0',
  project: {
    name: 'migration-project',
    sourceLanguage: 'VB6',
    targetLanguage: 'C#',
    description: 'Legacy VB6 to modern C# migration',
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  },
  rules: [],
  decisions: [],
  testPatterns: [],
  customSections: {},
};

// ============================================================================
// File resolution
// ============================================================================

function findProjectRoot(startDir?: string): string {
  // Priority: ROLAND_PROJECT_ROOT env var > explicit startDir > cwd
  const envRoot = process.env['ROLAND_PROJECT_ROOT']?.trim();
  if (envRoot) {
    const resolved = path.resolve(envRoot);
    if (!fs.existsSync(resolved)) {
      process.stderr.write(
        `[roland] Warning: ROLAND_PROJECT_ROOT="${envRoot}" does not exist — falling back to cwd\n`
      );
    } else {
      return resolved;
    }
  }
  return startDir ?? process.cwd();
}

function contextFilePath(projectRoot: string): string {
  return path.join(projectRoot, 'roland-context.json');
}

function migrationMdPath(projectRoot: string): string {
  return path.join(projectRoot, 'MIGRATION.md');
}

function rcoStatePath(projectRoot: string): string {
  return path.join(projectRoot, '.rco-state.json');
}

// ============================================================================
// Read / Write context
// ============================================================================

export function readContext(projectRoot?: string): RolandContext {
  const root = findProjectRoot(projectRoot);
  const jsonPath = contextFilePath(root);

  if (fs.existsSync(jsonPath)) {
    try {
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      return JSON.parse(raw) as RolandContext;
    } catch (err) {
      process.stderr.write(
        `[roland] Warning: Failed to parse ${jsonPath}: ${err instanceof Error ? err.message : String(err)} — using defaults\n`
      );
    }
  }

  // Deep copy so callers cannot mutate the module-level DEFAULT_CONTEXT
  return JSON.parse(JSON.stringify(DEFAULT_CONTEXT)) as RolandContext;
}

export function writeContext(ctx: RolandContext, projectRoot?: string): void {
  const root = findProjectRoot(projectRoot);
  ctx.project.lastUpdated = new Date().toISOString();

  fs.writeFileSync(contextFilePath(root), JSON.stringify(ctx, null, 2), 'utf-8');
  syncMigrationMd(ctx, root);
}

// ============================================================================
// Read / Write session state
// ============================================================================

export function readRcoState(projectRoot?: string): RcoState | null {
  const root = findProjectRoot(projectRoot);
  const statePath = rcoStatePath(root);

  if (!fs.existsSync(statePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8')) as RcoState;
  } catch {
    return null;
  }
}

export function writeRcoState(state: RcoState, projectRoot?: string): void {
  const root = findProjectRoot(projectRoot);
  fs.writeFileSync(rcoStatePath(root), JSON.stringify(state, null, 2), 'utf-8');
}

// ============================================================================
// Merge context + state into a single prompt-ready block
// ============================================================================

export function buildContextBlock(projectRoot?: string): string {
  const ctx = readContext(projectRoot);
  const state = readRcoState(projectRoot);

  const lines: string[] = [
    `# Roland Migration Context`,
    ``,
    `## Project`,
    `- **Name**: ${ctx.project.name}`,
    `- **Source**: ${ctx.project.sourceLanguage}`,
    `- **Target**: ${ctx.project.targetLanguage}`,
    `- **Description**: ${ctx.project.description}`,
    `- **Last Updated**: ${ctx.project.lastUpdated}`,
    ``,
  ];

  if (ctx.rules.length > 0) {
    lines.push(`## ${ctx.project.sourceLanguage}→${ctx.project.targetLanguage} Mapping Rules`);
    ctx.rules.forEach((rule, i) => {
      lines.push(`${i + 1}. **${rule.pattern}** → \`${rule.replacement}\``);
      if (rule.notes) lines.push(`   - ${rule.notes}`);
    });
    lines.push('');
  }

  if (ctx.decisions.length > 0) {
    lines.push(`## Past Decisions`);
    ctx.decisions.forEach((d, i) => {
      lines.push(`${i + 1}. **${d.description}**`);
      lines.push(`   - Rationale: ${d.rationale}`);
    });
    lines.push('');
  }

  if (ctx.testPatterns.length > 0) {
    lines.push(`## Test Patterns`);
    ctx.testPatterns.forEach((tp, i) => {
      lines.push(`${i + 1}. **${tp.name}**: ${tp.description}`);
      if (tp.example) lines.push(`   \`\`\`\n   ${tp.example}\n   \`\`\``);
    });
    lines.push('');
  }

  for (const [section, content] of Object.entries(ctx.customSections)) {
    lines.push(`## ${section}`);
    lines.push(content);
    lines.push('');
  }

  if (state) {
    lines.push(`## Current Session`);
    lines.push(`- **Session ID**: ${state.sessionId}`);
    lines.push(`- **Started**: ${state.startedAt}`);
    if (state.activeRecipe) lines.push(`- **Active Recipe**: ${state.activeRecipe}`);
    if (Object.keys(state.context).length > 0) {
      lines.push(`- **State Keys**: ${Object.keys(state.context).join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Append helpers
// ============================================================================

function nextId(items: { id: string }[]): string {
  const maxId = items.reduce((max, item) => Math.max(max, parseInt(item.id, 10) || 0), 0);
  return String(maxId + 1).padStart(3, '0');
}

export function appendRule(
  pattern: string,
  replacement: string,
  notes?: string,
  projectRoot?: string
): MigrationRule {
  const ctx = readContext(projectRoot);
  const rule: MigrationRule = {
    id: nextId(ctx.rules),
    pattern,
    replacement,
    notes,
    addedAt: new Date().toISOString(),
  };
  ctx.rules.push(rule);
  writeContext(ctx, projectRoot);
  return rule;
}

export function appendDecision(
  description: string,
  rationale: string,
  projectRoot?: string
): MigrationDecision {
  const ctx = readContext(projectRoot);
  const decision: MigrationDecision = {
    id: nextId(ctx.decisions),
    description,
    rationale,
    addedAt: new Date().toISOString(),
  };
  ctx.decisions.push(decision);
  writeContext(ctx, projectRoot);
  return decision;
}

export function appendTestPattern(
  name: string,
  description: string,
  example?: string,
  projectRoot?: string
): TestPattern {
  const ctx = readContext(projectRoot);
  const pattern: TestPattern = {
    id: nextId(ctx.testPatterns),
    name,
    description,
    example,
    addedAt: new Date().toISOString(),
  };
  ctx.testPatterns.push(pattern);
  writeContext(ctx, projectRoot);
  return pattern;
}

export function appendCustomSection(
  section: string,
  content: string,
  projectRoot?: string
): void {
  const ctx = readContext(projectRoot);
  const existing = ctx.customSections[section] ?? '';
  ctx.customSections[section] = existing
    ? `${existing}\n\n${content}`
    : content;
  writeContext(ctx, projectRoot);
}

// ============================================================================
// MIGRATION.md sync — keeps a human-readable companion in sync
// ============================================================================

export function syncMigrationMd(ctx: RolandContext, projectRoot?: string): void {
  const root = findProjectRoot(projectRoot);
  const mdPath = migrationMdPath(root);

  const lines: string[] = [
    `# MIGRATION.md`,
    `> Auto-generated by Roland. Edit \`roland-context.json\` or use \`update_migration_context\` tool.`,
    `> Last updated: ${ctx.project.lastUpdated}`,
    ``,
    `## Project`,
    `| Field | Value |`,
    `|---|---|`,
    `| Name | ${ctx.project.name} |`,
    `| Source | ${ctx.project.sourceLanguage} |`,
    `| Target | ${ctx.project.targetLanguage} |`,
    `| Description | ${ctx.project.description} |`,
    ``,
  ];

  if (ctx.rules.length > 0) {
    lines.push(`## ${ctx.project.sourceLanguage}→${ctx.project.targetLanguage} Mapping Rules`);
    lines.push(`| # | Pattern | Replacement | Notes |`);
    lines.push(`|---|---|---|---|`);
    ctx.rules.forEach((r, i) => {
      lines.push(`| ${i + 1} | \`${r.pattern}\` | \`${r.replacement}\` | ${r.notes ?? ''} |`);
    });
    lines.push('');
  }

  if (ctx.decisions.length > 0) {
    lines.push(`## Past Decisions`);
    ctx.decisions.forEach((d, i) => {
      lines.push(`### ${i + 1}. ${d.description}`);
      lines.push(`**Rationale**: ${d.rationale}`);
      lines.push(`_Added: ${d.addedAt}_`);
      lines.push('');
    });
  }

  if (ctx.testPatterns.length > 0) {
    lines.push(`## Test Patterns`);
    ctx.testPatterns.forEach((tp, i) => {
      lines.push(`### ${i + 1}. ${tp.name}`);
      lines.push(tp.description);
      if (tp.example) {
        lines.push('```');
        lines.push(tp.example);
        lines.push('```');
      }
      lines.push('');
    });
  }

  for (const [section, content] of Object.entries(ctx.customSections)) {
    lines.push(`## ${section}`);
    lines.push(content);
    lines.push('');
  }

  fs.writeFileSync(mdPath, lines.join('\n'), 'utf-8');
}

// ============================================================================
// Project scaffolding (called from init)
// ============================================================================

export function scaffoldContextFiles(
  projectRoot: string,
  options: Partial<RolandContext['project']> = {}
): { contextPath: string; mdPath: string; alreadyExisted: boolean } {
  const jsonPath = contextFilePath(projectRoot);
  const alreadyExisted = fs.existsSync(jsonPath);

  if (!alreadyExisted) {
    const ctx: RolandContext = {
      ...DEFAULT_CONTEXT,
      project: {
        ...DEFAULT_CONTEXT.project,
        ...options,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      },
    };
    writeContext(ctx, projectRoot);
  }

  return { contextPath: jsonPath, mdPath: migrationMdPath(projectRoot), alreadyExisted };
}
