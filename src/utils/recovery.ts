/**
 * Enhanced Error Recovery - Phase 10 Improvements
 * Graceful degradation and recovery strategies
 */

import { logger } from './logger.js';

export interface RecoveryStrategy {
  name: string;
  shouldTry: (error: Error) => boolean;
  execute: () => Promise<unknown>;
  maxRetries?: number;
}

/**
 * Resilience wrapper for error handling and recovery
 */
export class ResilientExecutor {
  private strategies: RecoveryStrategy[] = [];
  private retryDelays = [100, 500, 2000]; // ms

  /**
   * Register a recovery strategy
   */
  registerStrategy(strategy: RecoveryStrategy): void {
    this.strategies.push(strategy);
  }

  /**
   * Execute with automatic recovery
   */
  async execute<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      backoff?: boolean;
      fallback?: () => Promise<T>;
      context?: string;
    } = {}
  ): Promise<T> {
    const { maxRetries = 3, backoff = true, fallback, context = 'execution' } = options;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        logger.warn(
          `[${context}] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError.message}`
        );

        if (attempt < maxRetries) {
          // Try recovery strategies
          const recovered = await this.tryRecoveryStrategies(lastError);
          if (recovered) {
            continue; // Retry main function
          }

          // Exponential backoff
          if (backoff && attempt < maxRetries) {
            const delay = this.retryDelays[Math.min(attempt, this.retryDelays.length - 1)];
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
    }

    // Use fallback if available
    if (fallback) {
      logger.info(`[${context}] Using fallback strategy`);
      return fallback();
    }

    throw lastError || new Error(`Failed after ${maxRetries} retries`);
  }

  /**
   * Try registered recovery strategies
   */
  private async tryRecoveryStrategies(error: Error): Promise<boolean> {
    for (const strategy of this.strategies) {
      if (strategy.shouldTry(error)) {
        try {
          logger.info(`[Recovery] Attempting strategy: ${strategy.name}`);
          await strategy.execute();
          logger.info(`[Recovery] Strategy succeeded: ${strategy.name}`);
          return true;
        } catch (strategyError) {
          logger.warn(
            `[Recovery] Strategy failed: ${strategy.name} - ${strategyError}`
          );
        }
      }
    }
    return false;
  }
}

/**
 * Circuit breaker for failing services
 */
export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private failureThreshold: number;
  private successThreshold: number;
  private resetTimeout: number;
  private nextResetTime = 0;

  constructor(failureThreshold = 5, successThreshold = 2, resetTimeout = 60000) {
    this.failureThreshold = failureThreshold;
    this.successThreshold = successThreshold;
    this.resetTimeout = resetTimeout;
  }

  /**
   * Execute with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() >= this.nextResetTime) {
        logger.info('[CircuitBreaker] Attempting to reset (half-open)');
        this.state = 'half-open';
        this.failureCount = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();

      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failureCount = 0;
        logger.info('[CircuitBreaker] Circuit closed (recovered)');
      }

      return result;
    } catch (error) {
      this.failureCount++;

      if (this.failureCount >= this.failureThreshold) {
        this.state = 'open';
        this.nextResetTime = Date.now() + this.resetTimeout;
        logger.error(`[CircuitBreaker] Circuit opened after ${this.failureCount} failures`);
      }

      throw error;
    }
  }

  /**
   * Get circuit state
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      nextResetTime: this.nextResetTime,
    };
  }

  /**
   * Manual reset
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.nextResetTime = 0;
    logger.info('[CircuitBreaker] Manually reset');
  }
}

/**
 * Graceful degradation wrapper
 */
export class GracefulDegradation {
  private fullFeaturesFallback: (() => Promise<unknown>) | null = null;
  private partialFeaturesFallback: (() => Promise<unknown>) | null = null;

  /**
   * Execute with graceful degradation
   */
  async execute<T>(
    primary: () => Promise<T>,
    options: {
      fullFallback?: () => Promise<T>;
      partialFallback?: () => Promise<Partial<T>>;
      minimalFallback?: () => Partial<T>;
    } = {}
  ): Promise<T | Partial<T>> {
    try {
      return await primary();
    } catch (primaryError) {
      logger.warn(`[Degradation] Primary failed: ${primaryError}`);

      if (options.fullFallback) {
        try {
          logger.info('[Degradation] Attempting full fallback');
          return await options.fullFallback();
        } catch (fullError) {
          logger.warn(`[Degradation] Full fallback failed: ${fullError}`);
        }
      }

      if (options.partialFallback) {
        try {
          logger.info('[Degradation] Attempting partial fallback');
          return (await options.partialFallback()) as T;
        } catch (partialError) {
          logger.warn(`[Degradation] Partial fallback failed: ${partialError}`);
        }
      }

      if (options.minimalFallback) {
        logger.info('[Degradation] Using minimal fallback');
        return options.minimalFallback() as T;
      }

      throw primaryError;
    }
  }
}

/**
 * Timeout wrapper for operations
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), timeoutMs)
    ),
  ]);
}

/**
 * Retry with jitter
 */
export async function retryWithJitter<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 100
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const jitter = Math.random() * baseDelayMs;
        const exponentialBackoff = baseDelayMs * Math.pow(2, attempt);
        const delay = exponentialBackoff + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}
