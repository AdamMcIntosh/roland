/**
 * Lazy Loading Module - Performance Optimization
 * Phase 10: Lazy loads resources on demand to reduce startup time
 */

export class LazyLoader<T> {
  private instance: T | null = null;
  private loader: () => T | Promise<T>;
  private isLoading = false;
  private loadPromise: Promise<T> | null = null;

  constructor(loader: () => T | Promise<T>) {
    this.loader = loader;
  }

  /**
   * Get instance, loading if necessary
   */
  async get(): Promise<T> {
    if (this.instance) {
      return this.instance;
    }

    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    this.isLoading = true;
    this.loadPromise = Promise.resolve(this.loader());

    try {
      this.instance = await this.loadPromise;
      this.isLoading = false;
      return this.instance;
    } catch (error) {
      this.isLoading = false;
      this.loadPromise = null;
      throw error;
    }
  }

  /**
   * Get sync instance if already loaded
   */
  getSync(): T | null {
    return this.instance;
  }

  /**
   * Check if loaded
   */
  isLoaded(): boolean {
    return this.instance !== null;
  }

  /**
   * Reset instance (for testing)
   */
  reset(): void {
    this.instance = null;
    this.isLoading = false;
    this.loadPromise = null;
  }
}

/**
 * Resource pool for connection management
 */
export class ResourcePool<T> {
  private items: T[] = [];
  private available: T[] = [];
  private factory: () => Promise<T>;
  private destroyer?: (item: T) => Promise<void>;
  private maxSize: number;

  constructor(
    factory: () => Promise<T>,
    maxSize: number = 10,
    destroyer?: (item: T) => Promise<void>
  ) {
    this.factory = factory;
    this.maxSize = maxSize;
    this.destroyer = destroyer;
  }

  /**
   * Acquire item from pool
   */
  async acquire(): Promise<T> {
    if (this.available.length > 0) {
      const item = this.available.pop();
      if (item) return item;
    }

    if (this.items.length < this.maxSize) {
      const item = await this.factory();
      this.items.push(item);
      return item;
    }

    // Wait for availability
    return new Promise((resolve) => {
      const checkAvailability = setInterval(() => {
        if (this.available.length > 0) {
          clearInterval(checkAvailability);
          const item = this.available.pop();
          if (item) resolve(item);
        }
      }, 10);
    });
  }

  /**
   * Release item back to pool
   */
  release(item: T): void {
    if (this.items.includes(item)) {
      this.available.push(item);
    }
  }

  /**
   * Clear pool
   */
  async clear(): Promise<void> {
    if (this.destroyer) {
      for (const item of this.items) {
        await this.destroyer(item);
      }
    }
    this.items = [];
    this.available = [];
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      total: this.items.length,
      available: this.available.length,
      inUse: this.items.length - this.available.length,
      maxSize: this.maxSize,
    };
  }
}

/**
 * Batch processor for bulk operations
 */
export class BatchProcessor<T, R> {
  private queue: T[] = [];
  private processor: (items: T[]) => Promise<R[]>;
  private batchSize: number;
  private flushInterval: number;
  private flushTimer?: NodeJS.Timeout;

  constructor(
    processor: (items: T[]) => Promise<R[]>,
    batchSize: number = 100,
    flushInterval: number = 1000
  ) {
    this.processor = processor;
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
  }

  /**
   * Add item to batch
   */
  add(item: T): void {
    this.queue.push(item);

    if (this.queue.length >= this.batchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  /**
   * Flush current batch
   */
  async flush(): Promise<R[]> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    if (this.queue.length === 0) {
      return [];
    }

    const items = this.queue;
    this.queue = [];

    return this.processor(items);
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }
}
