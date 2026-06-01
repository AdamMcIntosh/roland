/**
 * Roland TUI — real-time terminal dashboard.
 *
 * Uses alternate screen + ANSI escape codes; zero external dependencies.
 *
 * Usage (live mode, from team-cli):
 *   const tui = new TuiRenderer(stateFilePath);
 *   tui.start();
 *   tui.update(runState);   // call on every lifecycle event
 *   tui.stop();             // restores terminal, returns synthesis
 *
 * Usage (observer mode, from `roland status`):
 *   TuiRenderer.watch(stateDir);  // blocks, watches file, Ctrl+C to exit
 */
import type { RunState } from '../rco/run-state.js';
export declare class TuiRenderer {
    private spinTick;
    private timer;
    private lastState;
    private readonly stateFilePath;
    private active;
    private cmdBuffer;
    private cmdFlash;
    private cmdFlashTimer;
    private readonly _onCommand;
    private readonly _onExit;
    private readonly _onSigint;
    private readonly _onSigterm;
    private readonly _onResize;
    private readonly _onStdinData;
    constructor(stateFilePath: string, opts?: {
        onCommand?: (cmd: string) => void;
    });
    /** Display a message inside the TUI box for `durationMs` milliseconds. */
    showMessage(text: string, durationMs?: number): void;
    start(): void;
    update(state: RunState): void;
    stop(): void;
    /**
     * Block and watch the run-state.json file, redrawing on every change.
     * Exits when the run reaches 'done' or 'error', or when Ctrl+C is pressed.
     */
    static watch(stateDir: string): Promise<void>;
    private get width();
    private get contentWidth();
    private spinner;
    private draw;
    private taskRow;
}
//# sourceMappingURL=tui.d.ts.map