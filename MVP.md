# oh-my-goose MVP Roadmap - Ecomode First! 🎯

> **Philosophy**: Start simple, prove value, iterate quickly

## MVP Goal

Build the **simplest useful version** that demonstrates:
- ✅ Goose MCP integration works
- ✅ Cost optimization is real (Ecomode!)
- ✅ Foundation is solid for expansion

## Why Ecomode First?

| Reason | Benefit |
|--------|---------|
| **Simplest to implement** | No multi-agent orchestration complexity |
| **Immediate value** | Cost savings from day 1 |
| **Proves concept** | Validates MCP integration works |
| **Fast to market** | Ship in weeks, not months |
| **Solid foundation** | Other modes build on this |

## MVP Feature Set

### ✅ Included in MVP

1. **Ecomode Execution**
   - Single agent execution
   - Cheapest model selection from `routing.simple`
   - `eco:` keyword detection
   
2. **Basic MCP Server**
   - Connection to Goose
   - Tool registration
   - Request/response handling
   
3. **Simple CLI**
   - `goose run "eco: your task"`
   - Basic help text
   - Error messages
   
4. **Cost Tracking**
   - Show cost per query
   - Compare to standard models
   - Display savings
   
5. **Simple Caching**
   - Cache repeated queries
   - Report cache hits
   - Show cost saved from cache
   
6. **Basic Skills (3-5)**
   - Refactoring
   - Documentation
   - Testing
   
7. **Agent Support**
   - Load existing 10 agents
   - Simple agent selection
   
8. **Simple HUD**
   - Spinner while processing
   - Cost display
   - Success/error messages

### ❌ NOT in MVP (Post-MVP)

1. ~~Autopilot mode~~ (needs orchestration)
2. ~~Swarm mode~~ (complex coordination)
3. ~~Pipeline mode~~ (multi-stage)
4. ~~Ultrapilot mode~~ (parallel execution)
5. ~~Advanced HUD~~ (progress bars, grids)
6. ~~30+ skills~~ (start with 3-5)
7. ~~34+ agents~~ (use existing 10)
8. ~~Complex routing~~ (just use cheapest)
9. ~~Workflows/recipes~~ (single-shot only)
10. ~~Interactive mode~~ (simple CLI first)

## MVP Success Criteria

### Must Have ✅
- [ ] User runs: `goose run "eco: refactor this function"`
- [ ] System uses cheapest model (grok-4.1-fast or gemini-2.5-flash)
- [ ] Shows cost: "Query cost: $0.01 (saved $0.02 vs standard)"
- [ ] Caches result for repeated queries
- [ ] Works with at least 3 skills (refactoring, docs, testing)
- [ ] Displays clear success/error messages
- [ ] Documentation shows how to use it

### Nice to Have 🎁
- [ ] Compare cost to other providers
- [ ] Show cache hit rate
- [ ] Basic usage statistics
- [ ] Simple configuration validation

## MVP Development Phases

### Phase 1: Foundation (Week 1-2)
```
✅ TypeScript project setup (DONE)
✅ Dependencies installed (DONE)
[ ] Core utilities (types, errors, logger)
[ ] Config loader
[ ] MCP server skeleton
```

### Phase 2: Ecomode Core (Week 3-4)
```
[ ] Simple model router (always use cheapest)
[ ] Single-agent execution
[ ] Basic cost calculator
[ ] Simple caching (JSON file)
```

### Phase 3: Skills & Agents (Week 5)
```
[ ] Skill framework
[ ] Refactoring skill
[ ] Documentation skill
[ ] Testing skill
[ ] Load existing 10 agents
```

### Phase 4: CLI & Integration (Week 6)
```
[ ] CLI with eco: detection
[ ] Goose MCP connection
[ ] Simple spinner/status
[ ] Help text
```

### Phase 5: Polish & Test (Week 7)
```
[ ] Error handling
[ ] Documentation
[ ] Example usage
[ ] Manual testing
[ ] Bug fixes
```

