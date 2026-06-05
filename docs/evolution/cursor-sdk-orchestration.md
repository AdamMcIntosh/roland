# Cursor SDK Orchestration Patterns for Roland

Reference patterns for wiring Roland as supervisor with UNSC sub-agents via `@cursor/sdk`.

## Pattern 1 — Roland with Inline Sub-Agents (Recommended)

Load YAML definitions and pass to `Agent.create`:

```typescript
import { Agent, CursorAgentError } from "@cursor/sdk";
import { loadUnscAgents, toSdkAgentDefinitions } from "../dist/rco/unsc-agents.js";
import { buildRolandOrchestratorPrompt } from "../dist/rco/orchestrator-prompts.js";
import { CommandBlackboard } from "../dist/rco/command-blackboard.js";

const apiKey = process.env.CURSOR_API_KEY!;
const board = new CommandBlackboard(".roland");
const goal = process.argv[2] ?? "No mission specified";

await using roland = await Agent.create({
  apiKey,
  model: { id: "grok-4.3" },
  name: "Roland",
  local: { cwd: process.cwd(), settingSources: [] },
  agents: toSdkAgentDefinitions(loadUnscAgents()),
});

const systemContext = buildRolandOrchestratorPrompt({
  goal,
  commandBlackboard: board.smartSnapshot(goal),
});

try {
  const run = await roland.send(`${systemContext}\n\n---\n\nExecute mission: ${goal}`);
  console.error(`[Roland] run.id=${run.id} agentId=${roland.agentId}`);

  for await (const event of run.stream()) {
    if (event.type === "assistant") {
      for (const block of event.message.content) {
        if (block.type === "text") process.stdout.write(block.text);
      }
    }
  }

  const result = await run.wait();
  if (result.status === "error") process.exit(2);
  if (result.status === "cancelled") process.exit(3);

  board.appendAgentLog("Roland", `Mission complete: ${goal.slice(0, 120)}`);
} catch (err) {
  if (err instanceof CursorAgentError) {
    console.error(`Startup failed: ${err.message}, retryable=${err.isRetryable}`);
    process.exit(1);
  }
  throw err;
}
```

See `scripts/roland-orchestrate.mjs` for the runnable version.

## Pattern 2 — File-Based Sub-Agents

Commit `.cursor/agents/*.md` with frontmatter. Enable project settings:

```typescript
local: { cwd: process.cwd(), settingSources: ["project"] }
```

Inline `agents` on `Agent.create` **override** file-based definitions with the same name.

## Pattern 3 — Dispatcher (Long-Running Web UI)

Keep Roland's `agentId` across requests:

```typescript
const agents = new Map<string, Awaited<ReturnType<typeof Agent.create>>>();

async function getRoland(projectId: string, savedId?: string) {
  const existing = agents.get(projectId);
  if (existing) return existing;

  const agent = savedId
    ? await Agent.resume(savedId, { apiKey: process.env.CURSOR_API_KEY! })
    : await Agent.create({
        apiKey: process.env.CURSOR_API_KEY!,
        model: { id: "grok-4.3" },
        name: "Roland",
        local: { cwd: projectRepoPath, settingSources: ["project"] },
        agents: toSdkAgentDefinitions(loadUnscAgents()),
      });

  agents.set(projectId, agent);
  return agent;
}
```

Store `agent.agentId` in SQLite alongside the project record for resume after server restart.

## Pattern 4 — Batch PM Team (Existing Path)

Web UI and CLI continue using:

```bash
roland team "goal" --notify
```

This path uses `team-orchestrator.ts` → parallel `Agent.create` per task. Incremental integration:

1. Inject `command-blackboard.md` excerpt into planning/review prompts
2. Map task `agent` field through `legacyAgentToCallsign()` for display
3. Optionally register sub-agents on Roland's planning agent only

## Pattern 5 — Cloud + Auto PR (CI / Fire-and-Forget)

For missions that open PRs without local checkout:

```typescript
await using agent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: "composer-2.5" },
  cloud: {
    repos: [{ url: "https://github.com/org/repo" }],
    autoCreatePR: true,
    skipReviewerRequest: true,
  },
  agents: toSdkAgentDefinitions(loadUnscAgents()),
});
```

Roland delegates to Sparrow/Vanguard inside the cloud VM. Pair with existing `roland-web` GitHub token flow for operator-initiated missions.

## Sub-Agent Spawning Mechanics

The parent Roland agent spawns sub-agents via Cursor's built-in **Agent tool** (not a separate `agent.spawn()` API). Sub-agents are registered at creation:

| Source | Precedence |
|--------|------------|
| Inline `agents` on `Agent.create` | Highest |
| `.cursor/agents/*.md` | Project files |
| User/team agent config | Ambient (when `settingSources` includes them) |

Each definition requires:
- `description` — when Roland should delegate (shown to parent)
- `prompt` — sub-agent system prompt
- `model` — optional override or `"inherit"`

## Error Handling

| Failure | Meaning | Action |
|---------|---------|--------|
| Thrown `CursorAgentError` | Run never started | Fix auth/config, check `isRetryable` |
| `result.status === "error"` | Run started, failed | Inspect transcript, git state |
| BLOCKER signal | Agent needs decision | Roland `unblock_task` or operator input |

Always log `run.id` and `agent.agentId` immediately after `send()`.

## Resource Management

```typescript
await using agent = await Agent.create({ ... });
// auto-disposed at block exit
```

For one-shot scripts: `Agent.prompt()` disposes automatically.

## MCP Integration

Pass Roland MCP server to sub-agents for board tools:

```typescript
mcpServers: {
  roland: {
    type: "stdio",
    command: "node",
    args: ["dist/index.js", "serve"],
  },
},
agents: {
  sparrow: {
    description: "...",
    prompt: "...",
    mcpServers: ["roland"],
  },
},
```

Remember: inline MCP servers are **not persisted** across `Agent.resume()` — pass again on resume.

## Model Routing

| Callsign | Model | Rationale |
|----------|-------|-----------|
| Roland | grok-4.3 | Planning, orchestration |
| Oracle, Sentinel | claude-sonnet-4-6 | Reasoning, review |
| Sparrow, Vanguard, Forge, Specter | composer-2.5 | Execution |

Routing is defined in `agents/unsc/*.yaml` and applied via `toCursorModelId()` in `unsc-agents.ts`.

## What Stays Unchanged

- Web UI POST `/api/projects/:id/run` → `roland team` subprocess
- GitHub branch `roland/<slug>` + PR creation in `roland-web/server/github.ts`
- `blackboard.json` + MCP board tools
- `memory.md` retrospective loop (complementary to Command Blackboard)
