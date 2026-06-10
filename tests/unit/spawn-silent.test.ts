import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildSilentSpawnOptions, spawnSilent } from '../../src/utils/spawn-silent.js';

describe('spawnSilent', () => {
  it('spawns a detached child with a pid', () => {
    const child = spawnSilent(process.execPath, ['-e', 'setTimeout(() => {}, 200)']);
    expect(child.pid).toBeGreaterThan(0);
  });

  it('writes stdout/stderr to a log file when log option is set', async () => {
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-spawn-'));
    const logFile = path.join(logDir, 'child.log');

    const child = spawnSilent(process.execPath, ['-e', 'console.log("silent-log-ok")'], {
      log: { logFile, logMode: 'w' },
    });

    await new Promise<void>((resolve) => child.on('close', () => resolve()));
    const content = fs.readFileSync(logFile, 'utf8');
    expect(content).toContain('silent-log-ok');
  });

  it('buildSilentSpawnOptions sets windowsHide and ignores stdio by default', () => {
    const opts = buildSilentSpawnOptions();
    expect(opts.windowsHide).toBe(true);
    expect(opts.shell).toBe(false);
    expect(opts.detached).toBe(true);
    expect(opts.stdio).toEqual(['ignore', 'ignore', 'ignore']);
  });

  it('buildSilentSpawnOptions adds CREATE_NO_WINDOW on Windows', () => {
    const opts = buildSilentSpawnOptions() as { creationFlags?: number };
    if (process.platform === 'win32') {
      expect(opts.creationFlags! & 0x08000000).toBe(0x08000000);
    } else {
      expect(opts.creationFlags).toBeUndefined();
    }
  });
});
