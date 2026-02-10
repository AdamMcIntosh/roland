# Samwise 🧑‍🌾

> Persistent autonomous agent orchestration for developers. Named after Sam from LOTR—never gives up.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-Stable-green.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)]()
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)]()

A production-ready orchestration framework for intelligent AI workflow management through MCP (Model Context Protocol) integration. Samwise provides specialized agents, reusable skills, cost-optimized execution modes, and workflow automation — all built with TypeScript for type safety and maintainability.

**Version**: 1.0.0 (package.json)

---

## ✨ Key Features

### 🎯 Seven Execution Modes
Samwise offers multiple execution modes optimized for different use cases and budgets:

| Mode | Agents | Speed | Cost | Best For |
|------|--------|-------|------|----------|
| **Ecomode** | 1 | ⚡ Fast | 💰 Cheap | Simple questions, quick lookups |
| **Autopilot** | 2-3 | ⚡⚡ Fast | 💰 Cheap | Standard requests, balanced quality |
| **Ultrapilot** | 5 | ⚡⚡⚡ Medium | 💰💰 Moderate | Complex analysis, multiple perspectives |
| **Swarm** | 8+ | ⚡⚡⚡⚡ Slow | 💰💰💰 Expensive | Deep research, validation needed |
| **Pipeline** | 4 stages | ⚡⚡⚡⚡⚡ Slowest | 💰💰💰💰 Most Expensive | Multi-stage workflows |
| **Planning** | 1-3 | ⚡⚡ Medium | 💰💰 Moderate | Structured implementation plans |
| **Ask Mode** | 1 | ⚡ Fast | 💰 Cheap | Simple Q&A without tools |

**Mode Keywords** (use in CLI): `eco:`, `autopilot:`, `ultrapilot:`, `swarm:`, `pipeline:`, `plan:`, `ask:`

### 🎓 Skill Learning System
- **Automatic pattern extraction** from successful sessions
- Learns tool sequences, multi-step workflows, and prompt templates
- Confidence scoring that increases with repeated success
- Persistent storage in `./learned-skills/` directory
- CLI commands: `learned`, `learned --stats`, `learned --find <query>`, `learned --export <id>`

### 🤖 Specialized Agents
10 pre-configured agents loaded from YAML definitions in `./agents/`:
- **architect** - System design and architecture
- **researcher** - Information gathering and research
- **designer** - UX/UI design
- **writer** - Documentation and content
- **vision** - Future-thinking and strategy
- **critic** - Review and validation
- **analyst** - Data analysis
- **executor** - Implementation and coding
- **planner** - Task breakdown and planning
- **qa-tester** - Quality assurance

### ⚡ Core Skills System
10 production skills across 3 categories:
- **Core** (3): `refactoring`, `documentation`, `testing`
- **Advanced** (2): `security_scan`, `performance`
- **Extended** (5): `code_review`, `api_design`, `database_schema`, `debugging`, `migration`

Skills are automatically detected from query keywords and can be extended with custom implementations.

### 🧩 Workflow Orchestration
- Multi-step workflows with variable interpolation between steps
- **6 pre-built recipes** in `./recipes/`:
  - `PlanExecRevEx` - 4-agent coding workflow
  - `BugFix` - Automated bug fixing
  - `RESTfulAPI` - API development
  - `MicroservicesArchitecture` - Architecture design
  - `SecurityAudit` - Security review
  - `WebAppFullStack` - Full-stack development
- Execution tracking, duration, and cost reporting
- Workflow caching for repeatable runs

### 🖥️ CLI Interface
Rich interactive CLI with commands:
- `run <query>` - Execute tasks with mode keywords
- `agent <query>` - Autonomous agent with tool calling
- `workflow <name>` - Execute workflows by name
- `recipe <name>` - Execute pre-built recipes
- `recipes` - List available recipes
- `learned` - View/manage learned skills
- `cache` - Manage workflow cache (stats, clear, invalidate)
- `skills` - List available skills
- `agents` - List loaded agents
- `modes` - List execution modes
- `stats` - View session cost and cache statistics
- `help` - Show comprehensive documentation

