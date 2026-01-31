# Cache Management Guide

**Complete Guide to Caching Strategy with oh-my-goose**

---

## Quick Start

### Enable Caching

```typescript
import { CacheManager } from '../src/orchestrator/cache-manager';

// Create cache instance
const cache = new CacheManager('.cache/responses.json');

// Store a result
cache.set(
  'What is REST?',
  'REST is an architectural style...',
  'grok-3',
  0.003,
  {
    agent: 'researcher',
    mode: 'Ultrapilot',
    complexity: 'medium'
  }
);

// Retrieve result
const cached = cache.get(
  'What is REST?',
  {
    agent: 'researcher',
    mode: 'Ultrapilot',
    complexity: 'medium'
  }
);

if (cached) {
  console.log('✅ Cache HIT - No API cost');
  console.log(cached);
} else {
  console.log('❌ Cache MISS - Need API call');
}
```

---

## Cache Architecture

### Metadata-Aware Key System

Cache keys are NOT just the query. They include metadata:

```
Key Format: {query}_{agent}_{mode}_{complexity}

Examples:
✅ "What is REST?" + architect + Ultrapilot + complex
   ≠ "What is REST?" + executor + Ecomode + simple

The same question answered by different agents
with different contexts = DIFFERENT cache entries
```

### Why Metadata Isolation?

Different agents produce different responses:

**Architect's Answer:**
```
"REST is an architectural style emphasizing scalable
web services through stateless communication and
standard HTTP methods..."
```

**Executor's Answer:**
```
"REST: representational state transfer
- Uses HTTP verbs (GET, POST, etc.)
- Stateless protocol
- Resources identified by URIs"
```

Same question, different depths. Cache must distinguish.

### Automatic Persistence

```typescript
const cache = new CacheManager('.cache/responses.json');

// Save happens IMMEDIATELY
cache.set('Query 1', 'Answer 1', 'grok-3', 0.003);
// File written immediately

// Even if app crashes, data survives
cache.set('Query 2', 'Answer 2', 'grok-3', 0.003);
// File written immediately

// Next app restart
const newCache = new CacheManager('.cache/responses.json');
const cached = newCache.get('Query 1');
console.log(cached); // ✅ "Answer 1" (persisted from before)
```

---

## When to Use Caching

### ✅ Perfect for Caching

**Repeating Questions:**
```typescript
// Question asked 5 times
// Without cache: 5 × $0.003 = $0.015
// With cache: 1 × $0.003 + 4 × $0.00 = $0.003
// Savings: $0.012

const cache = new CacheManager();

for (let i = 0; i < 5; i++) {
  const cached = cache.get('Explain async/await');
  if (cached) {
    console.log('Cache hit:', cached);
  } else {
    const response = await LLMClient.call({...});
    cache.set('Explain async/await', response.content, 'grok-3', response.cost);
  }
}
```

**Static Knowledge Queries:**
```typescript
// Questions about facts that don't change
// "What is Python?"
// "How does TCP work?"
// "Explain the DOM"
// Perfect cache candidates

// These answers are stable across time
```

**Multi-Agent Workflows:**
```typescript
// Agent 1 researches "Best REST practices"
// Agent 2 also needs "Best REST practices"
// Agent 3 also needs "Best REST practices"

// Without cache: 3 × $0.003 = $0.009
// With cache: 1 × $0.003 = $0.003
// Savings: $0.006 (66%)

const cache = new CacheManager();

// Agent 1
const research = await LLMClient.call({...});
cache.set('Best REST practices', research.content, 'grok-3', research.cost, {
  agent: 'researcher'
});

// Agent 2 - hits cache
const cached = cache.get('Best REST practices', { agent: 'researcher' });
if (cached) return cached; // No API call

// Agent 3 - hits cache
const cached = cache.get('Best REST practices', { agent: 'researcher' });
if (cached) return cached; // No API call
```

### ❌ Not Good for Caching

**Real-Time Data:**
```typescript
// "What is the current stock price of AAPL?"
// Answer changes every second
// Caching stale data = wrong information

// Solution: Skip cache
const response = await LLMClient.call({
  model: 'grok-3',
  messages: [{ role: 'user', content: 'Stock price...' }],
  max_tokens: 100,
  // No caching
});
```

