# RCO Phase 2 Summary — Claude Code Integration and Plugin Development

**Branch:** `rco-phase-2`  
**Date:** March 2025  
**Status:** Complete

---

## Milestones Achieved

### 1. Plugin packaging
- **`src/plugin.ts`** — Wraps the orchestrator with Claude slash commands:
  - `/rco-run:recipe PlanExecRevEx --task "..."` — runs recipe and optionally exports to Cursor
  - `/rco-status` — returns status message
  - `/rco-export` — documents export behavior
- **`plugin/manifest.json`** — Defines commands and permissions for Claude plugin format
- **`npm run build-plugin`** — esbuild bundles `src/plugin.ts` and dependencies into `dist-plugin/plugin.js`
- **README** — Documented plugin build and “install via Claude marketplace simulation” (zip manifest + bundle, sideload or marketplace)

### 2. Interface hooks (Claude tool-calling)
- **`src/rco/prompts.ts`** — `buildClaudeToolCallingPrompt()` generates prompts: *"As [agent-name], execute step: [input]. Tools: [yaml-tools]. Respond in JSON: {output: '...'}."*
- **`src/rco/agentWorker.ts`** — Refactored to use:
  - Claude tool-calling prompts instead of ad-hoc text
  - `parseClaudeResponseText()` from `src/schemas.ts` to parse JSON (or fallback to full text)
  - `WorkerOutputSchema` validation before sending result
- **`src/rco/orchestrator.ts`** — Validates worker output with `WorkerOutputSchema` when receiving IPC result
- **Puppeteer** — Dev automation unchanged: mock HTML page returns JSON; production uses manual Claude interface

### 3. Session persistence
- **`src/persistence.ts`** — State management:
  - **Notepad skill:** `buildNotepadStorePrompt()` / `buildNotepadRetrievePrompt()` for Claude (“Store state: [JSON]” / “Retrieve…”); `parseNotepadResponse()` to parse retrieved JSON
  - **Local fallback:** `saveStateToLocal()`, `loadStateFromLocal()`, `listLocalSessionIds()` using `.rco-sessions/` (configurable)
- All persisted state validated with `PersistedStateSchema` (Zod)

### 4. Hybrid IDE sync
- **`src/rco/exportCursor.ts`** — Enhanced with:
  - **Dynamic rules:** `deriveTriageFromOutputs()` — analyzes session outputs and adds hints (e.g. “Consider BugFix”, “Consider SecurityAudit”)
  - `exportCursor(..., dynamicRules: true)` (default) writes a “Dynamic hints” section into the generated `.cursor` rule
- **VS Code extension skeleton:** `extensions/vscode/`:
  - `package.json` — commands `rco.importSession`, `rco.importSessionFromClipboard`
  - `src/extension.ts` — Import RCO session from file or clipboard JSON; writes `.cursor/rules/rco-<sessionId>.mdc`

### 5. Monitoring upgrade (Tauri + Chart.js)
- **`src/rco/dashboard.ts`** — New payload type `graph` and **`broadcastGraph(nodes, edges)`** for dependency tree data
- **Orchestrator** — New optional **`onGraph`** callback; when provided (e.g. from CLI with `--dashboard`), broadcasts workflow nodes/edges at run start
- **CLI** — With `--dashboard`, passes `onGraph` so the WebSocket sends graph payloads
- **`dashboard-ui/index.html`** — Static UI: connects to WebSocket (port 8080), uses **Chart.js** (bar chart of agent steps from graph), log area for `log` payloads
- **Tauri app:** `src-tauri/` (Cargo.toml, tauri.conf.json, build.rs, src/main.rs, src/lib.rs, capabilities/default.json)
  - **`npm run tauri:dev`** — Starts `serve-dashboard` (port 8081) and opens Tauri window loading dashboard UI
  - **`npm run serve-dashboard`** — Serves `dashboard-ui/` on 8081
- **Dependencies:** `chart.js`, `@tauri-apps/cli` (dev), `esbuild` (dev)

### 6. Security audit (Zod)
- **`src/schemas.ts`** — Central Zod schemas:
  - `ClaudePromptPayloadSchema`, `ClaudeResponseOutputSchema` — prompts and parsed agent output
  - `PersistedStateSchema` — persisted session state
  - `NotepadStorePayloadSchema`, `NotepadRetrievePayloadSchema` — notepad payloads
  - `PluginRunRecipeArgsSchema` — plugin slash-command args
  - **`parseClaudeResponseText(raw)`** — extracts JSON `{ output, success?, dotGraph? }` or falls back to full text
- **Orchestrator** — Validates worker IPC result with `WorkerOutputSchema`
- **Agent worker** — Validates input with `WorkerInputSchema`, output with `WorkerOutputSchema`
- **Persistence** — Save/load use `PersistedStateSchema`; notepad parse uses it for retrieved JSON

