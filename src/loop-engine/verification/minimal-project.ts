/**
 * ## Evaluation Gate & Blocker Fix
 *
 * Helpers for minimal / greenfield projects that lack npm test scripts or
 * placeholder test harnesses. Used by TestExecutor to soft-skip instead of
 * hard-failing the unit verification gate.
 */

import fs from 'fs';
import path from 'path';

const NO_TEST_PATTERNS = [
  /missing script:\s*["']?test["']?/i,
  /\bno test specified\b/i,
  /lifecycle script [`'"]test[`'"] failed/i,
  /npm ERR!.*test/i,
  /Error: no test specified/i,
];

/** True when package.json exists but has no `scripts.test` entry. */
export function lacksNpmTestScript(cwd: string): boolean {
  const pkgPath = path.join(cwd, 'package.json');
  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    const testScript = pkg.scripts?.test?.trim();
    return !testScript;
  } catch {
    return false;
  }
}

/** True when runner output indicates npm had no test script to run. */
export function isNoTestSpecifiedOutput(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`;
  return NO_TEST_PATTERNS.some((re) => re.test(combined));
}

/** Unit strategy types that may soft-skip on missing tests in minimal projects. */
export function shouldSoftSkipMissingTests(strategyType: string): boolean {
  return strategyType === 'unit' || strategyType === 'smoke';
}