**Personalized Queries:**
```typescript
// "Tell me what books User A likes"
// "Tell me what books User B likes"
// Same question, different users = different answers

// Solution: Include user ID in cache metadata
const response1 = await LLMClient.call({...});
cache.set(query, response1.content, 'grok-3', response1.cost, {
  userId: 'user-a'
});

const response2 = await LLMClient.call({...});
cache.set(query, response2.content, 'grok-3', response2.cost, {
  userId: 'user-b'
});

// Now retrieve with user context
const cached1 = cache.get(query, { userId: 'user-a' });
const cached2 = cache.get(query, { userId: 'user-b' });
```

**Frequently Changing Data:**
```typescript
// "Summarize the latest tech news"
// New articles daily = different summaries

// Solution: Include date in cache key
const today = new Date().toISOString().split('T')[0];

const cached = cache.get(query, {
  date: today
});

if (cached) return cached;

// If new day, miss cache and fetch new data
const response = await LLMClient.call({...});
cache.set(query, response.content, 'grok-3', response.cost, {
  date: today
});
```

---

## Cache Statistics

### Get Cache Health

```typescript
const cache = new CacheManager();

// Populate cache with some data
cache.set('Query 1', 'Answer 1', 'grok-3', 0.003);
cache.set('Query 2', 'Answer 2', 'grok-3', 0.003);

// Get a result (hit)
cache.get('Query 1'); // Hit

// Try to get missing result (miss)
cache.get('Query 3'); // Miss

// View statistics
const stats = cache.getStats();
console.log(stats);
// {
//   totalEntries: 2,
//   hits: 1,
//   misses: 1,
//   hitRate: 50,
//   savedCost: 0.003,
//   agentStats: { ... },
//   modeStats: { ... }
// }
```

### Interpret Hit Rate

```typescript
// Perfect cache
const stats = cache.getStats();

if (stats.hitRate > 80) {
  console.log('✅ Excellent cache usage');
  // Most queries are cached
}

if (stats.hitRate > 50) {
  console.log('✅ Good cache usage');
  // Half of queries hit cache
}

if (stats.hitRate > 20) {
  console.log('⚠️ Moderate cache usage');
  // Some benefit, room for improvement
}

if (stats.hitRate < 20) {
  console.log('❌ Low cache usage');
  // Need to cache more or queries are too varied
}
```

### Generate Report

```typescript
const cache = new CacheManager();

// ... do some operations ...

const report = cache.generateReport();
console.log(report);

// Output:
// ═════════════════════════════════════
//     CACHE STATISTICS REPORT
// ═════════════════════════════════════
//
// 📊 OVERALL STATS
//    Total Entries: 45
//    Cache Hits: 38
//    Cache Misses: 7
//    Hit Rate: 84.4%
//    Cost Saved: $0.114
//
// 🤖 BY AGENT
//    architect: 12 entries, 92.3% hit rate, $0.036 saved
//    executor: 18 entries, 81.1% hit rate, $0.054 saved
//    researcher: 15 entries, 79.0% hit rate, $0.024 saved
//
// 🎯 BY MODE
//    Ultrapilot: 25 entries, 88.0% hit rate, $0.075 saved
//    Swarm: 20 entries, 80.0% hit rate, $0.039 saved
```

---

## Real Usage Examples

### Example 1: Search with Caching

```typescript
import { CacheManager } from '../src/orchestrator/cache-manager';
import { LLMClient } from '../src/orchestrator/llm-client';

const cache = new CacheManager('.cache/search.json');

async function search(query: string, agent: string) {
  // Try cache first
  const cached = cache.get(query, { agent });
  
  if (cached) {
    console.log(`✅ Cache HIT (${agent})`);
    return cached;
  }
  
  console.log(`❌ Cache MISS - fetching from API`);
  
  // No cache - call API
  const response = await LLMClient.call({
    model: 'grok-3',
    messages: [{ role: 'user', content: query }],
    max_tokens: 1000,
    temperature: 0.7
  });
  
  // Cache for future use
  cache.set(query, response.content, response.model, response.cost, {
    agent,
    timestamp: new Date().toISOString()
  });
  
  return response.content;
}

// Usage
const result1 = await search('How to optimize React?', 'architect');
// Cache miss, costs $0.003

const result2 = await search('How to optimize React?', 'architect');
// Cache hit, costs $0.00

const result3 = await search('How to optimize React?', 'executor');
// Cache miss (different agent), costs $0.003
// Executor's perspective is different
```

### Example 2: Multi-Agent Pipeline with Shared Cache

