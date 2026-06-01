/**
 * RCO config and YAML loading (agents + recipes)
 */
import { type RcoConfig, type RcoRecipe, type AgentYaml } from './types.js';
/**
 * Canonical agents-directory resolver — single source of truth.
 *
 * Resolution order:
 *   1. `override` (e.g. from CLI --agents-dir flag)
 *   2. `installDir/agents`  — dist/agents when compiled, src/agents in dev
 *   3. `rootDir/agents`     — project root agents/ (e.g. when running from dist/server/)
 *   4. `cwd/agents`         — last resort
 *
 * Pass `referenceUrl = import.meta.url` from any call site to anchor resolution
 * to that file's install directory rather than loadConfig's own location.
 */
export declare function resolveAgentsDir(referenceUrl?: string, override?: string): string;
export declare function loadRcoConfig(configPath?: string): RcoConfig;
export declare function loadAgentYaml(filePath: string): AgentYaml;
export interface LoadAllAgentsOptions {
    /**
     * When true, skips agents whose names end in -low, -medium, or -high.
     * Use for the PM team roster so the Lead PM only sees primary personas.
     */
    excludeVariants?: boolean;
}
export declare function loadAllAgents(agentsDir?: string, opts?: LoadAllAgentsOptions): Map<string, AgentYaml>;
export declare function loadRecipe(recipeName: string, recipesDir?: string): RcoRecipe;
//# sourceMappingURL=loadConfig.d.ts.map