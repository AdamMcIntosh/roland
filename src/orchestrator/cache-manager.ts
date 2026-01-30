/**
 * Cache Manager - Simple JSON File-Based Caching
 * 
 * MVP Version: Stores cached results in a simple JSON file
 * Fast lookup, basic expiration support, cost savings tracking
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import { CacheEntry, CacheStats } from '../utils/types.js';
import { CacheError, CacheReadError, CacheWriteError } from '../utils/errors.js';

export class CacheManager {
  private cacheDir: string;
  private cacheFile: string;
  private cache: Map<string, CacheEntry> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    totalEntries: 0,
    savedCost: 0,
  };

  constructor(cacheDir: string = '.cache') {
    this.cacheDir = cacheDir;
    this.cacheFile = path.join(cacheDir, 'query-cache.json');
    this.stats = { hits: 0, misses: 0, totalEntries: 0, savedCost: 0 };
    this.ensureCacheDir();
    this.loadCache();
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDir(): void {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
        logger.debug(`Created cache directory: ${this.cacheDir}`);
      }
    } catch (error) {
      throw new CacheError(`Failed to create cache directory: ${error}`);
    }
  }

  /**
   * Load cache from disk into memory
   */
  private loadCache(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = fs.readFileSync(this.cacheFile, 'utf-8');
        const parsed = JSON.parse(data);

        if (parsed.entries) {
          Object.entries(parsed.entries).forEach(([key, value]: [string, any]) => {
            this.cache.set(key, {
              key,
              value: value.value,
              timestamp: value.timestamp,
              ttl: value.ttl,
              cost: value.cost,
            });
          });
        }

        if (parsed.stats) {
          this.stats = parsed.stats;
        }

        logger.debug(`Loaded ${this.cache.size} cached entries`);
      }
    } catch (error) {
      throw new CacheReadError(`Failed to load cache: ${error}`);
    }
  }

  /**
   * Save cache to disk
   */
  private saveCache(): void {
    try {
      const entries: Record<string, any> = {};
      this.cache.forEach((value, key) => {
        entries[key] = value;
      });

      const data = {
        version: 1,
        timestamp: Date.now(),
        entries,
        stats: this.stats,
      };

      fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
      logger.debug(`Saved cache with ${this.cache.size} entries`);
    } catch (error) {
      throw new CacheWriteError(`Failed to save cache: ${error}`);
    }
  }

  /**
   * Generate cache key from query
   * Simple hash-like key based on query content
   * 
   * @param query - Query string
   * @returns Cache key
   */
  private generateKey(query: string): string {
    // Simple but effective: hash the query
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `query_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Check if entry is expired
   * 
   * @param entry - Cache entry
   * @returns True if expired
   */
  private isExpired(entry: CacheEntry): boolean {
    if (!entry.ttl) return false;
    const age = Date.now() - entry.timestamp;
    return age > entry.ttl;
  }

  /**
   * Try to get result from cache
   * 
   * @param query - Query string
   * @returns Cached result or null if not found/expired
   */
  get(query: string): string | null {
    const key = this.generateKey(query);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    logger.debug(`Cache hit: ${key}`);

    return entry.value as string;
  }

  /**
   * Store result in cache
   * 
   * @param query - Query string
   * @param result - Result to cache
   * @param model - Model used
   * @param cost - Cost of this query
   * @param ttl - Time to live in milliseconds (optional)
   */
  set(
    query: string,
    result: string,
    model: string,
    cost: number,
    ttl?: number
  ): void {
    const key = this.generateKey(query);

    const entry: CacheEntry = {
      key,
      value: result,
      timestamp: Date.now(),
      ttl,
      cost,
    };

    this.cache.set(key, entry);
    this.saveCache();
    logger.debug(`Cached result: ${key}`);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, totalEntries: 0, savedCost: 0 };
    this.saveCache();
    logger.debug('Cache cleared');
  }

  /**
   * Get cache statistics
   * 
   * @returns Cache hit rate and stats
   */
  getStats(): CacheStats & { hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      ...this.stats,
      hitRate,
    };
  }

  /**
   * Get number of cached entries
   * 
   * @returns Entry count
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Generate cache report
   * 
   * @returns Formatted report
   */
  generateReport(): string {
    const stats = this.getStats();
    const total = this.stats.hits + this.stats.misses;

    let report = '\n💾 Cache Statistics:\n';
    report += `  Size: ${this.cache.size} entries\n`;
    report += `  Hit Rate: ${stats.hitRate.toFixed(1)}% (${this.stats.hits}/${total} queries)\n`;

    return report;
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();