```typescript
import { CacheManager } from '../src/orchestrator/cache-manager';
import { LLMClient } from '../src/orchestrator/llm-client';

const cache = new CacheManager('.cache/pipeline.json');

async function researchPhase(topic: string) {
  const cached = cache.get(topic, { phase: 'research' });
  if (cached) return cached;
  
  const response = await LLMClient.call({
    model: 'grok-3',
    messages: [{ role: 'user', content: `Research: ${topic}` }],
    max_tokens: 1500,
    temperature: 0.7
  });
  
  cache.set(topic, response.content, response.model, response.cost, {
    phase: 'research'
  });
  
  return response.content;
}

async function designPhase(topic: string, research: string) {
  const cached = cache.get(topic, { phase: 'design' });
  if (cached) return cached;
  
  const response = await LLMClient.call({
    model: 'grok-3',
    messages: [
      { role: 'user', content: `Design based on: ${research}` }
    ],
    max_tokens: 1500,
    temperature: 0.7
  });
  
  cache.set(topic, response.content, response.model, response.cost, {
    phase: 'design'
  });
  
  return response.content;
}

async function executePhase(topic: string, design: string) {
  const cached = cache.get(topic, { phase: 'execute' });
  if (cached) return cached;
  
  const response = await LLMClient.call({
    model: 'grok-3-mini',
    messages: [
      { role: 'user', content: `Execute: ${design}` }
    ],
    max_tokens: 1000,
    temperature: 0.7
  });
  
  cache.set(topic, response.content, response.model, response.cost, {
    phase: 'execute'
  });
  
  return response.content;
}

// Pipeline execution
async function pipeline(topic: string) {
  const research = await researchPhase(topic);
  console.log('Research complete');
  
  const design = await designPhase(topic, research);
  console.log('Design complete');
  
  const execution = await executePhase(topic, design);
  console.log('Execution complete');
  
  return execution;
}

// First run: 3 API calls
await pipeline('microservices architecture');

// Second run: 3 cache hits
await pipeline('microservices architecture');
// Cost: $0.00 vs. $0.009 (100% savings)
```

### Example 3: Batch Processing with Cache Warming

```typescript
import { CacheManager } from '../src/orchestrator/cache-manager';
import { LLMClient } from '../src/orchestrator/llm-client';

const cache = new CacheManager('.cache/batch.json');

// Pre-populate cache with common queries
async function warmCache(commonTopics: string[]) {
  console.log(`🔥 Warming cache with ${commonTopics.length} topics...`);
  
  for (const topic of commonTopics) {
    const cached = cache.get(topic);
    if (cached) continue; // Already cached
    
    const response = await LLMClient.call({
      model: 'grok-3-mini', // Use cheap model for warming
      messages: [{ role: 'user', content: `Summary: ${topic}` }],
      max_tokens: 500,
      temperature: 0.7
    });
    
    cache.set(topic, response.content, response.model, response.cost);
    console.log(`  ✅ Cached: ${topic}`);
  }
  
  console.log('🔥 Cache warming complete');
}

// Process batch with hot cache
async function processBatch(items: string[]) {
  const results = [];
  
  for (const item of items) {
    const cached = cache.get(item);
    if (cached) {
      results.push({ item, result: cached, source: 'cache' });
    } else {
      const response = await LLMClient.call({
        model: 'grok-3',
        messages: [{ role: 'user', content: item }],
        max_tokens: 1000,
        temperature: 0.7
      });
      
      cache.set(item, response.content, response.model, response.cost);
      results.push({ item, result: response.content, source: 'api' });
    }
  }
  
  return results;
}

// Usage
const topics = ['REST APIs', 'Microservices', 'GraphQL', 'WebSockets'];
await warmCache(topics);

const items = ['REST APIs', 'REST APIs', 'GraphQL', 'New Topic'];
const results = await processBatch(items);

// Results:
// - "REST APIs": cache (hit)
// - "REST APIs": cache (hit)
// - "GraphQL": cache (hit)
// - "New Topic": api (miss)
// Cost: 2 API calls (topics) + 1 API call (new) = $0.009
// vs. 4 API calls without cache = $0.012
// Savings: $0.003
```

---

## Troubleshooting

### Cache Not Persisting

**Problem:** Restarting app loses cached data.

