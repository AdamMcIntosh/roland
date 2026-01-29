# oh-my-goose 🦢

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Goose](https://img.shields.io/badge/goose-MCP%20Integration-blue.svg)](https://github.com/block/goose)
[![Status](https://img.shields.io/badge/status-in%20development-yellow.svg)]()

A powerful orchestration framework for **[Goose](https://github.com/block/goose)** that provides intelligent AI workflow management through MCP (Model Context Protocol) tools integration. Inspired by **oh-my-claudecode**, OMG extends Goose with specialized agents, reusable skills, and advanced execution modes.

> **⚠️ Project Status**: Currently in active development. Core TypeScript implementation in progress with Goose MCP integration.

## ✨ Planned Features

- **🦢 Goose MCP Integration**: Native Goose AI agent with custom MCP tools
- **🎯 5 Execution Modes**: Autopilot, Ecomode, Ultrapilot, Swarm, Pipeline
- **🤖 10+ Specialized Agents**: Architect, Researcher, Designer, Writer, Vision, QA-Tester, and more
- **⚡ Reusable Skills as MCP Tools**: Auth, Database, Testing, Deployment, Security, Refactoring
- **🎨 Rich HUD Display**: Real-time progress tracking with Goose session status
- **🧠 Smart Model Routing**: Complexity-based model selection across providers
- **💰 Cost Optimization**: Intelligent model selection with prompt caching
- **📊 Multi-Agent Workflows**: Declarative YAML-based agent coordination

## 🚀 Current Status

### What's Ready

```
oh-my-goose/
├── config.yaml                 # ✅ Model routing & Goose API config
├── agents/*.yaml               # ✅ 10 specialized agent definitions
│   ├── architect.yaml
│   ├── researcher.yaml
│   ├── designer.yaml
│   └── ... (7 more)
└── recipes/
    └── PlanExecRevEx.yaml     # ✅ 4-agent workflow template
```

### Installation (Coming Soon)

```bash
# Install Goose first
npm install -g goose-ai

# Clone this repository
git clone https://github.com/yourusername/oh-my-goose.git
cd oh-my-goose

# Install dependencies
npm install

# Configure API keys
cp config.yaml.example config.yaml
# Edit config.yaml with your API keys

# Build TypeScript
npm run build

# Run with Goose
goose session start --mcp oh-my-goose
```

## 📋 Features

### Execution Modes

| Mode | Use Case | Cost | Speed | Agents |
|------|----------|------|-------|--------|
| **Autopilot** | Default, balanced execution | $0.03 | Medium | 1 lead + 2 subagents |
| **Ecomode** | Cost-optimized, cheap models | $0.01 | Fast | 1 (cheapest) |
| **Ultrapilot** | Parallel execution, speed | $0.06 | Fast | 5 parallel |
| **Swarm** | Dynamic coordination, memory | $0.08 | Medium | 8 agents |
| **Pipeline** | Sequential processing chain | $0.04 | Slow | 4 steps |

## 🎯 Example: 4-Agent Workflow

The included `PlanExecRevEx.yaml` recipe demonstrates multi-agent coordination:

```yaml
workflow:
  - Planner (Claude 4): Break down task into steps
  - Executor (GPT-4o): Implement the changes
  - Reviewer (Gemini 2.5): Check for issues
  - Explainer (Grok 4.1): Explain what was done
```

This will be executable via:

```bash
goose run --recipe recipes/PlanExecRevEx.yaml "build a REST API"
```

## 🔮 Planned Usage Examples

### Execution Modes (Coming Soon)

```bash
# Default autopilot mode (lead agent + subagents)
goose run "build a todo app with auth"

# Ecomode (cost-optimized)
goose run "eco: refactor legacy code"

# Ultrapilot (5 parallel subagents)
goose run "ulw: implement payment integration"

# Swarm (8 dynamic agents with shared memory)
goose run "swarm: redesign authentication system"

# Pipeline (4-step sequential processing)
goose run "pipeline: create documentation"
```

### Specialized Agents

```bash
goose agent architect      # Design system architecture
goose agent researcher     # Conduct in-depth research
goose agent designer       # Create UI/UX designs
goose agent writer         # Write clear content
goose agent vision         # Analyze visual data
goose agent qa-tester      # Test for quality assurance
```

### Skills as MCP Tools

```bash
goose skill auth           # Implement authentication
goose skill database       # Handle database operations
goose skill testing        # Run tests
goose skill deployment     # Deploy application
goose skill refactoring    # Refactor code
goose skill security_scan  # Scan for security issues
```

## ⚙️ Configuration

Current `config.yaml` structure (✅ ready):

```yaml
routing:
  simple:
    - grok-4.1-fast
    - gemini-2.5-flash
    - gpt-4o-mini
  medium:
    - claude-4-sonnet
    - gpt-4o
    - gemini-2.5-pro
  complex:
    - claude-4.5-sonnet
    - gpt-4o
    - grok-4.1-full
  explain:
    - grok-4.1-fast

goose:
  api_keys:
    anthropic: "YOUR_ANTHROPIC_KEY"
    openai: "YOUR_OPENAI_KEY"
    google: "YOUR_GOOGLE_KEY"
    xai: "YOUR_XAI_KEY"
  mcp_defaults:
    temperature: 0.7
    max_tokens: 2000
```

## 📁 Architecture

```
oh-my-goose/
├── oh_my_goose/
│   ├── cli/
│   │   └── omg.py              # Click CLI entry point
│   ├── modes/
│   │   ├── autopilot.py        # Lead + 2 subagents
│   │   ├── ecomode.py          # Cost-optimized mode
│   │   ├── ultrapilot.py       # 5 parallel subagents
│   │   ├── swarm.py            # 8 dynamic agents
│   │   └── pipeline.py         # 4-step sequential chain
│   ├── agents/
│   │   └── *.yaml              # Specialized agent configs
│   ├── skills/
│   │   └── registry.py         # Skill registration & execution
│   ├── utils/
│   │   ├── caching.py          # Disk-based result caching
│   │   ├── cost_tracker.py     # Cost accumulation
│   │   └── persistence.py      # Ralph-style file watching
│   ├── orchestrator.py         # Core routing & delegation
│   ├── hud.py                  # Rich HUD status displays
│   └── __init__.py
├── agents/                     # YAML agent definitions
├── config.yaml                 # Model routing config
├── cache.json                  # Auto-generated result cache
├── pyproject.toml              # Poetry configuration
└── README.md
```

## 🛠️ Development (Coming Soon)

```bash
# Install dependencies
npm install

# Run in dev mode with watch
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## 💡 Design Philosophy

### Goose + MCP = Power

**oh-my-goose** leverages Goose's strengths while adding orchestration:

- **Goose handles**: AI execution, context management, tool calling
- **oh-my-goose provides**: Agent coordination, workflow patterns, skills library
- **MCP enables**: Seamless integration without modifying Goose core

### Key Benefits

- ✅ **No forking required** - Pure MCP integration
- ✅ **Goose updates automatically** - No version lock-in
- ✅ **Reusable skills** - Build once, use everywhere
- ✅ **Multi-provider** - Anthropic, OpenAI, Google, xAI support
- ✅ **Cost optimization** - Smart model routing per complexity

## 💰 Expected Performance (Planned)

### Cost Estimates (per query)

- **Autopilot**: ~$0.03 (balanced execution)
- **Ecomode**: ~$0.01 (35–55% savings)
- **Ultrapilot**: ~$0.06 (parallel execution)
- **Swarm**: ~$0.08 (dynamic coordination)
- **Pipeline**: ~$0.04 (sequential processing)

*Actual costs depend on task complexity and prompt caching effectiveness*

## 🎯 Example: 4-Agent Workflow

The included `PlanExecRevEx.yaml` recipe demonstrates multi-agent coordination:

```yaml
workflow:
  - Planner (Claude 4): Break down task into steps
  - Executor (GPT-4o): Implement the changes
  - Reviewer (Gemini 2.5): Check for issues
  - Explainer (Grok 4.1): Explain what was done
```

This will be executable via:

```bash
goose run --recipe recipes/PlanExecRevEx.yaml "build a REST API"
```

## 🗺️ Roadmap

- [x] Define agent configurations (YAML)
- [x] Design workflow templates
- [x] Create model routing config
- [ ] **Phase 1**: TypeScript MCP server foundation
- [ ] **Phase 2**: Core skills as MCP tools
- [ ] **Phase 3**: Execution modes (autopilot, swarm, etc.)
- [ ] **Phase 4**: Goose CLI integration
- [ ] **Phase 5**: Documentation & examples

## 🤝 Contributing

Contributions welcome! This project is in active development.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/AmazingFeature`
3. Make your changes and commit: `git commit -m 'Add AmazingFeature'`
4. Push to the branch: `git push origin feature/AmazingFeature`
5. Open a Pull Request

Please ensure:
- Code follows TypeScript/ESLint conventions
- Tests pass (`npm test`)
- Documentation is updated

## 📜 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Inspired by **[oh-my-claudecode](https://github.com/ldavidson45/oh-my-claudecode)**
- Built on **[Goose](https://github.com/block/goose)** by Block
- Powered by **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)**
- Thanks to the open-source AI community

## 📧 Support

For issues, questions, or feature requests:

- **GitHub Issues**: [Open an issue](https://github.com/yourusername/oh-my-goose/issues)
- **Discussions**: [Start a discussion](https://github.com/yourusername/oh-my-goose/discussions)

---

**oh-my-goose** — Orchestration made simple. 🦢