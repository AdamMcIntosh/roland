# Roland + Goose vs Claude Code — Honest Comparison

## Feature-by-feature

| Capability | Roland + Goose | Claude Code | Winner |
|---|---|---|---|
| **File read/write** | Goose Developer extension | Native | Tie |
| **Shell execution** | Goose Developer extension | Native | Tie |
| **Git awareness** | 4 MCP tools (`git_status`, `git_diff`, `git_log`, `git_commit`) | Native | Tie |
| **Streaming output** | Real-time via `spawn` piping | Native | Tie |
| **Session memory** | `SessionContextManager` — structured decisions, patterns, files | Conversation history | Tie — different approach, same result |
| **Persistent project context** | `roland-context.json` + `MIGRATION.md` — auto-loaded on every session | `CLAUDE.md` — auto-loaded on every session | Tie |
| **Screenshot/vision** | `analyze_screenshot` via OpenRouter vision models | Native | Tie |
| **Permission gating** | Docker container isolation + `.roland-permissions.json` policy | Per-tool approval dialog | Tie — Docker is stronger than prompt-level |
| **Inline diff UI** | VS Code extension (`roland-diff`) with native `vscode.diff` — Apply/Discard buttons | Native accept/reject in editor | Tie |
| **Diff/preview** | `preview_changes` — unified diff + HTML preview + auto-writes pending changes for extension | Inline accept/reject in VS Code | Tie |
| **Complex code authoring** | Sonnet 4 subagent via smart routing | Sonnet 4 native | Tie |
| **Architecture/design** | Sonnet 4 subagent | Sonnet 4 native | Tie |
| **Model choice** | 100+ models via OpenRouter — right model for each task | Claude only | **Roland wins** |
| **Cost visibility** | Full tracking + hard daily/monthly caps + auto-degrade at 80% | Usage dashboard, no caps | **Roland wins** |
| **Budget enforcement** | Auto-fallback to free models at threshold | None | **Roland wins** |
| **Multi-agent recipes** | YAML-driven pipelines (Plan → Execute → Review → Explain, BugFix, SecurityAudit, VB6Migration) | Single-agent with sub-agent support | **Roland wins** |
| **Multi-provider routing** | Claude plans, Gemini reviews, DeepSeek executes | Single provider | **Roland wins** |
| **CI/headless runs** | Runs anywhere Goose runs — cron, GitHub Actions, SSH | IDE-bound | **Roland wins** |
| **Personas & specialization** | 44 agent personas with budget-optimized tiers | System prompts only | **Roland wins** |
| **Extensibility** | YAML agents/recipes, custom TS tools | Limited to Anthropic ecosystem | **Roland wins** |
| **Setup** | `npm install && npm run build && npm run init` + Goose + OpenRouter key | `claude` in terminal — done | Claude Code wins |

## The one remaining gap

### Setup complexity

Claude Code installs with a single command (`claude`) and works immediately. Roland requires:
1. Clone + build (`npm install && npm run build`)
2. Install Goose
3. Set OpenRouter API key
4. Run `npm run init` on your project

This is ~10 minutes vs ~30 seconds. Once set up, the experience is equivalent or better. For teams, `npm run init` is a one-time per-project step.

**Impact:** First-run friction only. Doesn't affect day-to-day capability or code quality.

---

## What changed (gaps closed)

### Inline diff UI — CLOSED

The `roland-diff` VS Code extension (`extension/`) uses VS Code's native `vscode.diff` API:
- `preview_changes` writes pending change manifests to `.omc/pending-changes/`
- Extension watches the directory and opens side-by-side diffs automatically
- Apply/Discard buttons in the editor title bar
- Status bar shows pending change count
- Bulk apply/discard all pending changes

### Permission gating — CLOSED

Docker container isolation (`Dockerfile` + `scripts/roland-docker.sh`):
- Goose runs inside a container with only the project directory mounted
- No access to host filesystem, home directory, or system commands outside the mount
- `.roland-permissions.json` provides additional policy enforcement inside the container
- `./scripts/roland-docker.sh /path/to/project session` — one command to run sandboxed

This is **stronger** than Claude Code's per-tool approval dialog — the container physically cannot access files outside the project.

---

## Where each tool shines

**Roland's strengths**: cost visibility and hard budget caps, multi-model routing (100+ models via OpenRouter), multi-agent recipe workflows, CI/headless execution, Docker sandboxing, YAML extensibility.

**Claude Code's strengths**: zero-friction setup, deeply integrated native tooling (file editing, git, streaming), sophisticated context management, consistent model quality (always Claude), mature ecosystem backed by Anthropic.

---

## The ideal enterprise workflow

You don't have to pick one. The best setup uses both:

```
Windsurf / Cursor (daily driver)      Roland + Goose (heavy lifting)
├── Small fixes                       ├── Multi-file features
├── Simple refactors                  ├── Architecture decisions
├── Quick bug fixes                   ├── Security audits
├── Code navigation                   ├── Recipe workflows
├── File exploration                  ├── Complex implementations
└── 70% of work, $0 extra            └── 30% of work, ~$50/mo
```

### Cost comparison

| Setup | Solo dev | Small team (3) |
|---|---|---|
| Windsurf + Roland + OpenRouter | ~$65-75/mo | ~$145-225/mo |
| Claude Code | $100/mo per seat | $300/mo |
| **Savings** | **~30%** | **~35-50%** |

Roland + Goose covers the core coding agent workflows at ~65% of the cost, with multi-agent recipes, model routing, and container sandboxing that Claude Code doesn't offer.

---

## Bottom line

Roland and Claude Code solve different problems well. Claude Code is the simpler, more polished single-agent experience with best-in-class native tooling. Roland adds multi-model routing, budget enforcement, multi-agent recipes, and CI/headless support that Claude Code doesn't have — at the cost of more setup and a younger, less battle-tested ecosystem.

**Use Windsurf as your hands, Roland as your brain.**
