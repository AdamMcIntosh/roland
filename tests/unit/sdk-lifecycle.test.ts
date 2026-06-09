import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  SdkAgentTimeoutError,
  cancelSdkRun,
  cleanupSdkSession,
  configureSdkProcessLimits,
  createShellExecStderrFilter,
  disposeSdkAgent,
  forceKillAfterSettle,
  isShellExecCloseWarning,
  resolveSdkAgentLocalOptions,
  resolveSdkSettleMs,
  settleSdkRun,
  waitForRunTerminal,
  waitForSdkRun,
} from '../../src/utils/sdk-lifecycle.js';

describe('configureSdkProcessLimits', () => {
  it('is idempotent', () => {
    expect(() => {
      configureSdkProcessLimits();
      configureSdkProcessLimits();
    }).not.toThrow();
  });
});

describe('cancelSdkRun', () => {
  it('calls cancel when status is running', async () => {
    const run = { status: 'running' as const, cancel: vi.fn(async () => { run.status = 'cancelled'; }) };
    await cancelSdkRun(run);
    expect(run.cancel).toHaveBeenCalledOnce();
  });

  it('skips cancel when run already finished', async () => {
    const cancel = vi.fn(async () => {});
    await cancelSdkRun({ status: 'finished', cancel });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('forces cancel on finished run when force=true', async () => {
    const cancel = vi.fn(async () => {});
    await cancelSdkRun({ status: 'finished', cancel }, { force: true });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('swallows cancel errors', async () => {
    const run = {
      status: 'running' as const,
      cancel: vi.fn(async () => {
        run.status = 'cancelled';
        throw new Error('already done');
      }),
    };
    await expect(cancelSdkRun(run)).resolves.toBeUndefined();
  });
});

describe('waitForRunTerminal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls until status leaves running then drains terminal wait', async () => {
    const wait = vi.fn(async () => ({ status: 'finished' }));
    const run = { status: 'running' as string, wait };
    const promise = waitForRunTerminal(run, 500);
    await vi.advanceTimersByTimeAsync(60);
    run.status = 'finished';
    await vi.advanceTimersByTimeAsync(2_500);
    await promise;
    expect(wait).toHaveBeenCalled();
  });

  it('drains wait() when still running at deadline', async () => {
    const wait = vi.fn(async () => ({ status: 'cancelled' }));
    const run = { status: 'running' as string, wait };
    const promise = waitForRunTerminal(run, 100);
    await vi.advanceTimersByTimeAsync(150);
    await promise;
    expect(wait).toHaveBeenCalledOnce();
  });
});

describe('settleSdkRun', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for terminal status then settles', async () => {
    const run = { status: 'finished' as const };
    const promise = settleSdkRun(run);
    await vi.advanceTimersByTimeAsync(3_600);
    await promise;
  });
});

describe('resolveSdkSettleMs', () => {
  it('uses heavy settle for test-author', () => {
    expect(resolveSdkSettleMs('test-author')).toBeGreaterThanOrEqual(8_000);
  });

  it('uses heavy settle when task mentions vitest', () => {
    expect(resolveSdkSettleMs('executor', 'run npm test and vitest')).toBeGreaterThanOrEqual(8_000);
  });

  it('uses heavy settle when task mentions dotnet test', () => {
    expect(resolveSdkSettleMs('test-executor', 'dotnet test --no-build')).toBeGreaterThanOrEqual(8_000);
  });

  it('uses default settle for ordinary tasks', () => {
    expect(resolveSdkSettleMs('executor', 'add a route handler')).toBe(3_500);
  });
});

describe('resolveSdkAgentLocalOptions', () => {
  it('adds shellExec ignore/detached for test-executor', () => {
    const opts = resolveSdkAgentLocalOptions('test-executor', { cwd: '/tmp' });
    expect(opts.shellExec).toEqual({ stdio: 'ignore', detached: true });
  });

  it('adds shellExec ignore/detached for all agents', () => {
    const opts = resolveSdkAgentLocalOptions('executor', { cwd: '/tmp' });
    expect(opts.shellExec).toEqual({ stdio: 'ignore', detached: true });
  });
});

