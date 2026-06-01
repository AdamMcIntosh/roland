/**
 * Roland Simple TUI — scrolling terminal output for limited/mobile terminals.
 *
 * Designed for SSH clients (Termius, JuiceSSH, etc.) and other environments
 * where alternate screen buffers and cursor movement codes produce garbage.
 *
 * Key differences from TuiRenderer:
 *   - No alternate screen buffer  (\x1b[?1049h / \x1b[?1049l)
 *   - No cursor movement codes    (\x1b[H\x1b[J, \x1b[A, etc.)
 *   - No Unicode box-drawing or block characters
 *   - No Unicode spinner characters
 *   - Scrolling, delta-only output — only NEW events are printed
 *   - ASCII progress bar  [######--------]
 *   - Basic ANSI colors only (bold, dim, red, green, yellow, cyan)
 *
 * Activated by:
 *   ROLAND_SIMPLE_TUI=1                    env var (explicit opt-in)
 *   roland team "goal" --simple-tui        CLI flag
 *   roland team "goal" --no-fancy          CLI flag alias
 *   auto-detected for TERM=dumb, narrow terminals (< 60 cols), or SSH
 *   sessions without declared truecolor support (SSH_CLIENT/SSH_TTY set
 *   but COLORTERM not 'truecolor' / '24bit').
 */
import type { RunState } from '../rco/run-state.js';
/**
 * Returns true when the current terminal environment is likely limited
 * (mobile SSH, dumb terminal, very narrow screen) and should use simple mode.
 *
 * Detection heuristics (any one is sufficient):
 *   1. ROLAND_SIMPLE_TUI=1      — explicit user opt-in
 *   2. TERM=dumb                — classic dumb terminal
 *   3. Terminal width < 60      — too narrow for the fancy box UI
 *   4. SSH session (SSH_CLIENT or SSH_TTY) without declared truecolor support
 *      (COLORTERM != 'truecolor' | '24bit') — catches Termius and similar
 *      mobile SSH clients that don't handle alternate screen buffers well.
 *
 * Users on SSH who DO have truecolor (e.g. iTerm2 remote, modern Termius)
 * will pass check 4 and get the full TUI.  They can still force simple mode
 * with ROLAND_SIMPLE_TUI=1 if they prefer.
 */
export declare function isSimpleTui(): boolean;
export declare class SimpleTuiRenderer {
    /** Task IDs + state we have already printed a line for, e.g. "task-1:running". */
    private readonly printedTaskIds;
    /** Wave numbers we have already printed a header for. */
    private readonly printedWaves;
    /** Last RunStatus we printed a transition announcement for. */
    private lastStatus;
    /** Last HITL pause state we printed a transition for. */
    private lastHitlPaused;
    /** Path to the state file (used in watch mode). */
    private readonly stateFilePath;
    private active;
    private readonly _onExit;
    private readonly _onSigint;
    private readonly _onSigterm;
    constructor(stateFilePath: string);
    start(): void;
    update(state: RunState): void;
    /** Removes all process listeners registered in start(). */
    stop(): void;
    /**
     * Block and watch run-state.json, printing delta updates as the state changes.
     * Exits when the run reaches 'done' or 'error', or on Ctrl+C.
     */
    static watch(stateDir: string): Promise<void>;
    private printDelta;
}
//# sourceMappingURL=simple-tui.d.ts.map