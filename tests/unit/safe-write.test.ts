import { describe, it, expect } from 'vitest';
import { stripAnsi, sanitizeForDisk, writeUtf8File } from '../../src/utils/safe-write.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('safe-write', () => {
  it('stripAnsi removes escape codes', () => {
    expect(stripAnsi('\x1b[32mgreen\x1b[0m')).toBe('green');
  });

  it('sanitizeForDisk normalizes and strips ANSI', () => {
    expect(sanitizeForDisk('\x1b[1mbold\x1b[0m')).toBe('bold');
  });

  it('writeUtf8File persists sanitized content', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-safe-write-'));
    const file = path.join(dir, 'out.txt');
    writeUtf8File(file, '\x1b[31mhello\x1b[0m');
    expect(fs.readFileSync(file, 'utf-8')).toBe('hello');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
