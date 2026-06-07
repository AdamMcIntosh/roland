/**
 * Loop resilience — model degradation and rate-limit handling.
 */

import type { CritiqueModel } from './self-improvement/types.js';

const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /429/,
  /too many requests/i,
  /quota exceeded/i,
  /model.*unavailable/i,
  /overloaded/i,
  /capacity/i,
];

/** Detect API rate-limit or model-unavailable errors from agent output or errors. */
export function isRateLimitOrUnavailableError(message: string): boolean {
  if (!message) return false;
  return RATE_LIMIT_PATTERNS.some((re) => re.test(message));
}

/** Fallback model when primary lane is rate-limited. */
export function degradedCritiqueModel(current: CritiqueModel): CritiqueModel {
  return current === 'grok' ? 'composer' : 'grok';
}

export interface DegradationState {
  grokDegraded: boolean;
  composerDegraded: boolean;
  lastDegradedAt?: number;
  reason?: string;
}

export class ModelDegradationPolicy {
  private state: DegradationState = { grokDegraded: false, composerDegraded: false };

  recordFailure(model: CritiqueModel, errorMessage: string): CritiqueModel {
    if (!isRateLimitOrUnavailableError(errorMessage)) return model;

    if (model === 'grok') this.state.grokDegraded = true;
    else this.state.composerDegraded = true;
    this.state.lastDegradedAt = Date.now();
    this.state.reason = errorMessage.slice(0, 200);

    const fallback = degradedCritiqueModel(model);
    console.error(
      `[Loop][degrade] model=${model} unavailable — falling back to ${fallback}: ` +
        `"${this.state.reason}"`,
    );
    return fallback;
  }

  selectModel(preferred: CritiqueModel): CritiqueModel {
    if (preferred === 'grok' && this.state.grokDegraded) return 'composer';
    if (preferred === 'composer' && this.state.composerDegraded) return 'grok';
    return preferred;
  }

  getState(): DegradationState {
    return { ...this.state };
  }

  reset(): void {
    this.state = { grokDegraded: false, composerDegraded: false };
  }
}

/** Shared policy instance — persists degradation state across phases in one loop run. */
export const loopDegradationPolicy = new ModelDegradationPolicy();
