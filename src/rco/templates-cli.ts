/**
 * `roland templates` — list loop templates parsed from recipes/loops/*.yaml.
 *
 * Usage:
 *   roland templates              Human-readable catalog
 *   roland templates --json       Machine-readable catalog
 */

import {
  CORE_GENERIC_TEMPLATES,
  LoopTemplates,
  type TemplateLoadError,
} from '../loop-engine/loop-templates.js';
import { loadLoopEngineConfig } from '../loop-engine/loop-config.js';
import { resolveVerificationStrategies } from '../loop-engine/loop-template-resolution.js';
import type { ExitConditionConfig, LoopTemplate } from '../loop-engine/loop-phases.js';
import { Phase } from '../loop-engine/loop-phases.js';

export interface TemplateVerificationGate {
  type: string;
  optional?: boolean;
  weight?: number;
  successThreshold?: number;
  command?: string;
  dryRun?: boolean;
}

export interface TemplateExitConditionEntry {
  id?: string;
  type: string;
  description: string;
  minConfidence?: number;
  consecutiveIterations?: number;
  command?: string;
}

export interface TemplateCatalogEntry {
  name: string;
  description: string;
  maxIterations: number | null;
  verificationGates: TemplateVerificationGate[];
  exitConditions: TemplateExitConditionEntry[];
  deprecated?: boolean;
  aliasOf?: string;
  isCoreGeneric: boolean;
}

export interface TemplatesCatalog {
  defaultTemplate: string;
  coreGeneric: readonly string[];
  templates: TemplateCatalogEntry[];
  loadErrors: TemplateLoadError[];
}

export interface TemplatesCliArgs {
  json?: boolean;
}

export function parseTemplatesArgs(argv: string[]): TemplatesCliArgs {
  const args = argv[0] === 'templates' ? argv.slice(1) : argv;
  return { json: args.includes('--json') };
}

function defaultExitDescription(c: ExitConditionConfig): string {
  switch (c.type) {
    case 'all_gates_pass':
      return 'All evaluation gates pass with accepted confidence';
    case 'confidence_streak':
      return `Success confidence ≥ ${c.minConfidence ?? 0.85} for ${c.consecutiveIterations ?? 2} consecutive iterations`;
    case 'command_success':
      return c.command ? `Command succeeds: ${c.command}` : 'Between-iterations check command exits 0';
    case 'custom':
      return 'Custom exit rule';
    default:
      return c.type;
  }
}

function extractVerificationGates(template: LoopTemplate): TemplateVerificationGate[] {
  const verifyPhase = template.phases.find((p) => p.phase === Phase.Verify);
  return resolveVerificationStrategies(template, verifyPhase).map((s) => ({
    type: s.type,
    optional: s.optional,
    weight: s.weight,
    successThreshold: s.successThreshold,
    command: s.command,
    dryRun: s.dryRun,
  }));
}

function extractExitConditions(template: LoopTemplate): TemplateExitConditionEntry[] {
  const rules =
    template.exitConditions && template.exitConditions.length > 0
      ? template.exitConditions
      : [{ type: 'all_gates_pass' as const, description: 'All gates pass (default)' }];

  return rules.map((c, index) => ({
    id: c.id ?? `${c.type}-${index}`,
    type: c.type,
    description: c.description ?? defaultExitDescription(c),
    minConfidence: c.minConfidence,
    consecutiveIterations: c.consecutiveIterations,
    command: c.command,
  }));
}

function toCatalogEntry(template: LoopTemplate): TemplateCatalogEntry {
  return {
    name: template.name,
    description: template.description.trim(),
    maxIterations: template.maxIterations ?? null,
    verificationGates: extractVerificationGates(template),
    exitConditions: extractExitConditions(template),
    deprecated: template.deprecated,
    aliasOf: template.aliasOf,
    isCoreGeneric: (CORE_GENERIC_TEMPLATES as readonly string[]).includes(template.name),
  };
}

/** Build the templates catalog from recipes/loops YAML (same source as ClosedLoop). */
export function buildTemplatesCatalog(): TemplatesCatalog {
  const loader = new LoopTemplates();
  const cfg = loadLoopEngineConfig();
  const templates = loader
    .listAll()
    .map(toCatalogEntry)
    .sort((a, b) => {
      if (a.isCoreGeneric !== b.isCoreGeneric) return a.isCoreGeneric ? -1 : 1;
      if (Boolean(a.deprecated) !== Boolean(b.deprecated)) return a.deprecated ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

  return {
    defaultTemplate: cfg.default_template ?? 'standard-code-loop',
    coreGeneric: CORE_GENERIC_TEMPLATES,
    templates,
    loadErrors: loader.getLoadErrors(),
  };
}

function formatGate(g: TemplateVerificationGate): string {
  const opt = g.optional ? '?' : '';
  const dry = g.dryRun ? '(dry)' : '';
  const wt = g.weight != null ? `@${g.weight}` : '';
  const th =
    g.successThreshold != null && g.successThreshold < 1 ? `≥${g.successThreshold}` : '';
  return `${g.type}${wt}${th}${opt}${dry}`;
}

function formatHumanCatalog(catalog: TemplatesCatalog): string {
  const b = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const d = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const y = (s: string) => `\x1b[33m${s}\x1b[0m`;
  const lines: string[] = [];

  const coreCount = catalog.templates.filter((t) => t.isCoreGeneric && !t.deprecated).length;
  lines.push('');
  lines.push(`  ${b('Loop Templates')}  ${d(`(${coreCount} core · ${catalog.templates.length} total)`)}`);
  lines.push(`  ${d('Default:')} ${catalog.defaultTemplate}`);
  lines.push('');

  for (const tpl of catalog.templates) {
    const tags: string[] = [];
    if (tpl.isCoreGeneric) tags.push('core');
    if (tpl.deprecated) tags.push('deprecated');
    if (tpl.aliasOf) tags.push(`alias→${tpl.aliasOf}`);
    const tagStr = tags.length ? ` ${d(`[${tags.join(' · ')}]`)}` : '';

    lines.push(`  ${b(tpl.name)}${tagStr}`);
    if (tpl.description) {
      const desc = tpl.description.replace(/\s+/g, ' ').trim();
      lines.push(`    ${desc.length > 100 ? `${desc.slice(0, 97)}…` : desc}`);
    }
    lines.push(
      `    ${d('Max iterations:')} ${tpl.maxIterations ?? y('not set (engine default: 1)')}`,
    );

    if (tpl.verificationGates.length > 0) {
      lines.push(`    ${d('Verification gates:')} ${tpl.verificationGates.map(formatGate).join(', ')}`);
    } else {
      lines.push(`    ${d('Verification gates:')} ${y('none in template (uses loop_engine config)')}`);
    }

    lines.push(`    ${d('Exit conditions:')}`);
    for (const ec of tpl.exitConditions) {
      lines.push(`      • ${ec.type} — ${ec.description}`);
    }
    lines.push('');
  }

  if (catalog.loadErrors.length > 0) {
    lines.push(`  ${y('⚠')}  ${catalog.loadErrors.length} template file(s) failed to load:`);
    for (const err of catalog.loadErrors) {
      lines.push(`    ${err.file}: ${err.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function printTemplatesCatalog(opts: TemplatesCliArgs = {}): void {
  const catalog = buildTemplatesCatalog();
  if (opts.json) {
    console.log(JSON.stringify(catalog, null, 2));
    return;
  }
  console.log(formatHumanCatalog(catalog));
}

export function runTemplatesCli(argv: string[]): number {
  printTemplatesCatalog(parseTemplatesArgs(argv));
  return 0;
}