**Options**: `--no-cache`, `--verbose`, `--model <model>`, `--cost-only`, `--hud`, `--no-hud`

### 📊 HUD Status Line
Real-time metrics displayed in terminal during execution:
- Live progress spinner
- Duration counter
- Tool call tracking
- Cost tracking
- Auto-enabled in TTY terminals (toggle with `--hud`/`--no-hud`)

### 💸 Cost Optimization
- **Complexity-based model routing** - Automatically selects cheapest model for task complexity
- **Cache system** - Persistent query result caching with TTL (default24 hours)
- **Budget management** - Set spending limits with warnings
- **Free tier available** - All default models use OpenRouter free tier

**Real Performance** (from actual measurements):
| Task Type | Standard Cost | Ecomode Cost | Savings |
|-----------|--------------|--------------|---------|
| Simple (documentation) | $0.0006 | $0.0000 | 100% |
| Medium (refactoring) | $0.0020 | $0.0000 | 100% |
| Complex (architecture) | $0.0150 | $0.0003 | 98% |

### 🔌 MCP Integration
- Full Model Context Protocol server implementation
- Exposes tools for external MCP clients
- Skill registration as MCP tools
- Stdio transport for local integration

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** >= 18.0.0 (required)
- **OpenRouter API key** (free tier available)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/samwise.git
cd samwise

# Install dependencies
npm install

# Build the project
npm run build

# Start the CLI
npm run samwise
```

### First Run

```bash
# Start interactive CLI
npm run samwise

# Or execute a single task
npm run samwise run "eco: refactor this function"
```

### Configuration

1. **Set your OpenRouter API key** (get free key at https://openrouter.ai):

```bash
# Option A: Environment variable
export SAMWISE_API_KEYS_OPENROUTER="your-key-here"

# Option B: .env file (recommended)
echo "SAMWISE_API_KEYS_OPENROUTER=your-key-here" > .env
```

2. **Optional: Customize configuration** by editing `config.yaml`:

```yaml
routing:
  simple:
    - meta-llama/llama-3.2-3b-instruct:free
  medium:
    - stepfun/step-3.5-flash:free
  complex:
    - nousresearch/hermes-3-llama-3.1-405b:free

samwise:
  api_keys:
    openrouter: "YOUR_OPENROUTER_KEY"
  mcp_defaults:
    temperature: 0.7
    max_tokens: 2000
```

---

## 📖 Usage Examples

### Basic Task Execution

```bash
# Simple refactoring in Ecomode
samwise run "eco: refactor this authentication function"

# Complex analysis with Ultrapilot
samwise run "ultrapilot: analyze this codebase architecture"

# Planning mode for structured implementation
samwise run "plan: build a REST API for user management"

# Ask mode for simple Q&A
samwise run "ask: what is TypeScript?"

# Custom model selection
samwise run "eco: explain this algorithm" --model "anthropic/claude-3.5-sonnet"
```

### Workflow Execution

```bash
# Execute a pre-built recipe
samwise recipe BugFix

# With input variables
samwise recipe RESTfulAPI --input user_task="Create endpoints for user CRUD"

# List all recipes
samwise recipes
```

### Agent Interaction

```bash
# Direct agent query (autonomous tool use)
samwise agent "Analyze the performance bottleneck in this code"

# With verbose output
samwise agent "Review this PR" --verbose
```

### Cache Management

```bash
# View cache statistics
samwise cache --stats

# Clear all cached results
samwise cache --clear

# Invalidate specific query
samwise cache --invalidate "refactor function"
```

### View Learned Skills

```bash
# List all learned patterns
samwise learned

# Show learning statistics
samwise learned --stats

# Find skills matching query
samwise learned --find "performance"

