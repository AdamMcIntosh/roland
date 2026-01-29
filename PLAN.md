# oh-my-goose: Goose MCP Integration Implementation Plan

> **Last Updated**: 2026-01-29  
> **Status**: Phase 1 - Foundation in Progress

## Overview

Build a TypeScript-based orchestration framework that integrates with Goose via the Model Context Protocol (MCP). The framework will provide specialized agents, reusable skills, and advanced execution modes while leveraging Goose as the AI execution engine.

### Target Feature Set

- ✅ **5 Execution Modes**: Autopilot, Ultrapilot, Swarm, Pipeline, Ecomode
- 🎯 **30+ Specialized Agents**: Architect, Researcher, Writer, Designer, QA-Tester, etc.
- 🎯 **30+ Reusable Skills**: Auth, Database, Testing, Deployment, Refactoring, etc.
- ✅ **Magic Keywords**: Natural language triggers (`autopilot:`, `swarm:`, `eco:`)
- ✅ **HUD-Style Real-Time Status**: Rich terminal UI with progress bars and cost tracking
- ✅ **Smart Model Routing**: Complexity-based selection with persistent caching
- ✅ **Pre-Built Recipes**: Common workflows ready to use

## Architecture Approach

### Integration Strategy
- **MCP Server**: oh-my-goose runs as an MCP server that Goose connects to
- **Tools**: Skills exposed as MCP tools that Goose can invoke
- **Agents**: Specialized agent configs loaded into Goose sessions
- **Workflows**: Multi-agent orchestration coordinating multiple Goose sessions

### Key Components
1. **MCP Server** - TypeScript server implementing MCP protocol
2. **Agent Manager** - Load and manage agent YAML configurations
3. **Skill Registry** - Register and execute skills as MCP tools
4. **Mode Orchestrator** - Coordinate different execution patterns
5. **Model Router** - Intelligent model selection based on complexity
6. **Cost Tracker** - Monitor API usage and costs
7. **Cache Manager** - Persistent result caching

---

## Current Progress Summary

### ✅ Completed

- [x] **README Updated** - Accurately reflects current state with Goose MCP integration plans
- [x] **TypeScript Project Initialized** 
  - package.json with all dependencies
  - tsconfig.json configured for ES2022 modules
  - ESLint and Prettier setup
  - Build and dev scripts
- [x] **Dependencies Installed** - 267 packages including:
  - `@modelcontextprotocol/sdk` for MCP protocol
  - `zod` for configuration validation
  - `yaml` for config/agent parsing
  - `commander` for CLI
  - `chalk` and `ora` for UI
- [x] **Project Structure Created**
  ```
  src/
  ├── server/          # MCP server implementation
  ├── agents/          # Agent management
  ├── skills/          # Skills as MCP tools
  │   └── implementations/
  ├── modes/           # Execution modes
  ├── orchestrator/    # Model routing, cost tracking
  ├── workflows/       # Workflow engine
  ├── config/          # Configuration loader
  ├── cli/             # CLI interface
  └── utils/           # Logging, types, errors
  ```
- [x] **Core Utilities Started**
  - `src/index.ts` - MCP server entry point
  - `src/utils/logger.ts` - Logging utility
  - Foundations for types and errors

### 🚧 In Progress

- [ ] **Phase 1: Foundation & MCP Server**
  - [ ] Complete type definitions (`src/utils/types.ts`)
  - [ ] Complete error classes (`src/utils/errors.ts`)
  - [ ] Complete config loader (`src/config/config-loader.ts`)
  - [ ] Implement MCP server (`src/server/mcp-server.ts`)

### 📋 Up Next

1. Complete remaining Phase 1 files (types, errors, config loader)
2. Implement basic MCP server with health check tool
3. Test MCP server connection with Goose
4. Move to Phase 2: Agent management system

---

## Implementation Workplan

### Phase 1: Foundation & MCP Server ⏳
- [x] Initialize TypeScript project
  - [x] Create package.json with dependencies
  - [x] Setup tsconfig.json for TypeScript compilation
  - [x] Configure ESLint and Prettier
  - [x] Add build and dev scripts
- [ ] Implement MCP server foundation
  - [ ] Create MCP server entry point
  - [ ] Implement server initialization and connection handling
  - [ ] Add basic logging and error handling
  - [ ] Register initial test tool (health check)
