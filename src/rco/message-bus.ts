/**
 * RCO Message Bus — point-to-point messaging between agents.
 *
 * Agents (and the Lead PM) can send messages to each other by name.
 * The orchestrator polls on each agent's behalf and injects unread messages
 * into their next prompt, giving the team async communication without
 * requiring actual network connections between child processes.
 *
 * Delivery guarantee: exactly-once per recipient (deliveredTo tracks acks).
 * Persistence: `.roland/messages.json`.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface BusMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  sentAt: number;
  /** Agent names that have already received this message. */
  deliveredTo: string[];
}

export class MessageBus {
  private readonly filePath: string;
  private messages: BusMessage[] = [];

  constructor(stateDir: string = '.roland') {
    fs.mkdirSync(stateDir, { recursive: true });
    this.filePath = path.join(stateDir, 'messages.json');
    this.load();
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private load(): void {
    try {
      this.messages = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as BusMessage[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // File exists but is corrupt — warn rather than silently dropping all messages.
        console.error('[MessageBus] Messages file could not be parsed; starting empty.', err);
      }
      this.messages = [];
    }
  }

  private save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.messages, null, 2), 'utf-8');
  }

  // ── API ────────────────────────────────────────────────────────────────────

  /** Send a message from one agent to another. Returns the stored message. */
  send(from: string, to: string, subject: string, body: string): BusMessage {
    const msg: BusMessage = { id: randomUUID(), from, to, subject, body, sentAt: Date.now(), deliveredTo: [] };
    this.messages.push(msg);
    this.save();
    return msg;
  }

  /**
   * Poll pending messages for `agent`, marking them delivered (exactly-once).
   * Safe to call repeatedly — returns only new messages each time.
   */
  poll(agent: string): BusMessage[] {
    const pending = this.messages.filter((m) => m.to === agent && !m.deliveredTo.includes(agent));
    for (const msg of pending) msg.deliveredTo.push(agent);
    if (pending.length > 0) this.save();
    return pending;
  }

  /** All messages ever sent (for Lead PM oversight / audit). */
  all(): BusMessage[] {
    return [...this.messages];
  }

  /**
   * Human-readable inbox summary for an agent.
   * Injected into agent prompts alongside the Blackboard snapshot.
   */
  inboxSummary(agent: string): string {
    const msgs = this.poll(agent);
    if (msgs.length === 0) return '';
    return msgs
      .map((m) => `**From ${m.from}** — ${m.subject}\n${m.body}`)
      .join('\n\n---\n\n');
  }
}
