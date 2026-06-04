import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import { getConfig, type LogLevel } from './config.js';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

interface LogMeta {
  [key: string]: unknown;
}

function baseEntry(level: LogLevel, msg: string, meta?: LogMeta) {
  const config = getConfig();
  return {
    time: new Date().toISOString(),
    level,
    msg,
    service: 'roland-web',
    version: config.version,
    ...meta,
  };
}

class Logger {
  private accessStream: WriteStream | null = null;
  private errorStream: WriteStream | null = null;
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    const { logDir } = getConfig();
    mkdirSync(logDir, { recursive: true });

    this.accessStream = createWriteStream(`${logDir}/access.log`, { flags: 'a' });
    this.errorStream = createWriteStream(`${logDir}/error.log`, { flags: 'a' });
    this.initialized = true;
  }

  private shouldLog(level: LogLevel): boolean {
    const min = getConfig().logLevel;
    return LEVEL_RANK[level] >= LEVEL_RANK[min];
  }

  private writeApp(level: LogLevel, msg: string, meta?: LogMeta): void {
    if (!this.shouldLog(level)) return;
    const line = JSON.stringify(baseEntry(level, msg, meta)) + '\n';
    if (level === 'error') {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  }

  private writeFile(stream: WriteStream | null, entry: Record<string, unknown>): void {
    if (!stream) return;
    stream.write(JSON.stringify(entry) + '\n');
  }

  debug(msg: string, meta?: LogMeta): void {
    this.writeApp('debug', msg, meta);
  }

  info(msg: string, meta?: LogMeta): void {
    this.writeApp('info', msg, meta);
  }

  warn(msg: string, meta?: LogMeta): void {
    this.writeApp('warn', msg, meta);
  }

  error(msg: string, meta?: LogMeta): void {
    const entry = baseEntry('error', msg, meta);
    if (this.shouldLog('error')) {
      process.stderr.write(JSON.stringify(entry) + '\n');
    }
    this.writeFile(this.errorStream, entry);
  }

  /** HTTP access log — written only to access.log. */
  access(meta: {
    method: string;
    path: string;
    status: number;
    durationMs: number;
    ip?: string;
    userAgent?: string;
  }): void {
    const entry = {
      ...baseEntry('info', 'http_request'),
      type: 'access',
      ...meta,
    };
    this.writeFile(this.accessStream, entry);
  }

  /** Gracefully close file streams (shutdown). */
  close(): Promise<void> {
    return new Promise((resolvePromise) => {
      let pending = 0;
      const done = () => { if (--pending <= 0) resolvePromise(); };

      for (const stream of [this.accessStream, this.errorStream]) {
        if (!stream) continue;
        pending++;
        stream.end(done);
      }
      if (pending === 0) resolvePromise();
    });
  }
}

export const logger = new Logger();

/** Express middleware — logs every request to access.log when response finishes. */
export function accessLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    // Skip health checks in access log to reduce noise
    if (req.path === '/health') return;

    logger.access({
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    });
  });

  next();
}