### 7. Testing
- **`tests/rco/phase2.test.ts`** — Integration tests for:
  - **Plugin:** `parseRunRecipeArgs`, `handlePluginCommand` (rco-status, unknown), `runRecipeFromPlugin` (PlanExecRevEx end-to-end with `--no-export`)
  - **Schemas:** `parseClaudeResponseText` (JSON and fallback), `ClaudeResponseOutputSchema`, `PersistedStateSchema`
  - **Persistence:** notepad prompt builders, `parseNotepadResponse`, `saveStateToLocal` / `loadStateFromLocal` round-trip, `listLocalSessionIds`
  - **Export:** `exportCursor` with `dynamicRules: true` and output containing “bug” → triage hints in rule
  - **Dashboard:** `broadcastGraph` (no throw), `startDashboard(0)` / `stopDashboard`
  - **Prompts:** `buildClaudeToolCallingPrompt` content (agent name, tools, JSON instruction)
- All 36 RCO tests (including Phase 2) pass with `npm run test:rco`

---

## Bugs Fixed

- **agentWorker.ts** — Resolved variable shadowing: renamed first `parsed` (WorkerInputSchema) to `inputParsed` and second (parseClaudeResponseText) to `responseParsed` to fix TypeScript “Cannot redeclare block-scoped variable” and wrong type on `parsed.output`/`parsed.dotGraph`.
- **agentWorker.ts** — Fixed cast of `state` to `RcoState`: use `(state as unknown) as RcoState` for type safety.
- **VS Code extension** — Corrected `package.json`: `contribution` → `contributes`.

---

## Dependencies Added

- **esbuild** (dev) — Plugin bundle
- **chart.js** — Dashboard UI charts
- **@tauri-apps/cli** (dev) — Tauri dev/build

Puppeteer was already present. All changes are cross-platform (Windows, macOS, Linux).

---

## Next Steps

1. **Production Claude interface** — Replace Puppeteer/mock with real Claude tool-calling or API integration when running inside Claude Desktop / claude.ai.
2. **Tauri build** — Run `npm run tauri:dev` (and ensure Node dashboard on 8080 if you want live graph data). For production, add `tauri build` and bundle the dashboard as a standalone desktop app.
3. **VS Code extension** — Publish or sideload: run `npm run compile` in `extensions/vscode/`, then install the VSIX or link the extension folder for development.
4. **Security** — No known vulnerabilities introduced; Zod validation on all plugin/orchestrator/worker boundaries. Optional: run `npm audit` and address any existing advisories in the repo.
5. **Phase 3** — Proceed with plan.md: new modes (e.g. adaptive-swarm), more agents/skills, YAML editor integration, analytics in dashboard, benchmarking.

---

## Files Created or Touched

| Path | Change |
|------|--------|
| `src/schemas.ts` | New — Zod schemas and `parseClaudeResponseText` |
| `src/plugin.ts` | New — Plugin entry, slash command handling |
| `src/persistence.ts` | New — Notepad prompts + local JSON persistence |
| `src/rco/prompts.ts` | New — Claude tool-calling prompt builder |
| `src/rco/agentWorker.ts` | Refactor — Prompts + JSON parse + validation |
| `src/rco/orchestrator.ts` | Refactor — `onGraph`, WorkerOutputSchema validation |
| `src/rco/exportCursor.ts` | Enhanced — Dynamic rules, triage hints |
| `src/rco/dashboard.ts` | Enhanced — `graph` payload, `broadcastGraph` |
| `src/rco/cli.ts` | Hook — `onGraph` when dashboard enabled |
| `src/rco/fixtures/claude-mock-page.html` | Mock returns JSON |
| `plugin/manifest.json` | New — Plugin manifest |
| `scripts/build-plugin.js` | New — esbuild bundle |
| `scripts/serve-dashboard.js` | New — Serve dashboard-ui on 8081 |
| `dashboard-ui/index.html` | New — Chart.js + WebSocket client |
| `src-tauri/*` | New — Tauri app (Cargo, config, Rust entry) |
| `extensions/vscode/*` | New — VS Code extension skeleton |
| `tests/rco/phase2.test.ts` | New — Phase 2 integration tests |
| `package.json` | Scripts + deps: build-plugin, tauri:dev, serve-dashboard, esbuild, chart.js, @tauri-apps/cli |
| `README.md` | Plugin, Phase 2 features, tauri:dev, serve-dashboard |

---

## How to Run / Verify

```bash
git checkout rco-phase-2
npm install
npm run build
npm run build-plugin
npm run test:rco
npm run rco -- --recipe PlanExecRevEx --task "Short task"
# Optional: npm run rco -- --dashboard --recipe PlanExecRevEx --task "Task"  # WS on 8080
# Optional: npm run serve-dashboard & npm run tauri:dev  # Tauri dashboard window
```

---

*Phase 2 complete. RCO runs with native Claude-oriented prompts, plugin bundle, session persistence, dynamic Cursor rules, Tauri dashboard, and schema validation throughout.*
