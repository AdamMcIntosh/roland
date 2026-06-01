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
export declare function readContext(projectRoot?: string): RolandContext;
export declare function writeContext(ctx: RolandContext, projectRoot?: string): void;
export declare function readRcoState(projectRoot?: string): RcoState | null;
export declare function writeRcoState(state: RcoState, projectRoot?: string): void;
export declare function buildContextBlock(projectRoot?: string): string;
export declare function appendRule(pattern: string, replacement: string, notes?: string, projectRoot?: string): MigrationRule;
export declare function appendDecision(description: string, rationale: string, projectRoot?: string): MigrationDecision;
export declare function appendTestPattern(name: string, description: string, example?: string, projectRoot?: string): TestPattern;
export declare function appendCustomSection(section: string, content: string, projectRoot?: string): void;
export declare function syncMigrationMd(ctx: RolandContext, projectRoot?: string): void;
export declare function scaffoldContextFiles(projectRoot: string, options?: Partial<RolandContext['project']>): {
    contextPath: string;
    mdPath: string;
    alreadyExisted: boolean;
};
//# sourceMappingURL=migration-context.d.ts.map