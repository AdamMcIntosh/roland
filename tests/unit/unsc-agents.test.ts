import { describe, it, expect } from 'vitest';
import {
  loadUnscAgents,
  toSdkAgentDefinitions,
  legacyAgentToCallsign,
} from '../../src/rco/unsc-agents.js';

describe('unsc-agents', () => {
  it('loadUnscAgents loads all six callsigns', () => {
    const map = loadUnscAgents();
    expect(map.size).toBeGreaterThanOrEqual(6);
    expect(map.has('sparrow')).toBe(true);
    expect(map.has('vanguard')).toBe(true);
  });

  it('toSdkAgentDefinitions includes handoff protocol in prompts', () => {
    const defs = toSdkAgentDefinitions(loadUnscAgents());
    expect(Object.keys(defs).length).toBeGreaterThanOrEqual(6);

    for (const def of Object.values(defs)) {
      expect(def.prompt).toContain('## Command Discipline');
      expect(def.prompt).toContain('## Handoff Protocol');
      expect(def.prompt).toContain('BLOCKER');
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it('legacyAgentToCallsign maps roster names to UNSC callsigns', () => {
    expect(legacyAgentToCallsign('executor')).toBe('sparrow');
    expect(legacyAgentToCallsign('test-author')).toBe('vanguard');
    expect(legacyAgentToCallsign('code-reviewer')).toBe('sentinel');
    expect(legacyAgentToCallsign('architect')).toBe('oracle');
  });
});
