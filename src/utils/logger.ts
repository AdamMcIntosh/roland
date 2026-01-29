/**
 * Utility logger for consistent logging across the application
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private prefix = '[oh-my-goose]';

  info(...args: unknown[]): void {
    console.log(this.prefix, ...args);
  }

  warn(...args: unknown[]): void {
    console.warn(this.prefix, '⚠️', ...args);
  }

  error(...args: unknown[]): void {
    console.error(this.prefix, '❌', ...args);
  }

  debug(...args: unknown[]): void {
    if (process.env.DEBUG) {
      console.log(this.prefix, '🐛', ...args);
    }
  }

  success(...args: unknown[]): void {
    console.log(this.prefix, '✅', ...args);
  }
}

export const logger = new Logger();
