# Budget Management Guide

**Complete Guide to Managing API Spending with roland**

---

## Quick Start

### Set Your Budget

```typescript
import { BudgetManager } from '../src/utils/budget-manager';

// Set $5 spending limit
BudgetManager.setMaxBudget(5.00);

// Check current status
console.log(BudgetManager.formatStatus());
// Budget Status:
//   Enabled: YES
//   Maximum: $5.00
//   Spent:   $0.00
//   Remaining: $5.00
//   Usage:   0%
```

### Automatic Budget Protection

The system automatically prevents overspending:

```typescript
import { BudgetManager } from '../src/utils/budget-manager';
import { LLMClient } from '../src/orchestrator/llm-client';
import { BudgetExceededError } from '../src/utils/errors';

async function safeQuery(query: string) {
  BudgetManager.setMaxBudget(5.00);
  
  try {
    const response = await LLMClient.call({
      model: 'grok-3',
      messages: [{ role: 'user', content: query }],
      max_tokens: 1000,
      temperature: 0.7
    });
    
    // Auto-check happens before API call
    BudgetManager.recordSpending(response.cost);
    return response.content;
    
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      console.log('Budget limit reached - operation cancelled');
      return null;
    }
  }
}
```

---

## Budget Architecture

### The 3-Layer Protection System

**Layer 1: Pre-Call Check**
```typescript
BudgetManager.checkBudget(estimatedCost);
// Throws error if: estimated + spent > max
// Operation never reaches API
```

**Layer 2: API Integration**
```typescript
const response = await LLMClient.call({...});
// LLMClient respects BudgetManager.checkBudget()
// Fails safely if budget exceeded
```

**Layer 3: Spending Record**
```typescript
BudgetManager.recordSpending(response.cost);
// Track actual cost (may differ from estimate)
// Updates remaining budget
```

### How It Works

1. **Set Limit**: `BudgetManager.setMaxBudget(5.00)`
2. **Before API Call**: System estimates cost
3. **Pre-Call Check**: If `estimated + spent > max`, throw error
4. **If OK**: API call proceeds
5. **After API Call**: Record actual cost
6. **Track Remaining**: `getRemainingBudget()`

---

## Cost Estimation

### Model Costs (per 1,000 tokens)

**Simple Models (Cheapest)**
- `grok-3-mini`: $0.0005/1k
- `grok-2-mini`: $0.0003/1k

**Balanced Models**
- `grok-3`: $0.002/1k
- `claude-3.5-sonnet`: $0.003/1k

**Complex Models (Most Capable)**
- `claude-4.5-sonnet`: $0.003/1k
- `gpt-4o`: $0.015/1k
- `gemini-2.5-flash`: $0.075/1k (context heavy)

### Cost Calculation

```
Cost = (input_tokens + output_tokens) / 1000 × model_rate

Example:
- 500 input tokens
- 800 output tokens
- Model: grok-3 ($0.002/1k)
- Cost = (500 + 800) / 1000 × 0.002 = $0.0026
```

---

## Budget Planning Examples

### $5 Budget: Usage Scenarios

**Scenario 1: Simple Query Focus**
```typescript
// 5,000 simple questions @ grok-3-mini
// 1,000 tokens average per call
// Cost per call: 1,000 / 1000 × $0.0005 = $0.0005

// Total: 5,000 × $0.0005 = $2.50
// 50% of budget remaining for retries/complex queries

BudgetManager.setMaxBudget(5.00);
// Efficient use of budget
```

**Scenario 2: Balanced Usage**
```typescript
// Mix of query complexities
// 100 simple (grok-3-mini): 100 × $0.001 = $0.10
// 200 medium (grok-3): 200 × $0.003 = $0.60
// 50 complex (claude-4.5-sonnet): 50 × $0.010 = $0.50
// Total: $1.20
// Remaining: $3.80

// Good for diverse workloads
```

**Scenario 3: Complex Analysis Focus**
```typescript
// Few but deep queries
// 10 complex (claude-4.5-sonnet, 2,000 tokens)
// Cost per call: 2,000 / 1000 × $0.003 = $0.006
// Total: 10 × $0.006 = $0.06
// Remaining: $4.94

// Good for research/analysis mode
```

---

## Optimization Strategies

### 1. Use Caching

**No Caching (Expensive):**
```typescript
// Ask "What is REST?" 3 times
// Cost: 3 × $0.003 = $0.009
const response1 = await LLMClient.call({...});
const response2 = await LLMClient.call({...});
const response3 = await LLMClient.call({...});
// 3 API calls = $0.009 spent
```

