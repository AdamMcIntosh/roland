/**
 * RCO Recipe Orchestrator — legacy YAML workflow runner (child_process.fork).
 *
 * Walks recipe workflow steps, forks agentWorker.ts for each agent, persists
 * state via stateLock, and returns synthesized output. Team mode uses
 * team-orchestrator.ts instead; this module remains for recipes/QA/tests.
 */
import type { RcoState, WorkerInput, WorkerOutput } from './types.js';
export type RunWorkerFn = (workerPath: string, input: WorkerInput) => Promise<WorkerOutput>;
export interface RunOrchestratorOptions {
    recipeName: string;
    task: string;
    configPath: string;
    agentsDir: string;
    recipesDir: string;
    stateFilePath?: string;
    runWorker?: RunWorkerFn;
    workerRetries?: number;
    workerTimeoutMs?: number;
    executionMode?: string;
}
export interface RunOrchestratorResult {
    success: boolean;
    state: RcoState;
    synthesizedOutput: string;
}
export declare function runOrchestrator(opts: RunOrchestratorOptions): Promise<RunOrchestratorResult>;
//# sourceMappingURL=orchestrator.d.ts.map