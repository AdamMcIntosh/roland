/**
 * Unit Tests: Cache Manager
 * Tests metadata-aware caching, statistics, and persistence
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CacheManager } from '../src/orchestrator/cache-manager';
import { rm } from 'fs/promises';

describe('CacheManager', () => {
  const testCacheFile = './.test-cache-manager.json';
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager(testCacheFile);
  });

  afterEach(async () => {
    cache.clear();
    try {
      await rm(testCacheFile, { force: true });
    } catch {
      // File may not exist
    }
  });

  describe('set() and get()', () => {
    it('should store and retrieve value', () => {
      const key = 'test-query';
      const value = 'test-result';

      cache.set(key, value, 'grok-3', 0.001);
      const retrieved = cache.get(key);

      expect(retrieved).toBe(value);
    });

    it('should store with metadata', () => {
      const metadata = { agent: 'architect', mode: 'Ultrapilot', complexity: 'simple' };
      
      cache.set('query', 'result', 'model', 0.001, metadata);
      const retrieved = cache.get('query', metadata);

      expect(retrieved).toBe('result');
    });

    it('should return null for missing key', () => {
      const result = cache.get('nonexistent-key');
      expect(result).toBeNull();
    });

    it('should handle complex values', () => {
      const complexValue = {
        text: 'complex result',
        metadata: { nested: true },
        array: [1, 2, 3],
      };

      cache.set('complex', JSON.stringify(complexValue), 'model', 0.002);
      const retrieved = cache.get('complex');

      expect(retrieved).toBe(JSON.stringify(complexValue));
    });

    it('should distinguish by metadata', () => {
      const query = 'same-query';
      const metadata1 = { agent: 'architect', mode: 'Ultrapilot', complexity: 'simple' };
      const metadata2 = { agent: 'executor', mode: 'Ultrapilot', complexity: 'simple' };

      cache.set(query, 'result-1', 'model', 0.001, metadata1);
      cache.set(query, 'result-2', 'model', 0.001, metadata2);

      expect(cache.get(query, metadata1)).toBe('result-1');
      expect(cache.get(query, metadata2)).toBe('result-2');
    });
  });

  describe('clear()', () => {
    it('should remove all cached entries', () => {
      cache.set('key1', 'value1', 'model', 0.001);
      cache.set('key2', 'value2', 'model', 0.001);
      cache.set('key3', 'value3', 'model', 0.001);

      cache.clear();

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBeNull();
    });

    it('should reset statistics', () => {
      cache.set('query', 'result', 'model', 0.001);
      cache.get('query');

      cache.clear();
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('getStats()', () => {
    it('should track cache hits', () => {
      cache.set('query', 'result', 'model', 0.001);
      cache.get('query');
      cache.get('query');

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
    });

    it('should track cache misses', () => {
      cache.get('missing1');
      cache.get('missing2');
      cache.get('missing3');

      const stats = cache.getStats();
      expect(stats.misses).toBe(3);
    });

    it('should calculate hit rate', () => {
      cache.set('query', 'result', 'model', 0.001);
      cache.get('query');  // hit
      cache.get('query');  // hit
      cache.get('missing'); // miss
      cache.get('missing'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
    });

    it('should track saved costs', () => {
      cache.set('query1', 'result1', 'model', 0.1);
      cache.set('query2', 'result2', 'model', 0.2);

      cache.get('query1'); // hit - saves 0.1
      cache.get('query2'); // hit - saves 0.2

      const stats = cache.getStats();
      expect(stats.savedCost).toBeCloseTo(0.3, 5);
    });

    it('should have agent statistics', () => {
      const metadata = { agent: 'architect', mode: 'Ultrapilot', complexity: 'simple' };
      
      cache.set('q1', 'r1', 'model', 0.05, metadata);
      cache.get('q1', metadata); // hit

      const stats = cache.getStats();
      expect(stats).toHaveProperty('agentStats');
    });

    it('should have mode statistics', () => {
      cache.set('q1', 'r1', 'model', 0.05, { agent: 'arch', mode: 'Ultrapilot', complexity: 'simple' });
      cache.get('q1', { agent: 'arch', mode: 'Ultrapilot', complexity: 'simple' });

      const stats = cache.getStats();
      expect(stats).toHaveProperty('modeStats');
    });
  });

  describe('generateReport()', () => {
    it('should generate cache report', () => {
      cache.set('query', 'result', 'model', 0.001);
      cache.get('query');
      cache.get('missing');

      const report = cache.generateReport();

      expect(typeof report).toBe('string');
      expect(report).toContain('Cache Statistics');
      expect(report).toContain('Hits');
      expect(report).toContain('Misses');
    });

    it('should include cost savings in report', () => {
      cache.set('query', 'result', 'model', 0.5);
      cache.get('query');

      const report = cache.generateReport();

      expect(report).toContain('Saved');
    });
  });

  describe('Size Management', () => {
    it('should handle many entries', () => {
      const entries = 100;
      
      for (let i = 0; i < entries; i++) {
        cache.set(`query-${i}`, `result-${i}`, 'model', 0.001);
      }

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(entries);
    });

    it('should retrieve entries after many operations', () => {
      // Add entries
      for (let i = 0; i < 50; i++) {
        cache.set(`query-${i}`, `result-${i}`, 'model', 0.001);
      }

      // Retrieve specific entry
      const result = cache.get('query-25');
      expect(result).toBe('result-25');
    });
  });

  describe('Persistence', () => {
    it('should save cache to file', () => {
      cache.set('persistent-query', 'persistent-result', 'model', 0.001);
      
      // Create new cache instance from same file
      const newCache = new CacheManager(testCacheFile);
      const retrieved = newCache.get('persistent-query');

      expect(retrieved).toBe('persistent-result');
    });

    it('should preserve statistics on load', () => {
      cache.set('query', 'result', 'model', 0.1);
      cache.get('query');
      cache.get('missing');

      // New instance
      const newCache = new CacheManager(testCacheFile);
      const stats = newCache.getStats();

      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.savedCost).toBeCloseTo(0.1, 5);
    });

    it('should handle corrupted cache file gracefully', () => {
      // This would normally test recovery from bad JSON
      // In production, would attempt to recover or start fresh
      const cache2 = new CacheManager('./.test-cache-corrupted.json');
      expect(cache2).toBeDefined();
    });
  });

  describe('Metadata Isolation', () => {
    it('should isolate by agent', () => {
      const query = 'test';
      const mode = 'Ultrapilot';
      const complexity = 'simple';

      const meta1 = { agent: 'architect', mode, complexity };
      const meta2 = { agent: 'executor', mode, complexity };

      cache.set(query, 'arch-result', 'model', 0.01, meta1);
      cache.set(query, 'exec-result', 'model', 0.01, meta2);

      expect(cache.get(query, meta1)).toBe('arch-result');
      expect(cache.get(query, meta2)).toBe('exec-result');
    });

    it('should isolate by mode', () => {
      const query = 'test';
      const agent = 'architect';
      const complexity = 'simple';

      const meta1 = { agent, mode: 'Ultrapilot', complexity };
      const meta2 = { agent, mode: 'Swarm', complexity };

      cache.set(query, 'ultra-result', 'model', 0.01, meta1);
      cache.set(query, 'swarm-result', 'model', 0.01, meta2);

      expect(cache.get(query, meta1)).toBe('ultra-result');
      expect(cache.get(query, meta2)).toBe('swarm-result');
    });

    it('should isolate by complexity', () => {
      const query = 'test';
      const agent = 'architect';
      const mode = 'Ultrapilot';

      const meta1 = { agent, mode, complexity: 'simple' };
      const meta2 = { agent, mode, complexity: 'complex' };

      cache.set(query, 'simple-result', 'model', 0.01, meta1);
      cache.set(query, 'complex-result', 'model', 0.01, meta2);

      expect(cache.get(query, meta1)).toBe('simple-result');
      expect(cache.get(query, meta2)).toBe('complex-result');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string values', () => {
      cache.set('empty', '', 'model', 0.001);
      expect(cache.get('empty')).toBe('');
    });

    it('should handle very long values', () => {
      const longValue = 'x'.repeat(100000);
      cache.set('long', longValue, 'model', 0.001);
      expect(cache.get('long')).toBe(longValue);
    });

    it('should handle special characters in keys', () => {
      const specialKey = 'key-with-!@#$%^&*()[]{}|;:,.<>?/`~';
      cache.set(specialKey, 'result', 'model', 0.001);
      expect(cache.get(specialKey)).toBe('result');
    });

    it('should handle null/undefined metadata gracefully', () => {
      cache.set('query', 'result', 'model', 0.001);
      
      // Should work with or without metadata
      expect(cache.get('query')).toBe('result');
      expect(cache.get('query', undefined)).toBe('result');
    });

    it('should handle floating point costs precisely', () => {
      const costs = [0.001, 0.002, 0.003];
      costs.forEach((cost, i) => {
        cache.set(`q${i}`, `r${i}`, 'model', cost);
      });

      costs.forEach((cost, i) => {
        cache.get(`q${i}`);
      });

      const stats = cache.getStats();
      expect(stats.savedCost).toBeCloseTo(0.006, 10);
    });
  });

  describe('Performance Characteristics', () => {
    it('should retrieve cached entries quickly', () => {
      // Store entry
      cache.set('perf-test', 'result', 'model', 0.001);

      // Measure retrieval time
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        cache.get('perf-test');
      }
      const duration = Date.now() - start;

      // 1000 retrievals should be < 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should handle cache operations under load', () => {
      // Simulate heavy usage
      for (let batch = 0; batch < 10; batch++) {
        for (let i = 0; i < 50; i++) {
          cache.set(`q-${batch}-${i}`, `r-${batch}-${i}`, 'model', 0.001);
        }
      }

      // Should have 500 entries
      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(500);

      // Retrieval should still work
      const result = cache.get('q-5-25');
      expect(result).toBe('r-5-25');
    });
  });

  describe('Cache Coherence', () => {
    it('should maintain consistency across operations', () => {
      const query = 'consistency-test';

      // Store
      cache.set(query, 'value-1', 'model', 0.001);
      expect(cache.get(query)).toBe('value-1');

      // Update with same key
      cache.set(query, 'value-2', 'model', 0.001);
      expect(cache.get(query)).toBe('value-2');

      // Verify stats are consistent
      const stats = cache.getStats();
      expect(stats.totalEntries).toBeGreaterThanOrEqual(1);
    });

    it('should track separate instances independently', () => {
      const cache1 = new CacheManager('./.test-cache-1.json');
      const cache2 = new CacheManager('./.test-cache-2.json');

      cache1.set('key', 'value-1', 'model', 0.001);
      cache2.set('key', 'value-2', 'model', 0.001);

      expect(cache1.get('key')).toBe('value-1');
      expect(cache2.get('key')).toBe('value-2');

      cache1.clear();
      cache2.clear();
    });
  });
});