### Phase 6: Launch MVP (Week 8)
```
[ ] GitHub release
[ ] README with examples
[ ] Demo video/GIF
[ ] Community feedback
```

## Example MVP Usage

### Command
```bash
goose run "eco: refactor this function to use async/await"
```

### Output
```
🦢 oh-my-goose (Ecomode)
⚡ Using: grok-4.1-fast
🔄 Processing...

✅ Complete!

📊 Cost: $0.01 (saved $0.02 vs gpt-4o)
⚡ Cache: Miss (saved for next time)
⏱️  Duration: 3.2s

Result:
[... refactored code ...]
```

### Cached Query
```bash
goose run "eco: refactor this function to use async/await"

🦢 oh-my-goose (Ecomode)
💾 Cache hit! (instant result)

✅ Complete!

📊 Cost: $0.00 (saved $0.01 from cache)
⏱️  Duration: 0.1s

Result:
[... cached refactored code ...]
```

## Post-MVP Expansion Path

### Version 0.2 - Autopilot Mode
- Add lead + 2 subagents orchestration
- Task delegation logic
- `autopilot:` keyword

### Version 0.3 - More Skills
- Add 10 more skills (database, deployment, etc.)
- Skill categorization
- Skill discovery

### Version 0.4 - Ultrapilot Mode
- 5 parallel agents
- Task partitioning
- `ulw:` keyword

### Version 0.5 - Advanced HUD
- Progress bars
- Real-time updates
- Color-coded status

### Version 1.0 - Full Feature Set
- Swarm mode (3-12 dynamic agents)
- Pipeline mode
- All 34+ agents
- All 30+ skills
- Pre-built recipes
- Full HUD

## Development Estimate

| Milestone | Duration | Cumulative |
|-----------|----------|------------|
| **Phase 1: Foundation** | 2 weeks | 2 weeks |
| **Phase 2: Ecomode Core** | 2 weeks | 4 weeks |
| **Phase 3: Skills & Agents** | 1 week | 5 weeks |
| **Phase 4: CLI & Integration** | 1 week | 6 weeks |
| **Phase 5: Polish & Test** | 1 week | 7 weeks |
| **Phase 6: Launch** | 1 week | 8 weeks |

**Total MVP Timeline: 8 weeks** 🚀

## Key Decisions

### 1. Single Mode Only
**Decision**: MVP has only Ecomode  
**Rationale**: Proves concept without complexity  
**Trade-off**: Less features, but ships faster

### 2. Limited Skills
**Decision**: Start with 3-5 essential skills  
**Rationale**: Most common use cases covered  
**Trade-off**: Less versatility, but focused

### 3. Existing Agents
**Decision**: Use 10 existing agents, not 34+  
**Rationale**: Already defined, no extra work  
**Trade-off**: Less specialization, but adequate

### 4. Simple Caching
**Decision**: JSON file-based cache  
**Rationale**: Simple, no dependencies  
**Trade-off**: Not scalable, but works

### 5. Basic HUD
**Decision**: Spinner + cost, no fancy UI  
**Rationale**: Core info visible  
**Trade-off**: Less impressive, but functional

## Success Metrics

### Week 8 Goals
- [ ] 10+ users try MVP
- [ ] 5+ GitHub stars
- [ ] 3+ positive feedback comments
- [ ] 0 critical bugs reported
- [ ] Average cost savings: >30%

### Month 3 Goals (Post-MVP)
- [ ] 100+ users
- [ ] 50+ GitHub stars
- [ ] Version 0.3 released (more skills)
- [ ] Community contributions
- [ ] 1+ blog post/article written

## Next Steps

1. ✅ ~~Update PLAN.md with MVP priorities~~ (DONE)
2. Continue Phase 1: Complete core utilities
3. Build simple model router for Ecomode
4. Implement basic single-agent execution
5. Add 3 essential skills
6. Build CLI with `eco:` detection
7. Test end-to-end
8. Document and launch!

---

**Focus**: Ship Ecomode MVP in 8 weeks, then expand! 🦢
