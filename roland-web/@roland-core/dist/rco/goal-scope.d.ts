/**
 * Heuristic goal classification for PM scope calibration and synthesis compaction.
 */
/** True when the goal is a trivial local edit (comment, one-liner, minimal scaffold). */
export declare function isMinimalGoal(goal: string): boolean;
/** User explicitly asked for production-grade / hardening work. */
export declare function requestsProductionHardening(goal: string): boolean;
/** Single scoped feature (middleware, endpoint, one module) — not a full greenfield app. */
export declare function isFocusedFeatureGoal(goal: string): boolean;
/** Brand-new minimal scaffold — hardening gaps are backlog, not blockers. */
export declare function isScaffoldGoal(goal: string): boolean;
/**
 * Greenfield project creation — new repo/folder with initial files (Node, TS, hello-world, etc.).
 * Used for verification tolerance and loop act dispatch briefs.
 */
export declare function isGreenfieldGoal(goal: string): boolean;
/** Hardening-themed release blocker bullets that must not block minimal tasks. */
export declare const HARDENING_BLOCKER_PATTERNS: RegExp[];
//# sourceMappingURL=goal-scope.d.ts.map