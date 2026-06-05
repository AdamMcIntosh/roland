# Roland Evolution — UNSC Orchestration Step

This evolution strengthens Roland as a **Cursor SDK supervisor** with Halo-themed sub-agents, a military reasoning loop, and a structured Command Blackboard — while preserving the web UI request/response model and GitHub branch + PR automation.

## Deliverables

| Artifact | Location |
|----------|----------|
| Orchestrator persona | `agents/roland-orchestrator.yaml` |
| Sub-agent templates (YAML) | `agents/unsc/*.yaml` |
| SDK sub-agent definitions (MD) | `.cursor/agents/*.md` |
| Orchestrator prompt builder | `src/rco/orchestrator-prompts.ts` |
| Command Blackboard module | `src/rco/command-blackboard.ts` |
| SDK agent loader | `src/rco/unsc-agents.ts` |
| Reference orchestration script | `scripts/roland-orchestrate.mjs` |
| Architecture | [command-blackboard.md](./command-blackboard.md) |
| Sample workflow | [sample-workflow-rate-limiting.md](./sample-workflow-rate-limiting.md) |
| SDK patterns | [cursor-sdk-orchestration.md](./cursor-sdk-orchestration.md) |

## Suggested Folder Structure

```
roland/
├── agents/
│   ├── roland-orchestrator.yaml    ← Supervisor persona (evolves lead-pm)
│   ├── unsc/                       ← Halo callsign specialists
│   │   ├── sparrow.yaml
│   │   ├── vanguard.yaml
│   │   ├── oracle.yaml
│   │   ├── sentinel.yaml
│   │   ├── forge.yaml
│   │   └── specter.yaml
│   └── *.yaml                      ← Legacy roster (still used by roland team)
├── .cursor/
│   ├── agents/                     ← Cursor SDK file-based subagents
│   │   ├── roland.md
│   │   ├── sparrow.md
│   │   └── ...
│   └── rules/
│       └── roland.mdc              ← Interactive chat persona
├── .roland/
│   ├── command-blackboard.md       ← Human-readable UNSC battlespace (NEW)
│   ├── blackboard.json             ← Machine-readable tasks (existing)
│   ├── memory.md                   ← Cross-run learning (existing, complementary)
│   └── messages.json               ← Inter-agent bus (existing)
├── src/rco/
│   ├── orchestrator-prompts.ts     ← buildRolandOrchestratorPrompt()
│   ├── command-blackboard.ts       ← CommandBlackboard class
│   ├── unsc-agents.ts              ← YAML → SDK agents map
│   └── team-orchestrator.ts        ← Existing PM loop (integrate incrementally)
├── scripts/
│   └── roland-orchestrate.mjs      ← SDK orchestration reference
└── docs/evolution/                 ← This documentation set
```

## Integration Path (Incremental)

1. **Now** — Use new prompts and `.cursor/agents/` in Cursor chat; Roland delegates via SDK sub-agent tool.
2. **Next** — Wire `CommandBlackboard` into `runTeam()` planning/review prompts alongside `ProjectMemory`.
3. **Then** — Pass `toSdkAgentDefinitions(loadUnscAgents())` into `Agent.create()` in `team-orchestrator.ts`.
4. **Web UI** — No change required initially; `roland team` CLI path unchanged. Optional: surface `command-blackboard.md` in dashboard.

## Global CLI (`npm link` / `npm install -g`)

Roland ships a thin launcher at `bin/roland.js` that resolves install + project roots, then loads `dist/index.js`. After build, the `roland` command works from **any directory**.

### Development (linked install)

```bash
cd /path/to/roland
npm ci
npm run build
npm link          # symlinks bin/roland.js → global PATH

# From any project repo:
cd /path/to/myapp
roland doctor
roland board-status --concise
roland team "Test task"
roland orchestrate "SDK supervisor smoke test"
```

### Production (global install)

```bash
cd /path/to/roland
npm ci
npm run build
npm install -g .   # or: npm install -g /path/to/roland
```

Verify:

```bash
which roland       # e.g. ~/.npm-global/bin/roland → ../lib/node_modules/roland/bin/roland.js
roland --version
roland doctor
```

### Project root detection

When you run `roland` outside the Roland repo, the CLI sets `ROLAND_PROJECT_ROOT` automatically:

