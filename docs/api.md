# API Reference Documentation

**samwise v1.2.0**  
**Complete API Reference for Developers**

---

## Table of Contents

1. [Core Classes](#core-classes)
2. [Utilities](#utilities)
3. [Configuration](#configuration)
4. [CLI Interface](#cli-interface)
5. [Types & Interfaces](#types--interfaces)
6. [Error Handling](#error-handling)

---

## Core Classes

### LLMClient

Real-time LLM API client supporting 4 providers (xAI, Anthropic, OpenAI, Google).

#### Static Methods

**`async call(request: LLMRequest): Promise<LLMResponse>`**

Execute an LLM API call with automatic retry and fallback logic.

```typescript
const response = await LLMClient.call({
  model: 'grok-3',
  messages: [{ role: 'user', content: 'Hello' }],
  max_tokens: 1000,
  temperature: 0.7,
  fallbackModels: ['grok-3-mini']
});

// Response contains:
// - content: string (generated text)
// - tokens: { input: number, output: number }
// - cost: number (estimated cost)
// - provider: string
// - model: string
```

**Parameters:**
- `model`: string - Model name (auto-detects provider from name)
- `messages`: Message[] - Chat messages
- `max_tokens`: number - Output token limit
- `temperature`: number - 0-2, randomness
- `fallbackModels`: string[] - Models to try if primary fails

**Returns:**
- `content`: Generated text
- `tokens`: Token counts (input/output)
- `cost`: Calculated cost in USD
- `provider`: Provider name
- `model`: Actual model used

**Throws:**
- `APIError`: All fallback models exhausted
- `AuthError`: Invalid API key
- `RateLimitError`: API rate limit exceeded

**Retry Logic:**
- Automatic exponential backoff: 1s → 2s → 4s
- Retries on: timeout, rate limit, server error
- Stops on: auth error, invalid input

---

### CacheManager

Metadata-aware caching system for query results.

#### Constructor

**`new CacheManager(cacheFile: string = '.cache/query-cache.json')`**

```typescript
const cache = new CacheManager('.cache/responses.json');
```

#### Instance Methods

**`set(query: string, value: string, model: string, cost: number, metadata?: Metadata): void`**

Store a cached result with metadata.

```typescript
cache.set(
  'explain TypeScript',
  'TypeScript is a typed superset...',
  'grok-3',
  0.030402,
  {
    agent: 'architect',
    mode: 'Ultrapilot',
    complexity: 'complex'
  }
);
```

**Parameters:**
- `query`: The original query string
- `value`: The cached result
- `model`: Model that generated the result
- `cost`: Cost paid for generation
- `metadata`: Optional isolation keys (agent, mode, complexity)

---

**`get(query: string, metadata?: Metadata): string | null`**

Retrieve a cached result.

```typescript
const cached = cache.get('explain TypeScript', {
  agent: 'architect',
  mode: 'Ultrapilot',
  complexity: 'complex'
});

if (cached) {
  console.log('Cache HIT:', cached);
  // Cost: $0.00 (no API call)
} else {
  console.log('Cache MISS: Need API call');
  // Cost: ~$0.03 for API call
}
```

**Returns:**
- String if found, null if miss
- Searches by query + metadata combination
- Different metadata = different cache keys

---

**`getStats(): CacheStats`**

Get cache statistics.

```typescript
const stats = cache.getStats();
// {
//   hits: 5,
//   misses: 3,
//   hitRate: 62.5,
//   totalEntries: 8,
//   savedCost: 0.15,
//   agentStats: { architect: {...}, executor: {...} },
//   modeStats: { Ultrapilot: {...}, Swarm: {...} }
// }
```

---

**`clear(): void`**

Remove all cached entries.

```typescript
cache.clear(); // Total cache reset
```

---

**`generateReport(): string`**

Generate human-readable cache statistics report.

```typescript
const report = cache.generateReport();
console.log(report);
// Cache Statistics
// ═════════════════
// Total Entries: 42
// Cache Hits: 35
// Cache Misses: 7
// Hit Rate: 83.3%
// Cost Saved: $1.23
```

---

### BudgetManager

API spending limit enforcement and tracking.

#### Static Methods

**`setMaxBudget(amount: number): void`**

Set maximum spending limit in USD.

```typescript
BudgetManager.setMaxBudget(5.00); // $5 limit
```

---

**`checkBudget(estimatedCost: number): void`**

Check if cost can be paid without exceeding budget.

```typescript
try {
  BudgetManager.checkBudget(0.05); // Will this $0.05 call fit?
  // Cost approved, proceed with API call
  await LLMClient.call({...});
} catch (error) {
  // Budget would be exceeded
  console.error('Budget limit reached');
}
```

**Throws:**
- `BudgetExceededError`: If estimated + spent > max

---

**`recordSpending(actualCost: number): void`**

Record actual cost after API call.

```typescript
const response = await LLMClient.call({...});
BudgetManager.recordSpending(response.cost);
```

---

**`getRemainingBudget(): number`**

Get available budget.

```typescript
const remaining = BudgetManager.getRemainingBudget();
console.log(`$${remaining.toFixed(2)} remaining`);
```

---

**`getUsagePercent(): number`**

Get budget usage as percentage.

```typescript
const usage = BudgetManager.getUsagePercent();
if (usage > 80) {
  console.warn('⚠️ Budget usage at 80%');
}
```

---

**`formatStatus(): string`**

Get formatted budget status.

```typescript
console.log(BudgetManager.formatStatus());
// Budget Status:
//   Enabled: YES
//   Maximum: $5.00
//   Spent:   $0.35
//   Remaining: $4.65
//   Usage:   7%
```

---

**`enable() / disable(): void`**

Enable or disable budget enforcement.

```typescript
BudgetManager.disable(); // Allow overspend (testing)
BudgetManager.enable();  // Enforce limits (production)
```

---

**`reset(): void`**

Clear spending history (keep budget limit).

```typescript
BudgetManager.reset();
// Budget: $5.00
// Spent: $0.00
// Remaining: $5.00
```

---

### ComplexityAnalyzer

Query complexity scoring and agent recommendations.

#### Static Methods

**`analyze(query: string): ComplexityScore`**

Analyze query complexity.

```typescript
const analysis = ComplexityAnalyzer.analyze('explain REST APIs with microservices');
// {
//   score: 65,
//   level: 'medium',
//   factors: {
//     length: 8,
//     technicalTerms: 2,
//     multiStep: 0,
//     dependenciesDetected: false
//   }
// }
```

**Complexity Levels:**
- Simple (0-40): Single concepts, short queries
- Medium (40-70): Moderate scope, some complexity
- Complex (70-100): Large scope, multiple concepts

---

**`recommendAgentsForMode(level: 'simple' | 'medium' | 'complex', mode: string): string[]`**

Get recommended agent pool size.

```typescript
// Ultrapilot: 2-5 agents
const agents = ComplexityAnalyzer.recommendAgentsForMode('complex', 'ultrapilot');
// ['architect', 'researcher', 'designer', 'writer', 'executor']

// Swarm: 3-8 agents
const swarmAgents = ComplexityAnalyzer.recommendAgentsForMode('complex', 'swarm');
// ['architect', 'researcher', 'designer', 'writer', 'critic', 'analyst', 'executor', 'planner']
```

---

**`calculateAgentCost(agents: string[], model: string, tokens: number): number`**

Estimate cost for agent pool.

```typescript
const cost = ComplexityAnalyzer.calculateAgentCost(
  ['architect', 'executor'],
  'grok-3',
  1500
);
// ~0.003 (2 agents × 1500 tokens × $0.001/1k)
```

---

### PerformanceMonitor

Real-time performance metrics collection and analytics.

#### Static Methods

**`record(agent: string, mode: string, provider: string, latency: number, tokens: number, cost: number, success: boolean): void`**

Record execution metrics.

```typescript
PerformanceMonitor.record(
  'architect',           // agent name
  'Ultrapilot',          // execution mode
  'xai',                 // provider
  523,                   // latency in ms
  1450,                  // total tokens
  0.000234,              // actual cost
  true                   // success?
);
```

---

**`getGlobalMetrics(): GlobalMetrics`**

Get system-wide metrics.

```typescript
const metrics = PerformanceMonitor.getGlobalMetrics();
// {
//   totalCalls: 147,
//   successfulCalls: 140,
//   successRate: 95.2,
//   avgLatency: 487,
//   minLatency: 123,
//   maxLatency: 2340,
//   totalTokens: 245000,
//   totalCost: 0.3456
// }
```

---

**`getAgentMetrics(agent: string): AgentMetrics | null`**

Get metrics for specific agent.

```typescript
const archMetrics = PerformanceMonitor.getAgentMetrics('architect');
// {
//   agent: 'architect',
//   totalCalls: 42,
//   successfulCalls: 40,
//   successRate: 95.2,
//   avgLatency: 512,
//   totalTokens: 60000,
//   totalCost: 0.12
// }
```

---

**`getModeMetrics(mode: string): ModeMetrics | null`**

Get metrics for specific execution mode.

```typescript
const ultraMetrics = PerformanceMonitor.getModeMetrics('Ultrapilot');
// Aggregates all agents in that mode
```

---

**`getProviderMetrics(provider: string): ProviderMetrics | null`**

Get metrics for specific provider.

```typescript
const xaiMetrics = PerformanceMonitor.getProviderMetrics('xai');
// {
//   provider: 'xai',
//   totalCalls: 89,
//   successRate: 96.6,
//   avgLatency: 489,
//   avgCostPerCall: 0.0008,
//   totalCost: 0.0756
// }
```

---

**`getTopAgents(limit: number = 5): TopAgent[]`**

Get most-used agents.

```typescript
const topAgents = PerformanceMonitor.getTopAgents(3);
// [
//   { agent: 'architect', calls: 42 },
//   { agent: 'executor', calls: 38 },
//   { agent: 'researcher', calls: 29 }
// ]
```

---

**`generateDashboard(): string`**

Generate formatted performance dashboard.

```typescript
console.log(PerformanceMonitor.generateDashboard());
// ═══════════════════════════════════════════════
//              PERFORMANCE DASHBOARD
// ═══════════════════════════════════════════════
// 
// 📊 GLOBAL METRICS
//    Total Calls: 147
//    Success Rate: 95.2%
//    Avg Latency: 487ms
//    Total Cost: $0.3456
// ...
```

---

**`reset(): void`**

Clear all metrics.

```typescript
PerformanceMonitor.reset();
// Useful for testing or starting fresh
```

---

## Utilities

### Logger

Structured logging utility.

```typescript
import { logger } from './src/utils/logger';

logger.info('Operation started');
logger.debug('Detailed information');
logger.success('✅ Task completed');
logger.warn('⚠️ Warning');
logger.error('❌ Error occurred');
```

**Supports:**
- Info, debug, success, warn, error levels
- Prefix tagging: `[samwise]`
- Debug mode: Set `DEBUG=true` environment variable

---

## Configuration

### config.yaml

Main configuration file.

```yaml
# Model Selection by Complexity
routing:
  simple:
    - grok-3-mini      # Cheapest
    - grok-3-beta
  medium:
    - grok-3           # Balanced
    - claude-3.5-sonnet
  complex:
    - claude-4.5-sonnet # Most capable
    - gpt-4o

# LLM Settings
goose:
  mcp_defaults:
    temperature: 0.7
    max_tokens: 4000
    top_p: 0.9
```

---

## Types & Interfaces

### ExecutionRequest

```typescript
interface ExecutionRequest {
  query: string;
  mode?: 'ecomode' | 'autopilot' | 'ultrapilot' | 'swarm' | 'pipeline';
  complexity?: 'simple' | 'medium' | 'complex';
  agentName?: string;
  useCache?: boolean;
  skipCache?: boolean;
}
```

---

### Metadata

```typescript
interface Metadata {
  agent?: string;     // 'architect', 'executor', etc.
  mode?: string;      // 'Ultrapilot', 'Swarm', etc.
  complexity?: string; // 'simple', 'medium', 'complex'
}
```

---

### LLMRequest

```typescript
interface LLMRequest {
  model: string;
  messages: Message[];
  max_tokens: number;
  temperature: number;
  top_p?: number;
  fallbackModels?: string[];
  _isRetry?: boolean; // Internal: prevents infinite retry loops
}
```

---

### LLMResponse

```typescript
interface LLMResponse {
  content: string;
  tokens: { input: number; output: number };
  cost: number;
  provider: string;
  model: string;
}
```

---

### CacheStats

```typescript
interface CacheStats {
  totalEntries: number;
  hits: number;
  misses: number;
  hitRate: number;
  savedCost: number;
  agentStats?: Record<string, AgentStats>;
  modeStats?: Record<string, ModeStats>;
}
```

---

### ComplexityScore

```typescript
interface ComplexityScore {
  score: number; // 0-100
  level: 'simple' | 'medium' | 'complex';
  factors: {
    length: number;
    technicalTerms: number;
    multiStep: number;
    dependenciesDetected: boolean;
  };
}
```

---

## Error Handling

### Error Classes

**`APIError`**
- API call failed
- All fallbacks exhausted
- Final attempt failed

**`AuthError`**
- Invalid or missing API key
- No retry attempted

**`RateLimitError`**
- Provider rate limit hit
- Triggers exponential backoff

**`BudgetExceededError`**
- Estimated cost exceeds remaining budget
- Operation cancelled

**`ConfigError`**
- Configuration loading failed
- Invalid config structure

---

### Usage Example

```typescript
import { LLMClient } from './src/orchestrator/llm-client';
import { BudgetManager } from './src/utils/budget-manager';
import { CacheManager } from './src/orchestrator/cache-manager';
import { APIError, BudgetExceededError } from './src/utils/errors';

async function executeQuery(query: string) {
  const cache = new CacheManager();
  
  try {
    // Check cache first
    const cached = cache.get(query);
    if (cached) {
      return cached; // $0.00 cost
    }
    
    // Check budget
    const estimatedCost = 0.01; // rough estimate
    BudgetManager.checkBudget(estimatedCost);
    
    // Call API
    const response = await LLMClient.call({
      model: 'grok-3',
      messages: [{ role: 'user', content: query }],
      max_tokens: 1000,
      temperature: 0.7
    });
    
    // Record spending
    BudgetManager.recordSpending(response.cost);
    
    // Cache result
    cache.set(query, response.content, response.model, response.cost);
    
    return response.content;
    
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      console.log('Budget limit reached');
      return null;
    } else if (error instanceof APIError) {
      console.log('API failed after retries');
      return null;
    }
  }
}
```

---

## Performance Considerations

### Caching Strategy

**Metadata Keys:**
- Cache keys include: `{mode}_{agent}_{complexity}_{hash}`
- Same query + different agent = different cache entry
- Prevents cross-contamination

**Savings:**
- 1 cache hit = 100% cost reduction
- 10 cache hits = 90% cost reduction on repeated queries
- Real-world: 60-80% hit rate in production

### Budget Planning

**$5 Budget Example:**
- 5,000 simple queries @ $0.001 each = $5.00
- 500 medium queries @ $0.01 each = $5.00
- 50 complex queries @ $0.10 each = $5.00

**With Caching:**
- Same 50 complex queries (first run): $5.00
- Re-run: $0.00 (100% cache hits)

---

## Next Steps

- See [Budget Guide](../docs/guides/budget-guide.md) for spending strategies
- See [Cache Guide](../docs/guides/cache-guide.md) for optimization
- See [Mode Guide](../docs/guides/mode-guide.md) for execution patterns
- See [Examples](../examples/) for working code

---

**Last Updated:** January 31, 2026  
**Version:** 1.2.0

