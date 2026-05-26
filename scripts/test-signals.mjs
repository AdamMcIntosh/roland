import { parseWorkerSignals, hasBlockerSignal } from '../dist/rco/worker-signals.js';

const cases = [
  {
    label: 'formal ## 🚨 BLOCKER section',
    expectsBlocker: true,
    input: `## Analysis
Some work here.

## 🚨 BLOCKER
**Description:** Missing Stripe secret key — cannot call API.
**Needs from:** lead-pm
**Impact:** task-9 cannot start.

## Next Steps
Nothing else blocked.`,
  },
  {
    label: 'inline **BLOCKED:** shorthand',
    expectsBlocker: true,
    input: `## Implementation
Started the checkout flow. **BLOCKED:** No Stripe publishable key in env — cannot initialise SDK.

Continuing with mock stubs for now.`,
  },
  {
    label: 'emoji inline ⚠️ BLOCKED:',
    expectsBlocker: true,
    input: `## Review
Code looks good overall. ⚠️ BLOCKED: The PaymentStore interface is missing — cannot verify persistence layer.`,
  },
  {
    label: 'emoji inline 🚨 BLOCKED: (not a section header)',
    expectsBlocker: true,
    input: `## QA Results
All unit tests pass. 🚨 BLOCKED: Test fixtures for webhook signing are absent — integration tests cannot run.`,
  },
  {
    label: 'BLOCKING ISSUE: pattern',
    expectsBlocker: true,
    input: `## Plan
Designed the module structure.
BLOCKING ISSUE: No auth middleware exists — the payment routes would be unauthenticated.`,
  },
  {
    label: 'message to PM, no blocker',
    expectsBlocker: false,
    expectsMessage: true,
    input: `## Analysis
Found 12 endpoints.

## 📨 MESSAGE TO lead-pm
**Subject:** Auth gap
The codebase has no auth. Should I scope that in or flag as a deferred item?`,
  },
  {
    label: 'dedup: same text in section AND inline — expect exactly 1 blocker',
    expectsBlocker: true,
    expectsDedup: true,
    input: `## 🚨 BLOCKER
**Description:** Missing DB schema — cannot write queries.

Some prose. **BLOCKED:** Missing DB schema — cannot write queries.`,
  },
  {
    label: 'no signals at all',
    expectsBlocker: false,
    input: `## Implementation\n\nAll done, no issues.`,
  },
];

let passed = 0;
let failed = 0;

for (const { label, input, expectsBlocker, expectsMessage, expectsDedup } of cases) {
  const signals = parseWorkerSignals(input);
  const hasB = hasBlockerSignal(input);

  const blockerOk  = expectsBlocker  ? signals.blockers.length > 0  : signals.blockers.length === 0;
  const messageOk  = expectsMessage  ? signals.messages.length > 0  : true;
  const hasSignalOk = expectsBlocker ? hasB === true                : hasB === false;
  const dedupOk    = expectsDedup    ? signals.blockers.length === 1 : true;

  const ok = blockerOk && messageOk && hasSignalOk && dedupOk;
  const icon = ok ? '✓' : '✗';
  if (ok) passed++; else failed++;

  console.log(`${icon} ${label}`);
  if (!ok) {
    console.log(`    blockers (${signals.blockers.length}): ${JSON.stringify(signals.blockers.map(b => b.description.slice(0, 70)))}`);
    console.log(`    messages (${signals.messages.length}): ${JSON.stringify(signals.messages.map(m => m.subject))}`);
    console.log(`    hasBlockerSignal=${hasB}  expectsBlocker=${!!expectsBlocker}`);
  }
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