| Priority | Signal |
|----------|--------|
| 1 | `ROLAND_PROJECT_ROOT` or `ROLAND_ROOT` env var |
| 2 | Parent of `ROLAND_STATE_DIR` when it ends in `.roland` |
| 3 | Walk up from `cwd` for `.roland/` or `.git/` |
| 4 | `process.cwd()` |

Install root (agents, recipes, `dist/`) is always the npm package directory — resolved from `bin/roland.js` via `package.json` name `"roland"`, or `ROLAND_INSTALL_ROOT`.

### Bin entries

| Command | Entry | Purpose |
|---------|-------|---------|
| `roland` | `bin/roland.js` | Full CLI (`team`, `board-status`, `doctor`, …) |
| `roland-mcp` | `bin/roland-mcp.js` | Stdio MCP server (`dist/server/mcp-server.js`) |

`roland mcp-config --write` generates Cursor config pointing at the installed MCP entry with the correct absolute paths.

## Cursor MCP Integration

Roland is a first-class MCP server in Cursor. The dedicated stdio entry is `dist/server/mcp-server.js` (also `npm run mcp` or `roland-mcp` from a global install).

### Quick setup

```bash
# 1. Build + link or install globally
cd /path/to/roland && npm ci && npm run build && npm link

# 2. Generate or print ~/.cursor/mcp.json entry
roland mcp-config --write

# 3. Restart Cursor
```

### Recommended `~/.cursor/mcp.json`

When Roland is installed at `/path/to/roland` and your project lives at `/path/to/myapp`:

```json
{
  "mcpServers": {
    "roland": {
      "command": "node",
      "args": ["/path/to/roland/dist/server/mcp-server.js"],
      "env": {
        "ROLAND_PROJECT_ROOT": "/path/to/myapp",
        "ROLAND_QUIET": "1"
      },
      "autoApprove": [
        "health_check", "roland_hello", "board_status", "pm_standup", "triage",
        "list_team", "list_team_recipes", "list_recipes", "get_team_context",
        "get_pm_playbook", "get_team_usage", "get_pm_events", "get_analytics",
        "suggest_mode", "route_model", "blackboard_read", "bus_poll",
        "git_status", "git_diff", "git_log", "read_context"
      ]
    }
  }
}
```

Add `CURSOR_API_KEY` to `env` (or your shell profile) when using `roland_run_team`.

For global installs, `roland mcp-config --write` uses absolute paths to your linked/global package automatically.

### MCP tool surface (47 tools)

| Category | Tools |
|----------|-------|
| **Cursor chat** | `roland_hello`, `roland_run_team` |
| **PM / board** | `pm_standup`, `board_status`, `get_team_context`, `spawn_task`, `assign_task`, … |
| **Coordination** | `blackboard_post`, `blackboard_read`, `blackboard_patch`, `bus_send`, `bus_poll` |
| **Git (local)** | `git_status`, `git_diff`, `git_log`, `git_commit` |
| **Routing / cost** | `triage`, `route_model`, `track_cost`, `manage_budget`, `get_analytics` |
| **Recipes** | `list_recipes`, `start_recipe`, `advance_recipe`, `list_team_recipes`, `start_team_recipe` |

Read-only tools are listed in `autoApprove` above. Mutating tools always require user approval in Cursor.

### Production behavior

- **Stdio transport** — MCP JSON-RPC on stdin/stdout; logs go to stderr only
- **Graceful shutdown** — SIGINT/SIGTERM handlers close the server cleanly
- **Connect retry** — up to 5 attempts with exponential backoff on startup failure
- **Disconnect handling** — exits cleanly when Cursor closes stdio so Cursor can respawn the process

See also: [Mini PC Deployment](../guides/mini-pc-deployment.md#roland-as-a-cursor-mcp-server) for headless/mini-PC specifics.

## Callsign Map (Legacy → UNSC)

| Callsign | Role | Legacy agents |
|----------|------|---------------|
| Sparrow | Coder | executor |
| Vanguard | Tester | test-author, test-executor |
| Oracle | Researcher | researcher, explore, architect |
| Sentinel | Reviewer | code-reviewer, security-reviewer |
| Forge | DevOps | build-fixer, devops-agent |
| Specter | UI/UX | designer, ui-designer |
