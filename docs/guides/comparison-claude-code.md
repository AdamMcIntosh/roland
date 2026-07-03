# Roland vs Claude Code — Honest Comparison

## Feature-by-feature

| Capability | Roland (Cursor + MCP) | Claude Code | Winner |
|---|---|---|---|
| **File read/write** | Cursor agent native tools | Native | Tie |
| **Shell execution** | Cursor agent native tools | Native | Tie |
| **Git awareness** | 4 MCP tools (`git_status`, `git_diff`, `git_log`, `git_commit`) | Native | Tie |
| **Session memory** | `SessionContextManager` — structured decisions, patterns, files | Conversation history | Tie — different approach, same result |
| **Persistent project context** | `roland-context.json` + `MIGRATION.md` — auto-loaded on every session | Claude Code context file — auto-loaded on every session | Tie |
| **Screenshot/vision** | `analyze_screenshot` via OpenRouter vision models | Native | Tie |
| **Inline diff UI** | VS Code extension (`roland-diff`) with native `vscode.diff` — Apply/Discard buttons | Native accept/reject in editor | Tie |
| **Diff/preview** | `preview_changes` — unified diff + HTML preview + auto-writes pending changes for extension | Inline accept/reject in VS Code | Tie |
| **Multi-agent team missions** | Pure ClosedLoop — Sparrow, Vanguard, Oracle, Sentinel with verification gates | Single-agent with sub-agent support | **Roland wins** |
| **Model choice** | 100+ models via OpenRouter — right model for each task | Claude only | **Roland wins** |
| **Cost visibility** | Full tracking + hard daily/monthly caps + auto-degrade at 80% | Usage dashboard, no caps | **Roland wins** |
| **Budget enforcement** | Auto-fallback to free models at threshold | None | **Roland wins** |
| **Multi-agent recipes** | YAML-driven pipelines (Plan → Execute → Review → Explain, BugFix, SecurityAudit) | Single-agent with sub-agent support | **Roland wins** |
| **Multi-provider routing** | Claude plans, Gemini reviews, DeepSeek executes | Single provider | **Roland wins** |
| **CI/headless runs** | `roland team` CLI — cron, GitHub Actions, SSH | IDE-bound | **Roland wins** |
| **Personas & specialization** | 44 agent personas with budget-optimized tiers | System prompts only | **Roland wins** |
| **Extensibility** | YAML agents/recipes, custom TS tools | Limited to Anthropic ecosystem | **Roland wins** |
| **Setup** | `npm install && npm run build && npm run init` + Cursor MCP config | `claude` in terminal — done | Claude Code wins |

## The one remaining gap

### Setup complexity

Claude Code installs with a single command (`claude`) and works immediately. Roland requires:
1. Clone + build (`npm install && npm run build`)
2. Configure Cursor or VS Code MCP
3. Run `npm run init` on your project

This is ~10 minutes vs ~30 seconds. Once set up, the experience is equivalent or better for multi-step work via ClosedLoop team missions.

---

## Where each tool shines

**Roland's strengths**: cost visibility and hard budget caps, multi-model routing (100+ models via OpenRouter), multi-agent recipe workflows and Pure ClosedLoop team missions, CI/headless execution via CLI, YAML extensibility.

**Claude Code's strengths**: zero-friction setup, deeply integrated native tooling (file editing, git, streaming), sophisticated context management, consistent model quality (always Claude), mature ecosystem backed by Anthropic.

---

## The ideal enterprise workflow

You don't have to pick one. The best setup uses both:

```
Cursor / Windsurf (daily driver)      Roland team missions (heavy lifting)
├── Small fixes                       ├── Multi-file features
├── Simple refactors                  ├── Architecture decisions
├── Quick bug fixes                   ├── Security audits
├── Code navigation                   ├── Recipe workflows
├── File exploration                  ├── Complex implementations
└── 70% of work, $0 extra            └── 30% of work, ~$50/mo
```

---

## Bottom line

Roland and Claude Code solve different problems well. Claude Code is the simpler, more polished single-agent experience with best-in-class native tooling. Roland adds multi-model routing, budget enforcement, multi-agent recipes, and ClosedLoop team orchestration that Claude Code doesn't have — at the cost of more setup and a younger ecosystem.

**Use Cursor as your hands, Roland as your mission supervisor.**
