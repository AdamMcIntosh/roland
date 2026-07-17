/**
 * ## Final Audit Cleanup (v1.4.0)
 *
 * RoleModelRouter — role-based routing for Loop Engineering.
 *
 * Scoped run: npx vitest run tests/unit/role-model-router.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RoleModelRouter,
  resetRoleModelRouter,
  loadModelsConfigFromYaml,
  DEFAULT_MODELS_CONFIG,
} from '../../src/models/role-model-router.js';

describe('RoleModelRouter', () => {
  beforeEach(() => {
    resetRoleModelRouter();
  });

  afterEach(() => {
    resetRoleModelRouter();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('ROLAND_MODEL_')) delete process.env[key];
    }
  });

  it('resolves default models for core roles', () => {
    const router = RoleModelRouter.fromConfig();
    const pm = router.getModel('pm');
    expect(pm.provider).toBe('cursor');
    expect(pm.model).toBe('grok-4.5');
    expect(pm.displayLabel).toBe('grok-4.5@cursor');

    const coding = router.getModel('coding');
    expect(coding.model).toBe('qwen/qwen3-coder-next');

    const critic = router.getModel('critic');
    expect(critic.model).toBe('deepseek/deepseek-chat');
  });

  it('normalizes agent names and legacy lane aliases to roles', () => {
    expect(RoleModelRouter.normalizeRole('lead-pm')).toBe('pm');
    expect(RoleModelRouter.normalizeRole('test-executor')).toBe('verifier');
    expect(RoleModelRouter.normalizeRole('grok')).toBe('critic');
    expect(RoleModelRouter.normalizeRole('composer')).toBe('coding');
    expect(RoleModelRouter.roleForPhase('critique')).toBe('critic');
    expect(RoleModelRouter.roleForAgent('sparrow')).toBe('coding');
  });

  it('falls back to secondary model on rate-limit errors', () => {
    const router = new RoleModelRouter({
      critic: {
        provider: 'openrouter',
        model: 'deepseek/deepseek-chat',
        fallback: { provider: 'openrouter', model: 'minimax/minimax-m2.5' },
      },
    });

    const primary = router.getModel('critic');
    expect(primary.isFallback).toBe(false);
    expect(primary.model).toBe('deepseek/deepseek-chat');

    const afterFail = router.recordFailure('critic', '429 rate limit exceeded');
    expect(afterFail.isFallback).toBe(true);
    expect(afterFail.model).toBe('minimax/minimax-m2.5');
  });

  it('does not fallback on non-rate-limit errors', () => {
    const router = new RoleModelRouter({
      coding: {
        provider: 'openrouter',
        model: 'qwen/qwen3-coder-next',
        fallback: { provider: 'openrouter', model: 'deepseek/deepseek-v3-0324' },
      },
    });

    const result = router.recordFailure('coding', 'syntax error in generated code');
    expect(result.isFallback).toBe(false);
    expect(result.model).toBe('qwen/qwen3-coder-next');
  });

  it('applies env var overrides per role', () => {
    process.env.ROLAND_MODEL_CODING = 'qwen3.5-coder:14b';
    process.env.ROLAND_MODEL_CODING_PROVIDER = 'ollama';

    const router = RoleModelRouter.fromConfig();
    const coding = router.getModel('coding');
    expect(coding.provider).toBe('ollama');
    expect(coding.model).toBe('qwen3.5-coder:14b');
    expect(coding.displayLabel).toBe('qwen3.5-coder:14b@ollama');
  });

  it('loads models section from YAML config', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-models-yaml-'));
    const configPath = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(
      configPath,
      `
models:
  pm:
    provider: ollama
    model: llama3.2:latest
  coding:
    provider: ollama
    model: qwen3.5-coder:14b
routing:
  simple: [deepseek/deepseek-v3-0324]
  medium: [qwen/qwen3-coder-next]
  complex: [minimax/minimax-m2.5]
  explain: [deepseek/deepseek-v3-0324]
roland:
  mcp_defaults:
    temperature: 0.7
    max_tokens: 2000
`,
      'utf-8',
    );

    const config = loadModelsConfigFromYaml(configPath);
    expect(config.pm?.provider).toBe('ollama');
    expect(config.pm?.model).toBe('llama3.2:latest');
    expect(config.coding?.model).toBe('qwen3.5-coder:14b');

    const router = new RoleModelRouter(config);
    expect(router.getModel('pm').displayLabel).toBe('llama3.2:latest@ollama');
    expect(router.getModel('coding').displayLabel).toBe('qwen3.5-coder:14b@ollama');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('backward compat: derives cursor roles from pm section when models absent', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-models-pm-'));
    const configPath = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(
      configPath,
      `
pm:
  lead_model: gpt-5.4-nano
  standard_model: composer-2.5
routing:
  simple: [deepseek/deepseek-v3-0324]
  medium: [qwen/qwen3-coder-next]
  complex: [minimax/minimax-m2.5]
  explain: [deepseek/deepseek-v3-0324]
roland:
  mcp_defaults:
    temperature: 0.7
    max_tokens: 2000
`,
      'utf-8',
    );

    const config = loadModelsConfigFromYaml(configPath);
    expect(config.pm?.provider).toBe('cursor');
    expect(config.pm?.model).toBe('gpt-5.4-nano');
    expect(config.coding?.provider).toBe('cursor');
    expect(config.coding?.model).toBe('composer-2.5');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getModelWithFallback returns primary + fallback chain', () => {
    const router = new RoleModelRouter({
      critic: {
        provider: 'openrouter',
        model: 'deepseek/deepseek-chat',
        fallback: { provider: 'openrouter', model: 'minimax/minimax-m2.5' },
      },
    });
    const chain = router.getModelWithFallback('critic');
    expect(chain.primary.model).toBe('deepseek/deepseek-chat');
    expect(chain.fallback?.model).toBe('minimax/minimax-m2.5');
    expect(chain.chain.length).toBe(2);
    expect(chain.active.model).toBe('deepseek/deepseek-chat');
  });

  it('validateOnStartup passes when required roles resolve', () => {
    const result = RoleModelRouter.validateOnStartup(new RoleModelRouter(DEFAULT_MODELS_CONFIG));
    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.dispatchWarnings).toBeDefined();
    expect(result.defaultDispatch).toBeTruthy();
  });

  it('formatRoutingSummary includes primary roles', () => {
    const router = new RoleModelRouter(DEFAULT_MODELS_CONFIG);
    const summary = router.formatRoutingSummary();
    expect(summary).toContain('pm=');
    expect(summary).toContain('coding=');
    expect(summary).toContain('critic=');
  });

  it('formatStartupBanner includes template and core roles', () => {
    const router = new RoleModelRouter(DEFAULT_MODELS_CONFIG);
    const lines = router.formatStartupBanner('closed-loop-harness', 'Pure ClosedLoop (default)');
    const joined = lines.join('\n');
    expect(joined).toContain('closed-loop-harness');
    expect(joined).toContain('Pure ClosedLoop');
    expect(joined).toContain('pm');
    expect(joined).toContain('coding');
    expect(joined).toContain('Dispatch:');
    expect(joined).toContain('╔');
  });

  it('formatLoopRunConfigSummary includes PM mode and routing', () => {
    const router = new RoleModelRouter(DEFAULT_MODELS_CONFIG);
    const lines = router.formatLoopRunConfigSummary({
      templateId: 'closed-loop-harness',
      pmEnabled: false,
      pmReason: 'no PM Team opt-in — pure ClosedLoop',
      usePmTeam: false,
    });
    const joined = lines.join('\n');
    expect(joined).toContain('Mission Config');
    expect(joined).toContain('Pure ClosedLoop');
    expect(joined).toContain('use_pm_team: false');
    expect(joined).toContain('pm=');
  });

  it('serializeRoutingForState includes phase models and dispatch', () => {
    process.env.CURSOR_API_KEY = 'test-key';
    const router = new RoleModelRouter(DEFAULT_MODELS_CONFIG, 'cursor_sdk');
    const snap = router.serializeRoutingForState();
    expect(snap.summary).toContain('pm=');
    expect(snap.phaseModels.plan).toBeTruthy();
    expect(snap.phaseDispatch.plan).toBe('cursor_sdk');
    delete process.env.CURSOR_API_KEY;
  });

  it('resolveSdkModelId maps roles to Cursor SDK ids', () => {
    const router = new RoleModelRouter({
      pm: { provider: 'cursor', model: 'gpt-5.4-nano' },
      coding: { provider: 'cursor', model: 'composer-2.5' },
    });
    expect(router.resolveSdkModelId('lead-pm')).toBe('gpt-5.4-nano');
    expect(router.resolveSdkModelId('executor')).toBe('composer-2.5');
  });

  it('resolveSdkModelId maps OpenRouter pm model to Cursor SDK', () => {
    const router = new RoleModelRouter(DEFAULT_MODELS_CONFIG);
    const sdk = router.resolveSdkModelId('lead-pm');
    expect(typeof sdk).toBe('string');
    expect(sdk.length).toBeGreaterThan(0);
  });
});
