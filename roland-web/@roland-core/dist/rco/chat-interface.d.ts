/**
 * Roland Chat Interface — calm, modern, Claude-Code-style terminal UX.
 *
 * Activated when `roland` is run with no arguments in an interactive TTY.
 * Provides a chat-first experience: type a natural language goal or /command.
 *
 * Design principles (v2):
 *   - Conversational: Roland "speaks" before and after every run
 *   - Quiet progress: compact task lines, wave summaries not verbose transcripts
 *   - Visual hierarchy: dim=infrastructure, bold=user goals, cyan=actions
 *   - No alternate screen: scroll-back-friendly, SSH-safe (unless fancy TUI picked)
 *   - Auto-detects simple/SSH mode via isSimpleTui()
 */
import readline from 'readline';
export interface ChatContext {
    stateDir: string;
    notify: boolean;
    stream: boolean;
    noImprove: boolean;
    parallel: boolean;
    webhookUrl?: string;
    agentsDir?: string;
    simple: boolean;
    rl?: readline.Interface;
    lastGoal?: string;
    runCount: number;
    activeLiveStatus?: ChatLiveStatus;
}
/**
 * Renders a live in-place status block during a goal run.
 *
 * Fancy mode (default): uses ANSI cursor-up + erase-to-end to rewrite a fixed
 * block of lines in place — a live "dashboard" without alternate screen.
 *
 * Simple mode (SSH / dumb terminal): no cursor movement; falls back to
 * periodic one-line heartbeat prints every 25 s so the terminal doesn't appear
 * frozen during long test-author / test-executor steps.
 */
declare class ChatLiveStatus {
    private blockLines;
    private tickTimer;
    private readonly simple;
    private readonly sequential;
    private spinTick;
    private liveMode;
    get isLive(): boolean;
    private phase;
    private waveNumber;
    private totalTasks;
    private completedTasks;
    private taskList;
    private readonly activeTasks;
    constructor(simple: boolean, sequential: boolean);
    private renderBlock;
    private eraseBlock;
    private drawBlock;
    private refresh;
    /** Write a permanent scrolling line. In live mode, erases+redraws the block. */
    printLine(s?: string): void;
    /** Print a horizontal rule as a permanent scrolling line. */
    printRule(ch?: string, indent?: number): void;
    /** Initialise tracking state. Does NOT start rendering; call activate() for that. */
    start(): void;
    /** Enter live-view mode: draw the block and start the tick timer. */
    activate(): void;
    /** Exit live-view mode: erase the block and stop the tick timer. */
    deactivate(): void;
    /** Toggle live view. Returns true if now live. */
    toggle(): boolean;
    planReady(tasks: Array<{
        id: string;
        agent: string;
        title: string;
    }>): void;
    addTasks(tasks: Array<{
        id: string;
        agent: string;
        title: string;
    }>): void;
    waveStart(waveNumber: number, completedTasks: number, totalTasks: number): void;
    taskStart(id: string, agent: string, title: string): void;
    taskDone(id: string, completedTasks: number, hadBlocker?: boolean): void;
    reviewing(): void;
    synthesizing(): void;
    stop(): void;
}
export interface ChatOptions {
    stateDir?: string;
    notify?: boolean;
    stream?: boolean;
    noImprove?: boolean;
    webhookUrl?: string;
    agentsDir?: string;
    parallel?: boolean;
}
export declare function startChat(options?: ChatOptions): Promise<void>;
export {};
//# sourceMappingURL=chat-interface.d.ts.map