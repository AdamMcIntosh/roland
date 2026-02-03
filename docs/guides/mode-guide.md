# Mode Execution Guide

**Complete Guide to samwise Execution Modes**

---

## Quick Overview

samwise provides 5 execution modes for different use cases:

| Mode | Agents | Speed | Cost | Best For |
|------|--------|-------|------|----------|
| **Ecomode** | 1 | ⚡ Fast | 💰 Cheap | Simple questions |
| **Autopilot** | 2 | ⚡⚡ Fast | 💰 Cheap | Standard requests |
| **Ultrapilot** | 5 | ⚡⚡⚡ Medium | 💰💰 Moderate | Complex analysis |
| **Swarm** | 8 | ⚡⚡⚡⚡ Slow | 💰💰💰 Expensive | Deep research |
| **Pipeline** | Sequential | ⚡⚡⚡⚡⚡ Slowest | 💰💰💰💰 Most Expensive | Multi-stage workflows |

---

## Ecomode

**Single-Agent, Ultra-Efficient**

### When to Use

```
✅ Simple factual questions
✅ Quick lookups
✅ Cost-critical applications
✅ Real-time responses needed
✅ Budget-conscious users
```

### Configuration

```yaml
# config.yaml
modes:
  ecomode:
    agents: [1]  # Just executor
    model: grok-3-mini
    tokens: 500
    parallelism: 1
    timeout: 10000
```

### Code Example

```typescript
import { ExecutionOrchestrator } from '../src/orchestrator/execution-orchestrator';

const orchestrator = new ExecutionOrchestrator();

// Execute in Ecomode
const result = await orchestrator.execute({
  query: 'What is TypeScript?',
  mode: 'ecomode'
});

// Response:
// {
//   result: "TypeScript is a typed superset of JavaScript...",
//   agentsUsed: ["executor"],
//   latency: 234,    // ms
//   tokens: 187,
//   cost: 0.00094,   // Very cheap
//   cacheHit: false
// }
```

### Cost Analysis

```
Query: "What is REST?"
- Model: grok-3-mini ($0.0005/1k tokens)
- Tokens: 200 avg
- Cost per query: 0.0001
- Budget: $5.00 = 50,000 queries possible!
```

### Performance

```
✅ Fastest response (no parallelism overhead)
✅ Lowest cost (1 agent × cheap model)
✅ Most predictable
❌ Limited depth
❌ Single perspective
```

---

## Autopilot

**Two-Agent, Balanced**

### When to Use

```
✅ Standard question-answer
✅ Moderate analysis needed
✅ Balance speed and quality
✅ Good cost/quality ratio
✅ Most common workload
```

### Configuration

```yaml
# config.yaml
modes:
  autopilot:
    agents: [2]        # Executor + Researcher
    model: grok-3
    tokens: 1000
    parallelism: 2     # Run both simultaneously
    timeout: 15000
```

### Code Example

```typescript
const orchestrator = new ExecutionOrchestrator();

const result = await orchestrator.execute({
  query: 'How do REST APIs compare to GraphQL?',
  mode: 'autopilot'
});

// Response:
// {
//   result: "Executor and Researcher perspectives combined...",
//   agentsUsed: ["executor", "researcher"],
//   latency: 487,     // Slightly higher (parallel)
//   tokens: 456,      // Both agents contribute
//   cost: 0.00091,    // Reasonable cost
//   cacheHit: false,
//   breakdown: {
//     executor: "Here's the implementation...",
//     researcher: "Here's the academic perspective..."
//   }
// }
```

### Cost Analysis

```
Query: "Explain microservices"
- Model: grok-3 ($0.002/1k tokens)
- Avg tokens per agent: 400
- Total tokens: 800
- Cost per query: 0.0016
- Budget: $5.00 = 3,125 queries possible
```

### Performance

```
✅ Good balance of speed and quality
✅ Parallel execution (fast despite 2 agents)
✅ Multiple perspectives with manageable cost
❌ Not as cheap as Ecomode
❌ Not as comprehensive as Ultrapilot
```

---

## Ultrapilot

**Five-Agent, Comprehensive**

### When to Use

