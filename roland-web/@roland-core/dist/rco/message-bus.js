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
export class MessageBus {
    filePath;
    messages = [];
    constructor(stateDir = '.roland') {
        fs.mkdirSync(stateDir, { recursive: true });
        this.filePath = path.join(stateDir, 'messages.json');
        this.load();
    }
    // ── Persistence ────────────────────────────────────────────────────────────
    load() {
        try {
            this.messages = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        }
        catch (err) {
            if (err.code !== 'ENOENT') {
                // File exists but is corrupt — warn rather than silently dropping all messages.
                console.error('[MessageBus] Messages file could not be parsed; starting empty.', err);
            }
            this.messages = [];
        }
    }
    save() {
        fs.writeFileSync(this.filePath, JSON.stringify(this.messages, null, 2), 'utf-8');
    }
    // ── API ────────────────────────────────────────────────────────────────────
    /** Send a message from one agent to another. Returns the stored message. */
    send(from, to, subject, body) {
        const msg = { id: randomUUID(), from, to, subject, body, sentAt: Date.now(), deliveredTo: [] };
        this.messages.push(msg);
        this.save();
        return msg;
    }
    /**
     * Poll pending messages for `agent`, marking them delivered (exactly-once).
     * Safe to call repeatedly — returns only new messages each time.
     */
    poll(agent) {
        const pending = this.messages.filter((m) => m.to === agent && !m.deliveredTo.includes(agent));
        for (const msg of pending)
            msg.deliveredTo.push(agent);
        if (pending.length > 0)
            this.save();
        return pending;
    }
    /** All messages ever sent (for Lead PM oversight / audit). */
    all() {
        return [...this.messages];
    }
    /**
     * Human-readable inbox summary for an agent.
     * Injected into agent prompts alongside the Blackboard snapshot.
     */
    inboxSummary(agent) {
        const msgs = this.poll(agent);
        if (msgs.length === 0)
            return '';
        return msgs
            .map((m) => `**From ${m.from}** — ${m.subject}\n${m.body}`)
            .join('\n\n---\n\n');
    }
}
//# sourceMappingURL=message-bus.js.map