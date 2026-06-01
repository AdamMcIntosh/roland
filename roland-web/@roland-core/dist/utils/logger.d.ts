/**
 * Enhanced Logger with Levels and Context - Phase 10 Improvement
 * Provides structured logging with context tracking
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
interface LogContext {
    component?: string;
    operation?: string;
    userId?: string;
    requestId?: string;
    [key: string]: unknown;
}
declare class Logger {
    private prefix;
    private logLevel;
    private context;
    private logHistory;
    private maxHistorySize;
    constructor();
    /**
     * Set global context
     */
    setContext(context: LogContext): void;
    /**
     * Create scoped logger with additional context
     */
    createScoped(component: string): Logger;
    /**
     * Check if level is enabled
     */
    private isEnabled;
    /**
     * Format log message with context
     */
    private formatMessage;
    /**
     * Store in history
     */
    private storeInHistory;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    debug(...args: unknown[]): void;
    success(...args: unknown[]): void;
    /**
     * Get log history
     */
    getHistory(filter?: {
        level?: LogLevel;
        limit?: number;
    }): typeof this.logHistory;
    /**
     * Clear history
     */
    clearHistory(): void;
    /**
     * Set log level
     */
    setLevel(level: LogLevel): void;
    /**
     * Get current level
     */
    getLevel(): LogLevel;
}
export declare const logger: Logger;
export {};
//# sourceMappingURL=logger.d.ts.map