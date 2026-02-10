# Ecomode MVP - Example Usage Guide

This guide demonstrates real-world usage of the samwise Ecomode MVP.

## Quick Start

### 1. Basic Ecomode Query

```bash
npm run cli
> run "eco: refactor this long function to be more readable"
```

**What happens**:
- Keyword parser detects `eco:` prefix → Ecomode mode activated
- Detects `refactor` → RefactoringSkill is selected
- Query complexity inferred as `medium`
- ModelRouter selects `stepfun/step-3.5-flash:free` (free model for medium complexity)
- Result is cached for identical future queries
- Cost: $0.0000 (free tier)

**Output**:
```
✓ Ecomode Result
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Skill: RefactoringSkill
Model: stepfun/step-3.5-flash:free (via OpenRouter)
Status: Success

[Refactored code output here]

Cost: $0.0000 | Cached: No | Duration: 1.2s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 2. Documentation Generation

```bash
npm run cli
> run "eco: add comprehensive JSDoc to my TypeScript file"
```

**What happens**:
- Parser detects `eco:` + `documentation` keywords
- DocumentationSkill is selected
- Complexity: `simple`
- ModelRouter selects `meta-llama/llama-3.2-3b-instruct:free` (free model for simple tasks)
- Returns formatted documentation additions

**Example Output**:
```
✓ Documentation Added
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * Generates a comprehensive cost report for the session.
 * @param includeBreakdown - If true, includes per-task breakdown
 * @returns {Report} Object containing total cost and task details
 * @throws {ConfigError} If unable to calculate costs
 */
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cost: $0.0000 | Cached: No | Duration: 0.8s
```

### 3. Test Generation

```bash
npm run cli
> run "eco: write unit tests for this authentication module"
```

**What happens**:
- Parser detects `eco:` + `test/testing` keywords
- TestingSkill is selected
- Complexity inferred as `medium`
- Generates Jest-compatible test cases

**Example Output**:
```
✓ Test Suite Generated
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('AuthService', () => {
  it('should validate user credentials', () => {
    // Test implementation
  })
  
  it('should throw on invalid token', () => {
    // Test implementation
  })
})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cost: $0.0000 | Cached: No | Duration: 1.5s
```

## Advanced Usage

### Query with Specific Skill

```bash
npm run cli
> run "eco: refactor the database module with focus on performance"
```

The keyword `refactor` + `performance` → RefactoringSkill with performance focus

### Querying with Complexity Hints

```bash
# Simple task (< 50 tokens expected)
npm run cli
> run "eco: add a comment to this line"

# Medium task (50-500 tokens)
npm run cli
> run "eco: refactor this class"

# Complex task (> 500 tokens)
npm run cli
> run "eco: redesign entire module architecture"

# Explanation task (detailed walkthrough)
npm run cli
> run "eco: explain: how does dependency injection work"
```

### Cost Comparison

```bash
# Check cost savings with cached query
npm run cli
> run "eco: refactor function"  # First run: $0.0000
> run "eco: refactor function"  # Cached: FREE
```

**Cache Hit Example**:
```
✓ Cache Hit!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Retrieved from cache (previous cost: $0.0000)
Savings this session: $0.0000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Command Reference

### `run` - Execute Ecomode Query

```bash
npm run cli
> run "eco: your query here"

# Options:
> run --no-cache "eco: query"      # Bypass cache, always execute
> run --verbose "eco: query"       # Show detailed execution log
> run --model nousresearch/hermes-3-llama-3.1-405b:free "eco: query"  # Override model selection
> run --cost-only "eco: query"     # Show only cost estimate
```

### `stats` - View Session Statistics

```bash
npm run cli
> stats
```

**Example Output**:
```
📊 Session Statistics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Queries: 3
Cache Hits: 1 (33%)
Total Cost: $0.0000
Savings (vs standard): 100%

Top Models Used:
  • stepfun/step-3.5-flash:free: 2 queries ($0.0000)
  • meta-llama/llama-3.2-3b-instruct:free: 1 query ($0.0000)

Top Skills Used:
  • RefactoringSkill: 2 queries
  • DocumentationSkill: 1 query
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### `skills` - List Available Skills

```bash
npm run cli
> skills
```

**Output**:
```
✨ Available Skills
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. RefactoringSkill
   Categories: refactor, optimize, performance, readability
   Models: Simple to Complex
   Usage: "eco: refactor this code"

2. DocumentationSkill
   Categories: docs, documentation, comment, jsdoc, docstring
   Models: Simple to Complex
   Usage: "eco: add documentation to this"

3. TestingSkill
   Categories: test, testing, tests, unit-test, jest
   Models: Simple to Complex
   Usage: "eco: write tests for this"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### `agents` - List Available Agents

