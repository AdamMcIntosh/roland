# Integration Guide & Code Examples

**Real-world examples for integrating samwise**

---

## Table of Contents

1. [Basic Integration](#basic-integration)
2. [Advanced Patterns](#advanced-patterns)
3. [Production Deployments](#production-deployments)
4. [Error Handling](#error-handling)
5. [Performance Optimization](#performance-optimization)

---

## Basic Integration

### Initialize samwise

```typescript
import { loadConfig } from '../src/config/config-loader';
import { LLMClient } from '../src/orchestrator/llm-client';
import { BudgetManager } from '../src/utils/budget-manager';
import { CacheManager } from '../src/orchestrator/cache-manager';

// 1. Load configuration
await loadConfig();

// 2. Set budget
BudgetManager.setMaxBudget(5.00);

// 3. Create cache
const cache = new CacheManager('.cache/responses.json');

// 4. Ready to use
console.log('✅ samwise initialized');
```

### Simple Query

```typescript
import { LLMClient } from '../src/orchestrator/llm-client';

async function askQuestion(query: string): Promise<string> {
  try {
    const response = await LLMClient.call({
      model: 'grok-3-mini',
      messages: [
        { role: 'user', content: query }
      ],
      max_tokens: 500,
      temperature: 0.7
    });
    
    return response.content;
  } catch (error) {
    console.error('Query failed:', error.message);
    return null;
  }
}

// Usage
const answer = await askQuestion('What is TypeScript?');
console.log(answer);
```

### With Caching

```typescript
import { LLMClient } from '../src/orchestrator/llm-client';
import { CacheManager } from '../src/orchestrator/cache-manager';

const cache = new CacheManager();

async function smartQuery(query: string): Promise<string> {
  // Check cache first
  const cached = cache.get(query);
  if (cached) {
    console.log('✅ Cache hit');
    return cached;
  }
  
  console.log('❌ Cache miss - calling API');
  
  // Call API
  const response = await LLMClient.call({
    model: 'grok-3',
    messages: [{ role: 'user', content: query }],
    max_tokens: 500,
    temperature: 0.7
  });
  
  // Cache result
  cache.set(query, response.content, response.model, response.cost);
  
  return response.content;
}

// Usage
const answer1 = await smartQuery('What is REST?');
// Output: ❌ Cache miss - calling API
// Cost: $0.003

const answer2 = await smartQuery('What is REST?');
// Output: ✅ Cache hit
// Cost: $0.00
```

### With Budget Enforcement

```typescript
import { LLMClient } from '../src/orchestrator/llm-client';
import { BudgetManager } from '../src/utils/budget-manager';
import { BudgetExceededError } from '../src/utils/errors';

async function budgetedQuery(query: string): Promise<string> {
  try {
    // Pre-check budget
    const estimated = 0.01; // rough estimate
    BudgetManager.checkBudget(estimated);
    
    // Call API
    const response = await LLMClient.call({
      model: 'grok-3',
      messages: [{ role: 'user', content: query }],
      max_tokens: 500,
      temperature: 0.7
    });
    
    // Record actual cost
    BudgetManager.recordSpending(response.cost);
    
    console.log(`✅ Query completed. Cost: $${response.cost.toFixed(4)}`);
    console.log(`Remaining: $${BudgetManager.getRemainingBudget().toFixed(2)}`);
    
    return response.content;
    
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      console.log('❌ Budget limit would be exceeded');
      return null;
    }
    throw error;
  }
}

// Usage
BudgetManager.setMaxBudget(5.00);
const answer = await budgetedQuery('Explain cloud computing');
```

---

## Advanced Patterns

### Pattern 1: Complexity-Based Routing

```typescript
import { ComplexityAnalyzer } from '../src/utils/complexity-analyzer';
import { LLMClient } from '../src/orchestrator/llm-client';

async function intelligentQuery(query: string): Promise<string> {
  // Analyze complexity
  const analysis = ComplexityAnalyzer.analyze(query);
  console.log(`Query complexity: ${analysis.level} (${analysis.score}/100)`);
  
  // Choose model based on complexity
  let model: string;
  if (analysis.score < 30) {
    model = 'grok-3-mini'; // Simple: cheapest
  } else if (analysis.score < 70) {
    model = 'grok-3'; // Medium: balanced
  } else {
    model = 'claude-4.5-sonnet'; // Complex: best
  }
  
  console.log(`Selected model: ${model}`);
  
  // Execute query
  const response = await LLMClient.call({
    model,
    messages: [{ role: 'user', content: query }],
    max_tokens: analysis.score > 70 ? 2000 : 1000,
    temperature: 0.7
  });
  
  return response.content;
}

// Usage
const answer = await intelligentQuery('Explain quantum computing');
// Output: Query complexity: complex (85/100)
// Selected model: claude-4.5-sonnet
```

### Pattern 2: Multi-Query with Consensus

```typescript
import { LLMClient } from '../src/orchestrator/llm-client';

async function consensusAnswer(query: string): Promise<{
  answer: string;
  confidence: number;
  perspectives: Record<string, string>;
}> {
  const models = ['grok-3', 'claude-3.5-sonnet', 'gpt-4o'];
  const perspectives: Record<string, string> = {};
  
  // Get answers from multiple models
  for (const model of models) {
    try {
      const response = await LLMClient.call({
        model,
        messages: [{ role: 'user', content: query }],
        max_tokens: 500,
        temperature: 0.7
      });
      
      perspectives[model] = response.content;
    } catch (error) {
      console.warn(`${model} failed:`, error.message);
    }
  }
  
  // Combine perspectives (simple consensus)
  const answer = Object.values(perspectives).join('\n\n');
  const confidence = Object.keys(perspectives).length / models.length;
  
  return {
    answer,
    confidence,
    perspectives
  };
}

// Usage
const result = await consensusAnswer('What is the future of AI?');
console.log(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
console.log(`Answer:\n${result.answer}`);
```

### Pattern 3: Batch Processing with Progress

```typescript
import { LLMClient } from '../src/orchestrator/llm-client';
import { CacheManager } from '../src/orchestrator/cache-manager';
import { BudgetManager } from '../src/utils/budget-manager';

async function processBatch(
  items: string[],
  onProgress?: (current: number, total: number) => void
): Promise<{ item: string; result: string; cost: number }[]> {
  const cache = new CacheManager();
  const results = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Check remaining budget
    if (BudgetManager.getRemainingBudget() < 0.01) {
      console.warn('⚠️ Low budget - stopping batch');
      break;
    }
    
    // Try cache
    const cached = cache.get(item);
    if (cached) {
      results.push({ item, result: cached, cost: 0 });
      onProgress?.(i + 1, items.length);
      continue;
    }
    
    // Call API
    try {
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
        cost: response.cost
      });
    } catch (error) {
      console.error(`Failed to process "${item}":`, error.message);
      results.push({ item, result: null, cost: 0 });
    }
    
    onProgress?.(i + 1, items.length);
  }
  
  return results;
}

// Usage
const items = ['Item 1', 'Item 2', 'Item 3', '...'];
const results = await processBatch(items, (current, total) => {
  console.log(`Progress: ${current}/${total} (${Math.round(current/total*100)}%)`);
});

results.forEach(r => {
  console.log(`${r.item}: ${r.result?.substring(0, 50)}... (${r.cost})`);
});
```

### Pattern 4: Streaming Large Responses

```typescript
import { LLMClient } from '../src/orchestrator/llm-client';

async function streamLargeResponse(
  query: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  // Use higher token limit for large responses
  const response = await LLMClient.call({
    model: 'grok-3',
    messages: [{ role: 'user', content: query }],
    max_tokens: 4000, // Large output
    temperature: 0.7
  });
  
  // Simulate streaming by chunking the response
  const chunkSize = 100;
  for (let i = 0; i < response.content.length; i += chunkSize) {
    const chunk = response.content.slice(i, i + chunkSize);
    onChunk?.(chunk);
    
    // Small delay to simulate stream
    await new Promise(r => setTimeout(r, 50));
  }
  
  return response.content;
}

// Usage
let fullResponse = '';
await streamLargeResponse(
  'Write a complete guide to REST APIs',
  (chunk) => {
    process.stdout.write(chunk);
    fullResponse += chunk;
  }
);
```

### Pattern 5: Retry with Backoff

```typescript
import { LLMClient } from '../src/orchestrator/llm-client';
import { APIError, RateLimitError } from '../src/utils/errors';

async function robustQuery(
  query: string,
  maxRetries: number = 3
): Promise<string> {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await LLMClient.call({
        model: 'grok-3',
        messages: [{ role: 'user', content: query }],
        max_tokens: 1000,
        temperature: 0.7
      });
      
      return response.content;
      
    } catch (error) {
      lastError = error;
      
      if (error instanceof RateLimitError) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Rate limited. Waiting ${delay}ms before retry...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        // Don't retry non-rate-limit errors
        throw error;
      }
    }
  }
  
  throw new Error(`Failed after ${maxRetries} retries: ${lastError.message}`);
}

// Usage
try {
  const answer = await robustQuery('Explain machine learning');
  console.log(answer);
} catch (error) {
  console.error('All retries exhausted:', error.message);
}
```

---

## Production Deployments

### Express.js API Server

```typescript
import express from 'express';
import { LLMClient } from '../src/orchestrator/llm-client';
import { CacheManager } from '../src/orchestrator/cache-manager';
import { BudgetManager } from '../src/utils/budget-manager';
import { loadConfig } from '../src/config/config-loader';

const app = express();
const cache = new CacheManager('.cache/api.json');

// Initialize on startup
app.listen(3000, async () => {
  await loadConfig();
  BudgetManager.setMaxBudget(50.00);
  console.log('✅ API server started');
});

// Query endpoint
app.post('/api/query', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }
    
    // Check cache
    const cached = cache.get(query);
    if (cached) {
      return res.json({
        result: cached,
        cached: true,
        cost: 0
      });
    }
    
    // Check budget
    const remaining = BudgetManager.getRemainingBudget();
    if (remaining < 0.01) {
      return res.status(402).json({
        error: 'Budget limit reached',
        remaining
      });
    }
    
    // Call API
    const response = await LLMClient.call({
      model: 'grok-3',
      messages: [{ role: 'user', content: query }],
      max_tokens: 500,
      temperature: 0.7
    });
    
    // Record cost
    BudgetManager.recordSpending(response.cost);
    cache.set(query, response.content, response.model, response.cost);
    
    res.json({
      result: response.content,
      cached: false,
      cost: response.cost,
      remaining: BudgetManager.getRemainingBudget()
    });
    
  } catch (error) {
    console.error('Query failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Status endpoint
app.get('/api/status', (req, res) => {
  const stats = cache.getStats();
  res.json({
    budget: {
      enabled: true,
      max: 50.00,
      spent: 50.00 - BudgetManager.getRemainingBudget(),
      remaining: BudgetManager.getRemainingBudget(),
      usage: BudgetManager.getUsagePercent()
    },
    cache: stats
  });
});
```

### CLI Tool

```typescript
import { Command } from 'commander';
import { LLMClient } from '../src/orchestrator/llm-client';
import { BudgetManager } from '../src/utils/budget-manager';
import { CacheManager } from '../src/orchestrator/cache-manager';
import { loadConfig } from '../src/config/config-loader';

const program = new Command();
const cache = new CacheManager();

program
  .name('samwise')
  .description('samwise CLI tool')
  .version('1.0.0');

program
  .command('query <text>')
  .description('Ask a question')
  .option('-m, --model <model>', 'LLM model to use', 'grok-3-mini')
  .option('-t, --tokens <tokens>', 'Max output tokens', '500')
  .action(async (text, options) => {
    try {
      await loadConfig();
      BudgetManager.setMaxBudget(5.00);
      
      console.log('🤔 Thinking...\n');
      
      const response = await LLMClient.call({
        model: options.model,
        messages: [{ role: 'user', content: text }],
        max_tokens: parseInt(options.tokens),
        temperature: 0.7
      });
      
      console.log(response.content);
      console.log(`\n📊 Cost: $${response.cost.toFixed(4)}`);
      
      cache.set(text, response.content, response.model, response.cost);
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('cache-stats')
  .description('Show cache statistics')
  .action(() => {
    console.log(cache.generateReport());
  });

program.parse();
```

---

## Error Handling

### Complete Error Handler

```typescript
import { LLMClient } from '../src/orchestrator/llm-client';
import {
  APIError,
  AuthError,
  RateLimitError,
  BudgetExceededError,
  ConfigError
} from '../src/utils/errors';

async function safeQuery(query: string) {
  try {
    const response = await LLMClient.call({
      model: 'grok-3',
      messages: [{ role: 'user', content: query }],
      max_tokens: 1000,
      temperature: 0.7
    });
    
    return {
      success: true,
      data: response.content,
      cost: response.cost
    };
    
  } catch (error) {
    if (error instanceof AuthError) {
      console.error('❌ Authentication failed');
      console.error('   - Check your API keys');
      console.error('   - Verify credentials in config.yaml');
      return { success: false, error: 'auth_failed' };
      
    } else if (error instanceof BudgetExceededError) {
      console.error('❌ Budget limit exceeded');
      console.error('   - Increase budget or use cheaper model');
      console.error('   - Try Ecomode or check cache');
      return { success: false, error: 'budget_exceeded' };
      
    } else if (error instanceof RateLimitError) {
      console.error('❌ Rate limit hit');
      console.error('   - Retry with exponential backoff');
      console.error('   - Try different provider');
      return { success: false, error: 'rate_limited' };
      
    } else if (error instanceof APIError) {
      console.error('❌ API error (all retries failed)');
      console.error('   - Check provider status');
      console.error('   - Retry after delay');
      return { success: false, error: 'api_error' };
      
    } else if (error instanceof ConfigError) {
      console.error('❌ Configuration error');
      console.error('   - Verify config.yaml syntax');
      console.error('   - Run: npm run build');
      return { success: false, error: 'config_error' };
      
    } else {
      console.error('❌ Unexpected error:', error.message);
      return { success: false, error: 'unknown_error' };
    }
  }
}

// Usage
const result = await safeQuery('Your query here');
if (result.success) {
  console.log('✅ Result:', result.data);
} else {
  console.log('❌ Failed:', result.error);
}
```

---

## Performance Optimization

### Caching Strategy

```typescript
import { CacheManager } from '../src/orchestrator/cache-manager';

// Aggressive caching for high-volume workloads
const cache = new CacheManager('.cache/high-volume.json');

async function cachedQuery(query: string, metadata = {}) {
  // Always check cache first
  const cached = cache.get(query, metadata);
  if (cached) return cached;
  
  // Fetch and cache
  const response = await LLMClient.call({...});
  cache.set(query, response.content, response.model, response.cost, metadata);
  
  // Monitor cache health
  const stats = cache.getStats();
  if (stats.hitRate < 0.5) {
    console.warn('⚠️ Low cache hit rate:', stats.hitRate);
  }
  
  return response.content;
}
```

### Batch Optimization

```typescript
async function optimizedBatch(items: string[]) {
  // Group by complexity for better model selection
  const simple = items.filter(q => analyzeComplexity(q) < 30);
  const complex = items.filter(q => analyzeComplexity(q) >= 30);
  
  // Process in parallel, grouped by cost
  const results = await Promise.all([
    processBatch(simple, 'grok-3-mini'), // Cheap
    processBatch(complex, 'grok-3')      // Balanced
  ]);
  
  return results.flat();
}
```

---

## Next Steps

- See [API Reference](../api.md) for detailed documentation
- See [Budget Guide](guides/budget-guide.md) for cost optimization
- See [Cache Guide](guides/cache-guide.md) for caching strategy

---

**Last Updated:** January 31, 2026  
**Version:** 1.0.0
