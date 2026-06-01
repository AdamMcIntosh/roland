/**
 * render.ts — pure Markdown views over the PM data (Phase 4).
 *
 * No I/O, no state: every function takes a structure from lead-pm and returns a
 * Markdown string that renders cleanly in the Cursor chat panel. The point is
 * that the PM never has to read raw JSON — `pm_standup` shows the board, the
 * blockers (with the exact unblock call), and what to do next, at a glance.
 */
import type { PMEvent } from './event-log.js';
import type { DispatchPacket, TaskView, TeamContext, TeamUsage } from './types.js';
/** The morning-standup view: directive, triage (blockers→reviews→ready), board, usage, next 3. */
export declare function renderStandup(ctx: TeamContext): string;
/** A kanban-style board grouped by lifecycle status. */
export declare function renderBoard(tasks: TaskView[]): string;
/** Token usage attribution: by engineer, by task. */
export declare function renderUsage(usage: TeamUsage): string;
/** Copy-paste launch instructions for an engineer dispatch. */
export declare function renderCursorLaunch(input: {
    taskKey: string;
    engineer: string;
    model: string;
    brief: string;
    contextFiles: string[];
}): string;
/** Full dispatch view (brief + launch). */
export declare function renderDispatch(packet: DispatchPacket): string;
/** A reverse-chronological event timeline. */
export declare function renderTimeline(events: PMEvent[]): string;
//# sourceMappingURL=render.d.ts.map