/**
 * Roland Notifier — push alerts when a run completes, errors, hits a blocker,
 * or crosses other meaningful milestones.
 *
 * Zero required dependencies. Three channels, all gracefully degrading:
 *
 *   1. Desktop  — node-notifier if installed, else OS-native fallback
 *   2. Webhook  — HTTP POST to any URL (ntfy.sh, Slack, Discord, custom)
 *   3. stderr   — always: a one-liner for terminal users
 *
 * Events and when they fire:
 *   complete       — run finished (with or without blockers)
 *   error          — unrecoverable crash / agent exhaustion
 *   blocker        — an agent signalled a BLOCKER (opt-in, off by default)
 *   wave-complete  — a wave finished (opt-in, off by default)
 *   hitl-pause     — run was paused by human operator (always fires when paused)
 *
 * Configuration (config.yaml, notifications: section — all optional):
 *   webhook_url:    https://ntfy.sh/my-topic
 *   desktop:        true
 *   on_complete:    true
 *   on_error:       true
 *   on_blocker:     false
 *   on_wave:        false
 */
export interface NotifierConfig {
    webhookUrl?: string;
    desktop?: boolean;
    onComplete?: boolean;
    onError?: boolean;
    onBlocker?: boolean;
    onWave?: boolean;
}
export type NotifyEvent = 'complete' | 'error' | 'blocker' | 'wave-complete' | 'hitl-pause';
export interface NotifyPayload {
    event: NotifyEvent;
    goal: string;
    /** Short caller-supplied summary. Used as fallback if richer fields are absent. */
    summary: string;
    tasksCompleted?: number;
    wavesRun?: number;
    blockersEncountered?: number;
    /** Total duration of the run in ms. */
    durationMs?: number;
    errorMessage?: string;
    blockerAgent?: string;
    blockerDescription?: string;
    waveNumber?: number;
    waveTaskTitles?: string[];
    tasksCompletedThisWave?: number;
    remainingTasks?: number;
    pauseReason?: string;
    /** Free-form context line appended to the body. */
    contextLine?: string;
}
export declare class Notifier {
    private readonly cfg;
    constructor(cfg?: NotifierConfig);
    notify(payload: NotifyPayload): Promise<void>;
    private desktopNotify;
    private webhookNotify;
    private shouldFire;
    private eventIcon;
    private buildTitle;
    private buildBody;
    private ntfyPriority;
    private ntfyTags;
}
export declare function parseNotifierConfig(raw: Record<string, unknown> | undefined): NotifierConfig;
//# sourceMappingURL=notifier.d.ts.map