**Solution:**
```typescript
// Check cache file path
const cache = new CacheManager('.cache/responses.json');

// Verify file exists
import fs from 'fs';
if (fs.existsSync('.cache/responses.json')) {
  console.log('✅ Cache file exists');
  const data = JSON.parse(fs.readFileSync('.cache/responses.json', 'utf-8'));
  console.log(`Contains ${Object.keys(data).length} entries`);
} else {
  console.log('❌ Cache file missing');
  // First set() will create it
  cache.set('test', 'value', 'grok-3', 0.001);
}

// Verify write permissions
try {
  fs.writeFileSync('.cache/test.json', '{}');
  console.log('✅ Can write to .cache/');
} catch (error) {
  console.log('❌ Cannot write to .cache/ - check permissions');
}
```

### Cache Misses on Same Query

**Problem:** `cache.get(query)` returns null even though query was cached.

**Solution:**
```typescript
// Make sure metadata matches exactly
const cache = new CacheManager();

// Set with metadata
cache.set('What is REST?', 'REST is...', 'grok-3', 0.003, {
  agent: 'architect'
});

// Get with SAME metadata
const cached = cache.get('What is REST?', {
  agent: 'architect'  // ✅ Exact match
});

// Won't work (metadata mismatch)
const cached2 = cache.get('What is REST?', {
  agent: 'executor'   // ❌ Different agent
});

// Won't work (no metadata provided)
const cached3 = cache.get('What is REST?'); // ❌ No metadata

// Tip: Use consistent metadata
const METADATA = { agent: 'architect', mode: 'Ultrapilot' };
cache.set(query, answer, model, cost, METADATA);
const cached = cache.get(query, METADATA); // ✅ Guaranteed match
```

### High Memory Usage

**Problem:** Cache consumes too much RAM.

**Solution:**
```typescript
// Clear old cache
import fs from 'fs';
if (fs.existsSync('.cache/responses.json')) {
  fs.unlinkSync('.cache/responses.json');
}

// Or clear programmatically
const cache = new CacheManager();
cache.clear();

// Monitor cache size
const stats = cache.getStats();
console.log(`Cache entries: ${stats.totalEntries}`);
console.log(`Saved cost: $${stats.savedCost}`);

// If too large, consider:
// 1. Use separate caches per agent
// 2. Archive old cache periodically
// 3. Implement TTL (time-to-live) for entries
const cacheArchitect = new CacheManager('.cache/architect.json');
const cacheExecutor = new CacheManager('.cache/executor.json');
```

### Stale Cache Data

**Problem:** Cache has old answers that are no longer accurate.

**Solution:**
```typescript
// Option 1: Clear specific entries
const cache = new CacheManager();
cache.clear(); // Full reset

// Option 2: Use timestamps to detect stale data
const cached = cache.get('Latest news', {
  date: new Date().toISOString().split('T')[0]
});

// If different day, not in cache
const cached2 = cache.get('Latest news', {
  date: '2025-01-30' // Old date
});

// Option 3: Set cache expiration
// (Not built-in, but can implement)
const entry = JSON.parse(
  fs.readFileSync('.cache/responses.json', 'utf-8')
);

const ttlMs = 24 * 60 * 60 * 1000; // 24 hours
for (const key of Object.keys(entry)) {
  const age = Date.now() - entry[key].timestamp;
  if (age > ttlMs) {
    delete entry[key]; // Remove stale
  }
}

fs.writeFileSync('.cache/responses.json', JSON.stringify(entry));
```

---

## Best Practices

✅ **DO:**
- Include metadata to distinguish contexts
- Check cache before API calls
- Monitor cache hit rate with `getStats()`
- Warm cache during off-peak times
- Use caching for static/factual queries
- Regularly review cache size

❌ **DON'T:**
- Cache real-time/changing data
- Cache personalized responses without user ID
- Ignore cache metadata isolation
- Store sensitive data in cache files
- Let cache grow indefinitely
- Cache API errors

---

## Performance Impact

### Caching Effectiveness

**Scenario: 100 Queries Over a Week**

| Strategy | API Calls | Cost | Time |
|----------|-----------|------|------|
| No cache | 100 | $0.30 | 50s |
| Manual cache | 30 | $0.09 | 15s |
| Smart cache | 15 | $0.045 | 7.5s |
| Cache warming | 10 | $0.03 | 5s |

**Time savings:** From 50s → 5s (90% faster)  
**Cost savings:** From $0.30 → $0.03 (90% cheaper)

---

## Next Steps

- See [Budget Guide](budget-guide.md) for cost optimization
- See [Performance Monitoring](../api.md#performancemonitor) for metrics
- See [API Reference](../api.md) for detailed documentation

---

**Last Updated:** January 31, 2026  
**Version:** 1.0.0
