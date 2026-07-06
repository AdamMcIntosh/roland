# Roland

> **Production-grade agent looping harness** — orchestrates specialist sub-agents through plan → act → verify → critique cycles, with clean PR conventions, GitHub integration, and a mobile-friendly command center.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Current status (v1.4.0):** Closed-Loop Harness, EvaluationGate, loop memory, locked coordination blackboard, modular MCP tools, mission audit with phase timing, and clean PR formatting are production-ready. Critique phase is **rule-based (no LLM)**. `PhaseIntentPoster` records phase intents on the blackboard — it does not spawn sub-agents on the ClosedLoop hot path.

---

## Current Architecture

```mermaid
flowchart TB
  subgraph cursor["Cursor IDE"]
    R["@roland MCP"]
    T["triage → Direct | Team"]
  end

  subgraph cli["Roland CLI"]
    M["roland mission / team"]
    A["roland mission-audit"]
    D["roland doctor · status · board-status"]
  end

  subgraph loop["ClosedLoop Harness"]
    P["Plan → Act → Verify → Critique"]
    G["EvaluationGate"]
    O["LoopObservability · phase timing"]
  end

  subgraph state[".roland/ state"]
    BB["blackboard.json"]
    CB["command-blackboard.md"]
    LM["loop-metrics.json"]
  end

  R --> T
  T -->|small fix| R
  T -->|mission| M
  M --> P
  P --> G
  P --> O
  O --> LM
  P --> BB
  M --> CB
  A --> LM
  D --> state
```

**Doc map:** [README.md](README.md) (entry) · [ONBOARDING.md](ONBOARDING.md) (setup) · [docs/guides/closed-loop-harness.md](docs/guides/closed-loop-harness.md) (deep dive) · [docs/guides/model-routing-and-cost.md](docs/guides/model-routing-and-cost.md) (cost & routing)

## What Roland Is

Roland is a multi-agent platform for **reliable, iterative software missions**:

| Layer | Role |
|-------|------|
| **@roland (Cursor)** | PM, triage, direct edits — self-contained via MCP (no Hermes required) |
| **Roland Closed-Loop Harness** | Loop execution engine — PACVRE iterations, gates, reflection ([guide](docs/guides/closed-loop-harness.md)) |
| **Global CLI + MCP** | `roland mission`, `roland team`, `roland mission-audit`, Cursor MCP tools |
| **Monitoring Dashboard** | Read-only monitor at `:8081` — loop/HITL panels (launch via CLI) |

> **Hermes** (`roland chat` CLI) is optional for terminal-only workflows — **not required in Cursor**.

