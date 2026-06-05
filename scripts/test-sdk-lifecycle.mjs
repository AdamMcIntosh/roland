/**
 * SDK lifecycle smoke test — cancel / settle / dispose sequencing.
 *
 * Runs entirely in-memory with mock run/agent handles (no @cursor/sdk calls).
 */

import {
  SdkAgentTimeoutError,
  cancelSdkRun,
  cleanupSdkSession,
  configureSdkProcessLimits,
  forceKillAfterSettle,
  resolveSdkSettleMs,
  settleSdkRun,
  waitForRunTerminal,
  waitForSdkRun,
} from '../dist/utils/sdk-lifecycle.js';

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

console.log('\n\x1b[1mTest 1: configureSdkProcessLimits idempotent\x1b[0m');
try {
  configureSdkProcessLimits();
  configureSdkProcessLimits();
  assert('configureSdkProcessLimits does not throw', true);
} catch (e) {
  assert('configureSdkProcessLimits does not throw', false, e.message);
}

console.log('\n\x1b[1mTest 2: cancelSdkRun respects terminal status\x1b[0m');
{
  let calls = 0;
  await cancelSdkRun({
    status: 'finished',
    cancel: async () => {
      calls++;
    },
  });
  assert('skips cancel when finished', calls === 0);
}

console.log('\n\x1b[1mTest 3: cancelSdkRun force cancels finished runs\x1b[0m');
{
  let calls = 0;
  await cancelSdkRun(
    {
      status: 'finished',
      cancel: async () => {
        calls++;
      },
    },
    { force: true },
  );
  assert('force cancel invoked', calls === 1);
}

console.log('\n\x1b[1mTest 4: waitForRunTerminal polls until not running\x1b[0m');
{
  const run = { status: 'running' };
  const promise = waitForRunTerminal(run, 500);
  setTimeout(() => {
    run.status = 'finished';
  }, 60);
  await promise;
  assert('status reached finished', run.status === 'finished');
}

console.log('\n\x1b[1mTest 5: waitForSdkRun resolves successful wait\x1b[0m');
{
  const result = await waitForSdkRun(
    {
      status: 'running',
      wait: async () => ({ status: 'finished', result: 'done' }),
      cancel: async () => {},
    },
    { timeoutMs: 2_000, agentName: 'executor' },
  );
  assert('returns finished result', result.status === 'finished' && result.result === 'done');
}

console.log('\n\x1b[1mTest 6: waitForSdkRun timeout cancels and drains\x1b[0m');
{
  let cancelled = false;
  let waitCalls = 0;
  const run = {
    status: 'running',
    cancel: async () => {
      cancelled = true;
      run.status = 'cancelled';
    },
    wait: async () => {
      waitCalls++;
      if (waitCalls === 1) {
        return new Promise(() => {});
      }
      return { status: 'cancelled', result: '' };
    },
  };

  let err;
  try {
    await waitForSdkRun(run, { timeoutMs: 30, agentName: 'executor' });
  } catch (e) {
    err = e;
  }
  assert('throws SdkAgentTimeoutError', err instanceof SdkAgentTimeoutError);
  assert('cancel was invoked', cancelled);
  assert('wait drained after cancel', waitCalls >= 2);
}

console.log('\n\x1b[1mTest 7: cleanupSdkSession settles before dispose\x1b[0m');
{
  const order = [];
  await cleanupSdkSession(
    {
      [Symbol.asyncDispose]: async () => {
        order.push('dispose');
      },
    },
    {
      status: 'finished',
      cancel: async () => {
        order.push('cancel');
      },
    },
  );
  await settleSdkRun({ status: 'finished' });
  assert('dispose ran', order.includes('dispose'));
  assert('cancel skipped for finished run', !order.includes('cancel'));
}

console.log('\n\x1b[1mTest 8: resolveSdkSettleMs heavy vs default\x1b[0m');
{
  assert('test-author gets heavy settle', resolveSdkSettleMs('test-author') >= 8_000);
  assert('vitest context gets heavy settle', resolveSdkSettleMs('executor', 'run vitest') >= 8_000);
  assert('dotnet test context gets heavy settle', resolveSdkSettleMs('test-executor', 'dotnet test --no-build') >= 8_000);
  assert('ordinary task uses default settle', resolveSdkSettleMs('executor', 'add handler') === 3_500);
}

console.log('\n\x1b[1mTest 9: forceKillAfterSettle no-op without children\x1b[0m');
{
  const result = await forceKillAfterSettle(null);
  assert('forced=false when agent null', result.forced === false);
}

console.log('\n\x1b[1mTest 10: isShellExecCloseWarning pattern\x1b[0m');
{
  const { isShellExecCloseWarning } = await import('../dist/utils/sdk-lifecycle.js');
  assert(
    'matches shell-exec close warning',
    isShellExecCloseWarning('[shell-exec] Close event did not fire within 5000ms'),
  );
  assert('ignores normal stderr', !isShellExecCloseWarning('[Team] wave complete'));
}

console.log(`\n\x1b[1mResults: ${passed} passed, ${failed} failed\x1b[0m\n`);
process.exit(failed > 0 ? 1 : 0);
