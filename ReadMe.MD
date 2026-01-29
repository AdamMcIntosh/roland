# oh-my-goose 🦆

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/typescript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-18+-blue.svg)](https://nodejs.org/)

A powerful, zero-learning-curve orchestration framework for **Goose** inspired by **oh-my-claudecode**. OMG provides intelligent AI workflow management with multiple execution modes, specialized agents, persistent caching, cost optimization, and beautiful real-time HUD status displays.

## ✨ Highlights

- **5 Execution Modes**: Autopilot, Ecomode, Ultrapilot, Swarm, Pipeline
- **10+ Specialized Agents**: Architect, Researcher, Designer, Writer, Vision, QA-Tester, and more
- **10+ Reusable Skills**: Auth, Database, Testing, Deployment, Security, Refactoring, and more
- **Magic Keywords**: Natural language triggers (`autopilot:`, `eco:`, `ulw:`, `swarm:`, `pipeline:`)
- **Rich HUD Display**: Real-time progress bars and cost tracking with beautiful formatting
- **Smart Model Routing**: Complexity-based model selection with caching and fallbacks
- **Persistent Caching**: Automatic disk-based result caching across sessions
- **Cost Optimization**: 30–55% savings with Ecomode through intelligent model selection
- **File Watching**: Ralph-style persistence loop for continuous processing

## 🚀 Quick Start

### Installation

```bash
# Clone the TypeScript repository
git clone https://github.com/yourusername/oh-my-goose-ts.git
cd oh-my-goose-ts

# Install dependencies with Yarn
yarn install

# One-time setup
yarn setup
```

### First Run

```bash
# Build TypeScript
yarn build

# Default autopilot mode (lead agent + subagents)
yarn start run "build a todo app with auth"

# Ecomode (cost-optimized)
yarn start run "eco: refactor legacy code"

# Ultrapilot (5 parallel subagents)
yarn start run "ulw: implement payment integration"

# Swarm (8 dynamic agents with shared memory)
yarn start run "swarm: redesign authentication system"

# Pipeline (4-step sequential processing)
yarn start run "pipeline: create documentation"

# Execute a specific skill
yarn start skill testing

# Load agent configuration
yarn start agent architect
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

### Modes by Keyword

```bash
# Default (autopilot if no keyword)
omg run "your query here"

# Ecomode: Cheapest models, aggressive caching
yarn start run "eco: your query"

# Ultrapilot: 5 subagents in parallel
yarn start run "ulw: your query"

# Swarm: 8 agents with shared memory
yarn start run "swarm: your query"

# Pipeline: Plan → Execute → Review → Explain
yarn start run "pipeline: your query"

# Verbose output (all modes)
yarn start run "your query" -v
```

### Agents

Load any of 10 pre-configured specialized agents:

```bash
omg agent architect      # Design system architecture
omg agent researcher     # Conduct in-depth research
omg agent designer       # Create UI/UX designs
omg agent writer         # Write clear content
omg agent vision         # Analyze visual data
omg agent critic         # Provide constructive feedback
omg agent analyst        # Analyze data and trends
omg agent executor       # Execute tasks efficiently
omg agent planner        # Plan projects and strategies
omg agent qa-tester      # Test for quality assurance
```

### Skills

Execute reusable skills on demand:

```bash
omg skill auth           # Implement authentication
omg skill database       # Handle database operations
omg skill testing        # Run tests
omg skill deployment     # Deploy application
omg skill refactoring    # Refactor code
omg skill migration      # Migrate data
omg skill security_scan  # Scan for security issues
omg skill git_flow       # Manage git workflow
omg skill documentation  # Generate documentation
omg skill visual_review  # Review visuals
```

## ⚙️ Configuration

Edit `config.yaml` to customize model routing:

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

## 🛠️ Development

```bash
# Install development dependencies
poetry install

# Run tests
poetry run pytest

# Format code with Black
poetry run black .

# Check linting
poetry run flake8 .
```

## 📊 Performance & Costs

### Cost Comparison (per query)

- **Autopilot**: $0.03 (balanced)
- **Ecomode**: $0.01 (35–55% savings)
- **Ultrapilot**: $0.06 (parallel execution)
- **Swarm**: $0.08 (dynamic coordination)
- **Pipeline**: $0.04 (sequential steps)

### Caching Impact

- **First run**: Full cost (cold cache)
- **Cached hits**: $0.00 (instant results)
- **Typical savings**: 30–50% with Ecomode + caching

## 🔑 Key Concepts

### Magic Keywords

Natural language triggers for mode selection:

```bash
omg run "autopilot: query"   # Explicit mode
omg run "eco: query"         # Cost-optimized
omg run "ulw: query"         # Parallel execution
omg run "swarm: query"       # Dynamic coordination
omg run "pipeline: query"    # Sequential chain
omg run "ralph: path"        # File watching
omg run "query"              # Default (autopilot)
```

### Complexity Classification

Queries are auto-classified based on length:

- **Simple** (<50 chars): Cheapest model
- **Medium** (<200 chars): Balanced model
- **Complex** (≥200 chars): Strongest model

### Result Caching

All results are automatically cached in `cache.json`:

- Subsequent identical queries return instant results
- Cache persists across CLI sessions
- Zero cost for cache hits

### HUD (Heads-Up Display)

Real-time status with Rich formatting:

```
╭────────────────────────────╮
│ AUTOPILOT                  │
│ Status: Completed          │
│ Progress: 100.0%           │
│ Cost: $0.03                │
╰────────────────────────────╯
```

## 🤝 Contributing

We welcome contributions! To get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/AmazingFeature`
3. Make your changes and commit: `git commit -m 'Add AmazingFeature'`
4. Push to the branch: `git push origin feature/AmazingFeature`
5. Open a Pull Request

Please ensure:
- Code follows PEP 8 style (Black formatting)
- Tests pass (`poetry run pytest`)
- Documentation is updated

## 📜 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Inspired by **[oh-my-claudecode](https://github.com/ldavidson45/oh-my-claudecode)**
- Built with ❤️ using [Goose](https://github.com/block/goose), [Click](https://click.palletsprojects.com/), [Rich](https://rich.readthedocs.io/), [Pydantic](https://docs.pydantic.dev/), and [Watchdog](https://watchdog.readthedocs.io/)
- Thanks to the open-source community

## 📧 Support

For issues, questions, or feature requests:

- **GitHub Issues**: [Open an issue](https://github.com/yourusername/oh-my-goose/issues)
- **Discussions**: [Start a discussion](https://github.com/yourusername/oh-my-goose/discussions)
- **Documentation**: See [docs/](docs/) for detailed guides

---

**oh-my-goose** — Orchestration made simple. 🚀