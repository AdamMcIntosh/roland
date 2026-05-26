import { toCursorModelId } from '../dist/rco/model-routing.js';

// Cost-optimised routing strategy (2026-05):
//   Lead PM only  → grok-4.3     (orchestration brain)
//   All engineers → composer-2.5 (reasoning + execution + light lanes unified)
const cases = [
  // QA split
  ['test-author',       ''],   // should → composer-2.5  (engineer: 'author' heuristic)
  ['test-executor',     ''],   // should → composer-2.5  (execution default)
  // Reasoning-named roles — still composer-2.5 under new strategy
  ['architect',         ''],   // should → composer-2.5
  ['code-reviewer',     ''],   // should → composer-2.5  (reasoning: 'review')
  ['security-reviewer', ''],   // should → composer-2.5  (reasoning: 'security')
  // Execution lane
  ['executor',          ''],   // should → composer-2.5
  ['executor-high',     ''],   // should → composer-2.5
  // PM lane
  ['Lead-PM',           ''],   // should → grok-4.3
];

const EXPECTED = {
  'test-author':       'composer-2.5',
  'test-executor':     'composer-2.5',
  'architect':         'composer-2.5',
  'code-reviewer':     'composer-2.5',
  'security-reviewer': 'composer-2.5',
  'executor':          'composer-2.5',
  'executor-high':     'composer-2.5',
  'Lead-PM':           'grok-4.3',
};

let passed = 0, failed = 0;
for (const [name, model] of cases) {
  const got      = toCursorModelId(model, name);
  const expected = EXPECTED[name];
  const ok       = got === expected;
  if (ok) passed++; else failed++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(22)} → ${got}${ok ? '' : `  (expected ${expected})`}`);
}
console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
