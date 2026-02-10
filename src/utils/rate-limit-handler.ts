/**
 * Rate Limit Handler - Automatic retry with exponential backoff
 * 
 * Handles rate limit errors from LLM providers:
 * - OpenRouter (free tier models)
 * 
 * Features:
 * - Auto-detection of rate limit errors
 * - Exponential backoff with jitter
 * - Countdown timer display
 * - Configurable max retries
 * - Resume from last operation
 */

import { logger } from './logger.js';
import chalk from 'chalk';

export interface RateLimitConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
}

export interface RateLimitError {
  provider: 'openrouter' | 'unknown';
  retryAfter?: number; // seconds
  message: string;
  statusCode?: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRetries: 5,
  initialDelayMs: 61000, // 61 seconds — OpenRouter enforces per-minute limits
  maxDelayMs: 120000, // 2 minutes max
  backoffMultiplier: 1.5,
  jitterMs: 2000,
};

export class RateLimitHandler {
  private config: RateLimitConfig;
  private retryCount: number = 0;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect if an error is a rate limit error
   */
  static isRateLimitError(error: any): RateLimitError | null {
    const errorMessage = error?.message || String(error);
    const statusCode = error?.status || error?.statusCode;

    // HTTP 429 is standard rate limit, 402 is OpenRouter free-tier quota exhaustion
    // HTTP 502/503 are transient server errors (capacity, unavailable) that should also retry
    if (statusCode === 429 || statusCode === 402 || statusCode === 502 || statusCode === 503) {
      return {
        provider: this.detectProvider(error),
        retryAfter: this.extractRetryAfter(error),
        message: errorMessage,
        statusCode,
      };
    }

    // Provider-specific error messages
    const rateLimitPatterns = [
      /rate limit/i,
      /too many requests/i,
      /quota exceeded/i,
      /requests per/i,
      /throttle/i,
      /429/,
      /server at capacity/i,
      /service unavailable/i,
      /502/,
      /503/,
    ];

    if (rateLimitPatterns.some(pattern => pattern.test(errorMessage))) {
      return {
        provider: this.detectProvider(error),
        retryAfter: this.extractRetryAfter(error),
        message: errorMessage,
        statusCode,
      };
    }

    return null;
  }

  /**
   * Detect which provider the error is from
   */
  private static detectProvider(error: any): RateLimitError['provider'] {
    const message = error?.message || String(error);
    
    if (message.includes('openrouter')) {
      return 'openrouter';
    }
    
    return 'unknown';
  }

  /**
   * Extract retry-after header if present
   */
  private static extractRetryAfter(error: any): number | undefined {
    // Check headers
    const headers = error?.response?.headers || error?.headers;
    if (headers) {
      const retryAfter = headers['retry-after'] || headers['Retry-After'];
      if (retryAfter) {
        return parseInt(retryAfter, 10);
      }
    }

    // Check error body
    const body = error?.response?.data || error?.body;
    if (body?.retry_after) {
      return body.retry_after;
    }

    return undefined;
  }

  /**
   * Calculate delay for next retry with exponential backoff
   */
  private calculateDelay(retryAfter?: number, statusCode?: number): number {
    // If server provided retry-after, use it
    if (retryAfter) {
      return retryAfter * 1000; // Convert to milliseconds
    }

    // For transient server errors (502/503), use much shorter initial delay
    const isTransientServerError = statusCode === 502 || statusCode === 503;
    const baseDelay = isTransientServerError ? 3000 : this.config.initialDelayMs;

    // Exponential backoff: baseDelay * (multiplier ^ retryCount)
    const exponentialDelay = baseDelay * 
      Math.pow(this.config.backoffMultiplier, this.retryCount);

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * this.config.jitterMs;

    // Cap at max delay
    const delay = Math.min(exponentialDelay + jitter, this.config.maxDelayMs);

    return delay;
  }

  /**
   * Wait with countdown timer
   */
  private async waitWithCountdown(delayMs: number): Promise<void> {
    const totalSeconds = Math.ceil(delayMs / 1000);
    
    logger.info(`[RateLimitHandler] Waiting ${totalSeconds}s before retry (attempt ${this.retryCount + 1}/${this.config.maxRetries})`);
    
    // Show countdown in terminal
    for (let remaining = totalSeconds; remaining > 0; remaining--) {
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      const timeStr = minutes > 0 
        ? `${minutes}m ${seconds}s` 
        : `${seconds}s`;
      
      process.stdout.write(
        `\r${chalk.yellow('⏳')} Rate limit - retrying in ${chalk.bold(timeStr)}... `
      );
      
      await this.sleep(1000);
    }
    
    process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear line
    console.log(chalk.green('✓') + ' Resuming...');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute function with automatic retry on rate limit
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T> {
    this.retryCount = 0;

    while (true) {
      try {
        const result = await fn();
        
        // Success - reset retry count
        if (this.retryCount > 0) {
          logger.info(`[RateLimitHandler] ${operationName} succeeded after ${this.retryCount} retries`);
        }
        this.retryCount = 0;
        
        return result;
      } catch (error) {
        const rateLimitError = RateLimitHandler.isRateLimitError(error);
        
        if (!rateLimitError) {
          // Not a rate limit error - rethrow
          throw error;
        }

        // Check if we've exceeded max retries
        if (this.retryCount >= this.config.maxRetries) {
          logger.error(`[RateLimitHandler] Max retries (${this.config.maxRetries}) exceeded for ${operationName}`);
          throw new Error(
            `Rate limit exceeded after ${this.config.maxRetries} retries. ` +
            `Provider: ${rateLimitError.provider}. Original error: ${rateLimitError.message}`
          );
        }

        // Calculate delay and wait
        const delayMs = this.calculateDelay(rateLimitError.retryAfter, rateLimitError.statusCode);
        
        console.log(''); // New line
        console.log(chalk.yellow('⚠️  Rate limit hit:'), rateLimitError.message);
        console.log(chalk.dim(`   Provider: ${rateLimitError.provider}`));
        
        await this.waitWithCountdown(delayMs);
        
        this.retryCount++;
      }
    }
  }

  /**
   * Reset retry counter (useful for new operations)
   */
  reset(): void {
    this.retryCount = 0;
  }

  /**
   * Get current retry count
   */
  getRetryCount(): number {
    return this.retryCount;
  }
}

/**
 * Global rate limit handler instance
 */
export const rateLimitHandler = new RateLimitHandler();
