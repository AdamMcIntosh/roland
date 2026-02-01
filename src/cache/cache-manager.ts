/**
 * Cache Manager for Workflow Results
 * Phase 7: Caching & Persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';
import {
  CacheEntry,
  CacheConfig,
  CacheStats,
  CacheHit,
  CacheKey,
  InvalidationOptions,
  DEFAULT_CACHE_CONFIG,
} from './types.js';

/**
 * CacheManager - Manages workflow execution result caching
 */
export class CacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private config: CacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    costSaved: 0,
    timeSaved: 0,
  };
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };

    if (this.config.persistent) {
      this.loadFromDisk();
    }

    if (this.config.enabled && this.config.cleanupInterval > 0) {
      this.startCleanupTimer();
    }

    logger.info(`[CacheManager] Initialized (enabled: ${this.config.enabled}, persistent: ${this.config.persistent})`);
  }

  /**
   * Get cached result for workflow execution
   */
  get(workflowName: string, version: string, inputs: Record<string, any>): CacheHit {
    if (!this.config.enabled) {
      return { hit: false };
    }

    const hash = this.generateHash({ workflowName, version, inputs });
    const entry = this.cache.get(hash);

    if (!entry) {
      this.stats.misses++;
      logger.debug(`[CacheManager] Cache MISS for ${workflowName}`);
      return { hit: false };
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(hash);
      this.stats.misses++;
      logger.debug(`[CacheManager] Cache EXPIRED for ${workflowName}`);
      return { hit: false };
    }

    // Cache hit
    entry.hitCount++;
    this.stats.hits++;

    const costSaved = entry.result.cost || 0;
    const timeSaved = entry.result.duration || 0;
    this.stats.costSaved += costSaved;
    this.stats.timeSaved += timeSaved;

    logger.success(`[CacheManager] Cache HIT for ${workflowName} (saved $${costSaved.toFixed(4)}, ${timeSaved}ms)`);

    return {
      hit: true,
      result: entry.result,
      entry,
      costSaved,
      timeSaved,
    };
  }

  /**
   * Store workflow result in cache
   */
  set(
    workflowName: string,
    version: string,
    inputs: Record<string, any>,
    result: any,
    ttl?: number
  ): void {
    if (!this.config.enabled) {
      return;
    }

    const hash = this.generateHash({ workflowName, version, inputs });
    const entry: CacheEntry = {
      workflowName,
      version,
      inputs: this.normalizeInputs(inputs),
      result,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTtl,
      hash,
      hitCount: 0,
    };

    this.cache.set(hash, entry);
    logger.debug(`[CacheManager] Cached result for ${workflowName} (TTL: ${entry.ttl}ms)`);

    // Save to disk if persistent
    if (this.config.persistent) {
      this.saveToDisk();
    }

    // Check size limits
    this.enforceMaxSize();
  }

  /**
   * Invalidate cache entries
   */
  invalidate(options: InvalidationOptions = {}): number {
    let removed = 0;

    if (options.all) {
      removed = this.cache.size;
      this.cache.clear();
      logger.info(`[CacheManager] Invalidated all cache entries (${removed})`);
    } else if (options.expiredOnly) {
      for (const [hash, entry] of this.cache.entries()) {
        if (this.isExpired(entry)) {
          this.cache.delete(hash);
          removed++;
        }
      }
      logger.info(`[CacheManager] Removed ${removed} expired entries`);
    } else {
      for (const [hash, entry] of this.cache.entries()) {
        let shouldRemove = false;

        if (options.workflowName && entry.workflowName !== options.workflowName) {
          continue;
        }
        if (options.version && entry.version !== options.version) {
          continue;
        }
        if (options.olderThan && entry.timestamp >= options.olderThan) {
          continue;
        }

        if (options.workflowName || options.version || options.olderThan) {
          shouldRemove = true;
        }

        if (shouldRemove) {
          this.cache.delete(hash);
          removed++;
        }
      }
      logger.info(`[CacheManager] Invalidated ${removed} cache entries`);
    }

    if (removed > 0 && this.config.persistent) {
      this.saveToDisk();
    }

    return removed;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const sizeBytes = this.calculateCacheSize();

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      sizeBytes,
      entryCount: this.cache.size,
      hitRate: this.stats.hits + this.stats.misses > 0
        ? this.stats.hits / (this.stats.hits + this.stats.misses)
        : 0,
      costSaved: this.stats.costSaved,
      timeSaved: this.stats.timeSaved,
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.timestamp)) : undefined,
      newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.timestamp)) : undefined,
    };
  }

  /**
   * Clear all cache and reset statistics
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      costSaved: 0,
      timeSaved: 0,
    };

    if (this.config.persistent) {
      this.saveToDisk();
    }

    logger.info('[CacheManager] Cache cleared');
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    return this.invalidate({ expiredOnly: true });
  }

  /**
   * Stop cleanup timer and save cache
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    if (this.config.persistent) {
      this.saveToDisk();
    }

    logger.info('[CacheManager] Destroyed');
  }

  /**
   * Generate hash for cache key
   */
  private generateHash(key: CacheKey): string {
    const normalized = {
      workflowName: key.workflowName,
      version: key.version,
      inputs: this.normalizeInputs(key.inputs),
    };

    const str = JSON.stringify(normalized);
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  /**
   * Normalize inputs for consistent hashing
   */
  private normalizeInputs(inputs: Record<string, any>): Record<string, any> {
    // Sort keys for consistent ordering
    const sorted: Record<string, any> = {};
    const keys = Object.keys(inputs).sort();

    for (const key of keys) {
      sorted[key] = inputs[key];
    }

    return sorted;
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    const age = Date.now() - entry.timestamp;
    return age > entry.ttl;
  }

  /**
   * Calculate total cache size in bytes
   */
  private calculateCacheSize(): number {
    const entries = Array.from(this.cache.values());
    const json = JSON.stringify(entries);
    return Buffer.byteLength(json, 'utf8');
  }

  /**
   * Enforce max cache size by removing oldest entries
   */
  private enforceMaxSize(): void {
    if (this.config.maxSize <= 0) {
      return; // No size limit
    }

    const maxBytes = this.config.maxSize * 1024 * 1024; // Convert MB to bytes
    let currentSize = this.calculateCacheSize();

    if (currentSize <= maxBytes) {
      return;
    }

    // Sort entries by timestamp (oldest first)
    const entries = Array.from(this.cache.entries()).sort(
      ([, a], [, b]) => a.timestamp - b.timestamp
    );

    let removed = 0;
    for (const [hash, entry] of entries) {
      if (currentSize <= maxBytes) {
        break;
      }

      this.cache.delete(hash);
      removed++;
      currentSize = this.calculateCacheSize();
    }

    if (removed > 0) {
      logger.warn(`[CacheManager] Removed ${removed} oldest entries to enforce size limit`);
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const removed = this.cleanup();
      if (removed > 0) {
        logger.debug(`[CacheManager] Auto-cleanup removed ${removed} expired entries`);
      }
    }, this.config.cleanupInterval);
  }

  /**
   * Load cache from disk
   */
  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.config.cachePath)) {
        logger.debug('[CacheManager] No cache file found, starting fresh');
        return;
      }

      const data = fs.readFileSync(this.config.cachePath, 'utf8');
      const entries: CacheEntry[] = JSON.parse(data);

      let loaded = 0;
      let expired = 0;

      for (const entry of entries) {
        if (this.isExpired(entry)) {
          expired++;
          continue;
        }

        this.cache.set(entry.hash, entry);
        loaded++;
      }

      logger.success(`[CacheManager] Loaded ${loaded} cache entries from disk (${expired} expired)`);
    } catch (error) {
      logger.error('[CacheManager] Failed to load cache from disk:', error);
    }
  }

  /**
   * Save cache to disk
   */
  private saveToDisk(): void {
    try {
      const entries = Array.from(this.cache.values());
      const data = JSON.stringify(entries, null, 2);

      const dir = path.dirname(this.config.cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.config.cachePath, data, 'utf8');
      logger.debug(`[CacheManager] Saved ${entries.length} entries to disk`);
    } catch (error) {
      logger.error('[CacheManager] Failed to save cache to disk:', error);
    }
  }
}
