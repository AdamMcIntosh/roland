# Roland

> **Production-grade agent looping harness** — orchestrates specialist sub-agents through plan → act → verify → critique cycles, with clean PR conventions, GitHub integration, and a mobile-friendly command center.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Current status:** Closed-Loop Harness, EvaluationGate, loop memory, clean PR formatting, dashboard GitHub discovery, and mobile-responsive UI are production-ready.

---

## What Roland Is

Roland is a multi-agent platform for **reliable, iterative software missions**:

| Layer | Role |
|-------|------|
| **Closed-Loop Harness** | Structured iterations with evaluation gates, reflection, exit conditions, and checkpoint recovery ([guide](docs/guides/closed-loop-harness.md)) |
| **PM Team Engine** | Lead PM plans parallel waves, dispatches UNSC callsigns, synthesizes results |
| **Global CLI + MCP** | `roland team`, interactive chat, Cursor MCP tools |
| **Command Center** | Web dashboard — live progress, HITL, loop health, GitHub clone |

Inspired by [loops.elorm.xyz](https://loops.elorm.xyz) patterns: self-paced iterations, between-iteration checks, explicit exit conditions, and reflection memory.

```
  Operator ──► ClosedLoop / Lead PM ──► PLAN → ACT → VERIFY → CRITIQUE → REFLECT
                    │                         │
                    ▼                         ▼
           .roland/loops/<id>/          EvaluationGate · LoopMemory
           command-blackboard.md        clean PR on completion
```

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
roland team "add rate limiting to the password reset endpoint" \
  --loop-template closed-loop-harness
```

Other common templates:

```bash
roland team "ship user profile settings" --loop-template feature-implementation-loop
roland team "clean up recent slop in src/" --loop-template code-quality-loop
```

### 3. Command center (dashboard)

```bash
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

---

## Loop Templates

Templates live in `recipes/loops/`. Attach with `--loop-template <name>`.

| Template | When to use | Max iter | Key gates |
|----------|-------------|----------|-----------|
| **closed-loop-harness** | Production missions — full harness with reflection, exit conditions, PR formatting | 10 | lint, unit, typecheck |
| **feature-implementation-loop** | Ship a feature with integration + smoke | 8 | unit, integration, smoke |
| **code-quality-loop** | De-sloppify recent changes (loops.elorm.xyz pattern) | 4 | lint, unit, typecheck |
| **standard-code-loop** | Canonical plan → act → verify → critique | 5 | unit, lint, typecheck |
| **research-loop** | Investigation and synthesis | 3 | critic validation |
| **research-synthesis-loop** | Deeper research with synthesis critique | 3 | critic validation |
| **minimal-3-phase** | E2E reference (plan, act, verify only) | 1 | unit |

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
| `roland "goal"` | Shortcut for `roland team` |
| `roland team "goal"` | PM team with live TUI |
| `roland team "goal" --loop-template <id>` | Attach loop harness |
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
4. **HITL from phone** — pause, resume, inject directives from the dashboard Mission panel

Details: [docs/guides/mini-pc-deployment.md](docs/guides/mini-pc-deployment.md) (Tailscale section)

---

## `.roland/` State

| Path | Purpose |
|------|---------|
| `command-blackboard.md` | Human-readable battlespace |
| `blackboard.json` | Tasks, blockers, decisions |
| `memory.md` | Cross-run project knowledge |
| `run-state.json` | Live progress + loop phase |
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
| [docs/guides/pm-workflow.md](docs/guides/pm-workflow.md) | Manual PM mode in Cursor |
| [DAILY-USAGE.md](DAILY-USAGE.md) | Chat workflows, controls, troubleshooting |
| [INSTALLATION.md](INSTALLATION.md) | MCP setup for Cursor / VS Code |
| [CLAUDE.md](CLAUDE.md) | Developer conventions and smoke tests |

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
