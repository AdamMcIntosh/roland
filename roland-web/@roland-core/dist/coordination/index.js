/**
 * Coordination substrate (Phase 1) — public facade.
 *
 * A single object the MCP server holds, exposing the two shared-awareness
 * primitives. Mirrors how the server already holds AdvancedCostTracker,
 * RecipeSessionManager, etc. Pass `dir` to scope state somewhere other than the
 * resolved project .roland/ directory (used by tests).
 */
import path from 'path';
import { Blackboard } from './blackboard.js';
import { MessageBus } from './message-bus.js';
import { blackboardFile, busFile } from './paths.js';
export class CoordinationManager {
    blackboard;
    bus;
    constructor(opts) {
        const dir = opts?.dir;
        this.blackboard = new Blackboard(dir ? path.join(dir, 'blackboard.json') : blackboardFile());
        this.bus = new MessageBus(dir ? path.join(dir, 'bus.json') : busFile());
    }
}
export { Blackboard } from './blackboard.js';
export { MessageBus } from './message-bus.js';
export * from './types.js';
export { blackboardFile, busFile, coordDir, projectRoot } from './paths.js';
//# sourceMappingURL=index.js.map