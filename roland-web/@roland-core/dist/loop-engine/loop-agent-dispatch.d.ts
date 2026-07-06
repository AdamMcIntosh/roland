/**
 * ## Project Context & Agent Dispatch Fix
 *
 * Dispatches Cursor SDK agents for Pure ClosedLoop Plan/Act phases.
 * Includes role fallbacks when Sparrow / primary agents fail to respond.
 */
import type { Blackboard } from '../coordination/legacy-blackboard.js';
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
 * ## Project Context Switching and Agent Dispatch Fixed
 *
 * Act phase dispatches Cursor SDK agents with Sparrow/coding fallbacks and validates filesystem changes.
 * Test: npx vitest run tests/unit/loop-agent-dispatch.test.ts tests/integration/mcp-mission-project-context.test.ts
 */
//# sourceMappingURL=loop-agent-dispatch.d.ts.map