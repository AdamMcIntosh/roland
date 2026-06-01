/**
 * Message Bus — poll-based peer-to-peer mailbox.
 *
 * Honest MCP constraint: stdio MCP is request/response with no server→client
 * push, so the bus is a durable mailbox that recipients drain by polling.
 * Each message tracks deliveredTo[], so an ack'd poll returns each message to
 * each recipient exactly once. Messages addressed to "*" broadcast to everyone
 * except the sender.
 */
import { BusPollInput, BusSendInput, Message } from './types.js';
export declare class MessageBus {
    private readonly file;
    constructor(file?: string);
    /** Append a message to the bus. */
    send(input: BusSendInput): Message;
    /**
     * Return messages addressed to `recipient` (directly or via broadcast) that
     * it has not yet drained. With ack (default), stamps deliveredTo so the same
     * messages are not returned again. Sorted oldest-first.
     */
    poll(input: BusPollInput): Message[];
}
//# sourceMappingURL=message-bus.d.ts.map