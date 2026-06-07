import { toCursorModelId } from '../dist/rco/model-routing.js';
import { DEFAULT_PM_MODEL, DEFAULT_ENGINEER_MODEL } from '../dist/rco/cursor-models.js';

const savedPm = process.env.ROLAND_PM_MODEL;
const savedEng = process.env.ROLAND_ENGINEER_MODEL;
delete process.env.ROLAND_PM_MODEL;
delete process.env.ROLAND_ENGINEER_MODEL;

const cases = [
  // QA split — engineer defaults
  ['test-author',       '',   DEFAULT_ENGINEER_MODEL],
  ['test-executor',     '',   DEFAULT_ENGINEER_MODEL],
  // Reasoning-named roles
  ['architect',         '',   DEFAULT_ENGINEER_MODEL],
  ['code-reviewer',     '',   DEFAULT_ENGINEER_MODEL],
  ['security-reviewer', '',   DEFAULT_ENGINEER_MODEL],
  // Execution lane
  ['executor',          '',   DEFAULT_ENGINEER_MODEL],
  ['executor-high',     '',   DEFAULT_ENGINEER_MODEL],
  // PM lane — matches /api/models defaults.pm
  ['Lead-PM',           '',   DEFAULT_PM_MODEL],
  // Explicit dashboard catalog IDs pass through for engineers
  ['executor',          'claude-sonnet-4-6', 'claude-sonnet-4-6'],
  ['executor',          'gpt-5.2',           'gpt-5.2'],
  ['executor',          'gemini-2.5-pro',    'gemini-2.5-pro'],
  // Legacy YAML strings remap to canonical catalog IDs
  ['architect',         'claude-sonnet-4-6-high', 'claude-sonnet-4-6'],
  ['executor',          'openrouter/deepseek/deepseek-v3', DEFAULT_ENGINEER_MODEL],
];

let passed = 0;
let failed = 0;

function check(name, model, expected, label = '') {
  const got = toCursorModelId(model, name);
  const ok = got === expected;
  if (ok) passed++; else failed++;
  const tag = label ? ` [${label}]` : '';
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(22)} → ${got}${tag}${ok ? '' : `  (expected ${expected})`}`);
}

for (const [name, model, expected] of cases) {
  check(name, model, expected);
}

// Dashboard env overrides (ROLAND_PM_MODEL / ROLAND_ENGINEER_MODEL)
process.env.ROLAND_PM_MODEL = 'grok-4.3';
check('Lead-PM', '', 'grok-4.3', 'ROLAND_PM_MODEL=grok-4.3');

process.env.ROLAND_PM_MODEL = 'claude-opus-4-7';
check('Lead-PM', '', 'claude-opus-4-7', 'ROLAND_PM_MODEL=claude-opus-4-7');

process.env.ROLAND_PM_MODEL = 'gpt-5.4-nano';
check('Lead-PM', '', 'gpt-5.4-nano', 'ROLAND_PM_MODEL=gpt-5.4-nano');

process.env.ROLAND_PM_MODEL = undefined;
process.env.ROLAND_ENGINEER_MODEL = 'claude-sonnet-4-6';
check('executor', '', 'claude-sonnet-4-6', 'ROLAND_ENGINEER_MODEL=claude-sonnet-4-6');
check('test-author', '', 'claude-sonnet-4-6', 'ROLAND_ENGINEER_MODEL=claude-sonnet-4-6');

process.env.ROLAND_ENGINEER_MODEL = 'gemini-2.5-flash';
check('architect', '', 'gemini-2.5-flash', 'ROLAND_ENGINEER_MODEL=gemini-2.5-flash');

// PM heuristic wins over engineer env var
process.env.ROLAND_PM_MODEL = 'grok-4.3';
process.env.ROLAND_ENGINEER_MODEL = 'composer-2';
check('Lead-PM', '', 'grok-4.3', 'PM ignores engineer override');

// Restore env
if (savedPm === undefined) delete process.env.ROLAND_PM_MODEL;
else process.env.ROLAND_PM_MODEL = savedPm;
if (savedEng === undefined) delete process.env.ROLAND_ENGINEER_MODEL;
else process.env.ROLAND_ENGINEER_MODEL = savedEng;

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
