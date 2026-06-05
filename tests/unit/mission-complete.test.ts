import { describe, expect, it } from 'vitest';
import {
  extractNextStepsSection,
  finalizeSynthesisOutput,
  formatMissionCompleteFooter,
  stripMissionCompleteFooter,
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
    expect(out.indexOf('### 🎖 Mission Complete')).toBeGreaterThan(out.indexOf('## Summary'));
  });

  it('preserves Memory Extract and Knowledge Update before the footer', () => {
    const input = `# Synthesis

## Memory Extract
**Architecture Decisions:**
- Added CORS middleware

## Knowledge Update
**DECISIONS.md:**
- Allow localhost:3000

## Next Steps

1. Run \`npm run test:run\`.
`;

    const out = finalizeSynthesisOutput(input, ctx);
    const footerIdx = out.indexOf('### 🎖 Mission Complete');

    expect(out).toContain('## Memory Extract');
    expect(out).toContain('Added CORS middleware');
    expect(out).toContain('## Knowledge Update');
    expect(out).toContain('localhost:3000');
    expect(footerIdx).toBeGreaterThan(out.indexOf('## Memory Extract'));
    expect(out.slice(footerIdx)).toContain('#### Next Steps');
    expect(out.slice(footerIdx)).toContain('npm run test:run');
    expect(out.trimEnd().endsWith('```')).toBe(true);
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
    expect(out).not.toContain('Old footer.');
  });

  it('strips Mission Complete footer without --- separator', () => {
    const input = `## Summary\nDone.\n\n### 🎖 Mission Complete\n\nPM wrote this anyway.\n\n## Next Steps\n\n1. Real step.\n`;
    const stripped = stripMissionCompleteFooter(input);
    expect(stripped).not.toContain('PM wrote this anyway');
    const out = finalizeSynthesisOutput(input, ctx);
    expect(out.match(/### 🎖 Mission Complete/g)?.length).toBe(1);
    expect(out).toContain('1. Real step.');
  });
});
