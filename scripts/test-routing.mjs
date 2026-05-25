import { toCursorModelId } from '../dist/rco/model-routing.js';

const cases = [
  // QA split (primary routing check)
  ['test-author',       ''],   // should → claude-sonnet-4-6  (reasoning: 'author')
  ['test-executor',     ''],   // should → composer-2.5       (execution default)
  // Reasoning lane
  ['architect',         ''],   // should → claude-sonnet-4-6
  ['code-reviewer',     ''],   // should → claude-sonnet-4-6  (reasoning: 'review')
  ['security-reviewer', ''],   // should → claude-sonnet-4-6  (reasoning: 'security')
  // Execution lane
  ['executor',          ''],   // should → composer-2.5
  ['executor-high',     ''],   // should → composer-2.5
  // PM lane
  ['Lead-PM',           ''],   // should → claude-opus-4-7
];

const EXPECTED = {
  'test-author':       'claude-sonnet-4-6',
  'test-executor':     'composer-2.5',
  'architect':         'claude-sonnet-4-6',
  'code-reviewer':     'claude-sonnet-4-6',
  'security-reviewer': 'claude-sonnet-4-6',
  'executor':          'composer-2.5',
  'executor-high':     'composer-2.5',
  'Lead-PM':           'claude-opus-4-7',
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
