/**
 * ## Assumptions
 * - Escalate phase runs when critique/retry sets shouldEscalate or retry budget is exhausted.
 * - HITL queue is notified via blackboard decision entries (orchestrator drains these).
 * - Escalation is terminal for the current loop iteration unless operator resumes via checkpoint.
 */
import type { PhaseHandler, PhaseHandlerContext, PhaseResult } from './types.js';
export declare class EscalatePhaseHandler implements PhaseHandler {
    readonly phase: "escalate";
    execute(ctx: PhaseHandlerContext): Promise<PhaseResult>;
}
/**
 * ## Component Complete
 * EscalatePhaseHandler surfaces structured HITL context when automated retry/critique cannot resolve the loop.
 */
//# sourceMappingURL=escalate-phase.d.ts.map