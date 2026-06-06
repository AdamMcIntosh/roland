import { describe, expect, it } from 'vitest';
import {
  compactSynthesisBody,
  extractNextStepsSection,
  finalizeSynthesisOutput,
  formatMissionCompleteFooter,
  sanitizeReleaseBlockersForMinimalGoal,
  stripMissionCompleteFooter,
} from '../../src/rco/mission-complete.js';

const ctx = {
  goal: 'Add health check endpoint',
  blockersEncountered: 0,
  wavesRun: 2,
  taskCount: 4,
};

const minimalCtx = {
  goal: "Add a simple comment '// TODO: implement auth' at the top of src/index.js",
  blockersEncountered: 0,
  wavesRun: 1,
  taskCount: 1,
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

  it('finalizeSynthesisOutput ends with Mission Complete footer as last section', () => {
    const input = `## Summary\nAll green.\n\n## Next Steps\n\n1. Ship it.\n`;
    const out = finalizeSynthesisOutput(input, ctx);

    expect(out).toMatch(/### 🎖 Mission Complete/);
    expect(out).toContain('#### Next Steps');
    expect(out).toContain('1. Ship it.');
    expect(out).toContain('roland board-status --concise');
    expect(out.trimEnd().endsWith('```')).toBe(true);
    expect(out).not.toMatch(/\n## Next Steps\n/);
    expect(out.indexOf('### 🎖 Mission Complete')).toBeGreaterThan(out.indexOf('## Summary'));
    expect(out).not.toMatch(/### 🎖 Mission Complete[\s\S]*### 🎖 Mission Complete/);
  });

  it('strips Memory Extract from displayed synthesis (already persisted)', () => {
    const input = `## Executive Summary\nDone.\n\n## Memory Extract\n**Architecture Decisions:**\n- x\n\n## Next Steps\n\n1. Ship.\n`;
    const out = finalizeSynthesisOutput(input, ctx);
    expect(out).not.toContain('## Memory Extract');
    expect(out).toContain('### 🎖 Mission Complete');
  });

  it('uses compact footer for minimal goals', () => {
    const input = `## Executive Summary\nAdded comment.\n\n## Next Steps\n\n1. Commit.\n`;
    const out = finalizeSynthesisOutput(input, minimalCtx);

    expect(out).toContain('### 🎖 Mission Complete');
    expect(out).toContain('**Done.**');
    expect(out).not.toContain('#### Battlespace Status');
    expect(out).not.toContain('#### Suggested Follow-Up Commands');
    expect(out.trimEnd()).toMatch(/1\. Commit\.\s*$/);
  });

  it('removes hardening false blockers for minimal goals', () => {
    const input = `### 🔴 Release Blockers
1. Missing structured logging (ILogger) in src/index.js
2. Comment not added to src/index.js
`;
    const sanitized = sanitizeReleaseBlockersForMinimalGoal(input);
    expect(sanitized).not.toContain('structured logging');
    expect(sanitized).toContain('src/index.js');
  });

  it('compactSynthesisBody strips verbose sections', () => {
    const input = `## Executive Summary\nDone.

## Pre-Synthesis Assessment
✅ lots of checklist noise

## Deployment Checklist
- [ ] deploy

## What Was Produced
- src/index.js

## Risk Register
| Risk | L | I | M |
`;
    const out = compactSynthesisBody(input, minimalCtx.goal);
    expect(out).toContain('Executive Summary');
    expect(out).toContain('What Was Produced');
    expect(out).not.toContain('Pre-Synthesis Assessment');
    expect(out).not.toContain('Deployment Checklist');
    expect(out).not.toContain('Risk Register');
  });

  it('preserves Knowledge Update stripping before the footer', () => {
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

    expect(out).not.toContain('## Memory Extract');
    expect(out).not.toContain('## Knowledge Update');
    expect(footerIdx).toBeGreaterThan(0);
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

  it('drops trailing PM content after Mission Complete footer', () => {
    const input = `## Summary\nDone.\n\n## Next Steps\n\n1. Ship.\n\n---\n\n### 🎖 Mission Complete\n\nStale footer.\n\nExtra trailing paragraph the PM should not write.\n`;
    const out = finalizeSynthesisOutput(input, ctx);
    expect(out).not.toContain('Extra trailing paragraph');
    expect(out).not.toContain('Stale footer');
  });
});