# Export a skill to framework
samwise learned --export "pattern-id"
```

---

## 🏗️ Architecture Overview

Samwise is built with a modular architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                           │
│  (interactive-cli.ts, cli-main.ts, commands, HUD)         │
├─────────────────────────────────────────────────────────────┤
│                    Orchestrator Layer                       │
│  (llm-client.ts, model-router.ts, cost-calculator.ts)     │
├─────────────────────────────────────────────────────────────┤
│                    Agent System │
│  (agent-loader.ts, agent-manager.ts, agent-loop/) │
├─────────────────────────────────────────────────────────────┤
│                    Skill Framework                          │
│  (skill-framework.ts, skill-executor.ts, implementations) │
├─────────────────────────────────────────────────────────────┤
│                    Workflow Engine                          │
│  (engine.ts, recipe-loader.ts, workflow execution)        │
├─────────────────────────────────────────────────────────────┤
│                    Support Systems │
│  (cache/, config/, utils/, monitoring/, server/)          │
└─────────────────────────────────────────────────────────────┘
```

**Technology Stack**:
- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.7 (strict mode)
- **LLM Integration**: OpenRouter (multiple providers)
- **Protocol**: Model Context Protocol (MCP) SDK 1.0.4
- **Configuration**: YAML parsing with validation (Zod)
- **CLI**: Commander.js with interactive readline
- **Styling**: Chalk for terminal colors
- **Testing**: Vitest

---

## 🔧 Modes Deep Dive

### Ecomode
Single-agent, ultra-efficient execution. Uses cheapest available model for the task complexity. Ideal for simple questions, quick lookups, and cost-critical applications.

**Configuration**: 1 agent (executor), parallel=False, timeout=10s

**Example**: `eco: what is TypeScript?`

### Autopilot
Two to three agents working sequentially or in parallel. Balances speed and quality. Good for standard requests and moderate analysis.

**Configuration**: 2-3 agents (executor + researcher), parallel=True, timeout=15s

**Example**: `autopilot: compare REST vs GraphQL`

### Ultrapilot
Five parallel agents providing comprehensive analysis from multiple perspectives. For complex problems where quality is priority over cost.

**Configuration**: 5 agents (architect, researcher, designer, writer, executor), parallel=True, timeout=30s

**Example**: `ultrapilot: design a real-time notification system`

### Swarm
Eight or more dynamic agents with coordination. Deep research mode with validation, analysis, and QA. Most expensive and slowest but highest quality.

**Configuration**: 8+ agents (all available), parallel=True, timeout=60s

**Example**: `swarm: create comprehensive AI system architecture`

### Pipeline
Sequential multi-stage workflow where each stage builds on previous results. For guided processes and complex project development.

**Configuration**: 4 stages with different agents per stage, sequential execution

**Example**: `pipeline: develop full-stack web application`

### Planning Mode
Structured implementation planning with step-by-step breakdowns. Produces actionable plans without full implementation.

**Configuration**: 1-3 agents (planner + optionally architect), moderate tokens

**Example**: `plan: build REST API for user management`

### Ask Mode
Simple Q&A without tool access. Fastest mode for factual questions and explanations.

**Configuration**: 1 agent, minimal tokens, no tools

**Example**: `ask: explain async/await in JavaScript`

---

## 📚 Documentation

- **INSTALLATION.md** - Detailed setup instructions
- **EXAMPLE_USAGE.md** - CLI examples and patterns
- **EXAMPLE_WORKFLOWS.md** - Real-world workflow examples
- **RECIPES_CATALOG.md** - Complete recipe reference
- **TROUBLESHOOTING.md** - Common issues and solutions
- **docs/guides/** - In-depth guides:
  - `mode-guide.md` - Mode comparison and configuration
  - `budget-guide.md` - Cost management
  - `cache-guide.md` - Caching strategies
  - `integration-guide.md` - External system integration
  - `interactive-cli-guide.md` - CLI usage tips
- **docs/api.md** - API reference for developers

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on development, testing, and pull requests.

---

## 📄 License

MIT © Samwise Contributors