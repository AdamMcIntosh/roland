/**
 * Spec progress unit tests — markdown task list parsing and completion gates.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  parseMarkdownTaskList,
  computeSpecProgress,
  createSpecCompletionCriterion,
  formatSpecProgressSummary,
} from '../../src/loop-engine/spec-progress.js';

describe('spec-progress', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-spec-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses markdown task list items', () => {
    const md = [
      '# Checklist',
      '- [ ] First item',
      '- [x] Done item',
      '- [X] Also done',
      '- regular bullet',
      '* [ ] Star bullet',
    ].join('\n');

    const items = parseMarkdownTaskList(md);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ text: 'First item', complete: false });
    expect(items[1]).toMatchObject({ text: 'Done item', complete: true });
    expect(items[2]).toMatchObject({ text: 'Also done', complete: true });
    expect(items[3]).toMatchObject({ text: 'Star bullet', complete: false });
  });

  it('computes progress from spec file on disk', () => {
    const specPath = path.join(tmpDir, 'spec.md');
    fs.writeFileSync(
      specPath,
      '- [x] A\n- [ ] B\n- [ ] C\n',
      'utf-8',
    );

    const progress = computeSpecProgress(specPath);
    expect(progress).not.toBeNull();
    expect(progress!.total).toBe(3);
    expect(progress!.completed).toBe(1);
    expect(progress!.percentComplete).toBeCloseTo(33.3, 0);
    expect(progress!.allComplete).toBe(false);
  });

  it('spec completion criterion passes when all items checked', async () => {
    const specPath = path.join(tmpDir, 'done.md');
    fs.writeFileSync(specPath, '- [x] One\n- [x] Two\n', 'utf-8');

    const criterion = createSpecCompletionCriterion(specPath);
    const result = await criterion.evaluate({ goal: 'test', iteration: 1 });
    expect(result.pass).toBe(true);
    expect(result.message).toContain('2 spec/checklist items complete');
  });

  it('spec completion criterion fails with incomplete items', async () => {
    const specPath = path.join(tmpDir, 'open.md');
    fs.writeFileSync(specPath, '- [x] One\n- [ ] Two\n', 'utf-8');

    const criterion = createSpecCompletionCriterion(specPath);
    const result = await criterion.evaluate({ goal: 'test', iteration: 1 });
    expect(result.pass).toBe(false);
    expect(result.message).toContain('1/2 spec items complete');
  });

  it('formats progress summary with pending items', () => {
    const summary = formatSpecProgressSummary({
      specPath: 'spec.md',
      total: 2,
      completed: 1,
      percentComplete: 50,
      items: [
        { line: 1, text: 'Done', complete: true },
        { line: 2, text: 'Pending task', complete: false },
      ],
      allComplete: false,
      updatedAt: Date.now(),
    });
    expect(summary).toContain('50%');
    expect(summary).toContain('Pending task');
  });
});
