/**
 * Cache System Type Definitions
 * Phase 7: Caching & Persistence
 */

/**
 * Cache entry storing workflow execution results
 */
export interface CacheEntry {
  /** Workflow name */
  workflowName: string;
  /** Workflow version */
  version: string;
  /** Input parameters used */
  inputs: Record<string, any>;
  /** Cached workflow result */
  result: any;
  /** Timestamp when cached (ms) */
  timestamp: number;
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Hash of workflow + inputs for quick lookup */
  hash: string;
  /** Number of times this cache entry was hit */
  hitCount: number;
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  /** Enable/disable caching */
  enabled: boolean;
  /** Maximum cache size in MB (0 = unlimited) */
  maxSize: number;
  /** Default TTL for cache entries in milliseconds */
  defaultTtl: number;
  /** Interval for automatic cleanup in milliseconds */
  cleanupInterval: number;
  /** Path to cache file */
  cachePath: string;
  /** Whether to persist cache to disk */
  persistent: boolean;
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Current cache size in bytes */
  sizeBytes: number;
  /** Number of entries in cache */
  entryCount: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Total cost saved from cache hits */
  costSaved: number;
  /** Total execution time saved (ms) */
  timeSaved: number;
  /** Oldest entry timestamp */
  oldestEntry?: number;
  /** Newest entry timestamp */
  newestEntry?: number;
}

/**
 * Cache hit result
 */
export interface CacheHit {
  /** Whether cache was hit */
  hit: boolean;
  /** Cached result if hit */
  result?: any;
  /** Cache entry metadata */
  entry?: CacheEntry;
  /** Cost saved by using cache */
  costSaved?: number;
  /** Time saved by using cache (ms) */
  timeSaved?: number;
}

/**
 * Cache key components for hashing
 */
export interface CacheKey {
  /** Workflow name */
  workflowName: string;
  /** Workflow version */
  version: string;
  /** Normalized input parameters */
  inputs: Record<string, any>;
}

/**
 * Cache invalidation options
 */
export interface InvalidationOptions {
  /** Invalidate specific workflow */
  workflowName?: string;
  /** Invalidate specific version */
  version?: string;
  /** Invalidate entries older than timestamp */
  olderThan?: number;
  /** Invalidate expired entries only */
  expiredOnly?: boolean;
  /** Invalidate all entries */
  all?: boolean;
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  maxSize: 100, // 100 MB
  defaultTtl: 24 * 60 * 60 * 1000, // 24 hours
  cleanupInterval: 60 * 60 * 1000, // 1 hour
  cachePath: './cache.json',
  persistent: true,
};
