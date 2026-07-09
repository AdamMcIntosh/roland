import { describe, it, expect } from 'vitest';
import { resolveAgentModel, SENIOR_AGENT_MODEL } from '../../src/rco/types.js';

describe('resolveAgentModel', () => {
  it('routes Senior role prompts to Kimi K2.7 Code', () => {
    expect(
      resolveAgentModel({
        role_prompt: 'Senior engineer for complex multi-file implementations',
        model: 'composer-2.5',
      }),
    ).toBe(SENIOR_AGENT_MODEL);
    expect(
      resolveAgentModel({
        role_prompt: 'You are a senior code reviewer. Review diffs.',
      }),
    ).toBe('kimi-k2.7-code');
  });

  it('uses explicit model when role prompt is not Senior', () => {
    expect(resolveAgentModel({ model: 'composer-2.5', role_prompt: 'Fast executor' })).toBe(
      'composer-2.5',
    );
    expect(resolveAgentModel({ claude_model: 'gpt-5-mini' })).toBe('gpt-5-mini');
  });
});
