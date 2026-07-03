/**
 * ## Roland Execution Reliability Fix
 *
 * Dispatches Cursor SDK agents for Pure ClosedLoop Plan/Act phases.
 * Previously lightweight act was a no-op stub — missions completed without creating files.
 */
import type { Blackboard } from '../rco/blackboard.js';
import type { CommandBlackboard } from '../rco/command-blackboard.js';
import { ModelRouter } from '../models/model-router.js';
import type { PhaseConfig } from './loop-phases.js';
import type { LoopState } from './loop-state.js';
export interface LoopAgentDispatchOptions {
    phase: 'plan' | 'act';
    iteration: number;
    goal: string;
    stateDir: string;
    blackboard: Blackboard;
    commandBoard?: CommandBlackboard;
    modelRouter?: ModelRouter;
    phaseConfig?: PhaseConfig;
    loopState?: LoopState;
    waveNumber?: number;
    isTestMode?: boolean;
    cwd?: string;
}
export interface LoopAgentDispatchResult {
    success: boolean;
    output: string;
    hadBlocker: boolean;
    summary: string;
    agentRole: string;
}
/** Execute a loop Plan or Act phase agent via Cursor SDK (Pure ClosedLoop). */
export declare function dispatchLoopPhaseAgent(opts: LoopAgentDispatchOptions): Promise<LoopAgentDispatchResult>;
/**
 * ## Roland Execution Now Reliable
 *
 * Act phase dispatches Cursor SDK agents and validates filesystem changes afterward.
 * Test commands:
 *   npx vitest run tests/unit/act-validation.test.ts
 *   npx vitest run tests/unit/loop-agent-dispatch.test.ts
 * Greenfield E2E (requires CURSOR_API_KEY):
 *   roland team "create minimal Node.js + TS project with hello-world.ts" --loop-template full-cycle-verified-loop
 */
//# sourceMappingURL=loop-agent-dispatch.d.ts.map