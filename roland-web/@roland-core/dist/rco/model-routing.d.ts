/**
 * Cursor SDK model routing for RCO agents.
 *
 * Delegates role resolution to ModelRouter (`src/models/model-router.ts`).
 * Legacy PM Team dispatch and agentWorker both call `toCursorModelId()` here.
 *
 * Resolution order:
 *  1. Valid Cursor model id from agent YAML
 *  2. ModelRouter role → configured model (cursor provider uses id directly)
 *  3. Keyword mapping for OpenRouter/Ollama model strings → Cursor SDK id
 */
export { VALID_CURSOR_MODELS, isValidCursorModel } from './cursor-models.js';
export { DEFAULT_PM_MODEL, DEFAULT_ENGINEER_MODEL } from './cursor-models.js';
/**
 * Resolve agent name + optional YAML model to a Cursor SDK model id.
 * Loop Engineering uses ModelRouter directly; this bridges legacy PM Team paths.
 */
export declare function toCursorModelId(model: string, agentName?: string): string;
/**
 * ## Final Legacy Cleanup + Model Router Integration Complete
 *
 * PM Team wave engine calls `toCursorModelId()` → ModelRouter.resolveSdkModelId().
 * Loop-template missions use ModelRouter.getModel() directly in ClosedLoop harness.
 */
export {};
//# sourceMappingURL=model-routing.d.ts.map