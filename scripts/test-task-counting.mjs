/**
 * Task-counting correctness smoke test.
 *
 * Simulates the exact dynamic-spawning scenario that caused
 * "Wave 3 [████████] 6 / 4 tasks 150%" and verifies the fix.
 *
 * Runs entirely in-memory (no file I/O) by monkey-patching flush().
 */

import { RunStateWriter } from '../dist/rco/run-state.js';
import os from 'os';
import path from 'path';
import fs from 'fs';

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✗\x1b[0m ${label}${detail ? '  →  ' + detail : ''}`);
    failed++;
  }
}

function assertCounts(writer, label, expectedDone, expectedTotal) {
  const s = writer.get();
  const ok = s.completedTasks === expectedDone && s.totalTasks === expectedTotal;
  assert(
    label,
    ok,
    `got ${s.completedTasks}/${s.totalTasks}, expected ${expectedDone}/${expectedTotal}`,
  );
  // Defense-in-depth: completed must never exceed total
  assert(
    `  ${label} — completed ≤ total`,
    s.completedTasks <= s.totalTasks,
    `${s.completedTasks} > ${s.totalTasks}`,
  );
  // Percentage must never exceed 100
  const pct = s.totalTasks > 0 ? Math.round((s.completedTasks / s.totalTasks) * 100) : 0;
  assert(
    `  ${label} — pct ≤ 100%`,
    pct <= 100,
    `${pct}%`,
  );
}

function makeWriter() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-test-'));
  return new RunStateWriter(dir, 'test goal');
}

// ── Test 1: Basic 4-task plan, no spawning ────────────────────────────────────

console.log('\n\x1b[1mTest 1: Basic 4-task plan (no spawning)\x1b[0m');
{
  const w = makeWriter();
  w.planReady([
    { id: 't1', title: 'Task 1', agent: 'executor' },
    { id: 't2', title: 'Task 2', agent: 'executor' },
    { id: 't3', title: 'Task 3', agent: 'executor' },
    { id: 't4', title: 'Task 4', agent: 'executor' },
  ]);
  assertCounts(w, 'after planReady', 0, 4);

  w.waveStart(1, ['t1', 't2']);
  w.taskStart('t1'); w.taskStart('t2');
  w.taskComplete('t1', 'output', false);
  w.taskComplete('t2', 'output', false);
  assertCounts(w, 'after wave 1 (2 done)', 2, 4);

  w.waveStart(2, ['t3', 't4']);
  w.taskStart('t3'); w.taskStart('t4');
  w.taskComplete('t3', 'output', false);
  w.taskComplete('t4', 'output', false);
  assertCounts(w, 'after wave 2 (4 done)', 4, 4);

  w.done();
  assertCounts(w, 'after done', 4, 4);
}

// ── Test 2: PM spawns 2 tasks after wave 1 ───────────────────────────────────

console.log('\n\x1b[1mTest 2: Dynamic spawning — PM adds 2 tasks after wave 1\x1b[0m');
{
  const w = makeWriter();
  w.planReady([
    { id: 't1', title: 'Task 1', agent: 'executor' },
    { id: 't2', title: 'Task 2', agent: 'executor' },
    { id: 't3', title: 'Task 3', agent: 'executor' },
    { id: 't4', title: 'Task 4', agent: 'executor' },
  ]);
  assertCounts(w, 'after planReady', 0, 4);

  w.waveStart(1, ['t1', 't2', 't3', 't4']);
  w.taskStart('t1'); w.taskStart('t2'); w.taskStart('t3'); w.taskStart('t4');
  w.taskComplete('t1', 'output', false);
  w.taskComplete('t2', 'output', false);
  w.taskComplete('t3', 'output', false);
  w.taskComplete('t4', 'output', false);
  assertCounts(w, 'after wave 1 (4/4 done)', 4, 4);

  // PM spawns 2 new tasks during review
  w.addTasks([
    { id: 't5', title: 'Spawned Task 5', agent: 'executor' },
    { id: 't6', title: 'Spawned Task 6', agent: 'executor' },
  ]);
  assertCounts(w, 'after addTasks (totalTasks should be 6)', 4, 6);

  w.waveStart(2, ['t5', 't6']);
  w.taskStart('t5'); w.taskStart('t6');
  w.taskComplete('t5', 'output', false);
  w.taskComplete('t6', 'output', false);
  assertCounts(w, 'after wave 2 (6/6 done — must NOT show 6/4)', 6, 6);

  w.done();
  assertCounts(w, 'after done', 6, 6);
}

// ── Test 3: Regression — old bug scenario ────────────────────────────────────
// Under the old counter-based code, if addTasks was skipped/deduped for
// tasks already in the plan but PM re-queued them with the same IDs,
// completedTasks would exceed totalTasks.

console.log('\n\x1b[1mTest 3: Re-queued task IDs do not double-count totalTasks\x1b[0m');
{
  const w = makeWriter();
  w.planReady([
    { id: 't1', title: 'Task 1', agent: 'executor' },
    { id: 't2', title: 'Task 2', agent: 'executor' },
    { id: 't3', title: 'Task 3', agent: 'executor' },
    { id: 't4', title: 'Task 4', agent: 'executor' },
  ]);

  w.waveStart(1, ['t1', 't2']);
  w.taskStart('t1'); w.taskStart('t2');
  w.taskComplete('t1', 'output', false);
  w.taskComplete('t2', 'output', false);
  assertCounts(w, 'after wave 1', 2, 4);

  // PM tries to add t3 and t4 again (same IDs — addTasks deduplicates)
  // PLUS two genuinely new tasks
  w.addTasks([
    { id: 't3', title: 'Task 3 rescoped', agent: 'executor' }, // duplicate ID
    { id: 't4', title: 'Task 4 rescoped', agent: 'executor' }, // duplicate ID
    { id: 't5', title: 'New Task 5', agent: 'executor' },
    { id: 't6', title: 'New Task 6', agent: 'executor' },
  ]);
  // t3 and t4 already exist → no double-count. t5, t6 are new → totalTasks = 6
  assertCounts(w, 'after addTasks (dupe t3/t4 + new t5/t6)', 2, 6);

  w.waveStart(2, ['t3', 't4', 't5', 't6']);
  w.taskStart('t3'); w.taskStart('t4'); w.taskStart('t5'); w.taskStart('t6');
  w.taskComplete('t3', 'output', false);
  w.taskComplete('t4', 'output', false);
  w.taskComplete('t5', 'output', false);
  w.taskComplete('t6', 'output', false);
  assertCounts(w, 'after wave 2 — must be 6/6, never >100%', 6, 6);
}

// ── Test 4: Blocked tasks count as completed ──────────────────────────────────

console.log('\n\x1b[1mTest 4: Blocked tasks count toward completedTasks\x1b[0m');
{
  const w = makeWriter();
  w.planReady([
    { id: 't1', title: 'Task 1', agent: 'executor' },
    { id: 't2', title: 'Task 2', agent: 'executor' },
  ]);
  w.waveStart(1, ['t1', 't2']);
  w.taskStart('t1'); w.taskStart('t2');
  w.taskComplete('t1', 'output', true);  // blocker
  w.taskComplete('t2', 'output', false); // done
  assertCounts(w, 'blocked + done both count (2/2)', 2, 2);
}

// ── Test 5: Wave headers never show >100% ─────────────────────────────────────

console.log('\n\x1b[1mTest 5: Renderer-level clamp (safeDone / safePct)\x1b[0m');
{
  // Simulate what the TUI renderers compute from the state
  const completedTasks = 6;
  const totalTasks     = 4; // hypothetical stale value before fix

  const safeDone = Math.min(completedTasks, Math.max(totalTasks, 0));
  const safePct  = totalTasks > 0 ? Math.min(Math.round((safeDone / totalTasks) * 100), 100) : 0;

  assert('safeDone ≤ totalTasks', safeDone <= totalTasks, `safeDone=${safeDone}`);
  assert('safePct ≤ 100', safePct <= 100, `safePct=${safePct}%`);
  assert('safePct is 100 (clamped from 150)', safePct === 100, `${safePct}%`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('');
const total = passed + failed;
if (failed === 0) {
  console.log(`\x1b[32m✓\x1b[0m \x1b[1m${passed}/${total} passed\x1b[0m`);
  process.exit(0);
} else {
  console.error(`\x1b[31m✗\x1b[0m \x1b[1m${failed}/${total} failed\x1b[0m`);
  process.exit(1);
}
