/**
 * ## P3 Release & Stabilization
 *
 * UTF-8 state persistence with ANSI sanitization for hot-path disk writes.
 */

import fs from 'fs';

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** Strip ANSI escape sequences before persisting agent/CLI output to disk. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

/** Normalize text for safe UTF-8 persistence. */
export function sanitizeForDisk(text: string): string {
  return stripAnsi(text).normalize('NFC');
}

/** Write UTF-8 text file with ANSI stripped. */
export function writeUtf8File(filePath: string, content: string): void {
  fs.writeFileSync(filePath, sanitizeForDisk(content), 'utf-8');
}

/** Write JSON as UTF-8 with stable formatting. */
export function writeUtf8Json(filePath: string, data: unknown): void {
  writeUtf8File(filePath, JSON.stringify(data, null, 2));
}

/** Append a UTF-8 line (e.g. JSONL) with sanitization. */
export function appendUtf8Line(filePath: string, line: string): void {
  fs.appendFileSync(filePath, sanitizeForDisk(line) + '\n', 'utf-8');
}
