/**
 * Enhanced Logger with Levels and Context - Phase 10 Improvement
 * Provides structured logging with context tracking
 */
class Logger {
    prefix = '[roland]';
    logLevel = 'info';
    context = {};
    logHistory = [];
    maxHistorySize = 1000;
    constructor() {
        // Set log level from environment
        const envLevel = process.env.LOG_LEVEL;
        if (envLevel && ['debug', 'info', 'warn', 'error'].includes(envLevel)) {
            this.logLevel = envLevel;
        }
    }
    /**
     * Set global context
     */
    setContext(context) {
        this.context = { ...this.context, ...context };
    }
    /**
     * Create scoped logger with additional context
     */
    createScoped(component) {
        const scoped = new Logger();
        scoped.setContext({ ...this.context, component });
        scoped.logLevel = this.logLevel;
        return scoped;
    }
    /**
     * Check if level is enabled
     */
    isEnabled(level) {
        const levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3,
        };
        return levels[level] >= levels[this.logLevel];
    }
    /**
     * Format log message with context
     */
    formatMessage(message, context) {
        if (typeof message === 'string') {
            const contextStr = context && Object.keys(context).length > 0
                ? ` ${JSON.stringify(context)}`
                : '';
            return `${message}${contextStr}`;
        }
        return String(message);
    }
    /**
     * Store in history
     */
    storeInHistory(level, message, context) {
        this.logHistory.push({
            level,
            message,
            timestamp: new Date(),
            context: context || {},
        });
        if (this.logHistory.length > this.maxHistorySize) {
            this.logHistory.shift();
        }
    }
    info(...args) {
        if (!this.isEnabled('info'))
            return;
        const message = this.formatMessage(args[0], args[1]);
        console.error(this.prefix, message, ...args.slice(2));
        this.storeInHistory('info', String(args[0]), args[1]);
    }
    warn(...args) {
        if (!this.isEnabled('warn'))
            return;
        const message = this.formatMessage(args[0], args[1]);
        console.warn(this.prefix, '⚠️', message, ...args.slice(2));
        this.storeInHistory('warn', String(args[0]), args[1]);
    }
    error(...args) {
        if (!this.isEnabled('error'))
            return;
        const message = this.formatMessage(args[0], args[1]);
        console.error(this.prefix, '❌', message, ...args.slice(2));
        this.storeInHistory('error', String(args[0]), args[1]);
    }
    debug(...args) {
        if (!this.isEnabled('debug'))
            return;
        const message = this.formatMessage(args[0], args[1]);
        console.error(this.prefix, '🐛', message, ...args.slice(2));
        this.storeInHistory('debug', String(args[0]), args[1]);
    }
    success(...args) {
        if (!this.isEnabled('info'))
            return;
        const message = this.formatMessage(args[0], args[1]);
        console.error(this.prefix, '✅', message, ...args.slice(2));
        this.storeInHistory('info', String(args[0]), args[1]);
    }
    /**
     * Get log history
     */
    getHistory(filter) {
        let history = this.logHistory;
        if (filter?.level) {
            history = history.filter((entry) => entry.level === filter.level);
        }
        if (filter?.limit) {
            history = history.slice(-filter.limit);
        }
        return history;
    }
    /**
     * Clear history
     */
    clearHistory() {
        this.logHistory = [];
    }
    /**
     * Set log level
     */
    setLevel(level) {
        this.logLevel = level;
    }
    /**
     * Get current level
     */
    getLevel() {
        return this.logLevel;
    }
}
export const logger = new Logger();
//# sourceMappingURL=logger.js.map