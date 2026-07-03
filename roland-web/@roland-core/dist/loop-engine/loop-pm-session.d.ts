/**
 * Loop PM session persistence — shared by lightweight Plan/Act and [DEPRECATED] legacy PM bridge.
 * `executionPath: 'pm_team'` indicates the deprecated LeadPM / team-orchestrator path.
 */
import type { TeamPlan, TeamTaskResult } from '../rco/team-orchestrator.js';
export declare const LOOP_PM_SESSION_FILE = "loop-pm-session.json";
export type LoopPmExecutionPath = 'pm_team' | 'lightweight';
export interface LoopPmSession {
    iteration: number;
    templateId: string;
    executionPath: LoopPmExecutionPath;
    routingReason: string;
    plan?: TeamPlan;
    wavesRun: number;
    blockersEncountered: number;
    taskResults: Record<string, TeamTaskResult>;
    updatedAt: number;
}
export declare function readLoopPmSession(stateDir: string): LoopPmSession | null;
export declare function writeLoopPmSession(stateDir: string, session: LoopPmSession): void;
//# sourceMappingURL=loop-pm-session.d.ts.map