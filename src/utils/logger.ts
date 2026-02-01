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

class Logger {
  private prefix = '[oh-my-goose]';
  private logLevel: LogLevel = 'info';
  private context: LogContext = {};
  private logHistory: Array<{
    level: LogLevel;
    message: string;
    timestamp: Date;
    context: LogContext;
  }> = [];
  private maxHistorySize = 1000;

  constructor() {
    // Set log level from environment
    const envLevel = process.env.LOG_LEVEL as LogLevel | undefined;
    if (envLevel && ['debug', 'info', 'warn', 'error'].includes(envLevel)) {
      this.logLevel = envLevel;
    }
  }

  /**
   * Set global context
   */
  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Create scoped logger with additional context
   */
  createScoped(component: string): Logger {
    const scoped = new Logger();
    scoped.setContext({ ...this.context, component });
    scoped.logLevel = this.logLevel;
    return scoped;
  }

  /**
   * Check if level is enabled
   */
  private isEnabled(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
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
  private formatMessage(message: unknown, context: LogContext | undefined): string {
    if (typeof message === 'string') {
      const contextStr =
        context && Object.keys(context).length > 0
          ? ` ${JSON.stringify(context)}`
          : '';
      return `${message}${contextStr}`;
    }
    return String(message);
  }

  /**
   * Store in history
   */
  private storeInHistory(
    level: LogLevel,
    message: string,
    context: LogContext | undefined
  ): void {
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

  info(...args: unknown[]): void {
    if (!this.isEnabled('info')) return;

    const message = this.formatMessage(
      args[0],
      args[1] as LogContext | undefined
    );
    console.log(this.prefix, message, ...args.slice(2));
    this.storeInHistory('info', String(args[0]), args[1] as LogContext | undefined);
  }

  warn(...args: unknown[]): void {
    if (!this.isEnabled('warn')) return;

    const message = this.formatMessage(
      args[0],
      args[1] as LogContext | undefined
    );
    console.warn(this.prefix, '⚠️', message, ...args.slice(2));
    this.storeInHistory('warn', String(args[0]), args[1] as LogContext | undefined);
  }

  error(...args: unknown[]): void {
    if (!this.isEnabled('error')) return;

    const message = this.formatMessage(
      args[0],
      args[1] as LogContext | undefined
    );
    console.error(this.prefix, '❌', message, ...args.slice(2));
    this.storeInHistory('error', String(args[0]), args[1] as LogContext | undefined);
  }

  debug(...args: unknown[]): void {
    if (!this.isEnabled('debug')) return;

    const message = this.formatMessage(
      args[0],
      args[1] as LogContext | undefined
    );
    console.log(this.prefix, '🐛', message, ...args.slice(2));
    this.storeInHistory('debug', String(args[0]), args[1] as LogContext | undefined);
  }

  success(...args: unknown[]): void {
    if (!this.isEnabled('info')) return;

    const message = this.formatMessage(
      args[0],
      args[1] as LogContext | undefined
    );
    console.log(this.prefix, '✅', message, ...args.slice(2));
    this.storeInHistory('info', String(args[0]), args[1] as LogContext | undefined);
  }

  /**
   * Get log history
   */
  getHistory(filter?: { level?: LogLevel; limit?: number }): typeof this.logHistory {
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
  clearHistory(): void {
    this.logHistory = [];
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Get current level
   */
  getLevel(): LogLevel {
    return this.logLevel;
  }
}

export const logger = new Logger();
