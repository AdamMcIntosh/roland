# oh-my-goose - Getting Started

## Quick Overview

**oh-my-goose** is a TypeScript orchestration framework for Goose AI with MCP (Model Context Protocol) integration. Currently in Phase 1 of development.

## What's Ready ✅

- **Configuration**: `config.yaml` with model routing and API key setup
- **Agents**: 10 specialized agent YAML definitions in `agents/`
- **Recipes**: Multi-agent workflow template in `recipes/PlanExecRevEx.yaml`
- **TypeScript Project**: Full setup with dependencies installed
- **Implementation Plan**: See `PLAN.md` for comprehensive roadmap

## Project Structure

```
oh-my-goose/
├── PLAN.md                     # 📋 Full implementation plan
├── README.md                   # 📖 Project overview
├── config.yaml                 # ⚙️  Model routing & API keys
├── agents/                     # 🤖 10 specialized agent configs
│   ├── architect.yaml
│   ├── researcher.yaml
│   ├── designer.yaml
│   └── ... (7 more)
├── recipes/                    # 📝 Workflow templates
│   └── PlanExecRevEx.yaml
├── src/                        # 💻 TypeScript source (in progress)
│   ├── index.ts                # MCP server entry
│   ├── server/                 # MCP implementation
│   ├── agents/                 # Agent management
│   ├── skills/                 # Skills as MCP tools
│   ├── modes/                  # Execution modes
│   ├── orchestrator/           # Routing & cost tracking
│   └── utils/
│       └── logger.ts           # Logging utility
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
└── node_modules/               # 267 packages installed
```

## Current Status: Phase 1 🚧

**Foundation & MCP Server** - In Progress

### Completed:
- [x] TypeScript project initialization
- [x] Dependencies installed (MCP SDK, Zod, YAML, etc.)
- [x] Project structure created
- [x] Basic utilities started

### Next Steps:
- [ ] Complete core utilities (types, errors, config loader)
- [ ] Implement MCP server
- [ ] Test Goose connection
- [ ] Begin Phase 2: Agent system

## Development Commands

```bash
# Install dependencies (already done)
npm install

# Build TypeScript
npm run build

# Development with watch mode
npm run dev

# Lint code
npm run lint

# Format code
npm run format
```

## Configuration

Edit `config.yaml` to set your API keys:

```yaml
goose:
  api_keys:
    anthropic: "YOUR_ANTHROPIC_KEY"
    openai: "YOUR_OPENAI_KEY"
    google: "YOUR_GOOGLE_KEY"
    xai: "YOUR_XAI_KEY"
```

Or use environment variables:
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `XAI_API_KEY`

## Documentation

- **Full Plan**: See `PLAN.md` for 10-phase implementation roadmap
- **README**: See `README.md` for project overview and vision
- **Session Notes**: Implementation progress tracked in `.copilot/session-state/`

## Next Session

When continuing development:

1. Read `PLAN.md` for context
2. Check "Current Progress" section for status
3. Continue with Phase 1 tasks:
   - Implement `src/utils/types.ts`
   - Implement `src/utils/errors.ts`
   - Complete `src/config/config-loader.ts`
   - Build `src/server/mcp-server.ts`

## Questions?

Refer to:
- `PLAN.md` - Implementation details
- `README.md` - Project vision
- [Goose Documentation](https://block.github.io/goose/docs/)
- [MCP Documentation](https://modelcontextprotocol.io/)

---

**Status**: Phase 1 of 10 - Foundation in progress 🦢