```
✅ Complex technical problems
✅ Need multiple perspectives
✅ Quality is priority over cost
✅ Research and analysis
✅ Architectural decisions
```

### Configuration

```yaml
# config.yaml
modes:
  ultrapilot:
    agents:
      - architect     # Design perspective
      - researcher    # Research perspective
      - designer      # UX perspective
      - writer        # Documentation perspective
      - executor      # Implementation perspective
    model: grok-3
    tokens: 2000
    parallelism: 5    # All in parallel
    timeout: 30000
```

### Code Example

```typescript
const orchestrator = new ExecutionOrchestrator();

const result = await orchestrator.execute({
  query: 'Design a real-time notification system',
  mode: 'ultrapilot'
});

// Response:
// {
//   result: "Comprehensive design from 5 perspectives...",
//   agentsUsed: [
//     "architect",
//     "researcher",
//     "designer",
//     "writer",
//     "executor"
//   ],
//   latency: 892,     // Slower but worth it
//   tokens: 2340,     // Multiple agents
//   cost: 0.00468,    // Moderate
//   cacheHit: false,
//   breakdown: {
//     architect: "System architecture: ...",
//     researcher: "Industry best practices: ...",
//     designer: "User experience: ...",
//     writer: "Documentation: ...",
//     executor: "Implementation steps: ..."
//   }
// }
```

### Cost Analysis

```
Query: "Design cloud infrastructure"
- Model: grok-3 ($0.002/1k tokens)
- Avg tokens per agent: 600
- Total tokens: 3,000
- Cost per query: 0.006
- Budget: $5.00 = 833 queries possible
```

### Performance

```
✅ Comprehensive analysis
✅ Multiple expert perspectives
✅ Still parallel (5 at once)
⚠️ Higher cost than Autopilot
⚠️ Slower response time
```

---

## Swarm

**Eight-Agent, Deep Research**

### When to Use

```
✅ Deep research required
✅ Very complex problems
✅ Need consensus/validation
✅ Cost not a concern
✅ Quality is critical
```

### Configuration

```yaml
# config.yaml
modes:
  swarm:
    agents:
      - architect
      - researcher
      - designer
      - writer
      - executor
      - critic       # Validation
      - analyst      # Analysis
      - qa-tester    # Quality assurance
      - planner      # Planning
      - vision       # Future perspective
    model: claude-4.5-sonnet  # Premium model
    tokens: 4000
    parallelism: 8
    timeout: 60000
```

### Code Example

```typescript
const orchestrator = new ExecutionOrchestrator();

const result = await orchestrator.execute({
  query: 'Create a comprehensive AI system architecture',
  mode: 'swarm'
});

// Response:
// {
//   result: "Deep analysis from 8+ perspectives with validation...",
//   agentsUsed: [
//     "architect", "researcher", "designer", "writer",
//     "executor", "critic", "analyst", "qa-tester"
//   ],
//   latency: 2340,    // Slow but thorough
//   tokens: 5600,     // Many agents
//   cost: 0.01680,    // Expensive
//   cacheHit: false,
//   breakdown: {
//     architect: "Architecture proposal: ...",
//     critic: "Issues and concerns: ...",
//     analyst: "Risk analysis: ...",
//     qa-tester: "Quality checks: ...",
//     // ... more perspectives
//   },
//   consensus: 85     // Confidence score
// }
```

### Cost Analysis

```
Query: "Comprehensive system design"
- Model: claude-4.5-sonnet ($0.003/1k tokens)
- Avg tokens per agent: 800
- Total tokens: 6,400
- Cost per query: 0.0192
- Budget: $5.00 = 260 queries maximum

Expensive but extremely thorough!
```

### Performance

```
✅ Most comprehensive
✅ Multiple validation perspectives
✅ Highest quality results
❌ Most expensive option
❌ Slowest response time
```

---

## Pipeline

**Sequential Multi-Stage Workflow**

### When to Use

```
✅ Multi-stage workflows
✅ Each stage builds on previous
✅ Complex project development
✅ Step-by-step solutions
✅ Guided processes
```

### Configuration

