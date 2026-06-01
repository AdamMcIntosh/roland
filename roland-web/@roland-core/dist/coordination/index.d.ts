/**
 * Coordination substrate (Phase 1) — public facade.
 *
 * A single object the MCP server holds, exposing the two shared-awareness
 * primitives. Mirrors how the server already holds AdvancedCostTracker,
 * RecipeSessionManager, etc. Pass `dir` to scope state somewhere other than the
 * resolved project .roland/ directory (used by tests).
 */
import { Blackboard } from './blackboard.js';
import { MessageBus } from './message-bus.js';
export declare class CoordinationManager {
    readonly blackboard: Blackboard;
    readonly bus: MessageBus;
    constructor(opts?: {
        dir?: string;
    });
}
export { Blackboard } from './blackboard.js';
export { MessageBus } from './message-bus.js';
export * from './types.js';
export { blackboardFile, busFile, coordDir, projectRoot } from './paths.js';
//# sourceMappingURL=index.d.ts.map