/**
 * Unit tests for the coordination substrate (Phase 1):
 * Blackboard + Message Bus, including cross-process concurrency via the
 * shared fs lock and exactly-once message delivery.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Blackboard } from '../../src/coordination/blackboard.js';
import { MessageBus } from '../../src/coordination/message-bus.js';
import { CoordinationManager, ConcurrencyError } from '../../src/coordination/index.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roland-coord-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function bb(): Blackboard {
  return new Blackboard(path.join(dir, 'blackboard.json'));
}
function bus(): MessageBus {
  return new MessageBus(path.join(dir, 'bus.json'));
}

describe('Blackboard', () => {
  it('posts a new entry at rev 1 with timestamps', () => {
    const e = bb().post({ key: 'task:a', type: 'task', value: { goal: 'x' }, author: 'lead-pm', status: 'open' });
    expect(e.rev).toBe(1);
    expect(e.key).toBe('task:a');
    expect(e.status).toBe('open');
    expect(e.createdAt).toBeGreaterThan(0);
    expect(e.updatedAt).toBe(e.createdAt);
  });

  it('bumps rev and preserves createdAt when re-posting the same key', () => {
    const board = bb();
    const first = board.post({ key: 'k', type: 'fact', value: 1, author: 'a' });
    const second = board.post({ key: 'k', type: 'fact', value: 2, author: 'b' });
    expect(second.rev).toBe(2);
    expect(second.value).toBe(2);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt);
  });

  it('rejects a post when expectedRev does not match', () => {
    const board = bb();
    board.post({ key: 'k', type: 'fact', value: 1, author: 'a' }); // rev 1
    expect(() => board.post({ key: 'k', type: 'fact', value: 2, author: 'b', expectedRev: 5 })).toThrow(
      ConcurrencyError
    );
  });

  it('accepts a post when expectedRev matches', () => {
    const board = bb();
    board.post({ key: 'k', type: 'fact', value: 1, author: 'a' }); // rev 1
    const e = board.post({ key: 'k', type: 'fact', value: 2, author: 'b', expectedRev: 1 });
    expect(e.rev).toBe(2);
  });

  it('patches an existing entry and bumps rev', () => {
    const board = bb();
    board.post({ key: 'task:a', type: 'task', value: { goal: 'x' }, author: 'lead-pm', status: 'open' });
    const patched = board.patch({ key: 'task:a', author: 'executor', changes: { status: 'in_progress' } });
    expect(patched.status).toBe('in_progress');
    expect(patched.rev).toBe(2);
    expect(patched.value).toEqual({ goal: 'x' }); // untouched
  });

  it('throws when patching a missing key', () => {
    expect(() => bb().patch({ key: 'nope', author: 'x', changes: { status: 'done' } })).toThrow(/not found/);
  });

  it('filters reads by type, tags, author, status, and since', () => {
    const board = bb();
    board.post({ key: 't1', type: 'task', value: 1, author: 'pm', tags: ['fe'], status: 'open' });
    board.post({ key: 't2', type: 'task', value: 2, author: 'pm', tags: ['be'], status: 'done' });
    board.post({ key: 'd1', type: 'decision', value: 3, author: 'arch', tags: ['fe', 'be'] });

    expect(board.read({ type: 'task', limit: 50 }).map((e) => e.key).sort()).toEqual(['t1', 't2']);
    expect(board.read({ tags: ['fe'], limit: 50 }).map((e) => e.key).sort()).toEqual(['d1', 't1']);
    expect(board.read({ author: 'arch', limit: 50 }).map((e) => e.key)).toEqual(['d1']);
    expect(board.read({ status: 'done', limit: 50 }).map((e) => e.key)).toEqual(['t2']);
  });

  it('returns newest first and respects limit', () => {
    const board = bb();
    board.post({ key: 'a', type: 'fact', value: 1, author: 'x' });
    board.post({ key: 'b', type: 'fact', value: 2, author: 'x' });
    board.post({ key: 'c', type: 'fact', value: 3, author: 'x' });
    const top = board.read({ limit: 2 });
    expect(top).toHaveLength(2);
    expect(top[0].key).toBe('c'); // newest first
  });

  it('hides archived entries by default but shows them on request', () => {
    const board = bb();
    board.post({ key: 'k', type: 'task', value: 1, author: 'x', status: 'open' });
    board.archive('k', 'pm');
    expect(board.read({ limit: 50 })).toHaveLength(0);
    expect(board.read({ includeArchived: true, limit: 50 })).toHaveLength(1);
  });

  it('survives across separate instances on the same file (persistence)', () => {
    bb().post({ key: 'k', type: 'fact', value: 'persisted', author: 'x' });
    const reread = bb().read({ key: 'k', limit: 50 });
    expect(reread[0].value).toBe('persisted');
  });
});

describe('MessageBus', () => {
  it('delivers a directed message exactly once', () => {
    const b = bus();
    b.send({ from: 'pm', to: 'exec', body: 'do the thing' });
    const first = b.poll({ recipient: 'exec' });
    expect(first).toHaveLength(1);
    expect(first[0].body).toBe('do the thing');
    expect(b.poll({ recipient: 'exec' })).toHaveLength(0); // drained
  });

  it('does not deliver a message to a non-recipient', () => {
    const b = bus();
    b.send({ from: 'pm', to: 'exec', body: 'hi' });
    expect(b.poll({ recipient: 'reviewer' })).toHaveLength(0);
  });

  it('broadcasts to everyone except the sender, each exactly once', () => {
    const b = bus();
    b.send({ from: 'pm', to: '*', body: 'standup in 5' });
    expect(b.poll({ recipient: 'exec' })).toHaveLength(1);
    expect(b.poll({ recipient: 'reviewer' })).toHaveLength(1);
    expect(b.poll({ recipient: 'pm' })).toHaveLength(0); // sender excluded
    expect(b.poll({ recipient: 'exec' })).toHaveLength(0); // already drained for exec
  });

  it('peek (ack:false) does not consume messages', () => {
    const b = bus();
    b.send({ from: 'pm', to: 'exec', body: 'x' });
    expect(b.poll({ recipient: 'exec', ack: false })).toHaveLength(1);
    expect(b.poll({ recipient: 'exec', ack: false })).toHaveLength(1); // still there
    expect(b.poll({ recipient: 'exec' })).toHaveLength(1); // now consumed
    expect(b.poll({ recipient: 'exec' })).toHaveLength(0);
  });

  it('filters by topic and since', () => {
    const b = bus();
    const m1 = b.send({ from: 'pm', to: 'exec', topic: 'build', body: '1' });
    b.send({ from: 'pm', to: 'exec', topic: 'chat', body: '2' });
    expect(b.poll({ recipient: 'exec', topic: 'build', ack: false }).map((m) => m.body)).toEqual(['1']);
    expect(b.poll({ recipient: 'exec', since: m1.ts + 1, ack: false }).map((m) => m.body)).toEqual(['2']);
  });

  it('returns a usable nextSince-style ordering (oldest first)', () => {
    const b = bus();
    b.send({ from: 'pm', to: 'exec', body: 'first' });
    b.send({ from: 'pm', to: 'exec', body: 'second' });
    const msgs = b.poll({ recipient: 'exec' });
    expect(msgs.map((m) => m.body)).toEqual(['first', 'second']);
  });
});

describe('CoordinationManager facade', () => {
  it('scopes both stores to the provided dir', () => {
    const mgr = new CoordinationManager({ dir });
    mgr.blackboard.post({ key: 'k', type: 'fact', value: 1, author: 'x' });
    mgr.bus.send({ from: 'a', to: 'b', body: 'hi' });
    expect(fs.existsSync(path.join(dir, 'blackboard.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'bus.json'))).toBe(true);
  });
});