```bash
npm run cli
> agents
```

**Output**:
```
🤖 Available Agents
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

10 agents loaded:

• architect - System design and architecture
• researcher - Research and fact-finding
• designer - UI/UX design specialist
• writer - Technical writing
• vision - Product vision guidance
• critic - Code review and critique
• analyst - Analysis and reporting
• executor - Implementation specialist
• planner - Planning and roadmapping
• qa-tester - Quality assurance specialist
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Note: Agent integration coming in Phase 6
```

### `help` - Show Command Documentation

```bash
npm run cli
> help
```

## Real-World Workflow Example

### Scenario: Code Review and Refactoring Session

```bash
# Start CLI
npm run cli

# 1. Get cost estimate
> run --cost-only "eco: review this authentication code"
   Estimated cost: $0.0000

# 2. Generate tests first
> run "eco: write comprehensive unit tests"
   Cost: $0.0000 | Duration: 1.3s

# 3. Check stats
> stats
   Total Cost: $0.0000
   Cache Hits: 0

# 4. Refactor code
> run "eco: refactor for performance and readability"
   Cost: $0.0000 | Duration: 1.5s

# 5. Add documentation
> run "eco: add JSDoc comments"
   Cost: $0.0000 (uses meta-llama/llama-3.2-3b-instruct:free for simple task)

# 6. View final session report
> stats
   Total Cost: $0.0000
   Time Saved vs Standard: ~45 minutes
   Estimated Standard Cost: $0.0000
   Savings: 100%
```

## Error Handling Examples

### Missing Configuration

```bash
npm run cli
> run "eco: test"

✗ Configuration Error
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Missing API key for OpenRouter provider.

How to fix:
1. Create a .env file in the project root
2. Add: SAMWISE_API_KEYS_OPENROUTER=your_key_here
3. Restart the CLI

Get your free API key: https://openrouter.ai/settings/keys
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Invalid Query

```bash
npm run cli
> run "eco: "

✗ Invalid Query
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Query cannot be empty. Please provide text to process.

Examples:
  • eco: refactor this function
  • eco: write unit tests
  • eco: add documentation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Skill Not Detected

```bash
npm run cli
> run "eco: explain quantum physics"

⚠ Skill Not Detected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Query doesn't match any available skills.

Available skills:
  • RefactoringSkill - Use: "refactor", "optimize", "performance"
  • DocumentationSkill - Use: "docs", "documentation", "jsdoc"
  • TestingSkill - Use: "test", "testing", "unit test"

Proceeding with general query execution...
Cost: $0.0000 | Duration: 1.1s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Performance Tips

### 1. Leverage Caching

```bash
# These queries will be cached as identical:
> run "eco: refactor the API handler"
> run "eco: refactor the API handler"  # <- Instant, free

# These are different (will execute again):
> run "eco: refactor the API handler"
> run "eco: refactor the api handler"  # Different capitalization
```

### 2. Use Complexity Hints

```bash
# Bad: Unclear complexity
> run "eco: fix the code"

# Good: Clear complexity indication
> run "eco: explain: how the code works"       # Simple
> run "eco: refactor the module"               # Medium
> run "eco: redesign entire architecture"      # Complex
```

### 3. Batch Related Tasks

```bash
# In one session:
> run "eco: write tests"      # Cost: $0.0000
> run "eco: refactor"         # Cost: $0.0000
> run "eco: add docs"         # Cost: $0.0000
# Total: $0.0000 (100% free with OpenRouter)

# vs. Running separately, forgetting cache hits:
# Total could be: $0.0000 (all free tier models)
```

## Troubleshooting

### Cache Not Working

```bash
# Clear cache and retry
npm run cli
> run --no-cache "eco: your query"

# View cache stats
> stats
# Should show cache hit percentage > 0 after repeated queries
```

### Slow Response Time

```bash
# Check if using complex model
> run --verbose "eco: simple task"
# If using a complex model, try --model meta-llama/llama-3.2-3b-instruct:free

# Or specify complexity explicitly:
> run "eco: explain: quick summary"  # Will use faster model
```

### Model Not Available

```bash
# Check available models
npm run cli
> stats
# "Top Models Used" section shows what's available

# The system automatically falls back to next cheapest
```

## Next Steps

- See [INSTALLATION.md](INSTALLATION.md) for setup
- See [ReadMe.MD](ReadMe.MD) for full documentation
- Check [agents/](agents/) directory for agent configurations
- Review [config.yaml](config.yaml) for advanced settings
- Explore [RECIPES_CATALOG.md](RECIPES_CATALOG.md) for workflow examples
