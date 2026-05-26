/**
 * Message Bus — poll-based peer-to-peer mailbox.
 *
 * Honest MCP constraint: stdio MCP is request/response with no server→client
 * push, so the bus is a durable mailbox that recipients drain by polling.
 * Each message tracks deliveredTo[], so an ack'd poll returns each message to
 * each recipient exactly once. Messages addressed to "*" broadcast to everyone
 * except the sender.
 */

import {
  BusPollInput,
  BusPollInputSchema,
  BusSendInput,
  BusSendInputSchema,
  BusStore,
  Message,
} from './types.js';
import { busFile } from './paths.js';
import { mutate } from './store.js';

let counter = 0;
function genId(ts: number): string {
  counter = (counter + 1) % 1_000_000;
  return `${ts.toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export class MessageBus {
  constructor(private readonly file: string = busFile()) {}

  /** Append a message to the bus. */
  send(input: BusSendInput): Message {
    const parsed = BusSendInputSchema.parse(input);
    const ts = Date.now();
    const message: Message = {
      id: genId(ts),
      from: parsed.from,
      to: parsed.to,
      topic: parsed.topic ?? 'general',
      body: parsed.body,
      replyTo: parsed.replyTo,
      ts,
      deliveredTo: [],
    };
    mutate<BusStore>(this.file, { messages: [] }, (cur) => {
      cur.messages.push(message);
      return cur;
    });
    return message;
  }

  /**
   * Return messages addressed to `recipient` (directly or via broadcast) that
   * it has not yet drained. With ack (default), stamps deliveredTo so the same
   * messages are not returned again. Sorted oldest-first.
   */
  poll(input: BusPollInput): Message[] {
    const q = BusPollInputSchema.parse(input);
    const ack = q.ack ?? true;
    const result: Message[] = [];

    mutate<BusStore>(this.file, { messages: [] }, (cur) => {
      for (const m of cur.messages) {
        const addressed = m.to === q.recipient || (m.to === '*' && m.from !== q.recipient);
        if (!addressed) continue;
        if (m.deliveredTo.includes(q.recipient)) continue;
        if (q.since !== undefined && m.ts < q.since) continue;
        if (q.topic !== undefined && m.topic !== q.topic) continue;

        result.push(m);
        if (ack) m.deliveredTo.push(q.recipient);
        if (q.limit !== undefined && result.length >= q.limit) break;
      }
      return cur;
    });

    result.sort((a, b) => a.ts - b.ts);
    return result;
  }
}
