/**
 * Roster — the team's available engineers, loaded from agents/*.yaml.
 *
 * Reads the same persona files the rest of Roland uses. Each persona already
 * carries its own model (recommended_model / model), so the Roster recommends an
 * engineer *and* the model it should run on with no coupling to the server's
 * private routing tables. The recommendation here is intentionally lightweight
 * (keyword + complexity heuristic); Phase 3 replaces it with the full router.
 */
import { type Lane } from './model-policy.js';
export interface Engineer {
    name: string;
    /** One-line specialty (first line of the persona's role_prompt). */
    specialty: string;
    /**
     * The persona's declared model from its YAML (informational). Routing to a
     * Cursor model is done by lane via TaskRouter — not from this field.
     */
    model: string;
    /** Cursor routing lane derived from the persona (see model-policy.ts). */
    lane: Lane;
    role_prompt: string;
    tools: string[];
}
export interface RosterOptions {
    /** Per-engineer lane overrides (config pm.lane_overrides). */
    laneOverrides?: Record<string, Lane>;
}
export declare class Roster {
    private readonly agentsDir;
    private engineers;
    private readonly laneOverrides;
    constructor(agentsDir?: string, opts?: RosterOptions);
    /** All assignable engineers. */
    list(): Engineer[];
    get(name: string): Engineer | undefined;
    /**
     * Recommend the best engineer for a task. Heuristic: keyword overlap between
     * the task and each persona (name + specialty), nudged by complexity so that
     * harder tasks prefer reasoning-tier personas. Defaults to "executor".
     */
    recommend(taskDescription: string): Engineer;
    private load;
    /** Delegates to the shared resolveAgentsDir in loadConfig.ts. */
    static resolveAgentsDir(): string;
}
//# sourceMappingURL=roster.d.ts.map