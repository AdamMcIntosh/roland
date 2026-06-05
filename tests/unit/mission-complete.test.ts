import { describe, expect, it } from 'vitest';
import {
  extractNextStepsSection,
  finalizeSynthesisOutput,
  formatMissionCompleteFooter,
} from '../../src/rco/mission-complete.js';

const ctx = {
  goal: 'Add health check endpoint',
  blockersEncountered: 0,
  wavesRun: 2,
  taskCount: 4,
};

describe('mission-complete', () => {
  it('extracts ## Next Steps and removes from body', () => {
    const input = `# Synthesis

## Executive Summary
Done.

## Next Steps

1. Run tests:
\`\`\`bash
npm run test:run
\`\`\`
2. Commit changes.

## Memory Extract
**Architecture Decisions:**
- none
`;

    const { body, nextSteps } = extractNextStepsSection(input);
    expect(body).not.toContain('## Next Steps');
    expect(body).toContain('## Memory Extract');
    expect(nextSteps).toContain('npm run test:run');
  });

  it('finalizeSynthesisOutput ends with Mission Complete footer', () => {
    const input = `## Summary\nAll green.\n\n## Next Steps\n\n1. Ship it.\n`;
    const out = finalizeSynthesisOutput(input, ctx);

    expect(out).toMatch(/### 🎖 Mission Complete/);
    expect(out).toContain('#### Next Steps');
    expect(out).toContain('1. Ship it.');
    expect(out).toContain('roland board-status --concise');
    expect(out.trimEnd().endsWith('```')).toBe(true);
    expect(out).not.toMatch(/\n## Next Steps\n/);
    expect(out).toContain('#### Next Steps');
  });

  it('formatMissionCompleteFooter includes blocker warning when blockers present', () => {
    const footer = formatMissionCompleteFooter({ ...ctx, blockersEncountered: 2 }, null);
    expect(footer).toContain('2 blocker(s)');
    expect(footer).toContain('🔴 Release Blockers');
  });

  it('strips duplicate Mission Complete before re-appending', () => {
    const input = `## Summary\nDone.\n\n---\n\n### 🎖 Mission Complete\n\nOld footer.\n\n## Next Steps\n\n1. New step.\n`;
    const out = finalizeSynthesisOutput(input, ctx);
    const matches = out.match(/### 🎖 Mission Complete/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(out).toContain('1. New step.');
  });
});
