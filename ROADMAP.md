# Roland Roadmap — Gap Tracking vs Claude Code

> Last updated: 2026-03-23
> Current estimate: Roland + Goose covers ~75% of Claude Code for coding agent use cases.
> For terminal/CI workflows (e.g. VB6 migration): ~90% coverage.

---

## Remaining Gaps

### 1. Inline diff UI (accept/reject in editor)
**What Claude Code does:** Shows diffs inline in VS Code with Accept / Reject / Accept All buttons.
**Our state:** `preview_changes` generates correct unified diffs and HTML previews but there is no IDE widget to surface them as actionable UI.
**Fix requires:** A VS Code or Cursor extension. Not fixable at the CLI/MCP layer alone.
**Priority:** Low for terminal use cases. High if targeting IDE users.

---

### 2. Open file / editor awareness
**What Claude Code does:** Knows which files are open, which tab is active, and the user's cursor position.
**Our state:** Goose only knows the filesystem. Roland has no IDE state awareness.
**Fix requires:** VS Code extension that exposes active editor context as an MCP tool, or Cursor's built-in context passing.
**Priority:** Medium — affects how naturally the agent picks up on what the user is looking at.

---

### 3. Permission gating is coarser
**What Claude Code does:** Granular allow-lists per tool, per-session approval prompts for destructive operations.
**Our state:** `GOOSE_MODE=auto` suppresses all confirmations. No Roland-level control to allow `shell` but block `rm -rf`.
**Fix requires:** Roland middleware that intercepts Goose tool calls and applies a configurable allow/deny policy before execution.
**Priority:** Medium for solo use. High for team/CI environments.

---

### 4. Sub-agent spawning is process-level, not native
**What Claude Code does:** `Agent` tool spawns sub-agents in the same process with shared context and token budgets.
**Our state:** `run_goose_task` spawns a new `goose` process — no shared in-memory context, each sub-session re-reads from disk.
**Fix requires:** Either a long-running Goose session manager or a shared state protocol between sub-sessions via `roland-context.json`.
**Priority:** Low — disk-based context via `roland-context.json` is a reasonable substitute for most tasks.

---

### 5. No streaming output
**What Claude Code does:** Streams tokens to the IDE in real time.
**Our state:** `spawnGooseSession` uses `spawnSync` — blocks until the session finishes. No output visible during a 5-minute run.
**Fix requires:** Switch `spawnSync` → `spawn` with stdout piped and streamed line-by-line to the caller.
**Priority:** High — bad UX for any task longer than ~30 seconds.
**Effort:** Low — 1–2 hours, contained change in `src/utils/goose-runner.ts`.

---

### 6. No git-native integration
**What Claude Code does:** Understands the git graph natively — staged files, blame, commit history.
**Our state:** Goose can run `git` via `shell`, but Roland has no MCP tools that reason about git state.
**Fix requires:** New Roland MCP tools: `git_status`, `git_diff`, `git_log`, `git_commit`. Thin wrappers around `child_process` + git CLI.
**Priority:** Medium — Goose's `shell` tool can compensate but with less structure.
**Effort:** Medium — 2–3 hours for a solid `git_tools` module.

---

### 7. Session continuity across invocations
**What Claude Code does:** Retains full conversation history in the IDE sidebar across sessions.
**Our state:** Each `goose run --no-session` starts fresh. Prior knowledge only survives if explicitly written to `roland-context.json` or the filesystem.
**Fix requires:** Named Goose sessions (`goose run --session <name>`) combined with Roland appending key decisions to `roland-context.json` at session end.
**Priority:** Medium — `roland-context.json` already covers the most important continuity (rules, decisions, patterns). Raw conversation history is less critical.

---

## What Roland + Goose Does Better Than Claude Code

| Capability | Roland + Goose | Claude Code |
|---|---|---|
| Model selection | Any OpenRouter model, per-step routing | Claude only |
| Cost visibility | Full per-model tracking, hard budget limits | None |
| Multi-provider recipes | Claude plans, Gemini reviews, cheaper models execute | Single provider |
| Structured domain knowledge | `roland-context.json` — typed rules, versioned, appendable | Freeform `CLAUDE.md` |
| Portability | Runs anywhere Goose runs: CI, cron, headless servers | IDE-bound |
| Budget enforcement | Daily/monthly caps, per-query limits | None |

---

## Quick Wins (ranked by impact/effort)

| # | Gap | Effort | Impact |
|---|---|---|---|
| 1 | Streaming output (`spawn` instead of `spawnSync`) | Low (~2h) | High |
| 2 | Git-native MCP tools (`git_status`, `git_diff`, `git_commit`) | Medium (~3h) | Medium |
| 3 | Permission gating middleware | Medium (~4h) | Medium |
| 4 | Named session continuity via `--session` | Low (~1h) | Medium |
| 5 | Inline diff UI | High (VS Code extension) | Low for CLI users |
