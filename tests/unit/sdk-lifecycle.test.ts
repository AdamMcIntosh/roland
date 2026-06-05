import { describe, expect, it, vi } from 'vitest';
import {
  cancelSdkRun,
  cleanupSdkSession,
  configureSdkProcessLimits,
  disposeSdkAgent,
} from '../../src/utils/sdk-lifecycle.js';

describe('configureSdkProcessLimits', () => {
  it('is idempotent', () => {
    expect(() => {
      configureSdkProcessLimits(50);
      configureSdkProcessLimits(50);
    }).not.toThrow();
  });
});

describe('cancelSdkRun', () => {
  it('calls cancel when status is running', async () => {
    const cancel = vi.fn(async () => {});
    await cancelSdkRun({ status: 'running', cancel });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('skips cancel when run already finished', async () => {
    const cancel = vi.fn(async () => {});
    await cancelSdkRun({ status: 'finished', cancel });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('swallows cancel errors', async () => {
    const cancel = vi.fn(async () => {
      throw new Error('already done');
    });
    await expect(cancelSdkRun({ status: 'running', cancel })).resolves.toBeUndefined();
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
  it('cancels then disposes', async () => {
    const order: string[] = [];
    const cancel = vi.fn(async () => {
      order.push('cancel');
    });
    const asyncDispose = vi.fn(async () => {
      order.push('dispose');
    });
    await cleanupSdkSession(
      { [Symbol.asyncDispose]: asyncDispose },
      { status: 'running', cancel },
    );
    expect(order).toEqual(['cancel', 'dispose']);
  });
});
