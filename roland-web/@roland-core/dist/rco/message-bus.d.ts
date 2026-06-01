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
export declare class MessageBus {
    private readonly filePath;
    private messages;
    constructor(stateDir?: string);
    private load;
    private save;
    /** Send a message from one agent to another. Returns the stored message. */
    send(from: string, to: string, subject: string, body: string): BusMessage;
    /**
     * Poll pending messages for `agent`, marking them delivered (exactly-once).
     * Safe to call repeatedly — returns only new messages each time.
     */
    poll(agent: string): BusMessage[];
    /** All messages ever sent (for Lead PM oversight / audit). */
    all(): BusMessage[];
    /**
     * Human-readable inbox summary for an agent.
     * Injected into agent prompts alongside the Blackboard snapshot.
     */
    inboxSummary(agent: string): string;
}
//# sourceMappingURL=message-bus.d.ts.map