/**
 * Cursor SDK model routing for RCO agents.
 *
 * Delegates role resolution to RoleModelRouter (`src/models/role-model-router.ts`).
 * Legacy PM Team dispatch and agentWorker both call `toCursorModelId()` here.
 *
 * Resolution order:
 *  1. Valid Cursor model id from agent YAML
 *  2. RoleModelRouter role → configured model (cursor provider uses id directly)
 *  3. Keyword mapping for OpenRouter/Ollama model strings → Cursor SDK id
 */

import {
  DEFAULT_ENGINEER_MODEL,
  DEFAULT_PM_MODEL,
  VALID_CURSOR_MODELS,
  isValidCursorModel,
} from './cursor-models.js';
import { getRoleModelRouter, RoleModelRouter } from '../models/role-model-router.js';

export { VALID_CURSOR_MODELS, isValidCursorModel } from './cursor-models.js';
export { DEFAULT_PM_MODEL, DEFAULT_ENGINEER_MODEL } from './cursor-models.js';

/**
 * Resolve agent name + optional YAML model to a Cursor SDK model id.
 * Loop Engineering uses RoleModelRouter directly; this bridges legacy PM Team paths.
 */
export function toCursorModelId(model: string, agentName: string = ''): string {
  try {
    const dispatch = getRoleModelRouter().resolveDispatch(
      agentName ? RoleModelRouter.roleForAgent(agentName) : 'coding',
      { agentName, yamlModel: model, log: false },
    );
    if (dispatch.method === 'cursor_sdk') {
      return dispatch.sdkModelId ?? dispatch.model;
    }
    return dispatch.model;
  } catch {
    return toCursorModelIdLegacy(model, agentName);
  }
}

/** Legacy fallback when RoleModelRouter config is unavailable. */
function toCursorModelIdLegacy(model: string, agentName: string = ''): string {
  const m = model.toLowerCase().trim();
  const n = agentName.toLowerCase();
  const isPM = n.includes('pm') || n.includes('lead') || n.includes('manager');

  if (isPM) {
    const pmOverride = process.env.ROLAND_PM_MODEL?.trim();
    if (pmOverride && pmOverride !== 'auto' && isValidCursorModel(pmOverride)) return pmOverride;
    return DEFAULT_PM_MODEL;
  }

  const engOverride = process.env.ROLAND_ENGINEER_MODEL?.trim();
  if (engOverride && engOverride !== 'auto' && isValidCursorModel(engOverride)) return engOverride;

  if (VALID_CURSOR_MODELS.has(m)) return m;

  if (m.includes('grok')) return 'grok-4.3';
  if (m.includes('opus')) return 'claude-opus-4-7';
  if (m.includes('sonnet')) return 'claude-sonnet-4-6';
  if (m.includes('composer')) return DEFAULT_ENGINEER_MODEL;

  return DEFAULT_ENGINEER_MODEL;
}

/**
 * ## Final Legacy Cleanup + Model Router Integration Complete
 *
 * PM Team wave engine calls `toCursorModelId()` → RoleModelRouter.resolveSdkModelId().
 * Loop-template missions use RoleModelRouter.getModel() directly in ClosedLoop harness.
 */
export {};
