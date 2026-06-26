/**
 * Cursor SDK default dispatch + Loop Engineering readiness tests.
 *
 * Scoped: npm run test:run -- tests/unit/dispatch-readiness.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  ModelRouter,
  resetModelRouter,
  DEFAULT_MODELS_CONFIG,
} from '../../src/models/model-router.js';
import { clearLoopEngineConfigCache } from '../../src/loop-engine/loop-config.js';
import {
  runLoopReadinessCheck,
  formatLoopReadinessReport,
} from '../../src/loop-engine/loop-readiness.js';

describe('Cursor SDK default dispatch', () => {
  beforeEach(() => {
    resetModelRouter();
    clearLoopEngineConfigCache();
    delete process.env.CURSOR_API_KEY;
    delete process.env.ROLAND_DEFAULT_DISPATCH;
  });

  afterEach(() => {
    resetModelRouter();
    clearLoopEngineConfigCache();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('ROLAND_MODEL_') || key === 'ROLAND_DEFAULT_DISPATCH' || key === 'CURSOR_API_KEY') {
        delete process.env[key];
      }
    }
  });

  it('defaults to cursor_sdk dispatch when API key is set', () => {
    process.env.CURSOR_API_KEY = 'test-key';
    const router = new ModelRouter(DEFAULT_MODELS_CONFIG, 'cursor_sdk');
    const d = router.resolveDispatch('pm', { log: false });
    expect(d.method).toBe('cursor_sdk');
    expect(d.sdkModelId).toBeTruthy();
    expect(d.reason).toContain('cursor_sdk');
  });

  it('falls back to direct when CURSOR_API_KEY is missing', () => {
    const router = new ModelRouter(DEFAULT_MODELS_CONFIG, 'cursor_sdk');
    const d = router.resolveDispatch('coding', { log: false });
    expect(d.method).toBe('direct');
    expect(d.provider).toBe('openrouter');
    expect(d.reason).toContain('CURSOR_API_KEY');
  });

  it('forces direct when ROLAND_MODEL_CODING_PROVIDER=ollama', () => {
    process.env.CURSOR_API_KEY = 'test-key';
    process.env.ROLAND_MODEL_CODING_PROVIDER = 'ollama';
    process.env.ROLAND_MODEL_CODING = 'qwen3.5-coder:14b';
    const router = ModelRouter.fromConfig();
    const d = router.resolveDispatch('coding', { log: false });
    expect(d.method).toBe('direct');
    expect(d.provider).toBe('ollama');
  });

  it('respects per-role use_cursor_sdk: false', () => {
    process.env.CURSOR_API_KEY = 'test-key';
    const router = new ModelRouter({
      ...DEFAULT_MODELS_CONFIG,
      pm: {
        provider: 'openrouter',
        model: 'grok-4.3',
        use_cursor_sdk: false,
      },
    });
    const d = router.resolveDispatch('pm', { log: false });
    expect(d.method).toBe('direct');
    expect(d.reason).toContain('use_cursor_sdk=false');
  });

  it('opens SDK circuit on recordSdkFailure and switches to direct', () => {
    process.env.CURSOR_API_KEY = 'test-key';
    const router = new ModelRouter(DEFAULT_MODELS_CONFIG, 'cursor_sdk');
    const before = router.resolveDispatch('critic', { log: false });
    expect(before.method).toBe('cursor_sdk');

    router.recordSdkFailure('critic', '401 unauthorized — invalid API key');
    const after = router.resolveDispatch('critic', { log: false });
    expect(after.method).toBe('direct');
    expect(router.getSdkDisabledRoles().has('critic')).toBe(true);
  });

  it('recordSdkFailure chains provider fallback on rate limits', () => {
    process.env.CURSOR_API_KEY = 'test-key';
    const router = new ModelRouter({
      critic: {
        provider: 'openrouter',
        model: 'deepseek/deepseek-chat',
        fallback: { provider: 'openrouter', model: 'minimax/minimax-m2.5' },
      },
    });
    router.recordSdkFailure('critic', '429 rate limit exceeded');
    const d = router.resolveDispatch('critic', { log: false });
    expect(d.method).toBe('direct');
    expect(d.isFallback).toBe(true);
    expect(d.model).toBe('minimax/minimax-m2.5');
  });

  it('validateOnStartup includes dispatch warnings when SDK key missing', () => {
    const router = new ModelRouter(DEFAULT_MODELS_CONFIG, 'cursor_sdk');
    const v = ModelRouter.validateOnStartup(router);
    expect(v.defaultDispatch).toBe('cursor_sdk');
    expect(v.cursorSdkAvailable).toBe(false);
    expect(v.dispatchWarnings.some((w) => w.includes('CURSOR_API_KEY'))).toBe(true);
  });

  it('serializeRoutingForState includes dispatchMethod per role', () => {
    process.env.CURSOR_API_KEY = 'test-key';
    const router = new ModelRouter(DEFAULT_MODELS_CONFIG, 'cursor_sdk');
    const snap = router.serializeRoutingForState();
    expect(snap.defaultDispatch).toBe('cursor_sdk');
    expect(snap.cursorSdkAvailable).toBe(true);
    expect(snap.roles.pm?.dispatchMethod).toBe('cursor_sdk');
    expect(snap.phaseDispatch.plan).toBe('cursor_sdk');
  });

  it('global default_dispatch direct disables SDK', () => {
    process.env.CURSOR_API_KEY = 'test-key';
    const router = new ModelRouter(DEFAULT_MODELS_CONFIG, 'direct');
    const d = router.resolveDispatch('pm', { log: false });
    expect(d.method).toBe('direct');
    expect(d.reason).toContain('default_dispatch=direct');
  });
});

describe('Loop readiness check', () => {
  beforeEach(() => {
    resetModelRouter();
    clearLoopEngineConfigCache();
  });

  afterEach(() => {
    resetModelRouter();
    clearLoopEngineConfigCache();
  });

  it('returns ready with default config (warnings allowed)', () => {
    const report = runLoopReadinessCheck();
    expect(report.checks.length).toBeGreaterThan(5);
    expect(report.validation.ok).toBe(true);
    expect(formatLoopReadinessReport(report)).toContain('Readiness');
  });

  it('respects ROLAND_DEFAULT_DISPATCH env override', () => {
    process.env.ROLAND_DEFAULT_DISPATCH = 'direct';
    clearLoopEngineConfigCache();
    const report = runLoopReadinessCheck();
    expect(report.validation.defaultDispatch).toBe('direct');
  });
});