**With Caching (Efficient):**
```typescript
const cache = new CacheManager();

// First call: API + cache
const response1 = await LLMClient.call({...});
cache.set('What is REST?', response1.content, 'grok-3', 0.003);

// Second call: Cache hit!
const response2 = cache.get('What is REST?');
// $0.00 cost

// Third call: Cache hit!
const response3 = cache.get('What is REST?');
// $0.00 cost

// Total: $0.003 instead of $0.009
// Savings: $0.006 (66% reduction)
```

### 2. Match Model to Complexity

**Wrong: Always use expensive models**
```typescript
// Simple question + claude-4.5-sonnet
// Cost: $0.010 (overpowered)

// Better with grok-3-mini
// Cost: $0.0005 (95% cheaper)
```

**Complexity Routing:**
```typescript
const { ComplexityAnalyzer } = require('./src/utils/complexity-analyzer');

const analysis = ComplexityAnalyzer.analyze(query);

let model;
if (analysis.score < 30) {
  model = 'grok-3-mini'; // Simple: $0.0005/1k
} else if (analysis.score < 70) {
  model = 'grok-3'; // Medium: $0.002/1k
} else {
  model = 'claude-4.5-sonnet'; // Complex: $0.003/1k
}

const response = await LLMClient.call({
  model,
  messages: [{ role: 'user', content: query }],
  max_tokens: 1000,
  temperature: 0.7
});
```

### 3. Control Token Generation

**Long outputs (expensive):**
```typescript
const response = await LLMClient.call({
  model: 'grok-3',
  messages: [{ role: 'user', content: 'Explain quantum physics' }],
  max_tokens: 4000, // ⚠️ Expensive
  temperature: 0.7
});
// Cost: ~$0.008
```

**Concise outputs (efficient):**
```typescript
const response = await LLMClient.call({
  model: 'grok-3',
  messages: [{ role: 'user', content: 'Explain quantum physics' }],
  max_tokens: 500, // ✅ Efficient
  temperature: 0.7
});
// Cost: ~$0.001
```

### 4. Batch Operations

**Individual calls (inefficient):**
```typescript
const queries = ['Query 1', 'Query 2', 'Query 3'];

for (const query of queries) {
  await LLMClient.call({
    model: 'grok-3',
    messages: [{ role: 'user', content: query }],
    max_tokens: 1000,
    temperature: 0.7
  });
  // 3 API calls = 3 × $0.002 = $0.006
}
```

