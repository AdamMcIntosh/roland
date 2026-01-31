# oh-my-goose Documentation Index

**Complete Guide to oh-my-goose v1.2.0**

---

## 🚀 Quick Start (5 minutes)

New to oh-my-goose? Start here:

```typescript
// 1. Initialize
import { loadConfig } from './src/config/config-loader';
import { LLMClient } from './src/orchestrator/llm-client';
import { BudgetManager } from './src/utils/budget-manager';

await loadConfig();
BudgetManager.setMaxBudget(5.00);

// 2. Ask a question
const response = await LLMClient.call({
  model: 'grok-3-mini',
  messages: [{ role: 'user', content: 'What is TypeScript?' }],
  max_tokens: 500,
  temperature: 0.7
});

console.log(response.content);
// Output: "TypeScript is a typed superset of JavaScript..."
```

That's it! You've made your first API call.

---

## 📚 Documentation Structure

### **Level 1: API Reference** (Technical Details)
**File:** [docs/api.md](docs/api.md)  
**Size:** 2,500 lines  
**Contains:**
- LLMClient: Make API calls to 4 providers
- CacheManager: Cache results to save money
- BudgetManager: Control spending with limits
- ComplexityAnalyzer: Score query complexity
- PerformanceMonitor: Track metrics
- Complete type definitions
- Error handling reference

**When to use:**
- Looking up a specific method signature
- Understanding API parameters
- Checking return values and error types

---

### **Level 2: Quick Guides** (How-To)

#### [Budget Guide](docs/guides/budget-guide.md)
**Size:** 1,200 lines  
**Best for:** Controlling costs

**Key sections:**
- Set budget limits
- Understand pricing
- Plan for different budgets
- Optimize spending
- Troubleshooting overspend

**Quick example:**
```typescript
BudgetManager.setMaxBudget(5.00);
// Budget enforcement is automatic!
```

---

#### [Cache Guide](docs/guides/cache-guide.md)
**Size:** 1,400 lines  
**Best for:** Performance & cost savings

**Key sections:**
- When to cache
- Metadata-aware caching
- Cache statistics
- Real usage patterns
- Troubleshooting cache issues

**Quick example:**
```typescript
const cache = new CacheManager();
const cached = cache.get('Your query');
if (cached) return cached; // Saved $0.003!
```

---

#### [Mode Guide](docs/guides/mode-guide.md)
**Size:** 1,300 lines  
**Best for:** Choosing execution strategies

**Key sections:**
- 5 execution modes explained
- When to use each mode
- Cost analysis per mode
- Real-world scenarios
- Decision tree for mode selection

**Quick example:**
```
Simple question → Ecomode (1 agent, fastest, cheapest)
Complex question → Ultrapilot (5 agents, thorough)
Deep research → Swarm (8 agents, most comprehensive)
Multi-stage → Pipeline (sequential, step-by-step)
```

---

#### [Integration Guide](docs/guides/integration-guide.md)
**Size:** 1,800 lines  
**Best for:** Building applications

**Key sections:**
- Basic integration patterns
- Advanced patterns (consensus, batch, retry)
- Production deployments (Express, CLI)
- Complete error handling
- Performance optimization

**Quick example:**
```typescript
async function smartQuery(query) {
  const cached = cache.get(query);
  if (cached) return cached;
  
  const response = await LLMClient.call({...});
  cache.set(query, response.content, ...);
  return response.content;
}
```

---

## 🎯 By Use Case