describe('shell-exec warning silencer', () => {
  it('detects the close-event warning pattern', () => {
    expect(isShellExecCloseWarning('[shell-exec] Close event did not fire within 5000ms')).toBe(true);
    expect(isShellExecCloseWarning('[Team] wave complete')).toBe(false);
  });

  it('filters shell-exec warnings from stderr.write when scoped', () => {
    const captured: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
      captured.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    const restore = createShellExecStderrFilter();
    process.stderr.write('[shell-exec] Close event did not fire within 5000ms\n');
    process.stderr.write('[Team] normal progress\n');
    restore();
    process.stderr.write = orig;

    expect(captured).toEqual(['[Team] normal progress\n']);
  });
});

describe('forceKillAfterSettle', () => {
  it('returns forced=false when no childProcess handles', async () => {
    const result = await forceKillAfterSettle({ nested: { pid: process.pid } });
    expect(result.forced).toBe(false);
    expect(result.killedPids).toEqual([]);
  });

  it('skips the current process pid even on childProcess-shaped objects', async () => {
    const result = await forceKillAfterSettle({
      childProcess: { pid: process.pid, killed: false, stdin: null },
    });
    expect(result.forced).toBe(false);
  });
});

describe('waitForSdkRun', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns when wait resolves before timeout', async () => {
    const wait = vi.fn(async () => ({ status: 'finished', result: 'ok' }));
    const run = { status: 'running' as const, wait, cancel: vi.fn(async () => {}) };
    const promise = waitForSdkRun(run, { timeoutMs: 5_000, agentName: 'executor' });
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toEqual({ status: 'finished', result: 'ok' });
  });

  it('cancels and drains on timeout', async () => {
    vi.useRealTimers();
    let waitCalls = 0;
    const run = {
      status: 'running' as const,
      wait: async () => {
        waitCalls++;
        if (waitCalls === 1) {
          return new Promise<{ status: string }>(() => {});
        }
        return { status: 'cancelled' };
      },
      cancel: vi.fn(async () => {
        run.status = 'cancelled';
      }),
    };

    await expect(
      waitForSdkRun(run, { timeoutMs: 50, agentName: 'executor' }),
    ).rejects.toBeInstanceOf(SdkAgentTimeoutError);
    expect(run.cancel).toHaveBeenCalled();
    expect(waitCalls).toBeGreaterThanOrEqual(2);
    vi.useFakeTimers();
  });
});

describe('disposeSdkAgent', () => {
  it('prefers Symbol.asyncDispose over close', async () => {
    const asyncDispose = vi.fn(async () => {});
    const close = vi.fn();
    await disposeSdkAgent({ [Symbol.asyncDispose]: asyncDispose, close });
    expect(asyncDispose).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  });

  it('falls back to close()', async () => {
    const close = vi.fn();
    await disposeSdkAgent({ close });
    expect(close).toHaveBeenCalledOnce();
  });

  it('logs and continues when dispose throws', async () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    await disposeSdkAgent({
      [Symbol.asyncDispose]: async () => {
        throw new Error('dispose failed');
      },
    });
    expect(stderr).toHaveBeenCalled();
    stderr.mockRestore();
  });
});

describe('cleanupSdkSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancels, settles, then disposes', async () => {
    const order: string[] = [];
    const run = {
      status: 'running' as const,
      cancel: vi.fn(async () => {
        run.status = 'cancelled';
        order.push('cancel');
      }),
    };
    const promise = cleanupSdkSession({ [Symbol.asyncDispose]: async () => { order.push('dispose'); } }, run);
    await vi.advanceTimersByTimeAsync(3_600);
    await promise;
    expect(order).toEqual(['cancel', 'dispose']);
  });
});