```yaml
# config.yaml
modes:
  pipeline:
    stages:
      - name: research
        agents: [researcher]
        model: grok-3
        tokens: 1500
        
      - name: design
        agents: [architect, designer]
        model: grok-3
        tokens: 2000
        
      - name: develop
        agents: [executor]
        model: grok-3-mini
        tokens: 2500
        
      - name: test
        agents: [qa-tester]
        model: grok-3
        tokens: 1000
        
      - name: document
        agents: [writer]
        model: grok-3-mini
        tokens: 1500
    
    parallelism: 1  # Sequential
    timeout: 120000  # 2 minutes
```

### Code Example

```typescript
const orchestrator = new ExecutionOrchestrator();

const result = await orchestrator.execute({
  query: 'Build a complete REST API with documentation',
  mode: 'pipeline',
  pipelineConfig: {
    stages: ['research', 'design', 'develop', 'test', 'document']
  }
});

// Response:
// {
//   result: "Complete API with all stages completed...",
//   stages: [
//     {
//       name: 'research',
//       agents: ['researcher'],
//       output: "REST best practices and libraries...",
//       cost: 0.00225,
//       latency: 356
//     },
//     {
//       name: 'design',
//       agents: ['architect', 'designer'],
//       output: "API schema and documentation structure...",
//       cost: 0.00400,
//       latency: 512,
//       context: "Based on research from stage 1..."
//     },
//     {
//       name: 'develop',
//       agents: ['executor'],
//       output: "Implemented API code...",
//       cost: 0.00250,
//       latency: 423,
//       context: "Following design from stage 2..."
//     },
//     {
//       name: 'test',
//       agents: ['qa-tester'],
//       output: "Test suite and validation results...",
//       cost: 0.00200,
//       latency: 287
//     },
//     {
//       name: 'document',
//       agents: ['writer'],
//       output: "Complete documentation...",
//       cost: 0.00225,
//       latency: 301
//     }
//   ],
//   totalCost: 0.01300,
//   totalLatency: 1879,
//   allStagesComplete: true
// }
```

### Cost Analysis

```
Multi-stage project:
- Stage 1 (research): $0.002
- Stage 2 (design): $0.004
- Stage 3 (development): $0.003
- Stage 4 (testing): $0.002
- Stage 5 (documentation): $0.002
- Total: $0.013 per complete project

vs. Manual: Much more value
```

### Performance

```
✅ Comprehensive workflow
✅ Context carried between stages
✅ Each stage optimized
❌ Slowest overall (sequential)
❌ Moderate cost
```

---

## Mode Comparison Matrix

```
                 Ecomode  Autopilot  Ultrapilot  Swarm    Pipeline
Agents           1        2          5           8        Sequential
Speed            ⚡⚡⚡⚡   ⚡⚡⚡      ⚡⚡        ⚡       ⚡
Cost             💰       💰💰       💰💰💰    💰💰💰💰 💰💰
Quality          ⭐       ⭐⭐       ⭐⭐⭐    ⭐⭐⭐⭐ ⭐⭐⭐
Latency (ms)     250      500        900        2000     2000+
Tokens/Query     200      800        3000       6400     7500
Cost/Query       $0.001   $0.002     $0.006     $0.020   $0.015
Queries/Budget   5000     2500       833        250      330
Best For         Simple   Standard   Complex    Deep     Multi-Stage
```

---

## Decision Tree

### How to Choose a Mode

```
START: What are you trying to do?
│
├─→ "Quick answer needed"
│   └─→ Ecomode ✅
│
├─→ "Standard question"
│   └─→ Autopilot ✅
│
├─→ "Complex analysis or architecture"
│   └─→ Is cost a concern?
│       ├─→ YES → Autopilot (with caching)
│       └─→ NO → Ultrapilot ✅
│
├─→ "Very deep research needed"
│   └─→ Is cost a concern?
│       ├─→ YES → Ultrapilot
│       └─→ NO → Swarm ✅
│
├─→ "Multi-stage workflow"
│   └─→ Each stage builds on previous?
│       ├─→ YES → Pipeline ✅
│       └─→ NO → Use mode per stage
│
└─→ END
```

---

## Real-World Examples

