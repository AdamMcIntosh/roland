/**
 * Phase 4 E2E: Simulate beta feedback (mock issue payloads).
 * Validates structure of mock GitHub issue / feedback data.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const MockIssueSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
});

const mockBetaIssues: unknown[] = [
  { title: '[Bug] Plugin crashes on long task', body: 'Steps: run recipe with 500 steps', labels: ['bug'] },
  { title: '[Feature] Add Gemini support', body: 'Would allow multi-model workflows', labels: ['enhancement'] },
  { title: '[Bug] Export fails on Windows path', labels: ['bug'] },
];

describe('E2E Phase 4: Beta feedback (mock issues)', () => {
  it('mock issues have valid structure', () => {
    for (const issue of mockBetaIssues) {
      const result = MockIssueSchema.safeParse(issue);
      expect(result.success, `Issue ${JSON.stringify(issue)} should parse`).toBe(true);
    }
  });

  it('at least one bug and one feature in mock set', () => {
    const labels = mockBetaIssues.flatMap((i) => (i as { labels?: string[] }).labels ?? []);
    expect(labels).toContain('bug');
    expect(labels).toContain('enhancement');
  });
});