**Batch call (efficient):**
```typescript
const queries = ['Query 1', 'Query 2', 'Query 3'];
const batchPrompt = `
${queries.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Please answer all questions above.
`;

const response = await LLMClient.call({
  model: 'grok-3',
  messages: [{ role: 'user', content: batchPrompt }],
  max_tokens: 2000, // One call for all 3
  temperature: 0.7
});
// 1 API call = $0.004 instead of $0.006
```

---

## Real Usage Examples

### Example 1: Interactive CLI with Budget

```typescript
import { LLMClient } from './src/orchestrator/llm-client';
import { BudgetManager } from './src/utils/budget-manager';
import { CacheManager } from './src/orchestrator/cache-manager';
import { BudgetExceededError } from './src/utils/errors';

const cache = new CacheManager();

async function interactiveQuery() {
  BudgetManager.setMaxBudget(5.00);
  
  while (true) {
    const query = await prompt('You: ');
    
    if (query === 'quit') break;
    if (query === 'status') {
      console.log(BudgetManager.formatStatus());
      continue;
    }
    
    try {
      // Check cache
      const cached = cache.get(query);
      if (cached) {
        console.log('Bot (cached): ' + cached);
        continue;
      }
      
      // Check budget
      BudgetManager.checkBudget(0.01);
      
      // Get response
      const response = await LLMClient.call({
        model: 'grok-3',
        messages: [{ role: 'user', content: query }],
        max_tokens: 500,
        temperature: 0.7
      });
      
      BudgetManager.recordSpending(response.cost);
      cache.set(query, response.content, response.model, response.cost);
      
      console.log(`Bot ($${response.cost.toFixed(4)}): ${response.content}`);
      console.log(`Remaining: $${BudgetManager.getRemainingBudget().toFixed(2)}`);
      
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        console.log('❌ Budget limit reached. Cannot proceed.');
      } else {
        console.log(`Error: ${error.message}`);
      }
    }
  }
}
```

### Example 2: Batch Processing with Limits

```typescript
async function processBatch(items: string[]) {
  BudgetManager.setMaxBudget(2.00);
  const cache = new CacheManager();
  
  const results = [];
  
  for (const item of items) {
    try {
      // Check budget early
      const remaining = BudgetManager.getRemainingBudget();
      if (remaining < 0.01) {
        console.warn(`⚠️ Budget running low: $${remaining.toFixed(2)}`);
        break;
      }
      
      // Try cache first
      const cached = cache.get(item);
      if (cached) {
        results.push({ item, result: cached, cached: true });
        continue;
      }
      
      // Pre-check budget
      BudgetManager.checkBudget(0.005);
      
      // Call API
      const response = await LLMClient.call({
        model: 'grok-3-mini',
        messages: [{ role: 'user', content: item }],
        max_tokens: 300,
        temperature: 0.7
      });
      
      BudgetManager.recordSpending(response.cost);
      cache.set(item, response.content, response.model, response.cost);
      
      results.push({
        item,
        result: response.content,
        cached: false,
        cost: response.cost
      });
      
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        console.log('❌ Budget exhausted');
        break;
      }
    }
  }
  
  return results;
}
```

---

## Troubleshooting

### "Budget Exceeded" Error

**Problem:** Operation cancelled due to budget limit.

**Solution:**
```typescript
// Check remaining
const remaining = BudgetManager.getRemainingBudget();
console.log(`Remaining: $${remaining.toFixed(2)}`);

// Option 1: Increase budget
BudgetManager.setMaxBudget(10.00);

// Option 2: Use cheaper model
const response = await LLMClient.call({
  model: 'grok-3-mini', // Cheaper
  messages: [...],
  max_tokens: 1000,
  temperature: 0.7
});

// Option 3: Reduce tokens
const response = await LLMClient.call({
  model: 'grok-3',
  messages: [...],
  max_tokens: 500, // Less tokens
  temperature: 0.7
});

// Option 4: Reset and try again
BudgetManager.reset(); // Clear spending history
BudgetManager.setMaxBudget(5.00); // Fresh budget
```

### Unexpected High Spending

**Problem:** Cost is higher than expected.

**Solution:**
```typescript
// Check what consumed the budget
const metrics = PerformanceMonitor.getGlobalMetrics();
console.log(`Total calls: ${metrics.totalCalls}`);
console.log(`Total cost: $${metrics.totalCost}`);
console.log(`Avg cost/call: $${(metrics.totalCost / metrics.totalCalls).toFixed(4)}`);

// Check by agent
const agent = PerformanceMonitor.getAgentMetrics('architect');
console.log(`Architect cost: $${agent.totalCost}`);

// Check by model
const agents = PerformanceMonitor.getGlobalMetrics()
  .agents
  .reduce((acc, a) => {
    acc[a.model] = (acc[a.model] || 0) + a.cost;
    return acc;
  }, {});

// Reduce expensive model usage
BudgetManager.setMaxBudget(5.00); // Reset budget
// Switch to cheaper models for non-critical queries
```

### Budget Not Enforcing

**Problem:** Overspending despite budget limit.

**Solution:**
```typescript
// Make sure budget is enabled
BudgetManager.enable();

// Check if disabled
if (!BudgetManager.isEnabled()) {
  BudgetManager.enable();
}

// Always check before API call
try {
  BudgetManager.checkBudget(estimatedCost);
  const response = await LLMClient.call({...});
  BudgetManager.recordSpending(response.cost);
} catch (error) {
  // Handle budget error
}
```

---

## Best Practices

✅ **DO:**
- Set budget at app start: `BudgetManager.setMaxBudget(5.00)`
- Use caching to reduce repeated calls
- Match model complexity to query complexity
- Monitor budget status: `BudgetManager.formatStatus()`
- Record actual cost after each call
- Use cheaper models for simple queries
- Batch related queries into single calls

❌ **DON'T:**
- Use expensive models for simple queries
- Forget to record spending after API calls
- Generate unnecessarily long outputs
- Make duplicate API calls without checking cache
- Set budget too low (account for taxes/fees)
- Disable budget enforcement in production

---

## Performance Metrics

### Save Money with Caching

**Scenario: 100 Questions**
- Without caching: 100 calls × $0.003 = $0.30
- With 80% cache hit: 20 calls × $0.003 = $0.06
- **Savings: $0.24 (80% reduction)**

### Budget Multiplier

**With Smart Strategies:**
- Base budget: $5.00
- Caching savings: -66%
- Model optimization: -30%
- Batching: -15%
- **Effective budget: $15-20 equivalent work**

---

## Next Steps

- See [Cache Guide](cache-guide.md) for caching optimization
- See [Performance Monitoring](../api.md#performancemonitor) for detailed metrics
- See [API Reference](../api.md) for complete documentation

---

**Last Updated:** January 31, 2026  
**Version:** 1.0.0