### Example 1: Startup on Limited Budget

```typescript
// Budget: $5/month
// Strategy: Ecomode + Heavy Caching

const cache = new CacheManager();

async function askQuestion(query: string) {
  // Check cache first
  const cached = cache.get(query);
  if (cached) return cached;
  
  // Use cheapest mode
  const result = await orchestrator.execute({
    query,
    mode: 'ecomode'  // $0.001 per query
  });
  
  cache.set(query, result.result, 'grok-3-mini', result.cost);
  return result.result;
}

// With this strategy:
// - $5 budget = 5,000 Ecomode queries
// - Cache hits (80% typical) = 25,000 effective queries
// = 30,000 total queries for $5
```

### Example 2: Consulting Firm

```typescript
// Budget: Unlimited
// Strategy: Quality is priority

async function buildProjectPlan(requirements: string) {
  // Use best mode for comprehensive analysis
  const result = await orchestrator.execute({
    query: `Create project plan for: ${requirements}`,
    mode: 'swarm'  // All 8 agents, comprehensive
  });
  
  // Get consensus score and all perspectives
  return result;
}

// Results:
// - Deep analysis from 8 perspectives
// - Validated by critic and analyzer
// - Tested by QA tester
// - Comprehensive and reliable
```

### Example 3: SaaS Company

```typescript
// Budget: $1,000/month
// Strategy: Balanced with complexity routing

const { ComplexityAnalyzer } = require('../src/utils/complexity-analyzer');

async function intelligentExecution(query: string) {
  // Analyze complexity
  const analysis = ComplexityAnalyzer.analyze(query);
  
  // Route to appropriate mode
  let mode;
  if (analysis.score < 30) {
    mode = 'ecomode';      // Simple
  } else if (analysis.score < 70) {
    mode = 'autopilot';    // Medium
  } else {
    mode = 'ultrapilot';   // Complex
  }
  
  const result = await orchestrator.execute({
    query,
    mode
  });
  
  // Cost-effective: matches mode to complexity
}

// Results:
// - 80% of queries use Ecomode (cheap)
// - 15% of queries use Autopilot (balanced)
// - 5% of queries use Ultrapilot (expensive)
// - Average cost: $0.003 per query
// - $1,000/month = 333,000 queries
```

---

## Optimization Tips

### 1. Combine Modes with Caching

```typescript
// First run: Swarm for comprehensive analysis
const initial = await orchestrator.execute({
  query: 'Complex question',
  mode: 'swarm'
});

cache.set('Complex question', initial.result, 'claude', initial.cost);

// Subsequent runs: Cache hits
const cached = cache.get('Complex question');
// Cost: $0.00 vs $0.020
// Savings: $0.020 per hit
```

### 2. Use Pipeline for Complex Projects

```typescript
// Instead of multiple Swarm calls
// Use Pipeline: each stage is targeted

const result = await orchestrator.execute({
  query: 'Build complete system',
  mode: 'pipeline'
});

// More efficient:
// Research (researcher only)
// Design (architect + designer)
// Develop (executor only)
// Test (QA tester only)
// Document (writer only)
```

### 3. Progressive Enhancement

```typescript
// Start with Ecomode
let result = await orchestrator.execute({
  query,
  mode: 'ecomode'
});

// If unsatisfied, upgrade
if (result.quality < threshold) {
  result = await orchestrator.execute({
    query,
    mode: 'autopilot'
  });
}

// Only escalate when needed
```

---

## Best Practices

✅ **DO:**
- Use Ecomode for simple queries
- Use caching to reduce mode cost
- Route by complexity (simple → ecomode, complex → ultrapilot)
- Use Pipeline for multi-stage workflows
- Monitor cost per query

❌ **DON'T:**
- Use Swarm for simple questions
- Skip caching for repeating queries
- Always use expensive modes
- Mix modes randomly
- Ignore budget constraints

---

## Next Steps

- See [Budget Guide](budget-guide.md) for cost optimization
- See [Cache Guide](cache-guide.md) for caching strategy
- See [API Reference](../api.md) for execution details

---

**Last Updated:** January 31, 2026  
**Version:** 1.0.0