### "I want to ask questions quickly"
→ Start with [Quick Start](#quick-start-5-minutes)  
→ Then read [Integration Guide - Basic Integration](docs/guides/integration-guide.md#basic-integration)

### "I need to control costs"
→ Read [Budget Guide](docs/guides/budget-guide.md)  
→ Learn about [Caching](docs/guides/cache-guide.md)  
→ Use [Cost Optimization](docs/guides/budget-guide.md#optimization-strategies)

### "I'm building a production app"
→ Study [Integration Guide - Production Deployments](docs/guides/integration-guide.md#production-deployments)  
→ Implement [Error Handling](docs/guides/integration-guide.md#error-handling)  
→ Reference [API Documentation](docs/api.md)

### "I want best performance"
→ Master [Caching Strategy](docs/guides/cache-guide.md)  
→ Understand [Mode Selection](docs/guides/mode-guide.md)  
→ Use [Batch Processing](docs/guides/integration-guide.md#pattern-3-batch-processing-with-progress)

### "I need to understand all APIs"
→ Read the full [API Reference](docs/api.md)  
→ Check type definitions section
→ Review error handling

---

## 📊 Documentation at a Glance

| Document | Lines | Topics | Code Examples | Best For |
|----------|-------|--------|----------------|----------|
| [API Reference](docs/api.md) | 2,500 | 15+ API methods | 15+ | API details |
| [Budget Guide](docs/guides/budget-guide.md) | 1,200 | Cost planning | 8+ | Cost control |
| [Cache Guide](docs/guides/cache-guide.md) | 1,400 | Performance | 10+ | Speed & savings |
| [Mode Guide](docs/guides/mode-guide.md) | 1,300 | Execution modes | 12+ | Mode selection |
| [Integration Guide](docs/guides/integration-guide.md) | 1,800 | Patterns | 20+ | Building apps |

**Total:** 8,200+ lines of documentation, 65+ code examples

---

## 🔥 Popular Topics

### Most Viewed Sections (Based on Use Cases)

1. **"How do I cache results?"**
   → [Cache Guide - Quick Start](docs/guides/cache-guide.md#quick-start)

2. **"What's the cheapest way to run?"**
   → [Budget Guide - Optimization Strategies](docs/guides/budget-guide.md#optimization-strategies)

3. **"How do I choose a mode?"**
   → [Mode Guide - Decision Tree](docs/guides/mode-guide.md#decision-tree)

4. **"Can I use this in my app?"**
   → [Integration Guide - Production Deployments](docs/guides/integration-guide.md#production-deployments)

5. **"What's the complete API?"**
   → [API Reference](docs/api.md)

---

## 💡 Code Examples by Category

### Budget Management
- Set budget: [Budget Guide](docs/guides/budget-guide.md#set-your-budget)
- Track spending: [API Reference - BudgetManager](docs/api.md#budgetmanager)
- Cost planning: [Budget Guide - Planning Examples](docs/guides/budget-guide.md#budget-planning-examples)

### Caching
- Basic cache: [Cache Guide - Quick Start](docs/guides/cache-guide.md#quick-start)
- Smart retrieval: [Integration Guide - Pattern 1](docs/guides/integration-guide.md#pattern-1-complexity-based-routing)
- Statistics: [Cache Guide - Statistics](docs/guides/cache-guide.md#cache-statistics)

### Error Handling
- Try-catch: [Integration Guide - Error Handling](docs/guides/integration-guide.md#error-handling)
- All error types: [API Reference - Error Handling](docs/api.md#error-handling)
- Retry logic: [Integration Guide - Pattern 5](docs/guides/integration-guide.md#pattern-5-retry-with-backoff)

### Batch Processing
- Basic batch: [Integration Guide - Pattern 3](docs/guides/integration-guide.md#pattern-3-batch-processing-with-progress)
- Production batch: [Integration Guide - Real Examples](docs/guides/integration-guide.md#example-2-batch-processing-with-limits)

### API Integration
- Express.js: [Integration Guide - Express.js API Server](docs/guides/integration-guide.md#expressjs-api-server)
- CLI Tool: [Integration Guide - CLI Tool](docs/guides/integration-guide.md#cli-tool)
- Custom patterns: [Integration Guide - Advanced Patterns](docs/guides/integration-guide.md#advanced-patterns)

---

## 🔍 Search by Topic

### Core Concepts

**Budget**
- [Set budget limits](docs/guides/budget-guide.md#set-your-budget)
- [Understand costs](docs/guides/budget-guide.md#cost-estimation)
- [Plan for different budgets](docs/guides/budget-guide.md#budget-planning-examples)

**Caching**
- [When to cache](docs/guides/cache-guide.md#when-to-use-caching)
- [Metadata keys](docs/guides/cache-guide.md#metadata-aware-key-system)
- [Cache statistics](docs/guides/cache-guide.md#cache-statistics)

**Modes**
- [Mode comparison](docs/guides/mode-guide.md#mode-comparison-matrix)
- [Choose a mode](docs/guides/mode-guide.md#decision-tree)
- [Each mode details](docs/guides/mode-guide.md)

**APIs**
- [LLMClient](docs/api.md#llmclient)
- [BudgetManager](docs/api.md#budgetmanager)
- [CacheManager](docs/api.md#cachemanager)
- [ComplexityAnalyzer](docs/api.md#complexityanalyzer)
- [PerformanceMonitor](docs/api.md#performancemonitor)

### Use Cases

**Cost Control**
1. [Set budget](docs/guides/budget-guide.md#set-your-budget)
2. [Choose cheap models](docs/guides/budget-guide.md#match-model-to-complexity)
3. [Enable caching](docs/guides/cache-guide.md#quick-start)
4. [Monitor spending](docs/guides/budget-guide.md#real-usage-examples)

**High Performance**
1. [Use caching](docs/guides/cache-guide.md)
2. [Smart batching](docs/guides/integration-guide.md#pattern-3-batch-processing-with-progress)
3. [Route by complexity](docs/guides/integration-guide.md#pattern-1-complexity-based-routing)
4. [Monitor metrics](docs/api.md#performancemonitor)

**Production Ready**
1. [Error handling](docs/guides/integration-guide.md#error-handling)
2. [Retry logic](docs/guides/integration-guide.md#pattern-5-retry-with-backoff)
3. [Deploy example](docs/guides/integration-guide.md#production-deployments)
4. [Budget enforcement](docs/guides/budget-guide.md)

---

## 📖 Reading Recommendations

### For New Users (30 min)
1. [Quick Start](#quick-start-5-minutes) (5 min)
2. [Mode Guide - Decision Tree](docs/guides/mode-guide.md#decision-tree) (5 min)
3. [Basic Integration](docs/guides/integration-guide.md#basic-integration) (10 min)
4. [API Reference - Quick Scan](docs/api.md) (10 min)

### For Developers (2 hours)
1. [Integration Guide - Complete](docs/guides/integration-guide.md) (45 min)
2. [API Reference - Full](docs/api.md) (45 min)
3. [Budget Guide - Optimization](docs/guides/budget-guide.md#optimization-strategies) (15 min)
4. [Error Handling - Deep Dive](docs/guides/integration-guide.md#error-handling) (15 min)

### For DevOps (1 hour)
1. [Budget Guide - Complete](docs/guides/budget-guide.md) (30 min)
2. [Cache Guide - Strategy](docs/guides/cache-guide.md) (20 min)
3. [PerformanceMonitor API](docs/api.md#performancemonitor) (10 min)

---

## 🎓 Learning Paths

### Path 1: The Basics
```
1. Quick Start (this page)
   ↓
2. Integration Guide - Basic Integration
   ↓
3. Try your first query
   ↓
4. Read Mode Guide
   ↓
5. You're ready!
```
**Time:** 30 minutes

### Path 2: Production Ready
```
1. Integration Guide - Complete
   ↓
2. API Reference - Full
   ↓
3. Error Handling
   ↓
4. Production Deployments
   ↓
5. Set up monitoring
```
**Time:** 3-4 hours

### Path 3: Cost Master
```
1. Budget Guide - Quick Start
   ↓
2. Caching Strategy
   ↓
3. Mode Selection Guide
   ↓
4. Optimization Strategies
   ↓
5. Monitor and adjust
```
**Time:** 2 hours

---

## ❓ FAQ Links

**"How do I get started?"**
→ [Quick Start](#quick-start-5-minutes)

**"What's the cheapest way to run this?"**
→ [Budget Optimization](docs/guides/budget-guide.md#optimization-strategies)

**"How do I save money with caching?"**
→ [Cache Guide](docs/guides/cache-guide.md)

**"Should I use Swarm or Ultrapilot?"**
→ [Mode Guide - Decision Tree](docs/guides/mode-guide.md#decision-tree)

**"What's the complete API?"**
→ [API Reference](docs/api.md)

**"Can I deploy to production?"**
→ [Integration Guide - Production](docs/guides/integration-guide.md#production-deployments)

**"What if something goes wrong?"**
→ [Error Handling](docs/guides/integration-guide.md#error-handling)

**"How do I monitor performance?"**
→ [PerformanceMonitor API](docs/api.md#performancemonitor)

---

## 📁 File Organization

```
oh-my-goose/
├── docs/
│   ├── README.md (this file - Start here!)
│   ├── api.md (Complete API Reference - 2,500 lines)
│   ├── guides/
│   │   ├── budget-guide.md (1,200 lines)
│   │   ├── cache-guide.md (1,400 lines)
│   │   ├── mode-guide.md (1,300 lines)
│   │   └── integration-guide.md (1,800 lines)
│   └── PHASE_9_DOCUMENTATION_COMPLETE.md
├── src/
│   ├── orchestrator/
│   │   ├── llm-client.ts (Real API calls)
│   │   └── cache-manager.ts (Caching)
│   └── utils/
│       ├── budget-manager.ts (Budget control)
│       ├── complexity-analyzer.ts (Query scoring)
│       └── performance-monitor.ts (Metrics)
├── tests/
│   ├── unit/
│   │   ├── complexity-analyzer.test.ts
│   │   ├── budget-manager.test.ts
│   │   ├── cache-manager.test.ts
│   │   └── performance-monitor.test.ts
│   └── integration.test.ts
└── config.yaml (Configuration)
```

---

## 🚀 Next Steps

1. **Get Started:**
   - [Quick Start](#quick-start-5-minutes)
   - [Integration Guide - Basic](docs/guides/integration-guide.md#basic-integration)

2. **Control Costs:**
   - [Budget Guide](docs/guides/budget-guide.md)
   - [Cache Guide](docs/guides/cache-guide.md)

3. **Build Apps:**
   - [Integration Guide - Advanced](docs/guides/integration-guide.md#advanced-patterns)
   - [Production Examples](docs/guides/integration-guide.md#production-deployments)

4. **Reference:**
   - [Complete API](docs/api.md)
   - [Mode Selection](docs/guides/mode-guide.md)

---

## 📞 Support Resources

**Documentation:**
- [API Reference](docs/api.md) - Technical details
- [Integration Guide](docs/guides/integration-guide.md) - How to build
- [Budget Guide](docs/guides/budget-guide.md) - Cost control
- [Cache Guide](docs/guides/cache-guide.md) - Performance
- [Mode Guide](docs/guides/mode-guide.md) - Strategy

**Code Examples:**
- [Basic Integration](docs/guides/integration-guide.md#basic-integration)
- [Production Deployments](docs/guides/integration-guide.md#production-deployments)
- [Real Examples](docs/guides/integration-guide.md#real-world-examples)

**Troubleshooting:**
- [Budget Issues](docs/guides/budget-guide.md#troubleshooting)
- [Cache Issues](docs/guides/cache-guide.md#troubleshooting)
- [Error Handling](docs/guides/integration-guide.md#error-handling)

---

## 📈 Documentation Stats

- **Total Pages:** 5 files
- **Total Lines:** 8,200+
- **Code Examples:** 65+
- **Scenarios:** 15+
- **Best Practices:** 50+
- **Troubleshooting:** 20+

---

## ✅ What You Can Do

✅ Make API calls to 4 providers (xAI, Anthropic, OpenAI, Google)  
✅ Cache results to save money (100% savings on cache hits)  
✅ Control spending with budget limits ($5/month to unlimited)  
✅ Choose execution modes (1-8 agents, sequential workflows)  
✅ Monitor performance and costs in real-time  
✅ Deploy to production (Express.js, CLI, custom)  
✅ Handle errors gracefully with complete error types  
✅ Optimize for speed, cost, or quality

---

**Last Updated:** January 31, 2026  
**Version:** 1.2.0  
**Status:** ✅ Complete

Start with [Quick Start](#quick-start-5-minutes) above or jump to the [docs/api.md](docs/api.md) for complete reference!
