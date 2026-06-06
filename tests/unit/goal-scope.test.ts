import { describe, expect, it } from 'vitest';
import {
  isFocusedFeatureGoal,
  isScaffoldGoal,
  requestsProductionHardening,
} from '../../src/rco/goal-scope.js';

describe('goal-scope phase 2', () => {
  it('treats pino middleware goal as focused feature, not blanket hardening', () => {
    const goal = 'Add structured request logging middleware using pino to the woody Express server';
    expect(isFocusedFeatureGoal(goal)).toBe(true);
    expect(requestsProductionHardening(goal)).toBe(false);
    expect(isScaffoldGoal(goal)).toBe(false);
  });

  it('treats minimal scaffold as scaffold not hardening mandate', () => {
    const goal = 'Scaffold a basic minimal new Express API server';
    expect(isScaffoldGoal(goal)).toBe(true);
    expect(requestsProductionHardening(goal)).toBe(false);
  });

  it('still flags explicit production hardening requests', () => {
    expect(requestsProductionHardening('Make the API production-ready with full hardening')).toBe(true);
  });
});
