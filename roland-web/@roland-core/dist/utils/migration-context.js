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
// Defaults
// ============================================================================
const DEFAULT_CONTEXT = {
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
function findProjectRoot(startDir) {
    // Priority: ROLAND_PROJECT_ROOT env var > explicit startDir > cwd
    const envRoot = process.env['ROLAND_PROJECT_ROOT']?.trim();
    if (envRoot) {
        const resolved = path.resolve(envRoot);
        if (!fs.existsSync(resolved)) {
            process.stderr.write(`[roland] Warning: ROLAND_PROJECT_ROOT="${envRoot}" does not exist — falling back to cwd\n`);
        }
        else {
            return resolved;
        }
    }
    return startDir ?? process.cwd();
}
function contextFilePath(projectRoot) {
    return path.join(projectRoot, 'roland-context.json');
}
function migrationMdPath(projectRoot) {
    return path.join(projectRoot, 'MIGRATION.md');
}
function rcoStatePath(projectRoot) {
    return path.join(projectRoot, '.rco-state.json');
}
// ============================================================================
// Read / Write context
// ============================================================================
export function readContext(projectRoot) {
    const root = findProjectRoot(projectRoot);
    const jsonPath = contextFilePath(root);
    if (fs.existsSync(jsonPath)) {
        try {
            const raw = fs.readFileSync(jsonPath, 'utf-8');
            return JSON.parse(raw);
        }
        catch (err) {
            process.stderr.write(`[roland] Warning: Failed to parse ${jsonPath}: ${err instanceof Error ? err.message : String(err)} — using defaults\n`);
        }
    }
    // Deep copy so callers cannot mutate the module-level DEFAULT_CONTEXT
    return JSON.parse(JSON.stringify(DEFAULT_CONTEXT));
}
export function writeContext(ctx, projectRoot) {
    const root = findProjectRoot(projectRoot);
    ctx.project.lastUpdated = new Date().toISOString();
    fs.writeFileSync(contextFilePath(root), JSON.stringify(ctx, null, 2), 'utf-8');
    syncMigrationMd(ctx, root);
}
// ============================================================================
// Read / Write session state
// ============================================================================
export function readRcoState(projectRoot) {
    const root = findProjectRoot(projectRoot);
    const statePath = rcoStatePath(root);
    if (!fs.existsSync(statePath))
        return null;
    try {
        return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    }
    catch {
        return null;
    }
}
export function writeRcoState(state, projectRoot) {
    const root = findProjectRoot(projectRoot);
    fs.writeFileSync(rcoStatePath(root), JSON.stringify(state, null, 2), 'utf-8');
}
// ============================================================================
// Merge context + state into a single prompt-ready block
// ============================================================================
export function buildContextBlock(projectRoot) {
    const ctx = readContext(projectRoot);
    const state = readRcoState(projectRoot);
    const lines = [
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
            if (rule.notes)
                lines.push(`   - ${rule.notes}`);
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
            if (tp.example)
                lines.push(`   \`\`\`\n   ${tp.example}\n   \`\`\``);
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
        if (state.activeRecipe)
            lines.push(`- **Active Recipe**: ${state.activeRecipe}`);
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
function nextId(items) {
    const maxId = items.reduce((max, item) => Math.max(max, parseInt(item.id, 10) || 0), 0);
    return String(maxId + 1).padStart(3, '0');
}
export function appendRule(pattern, replacement, notes, projectRoot) {
    const ctx = readContext(projectRoot);
    const rule = {
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
export function appendDecision(description, rationale, projectRoot) {
    const ctx = readContext(projectRoot);
    const decision = {
        id: nextId(ctx.decisions),
        description,
        rationale,
        addedAt: new Date().toISOString(),
    };
    ctx.decisions.push(decision);
    writeContext(ctx, projectRoot);
    return decision;
}
export function appendTestPattern(name, description, example, projectRoot) {
    const ctx = readContext(projectRoot);
    const pattern = {
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
export function appendCustomSection(section, content, projectRoot) {
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
export function syncMigrationMd(ctx, projectRoot) {
    const root = findProjectRoot(projectRoot);
    const mdPath = migrationMdPath(root);
    const lines = [
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
export function scaffoldContextFiles(projectRoot, options = {}) {
    const jsonPath = contextFilePath(projectRoot);
    const alreadyExisted = fs.existsSync(jsonPath);
    if (!alreadyExisted) {
        const ctx = {
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
//# sourceMappingURL=migration-context.js.map