- [ ] Create configuration loader
  - [ ] YAML parser for config.yaml
  - [ ] Environment variable support for API keys
  - [ ] Config validation with Zod
  - [ ] **Simple model router** (for Ecomode MVP)

**MVP Focus**: Get basic MCP server working with cheapest model selection

### Phase 2: Agent System (MVP: Simple Agent Loader)
- [ ] Build agent management system
  - [ ] YAML schema definition for agents
  - [ ] Agent loader from agents/*.yaml files
  - [ ] Agent validator (check required fields)
  - [ ] **Agent registry for runtime access** (MVP: use existing 10 agents)
- [ ] Implement agent execution (MVP: Basic)
  - [ ] Map agent config to Goose session parameters
  - [ ] Dynamic prompt construction from agent templates
  - [ ] Model and temperature configuration
  - [ ] Tool assignment per agent
- [ ] **MVP**: Use existing 10 agents, expand to 34+ post-MVP
  - [x] Architect, Researcher, Designer, Writer, Vision
  - [x] Critic, Analyst, Executor, Planner, QA-Tester
  - [ ] (Post-MVP) Add 24+ more agents

**MVP Focus**: Load existing 10 agents, add more after Ecomode works
  - [x] Architect, Researcher, Designer, Writer, Vision
  - [x] Critic, Analyst, Executor, Planner, QA-Tester
  - [ ] **Add 20+ more**:
    - [ ] **Security Agents**
      - [ ] Security Auditor - Vulnerability scanning
      - [ ] Penetration Tester - Security testing
      - [ ] Compliance Officer - Standards compliance
      - [ ] Cryptography Expert - Encryption/security
    - [ ] **DevOps/Infrastructure**
      - [ ] DevOps Engineer - CI/CD pipelines
      - [ ] Cloud Architect - Cloud infrastructure
      - [ ] SRE (Site Reliability) - System reliability
      - [ ] Network Engineer - Network design
      - [ ] Platform Engineer - Platform tooling
    - [ ] **Development Specialists**
      - [ ] Frontend Developer - UI/client-side
      - [ ] Backend Developer - Server/API
      - [ ] Full-Stack Developer - End-to-end
      - [ ] Mobile Developer - iOS/Android
      - [ ] Database Administrator - Data management
      - [ ] API Designer - API architecture
      - [ ] Performance Engineer - Optimization
    - [ ] **Quality & Process**
      - [ ] Accessibility Expert - A11y compliance
      - [ ] Code Reviewer - Code quality
      - [ ] Debugger - Issue resolution
      - [ ] Migration Specialist - Legacy modernization
      - [ ] Technical Writer - Documentation
    - [ ] **Data & ML**
      - [ ] Data Scientist - Analytics/insights
      - [ ] ML Engineer - Machine learning
      - [ ] Data Engineer - Data pipelines
    - [ ] **Product & Management**
      - [ ] Product Manager - Product strategy
      - [ ] Business Analyst - Business logic
      - [ ] Project Manager - Project coordination
      - [ ] Scrum Master - Agile processes

### Phase 3: Skills as MCP Tools (MVP: 3-5 Core Skills)
- [ ] Create skill framework
  - [ ] Base Skill class/interface
  - [ ] Skill registration system
  - [ ] Tool metadata generation for MCP
  - [ ] Skill execution wrapper
- [ ] Skill parameter handling
  - [ ] JSON schema for skill inputs
  - [ ] Parameter validation
  - [ ] Result formatting
- [ ] **MVP: Implement 3-5 essential skills first**
  - [ ] **refactoring** - Code quality improvements (most common use case)
  - [ ] **documentation** - Auto-generate docs
  - [ ] **testing** - Basic test generation
  - [ ] (Optional) **security_scan** - Basic security checks
  - [ ] (Optional) **performance** - Simple profiling
- [ ] **(Post-MVP) Expand to 30+ skills**
  - [ ] Core Skills (10)
  - [ ] Development Skills (10)
  - [ ] DevOps Skills (10+)

**MVP Focus**: 3-5 high-value skills that work with Ecomode
  - [ ] auth - Authentication/authorization implementation
  - [ ] database - Database setup, migrations, queries
  - [ ] testing - Unit, integration, E2E tests
  - [ ] refactoring - Code quality improvements
  - [ ] security_scan - Security vulnerability analysis
  - [ ] documentation - Auto-generate docs
  - [ ] deployment - CI/CD, containerization, hosting
  - [ ] git_flow - Git operations, branching, PR management
  - [ ] api_design - REST/GraphQL API creation
  - [ ] performance - Profiling, optimization
- [ ] **Development Skills (10)**
  - [ ] frontend_setup - React/Vue/Angular scaffolding
  - [ ] backend_setup - Node/Python/Go server setup
  - [ ] mobile_setup - React Native/Flutter setup
  - [ ] state_management - Redux/MobX/Zustand integration
  - [ ] form_handling - Form validation and submission
  - [ ] error_handling - Error boundaries and logging
  - [ ] caching - Redis/Memcached setup
  - [ ] websockets - Real-time communication
  - [ ] file_upload - File handling and storage
  - [ ] search - ElasticSearch/Algolia integration
- [ ] **DevOps Skills (10+)**
  - [ ] docker - Containerization
  - [ ] kubernetes - Orchestration
  - [ ] terraform - Infrastructure as code
  - [ ] monitoring - Prometheus/Grafana/Datadog
  - [ ] logging - ELK stack, structured logging
  - [ ] backup - Database backups and recovery
  - [ ] scaling - Load balancing, auto-scaling
  - [ ] migrations - Zero-downtime deployments
  - [ ] disaster_recovery - DR planning and testing
  - [ ] cloud_setup - AWS/GCP/Azure configuration

### Phase 4: Model Routing & Intelligence (MVP: Simple Routing Only)
- [ ] **MVP: Basic model router for Ecomode**
  - [ ] Select cheapest model from `routing.simple` config
  - [ ] Basic fallback handling (try next model if first fails)
  - [ ] Simple cost calculation
  - [ ] Cost reporting
- [ ] **(Post-MVP) Enhanced routing**
  - [ ] Enhanced complexity classifier
    - [ ] Token count analysis
    - [ ] Keyword detection
    - [ ] Multi-step task detection
  - [ ] Model selection algorithm from routing config
  - [ ] Provider abstraction layer
  - [ ] Query complexity scoring (0-100)
- [ ] **(Post-MVP) Advanced cost tracking**
  - [ ] Token usage estimation
  - [ ] Session-level cost accumulation
  - [ ] Budget warnings and limits

**MVP Focus**: Simple routing - always use cheapest model for Ecomode

### Phase 5: Execution Modes (MVP: Ecomode First!)

#### 🎯 **Phase 5A: MVP - Ecomode** (Build This First!)
- [ ] **Ecomode** - Simple single-agent execution
  - [ ] Force cheapest model selection
  - [ ] Single-agent execution (no orchestration complexity)
  - [ ] Basic result caching
  - [ ] Cost tracking and reporting
  - [ ] `eco:` keyword detection in CLI
  - [ ] Simple progress indicator
  - [ ] Cost savings display

**Target**: Get Ecomode working end-to-end before building other modes!

#### Phase 5B: Additional Modes (Post-MVP)
- [ ] **Autopilot Mode**
  - [ ] Lead agent initialization
  - [ ] Subagent spawning (2 workers)
  - [ ] Task delegation logic
  - [ ] Result aggregation
- [ ] **Ultrapilot Mode**
  - [ ] Parallel subagent spawning (5 agents)
  - [ ] Task partitioning algorithm
  - [ ] Parallel execution coordination
  - [ ] Result merging
- [ ] **Swarm Mode** 🐝 (Enhanced)
  - [ ] **Dynamic agent pool sizing** (3-12 agents based on complexity)
    - [ ] Query complexity analyzer (simple: 3, medium: 6, complex: 12)
    - [ ] Token count estimator
    - [ ] Task decomposition analyzer
    - [ ] Automatic agent count selection
  - [ ] Shared memory implementation
  - [ ] Inter-agent communication protocol
  - [ ] Emergent behavior handling
  - [ ] Agent role specialization
  - [ ] Consensus building mechanism
  - [ ] Load balancing across agents
  - [ ] Real-time agent performance monitoring
- [ ] **Pipeline Mode**
  - [ ] Sequential stage execution (Plan → Execute → Review → Explain)
  - [ ] Stage output to next stage input
  - [ ] Pipeline state management
  - [ ] Error handling and retry logic

### Phase 6: Workflow System & Pre-Built Recipes
- [ ] Implement recipe/workflow engine
  - [ ] YAML workflow parser (recipes/*.yaml)
  - [ ] Workflow validation
  - [ ] Step execution orchestration
  - [ ] Variable interpolation ({{user_task}})
- [ ] Add workflow features
  - [ ] Conditional steps (loop_if)
  - [ ] Agent communication (@Agent references)
  - [ ] Output routing (output_to)
  - [ ] Max loops protection
  - [ ] Caching at workflow level
- [ ] Create pre-built recipes
  - [x] PlanExecRevEx.yaml (4-agent coding team)
  - [ ] **Web App Recipe** - Full-stack app with auth and database
  - [ ] **API Recipe** - REST API with documentation
  - [ ] **Mobile App Recipe** - Cross-platform mobile app
  - [ ] **Microservices Recipe** - Distributed system setup
  - [ ] **Data Pipeline Recipe** - ETL workflow
  - [ ] **ML Model Recipe** - Train and deploy ML models
  - [ ] **Security Audit Recipe** - Comprehensive security review
  - [ ] **Performance Optimization Recipe** - End-to-end optimization
  - [ ] **Migration Recipe** - Legacy system modernization
  - [ ] **Documentation Suite Recipe** - Full project documentation

### Phase 7: Caching & Persistence (MVP: Simple JSON Cache)
- [ ] **MVP: Basic caching for Ecomode**
  - [ ] Simple cache key generation (hash query)
  - [ ] JSON file-based cache (cache.json)
  - [ ] Cache hit/miss detection
  - [ ] Basic cache reporting
- [ ] **(Post-MVP) Advanced caching**
  - [ ] TTL and invalidation
  - [ ] Cache statistics
  - [ ] Cleanup utilities
- [ ] **(Post-MVP) Persistence features**
  - [ ] Session state saving
  - [ ] Result history
  - [ ] Cache optimization

**MVP Focus**: Simple cache that saves repeat queries

### Phase 8: CLI & Integration with HUD (MVP: Basic CLI)
- [ ] **MVP: Basic CLI with Ecomode**
  - [ ] Command parser for `run` command
  - [ ] **`eco:` keyword detection** (core MVP feature!)
  - [ ] Argument validation
  - [ ] Basic help text
- [ ] **MVP: Simple status display**
  - [ ] Spinner with ora
  - [ ] Cost display
  - [ ] Simple success/error messages
- [ ] **MVP: Goose integration**
  - [ ] MCP connection configuration
  - [ ] Basic session management
- [ ] **(Post-MVP) Advanced CLI**
  - [ ] Interactive mode
  - [ ] All keywords (autopilot:, swarm:, pipeline:)
  - [ ] Complex argument handling
- [ ] **(Post-MVP) Full HUD**
  - [ ] Real-time progress bars
  - [ ] Multi-agent status grid
  - [ ] Color-coded indicators
  - [ ] Timeline visualization
  - [ ] Syntax highlighting

**MVP Focus**: Simple CLI that detects `eco:` and shows cost

### Phase 9: Testing & Documentation
- [ ] Write tests
  - [ ] Unit tests for core utilities
  - [ ] Integration tests for MCP tools
  - [ ] E2E tests for workflows
  - [ ] Mock Goose for testing
- [ ] Create documentation
  - [ ] API documentation
  - [ ] Usage guides
  - [ ] Example workflows
  - [ ] Troubleshooting guide
- [ ] Add examples
  - [ ] Sample skills
  - [ ] Sample agents
  - [ ] Sample workflows
  - [ ] Tutorial projects

### Phase 10: Polish & Release
- [ ] Performance optimization
  - [ ] Lazy loading
  - [ ] Connection pooling
  - [ ] Parallel execution tuning
  - [ ] Memory management
- [ ] Error handling improvements
  - [ ] Graceful degradation
  - [ ] Better error messages
  - [ ] Recovery strategies
  - [ ] Logging levels
- [ ] Release preparation
  - [ ] Version tagging
  - [ ] Changelog
  - [ ] npm package publishing
  - [ ] GitHub release

---

## Technical Decisions

### Dependencies
```json
{
  "@modelcontextprotocol/sdk": "^1.0.4",
  "yaml": "^2.6.1",
  "zod": "^3.24.1",
  "commander": "^12.1.0",
  "chalk": "^5.3.0",
  "ora": "^8.1.1"
}
```

### File Structure
```
oh-my-goose/
├── src/
│   ├── index.ts                    # MCP server entry point
│   ├── server/
│   │   ├── mcp-server.ts          # MCP protocol implementation
│   │   └── connection.ts          # Connection management
│   ├── agents/
│   │   ├── agent-manager.ts       # Agent loading & registry
│   │   ├── agent-executor.ts      # Agent execution logic
│   │   └── types.ts               # Agent type definitions
│   ├── skills/
│   │   ├── skill-registry.ts      # Skill registration
│   │   ├── skill-executor.ts      # Skill execution wrapper
│   │   ├── base-skill.ts          # Base skill interface
│   │   └── implementations/       # Individual skill implementations
│   │       ├── auth.ts
│   │       ├── database.ts
│   │       ├── testing.ts
│   │       └── ...
│   ├── modes/
│   │   ├── autopilot.ts
│   │   ├── ecomode.ts
│   │   ├── ultrapilot.ts
│   │   ├── swarm.ts
│   │   └── pipeline.ts
│   ├── orchestrator/
│   │   ├── router.ts              # Model routing
│   │   ├── cost-tracker.ts        # Cost tracking
│   │   └── cache.ts               # Result caching
│   ├── workflows/
│   │   ├── workflow-engine.ts     # Workflow execution
│   │   └── workflow-parser.ts     # YAML parsing
│   ├── config/
│   │   ├── config-loader.ts       # Config loading
│   │   └── schema.ts              # Config validation
│   ├── cli/
│   │   ├── index.ts               # CLI entry point
│   │   └── commands.ts            # Command handlers
│   └── utils/
│       ├── logger.ts              # ✅ Logging utility
│       ├── errors.ts              # Error classes
│       └── types.ts               # Type definitions
├── agents/                         # ✅ Existing YAML files
├── recipes/                        # ✅ Existing workflow templates
├── config.yaml                     # ✅ Existing config
├── package.json                    # ✅ Created
├── tsconfig.json                   # ✅ Created
└── README.md                       # ✅ Updated
```

---

## Notes & Considerations

### Goose MCP Integration
- Goose supports MCP natively, so we just need to implement the protocol correctly
- MCP tools are synchronous - for long-running operations, return progress updates
- Goose handles the LLM interaction; we provide the tools/functions

### Agent vs Skill vs Mode
- **Agent**: A specialized prompt configuration (loaded from YAML)
- **Skill**: A reusable MCP tool (code that performs actions)
- **Mode**: An orchestration pattern (how agents/skills are coordinated)

### Model Routing Strategy
1. Analyze task complexity (prompt length, keywords, structure)
2. Select appropriate tier (simple/medium/complex)
3. Choose first available model from tier
4. Fallback to next model if API fails
5. Track costs and cache results

### Caching Strategy
- Cache key = hash(mode + query + agent_config)
- Store in cache.json with timestamp
- Invalidate after 24 hours or manual clear
- Report cache hit savings in cost tracking

### Error Handling
- Graceful degradation: if a skill fails, return error to Goose
- Retry logic for transient API errors
- Clear error messages with actionable suggestions
- Log all errors for debugging

### Security
- Never commit API keys (use .env or environment variables)
- Validate all skill inputs
- Sandbox skill execution where possible
- Rate limiting on expensive operations

---

## Success Criteria

- [ ] MCP server successfully connects to Goose
- [ ] At least 6 core skills work as MCP tools
- [ ] All 5 execution modes functional
- [ ] Agent YAML configs load correctly
- [ ] PlanExecRevEx workflow executes successfully
- [ ] Cost tracking reports accurate estimates
- [ ] Caching reduces repeat query costs
- [ ] Documentation complete with examples
- [ ] Tests achieve >80% coverage
- [ ] CLI is intuitive and well-documented

---

## Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Development with watch mode
npm run dev

# Start MCP server
npm run mcp

# Lint code
npm run lint

# Format code
npm run format

# Run tests
npm test

# Clean build output
npm run clean
```

---

## Next Immediate Steps

1. ✅ ~~Update README~~
2. ✅ ~~Create project structure~~
3. ✅ ~~Install dependencies~~
4. 🔄 Complete Phase 1 core files:
   - Complete `src/utils/types.ts`
   - Complete `src/utils/errors.ts`
   - Complete `src/config/config-loader.ts`
   - Implement `src/server/mcp-server.ts`
5. Test MCP server with basic health check tool
6. Begin Phase 2: Agent system