Inspired by [loops.elorm.xyz](https://loops.elorm.xyz) patterns: self-paced iterations, between-iteration checks, explicit exit conditions, and reflection memory.

```
  Operator ──► @roland in Cursor (PM + triage) ──► roland team + loop template ──► Roland ClosedLoop (PACVRE)
                    │                                        │
                    ▼                                        ▼
           Roland Dashboard (read-only monitor)              EvaluationGate · LoopMemory
```

> **roland-web** (`roland-web/`) is **experimental** — a separate hosted UI prototype; not required for daily Roland use. See `roland-web/README.md`.

> [DEPRECATED] In-loop PM Team (`use_pm_team: true`) is legacy opt-in only. CLI aliases `run`, `goal`, `start`, `orchestrate` soft-deprecated — use `roland team` or `roland mission`.

---

## Quick Start

**Prerequisites:** Node.js 22+, [`CURSOR_API_KEY`](https://cursor.com/settings), a git project directory.

### 1. Install

```bash
git clone https://github.com/AdamMcIntosh/roland.git
cd roland
npm ci && npm run build && npm link

export CURSOR_API_KEY=your_key_here    # add to ~/.bashrc or ~/.zshrc

cd /path/to/your/project
roland doctor
roland board-status --concise
```

### 2. Your first closed-loop mission

```bash
roland mission "add rate limiting to the password reset endpoint" \
  --loop-template full-cycle-verified-loop
```

Other common templates:

```bash
roland mission "ship user profile settings" --loop-template feature-implementation-loop
roland mission "clean up recent slop in src/" --loop-template refactor-and-modernize-loop
roland mission "add MCP tool for triage" --loop-template mcp-extension-loop
roland mission "Fix small typo in README" --loop-template small-fix-loop
```

### 3. Command center (dashboard — monitor & control)

Use **@roland in Cursor** or `roland team` to launch loops. The dashboard watches and controls active runs.

```bash
# In Cursor: @roland, or terminal:
roland team "goal" --loop-template full-cycle-verified-loop

# Monitor:
npm run serve-dashboard
# → http://127.0.0.1:8081
```

For phone access over Tailscale:

```bash
node scripts/serve-dashboard.js --host 0.0.0.0 --port 8081
# Open http://<tailscale-ip>:8081 on iPhone Safari
```

Connect GitHub in the dashboard → browse repos → **one-click clone** into your projects directory.

### 4. Roland inside Cursor (MCP)

```bash
roland mcp-config --write    # merges into ~/.cursor/mcp.json
```

Restart Cursor. Roland triages new work automatically:

| In chat | What happens |
|---------|----------------|
| Small fix or question | **Direct** — handled in chat |
| Multi-file feature | **Team** — offers `roland team "…"` |
| `Improve auth --force-team` | **Force team** — launches immediately |

Key MCP tools: `triage` · `roland_run_team` · `pm_standup` · `board_status`

### 5. General MCP (Hermes & external clients)

Roland also exposes a **Streamable HTTP** MCP endpoint for tools like Hermes, in addition to the Cursor stdio integration:

```bash
# With dashboard (default — MCP enabled on port 8081):
npm run serve-dashboard

# Standalone HTTP MCP only (localhost default):
roland mcp --port 8081

# LAN / Tailscale (requires ROLAND_MCP_TOKEN):
export ROLAND_MCP_TOKEN="your-secret-token"
roland mcp --host 0.0.0.0 --port 8081

# Discovery + health:
curl http://127.0.0.1:8081/mcp
curl http://127.0.0.1:8081/mcp/health

# Hermes (local):
hermes mcp add roland --url http://127.0.0.1:8081/mcp

# Print HTTP client config (Cursor stdio unchanged):
roland mcp-config --general
```

Cursor users should keep `roland mcp-config --write` (stdio). Hermes and other HTTP MCP clients use the URL above.

---

## Loop Templates

Templates live in `recipes/loops/`. Attach with `--loop-template <name>`. Verification commands and between-iteration checks are configured in `config.yaml` (`loop_engine.verification`, `loop_engine.between_iterations`).

| Template | When to use | Max iter | Key gates |
|----------|-------------|----------|-----------|
| **standard-code-loop** | Default canonical loop | 5 | unit, lint, typecheck |
| **small-fix-loop** | Hotfixes, typos, minor changes | 3 | lint, typecheck, smoke |
| **full-cycle-verified-loop** | Production missions — reflection, exit conditions, PR | 10 | lint, unit, typecheck |
| **feature-implementation-loop** | Ship a feature with integration + smoke | 8 | unit, integration, smoke |
| **refactor-and-modernize-loop** | Refactor without behavior change | 4 | lint, unit, typecheck |
| **research-and-plan-loop** | Research → plan/spec (parameterized) | 3 | critic validation |
| **maintenance-loop** | Dependency / hygiene updates | 3 | lint, typecheck |

Deprecated aliases still resolve via `TEMPLATE_ALIASES`: `closed-loop-harness`, `code-quality-loop`, `research-loop`, `research-and-spec-loop`, `research-synthesis-loop`, `mcp-extension-loop`, `minimal-3-phase` (E2E harness only).

Full guide: [docs/guides/closed-loop-harness.md](docs/guides/closed-loop-harness.md)

---

## Clean PR Conventions

Roland autogenerates conventional PR titles and structured bodies — no more `Task task-1: [Mission: …]` noise.

**Title format:** `type(scope): short imperative description`

```
feat(api): add rate limiting to password reset endpoint
fix(dashboard): restore mobile layout on iphone
refactor(loop): simplify critique escalation logic
```

Retroactively clean legacy open PRs:

```bash
roland pr-cleanup              # preview (dry-run)
roland pr-cleanup --apply      # rename via gh CLI
roland pr-cleanup --body --apply   # also migrate legacy bodies
```

Full guide: [docs/guides/pr-title-convention.md](docs/guides/pr-title-convention.md)

---

## Callsign Roster

| Callsign | Role | Maps from |
|----------|------|-----------|
| **Sparrow** | Implementation, wiring | `executor*` |
| **Vanguard** | Tests (author → execute) | `test-author`, `test-executor` |
| **Oracle** | Research, architecture | `researcher`, `explore`, `architect` |
| **Sentinel** | Code & security review | `code-reviewer`, `security-reviewer` |
| **Forge** | DevOps, CI, builds | `build-fixer` |
| **Specter** | UI/UX, accessibility | `designer*` |

---

## Direct vs Team

| **Direct** — stay in chat | **Team** — spawn `roland team` |
|---------------------------|--------------------------------|
| Comment, typo, rename, one-liner | Multi-step feature or refactor |
| Questions, debugging, research | Multiple files / services |
| Planning only (< ~30 min) | Tests, waves, synthesis (> ~30–45 min) |

**Force full team** (no confirmation in Cursor): `--force-team`, `force team`, `full team`, `run as team`, `spawn team`

---

## CLI Reference

### Missions

| Command | Purpose |
|---------|---------|
| `roland mission "goal"` | Pure ClosedLoop mission (alias: `roland team`) |
| `roland mission "goal" --loop-template <id>` | Attach loop harness |
| `roland team "goal" --stream` | Agent output preview per task |
| `roland team "goal" --background` | Detached run |
| `roland team "goal" --simple-tui` | ASCII-only (SSH / Termius / iPhone) |
| `roland orchestrate "goal"` | SDK supervisor mode |
| `roland chat` | Interactive session |

### PR & GitHub

| Command | Purpose |
|---------|---------|
| `roland pr-cleanup [--apply]` | Migrate legacy PR titles/bodies |
| `roland pr-cleanup --current --apply` | Current branch PR only |
| `roland pr 42 --fix` | Review + fix via `gh` CLI |

Team runs use `roland/<slug>` branches; clean PR titles on completion.

### Battlespace & HITL

| Command | Purpose |
|---------|---------|
| `roland board-status --concise` | One-screen mission digest |
| `roland board-cleanup` | Archive stale tasks |
| `roland pause` / `roland resume` | Pause / resume between waves |
| `roland inject "…"` | Directive to Lead PM |
| `roland unblock task-3 "…"` | Unblock a stalled agent |

Also available on the web dashboard and via `/pause`, `/resume` in chat.

### Background

```bash
roland team "goal" --background && roland bg-status && roland bg-logs --follow
```

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CURSOR_API_KEY` | *(required)* | Agent execution |
| `ROLAND_STATE_DIR` | `.roland` | Persistence directory |
| `ROLAND_MAX_CONCURRENT` | `2` | Parallel agents per wave |
| `ROLAND_SIMPLE_TUI` | `0` | ASCII-only output |
| `ROLAND_LOOP_TEST_MODE` | unset | Relaxed loop limits for E2E |

---

## Mobile Usage (iPhone + Tailscale)

Roland is designed for comfortable operation from a phone:

1. **Tailscale** — install on your home server and iPhone; bind dashboard with `--host 0.0.0.0`
2. **Safari** — open `http://<tailscale-ip>:8081`; dashboard is mobile-first with touch-friendly controls
3. **Simple TUI** — `roland team "goal" --simple-tui` for ASCII-only SSH sessions (Termius, Blink)
4. **HITL from phone** — pause, resume, inject directives from the dashboard Live Run Control panel

Details: [docs/guides/mini-pc-deployment.md](docs/guides/mini-pc-deployment.md) (Tailscale section)

---

## `.roland/` State

| Path | Purpose |
|------|---------|
| `command-blackboard.md` | Human-readable battlespace |
| `blackboard.json` | Tasks, blockers, decisions |
| `memory.md` | Cross-run project knowledge |
| `run-state.json` | Live progress + loop phase |
| `loop-metrics.json` | Phase timing and success rates |
| `loops/<loop-id>/` | Loop memory, reflections, checkpoints |
| `loops/<loop-id>/closed-loop-pr.json` | Formatted PR draft on completion |
| `usage-history.json` | Token/cost estimates |

---

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/vision.md](docs/vision.md) | Product vision and architecture |
| [docs/guides/closed-loop-harness.md](docs/guides/closed-loop-harness.md) | Loop harness, gates, exit conditions, memory |
| [docs/guides/pr-title-convention.md](docs/guides/pr-title-convention.md) | Clean PR titles, bodies, cleanup |
| [docs/evolution/README.md](docs/evolution/README.md) | UNSC architecture and capabilities |
| [docs/guides/mini-pc-deployment.md](docs/guides/mini-pc-deployment.md) | Headless, Tailscale, systemd |
| [docs/guides/model-routing-and-cost.md](docs/guides/model-routing-and-cost.md) | Model routing, cost targets, telemetry |
| [docs/guides/pm-workflow.md](docs/guides/pm-workflow.md) | Manual PM mode in Cursor |
| [DAILY-USAGE.md](DAILY-USAGE.md) | Chat workflows, controls, troubleshooting |
| [INSTALLATION.md](INSTALLATION.md) | MCP setup for Cursor / VS Code |
| [DEVELOPER.md](DEVELOPER.md) | Developer conventions and smoke tests |

---

## Development

```bash
npm run build && npm run test:run
node scripts/test-routing.mjs           # 8/8
node scripts/test-signals.mjs           # 8/8
node scripts/test-mcp-tools.mjs         # 8/8
node scripts/test-retry-resilience.mjs  # 70/70
```

After changes to `src/` or agent YAML: `npm run build`.

---

## License

MIT © Adam McIntosh
