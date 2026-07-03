/**
 * Loop checkpointing — save state before each major phase for crash recovery.
 *
 * Persists `.roland/loop-checkpoint.json` (full LoopState snapshot + metadata).
 */
import type { Phase } from './loop-phases.js';
import type { LoopState } from './loop-state.js';
export declare const LOOP_CHECKPOINT_FILE = "loop-checkpoint.json";
export interface LoopCheckpoint {
    savedAt: number;
    phase: Phase;
    iteration: number;
    state: LoopState;
    supervisorRestart?: boolean;
}
/** Save a checkpoint before entering a phase. */
export declare function saveLoopCheckpoint(stateDir: string, phase: Phase, state: LoopState, opts?: {
    supervisorRestart?: boolean;
}): void;
export declare function readLoopCheckpoint(stateDir: string): LoopCheckpoint | null;
export declare function clearLoopCheckpoint(stateDir: string): void;
/**
 * Attempt recovery from checkpoint or loop-state.json after supervisor restart.
 * Returns restored state when a resumable snapshot exists.
 */
export declare function tryRecoverLoopState(stateDir: string): {
    recovered: boolean;
    state: LoopState | null;
    source: 'checkpoint' | 'loop-state' | null;
    phase?: Phase;
};
//# sourceMappingURL=loop-checkpoint.d.ts.map