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

## Callsign Map (Legacy → UNSC)

| Callsign | Role | Legacy agents |
|----------|------|---------------|
| Sparrow | Coder | executor |
| Vanguard | Tester | test-author, test-executor |
| Oracle | Researcher | researcher, explore, architect |
| Sentinel | Reviewer | code-reviewer, security-reviewer |
| Forge | DevOps | build-fixer, devops-agent |
| Specter | UI/UX | designer, ui-designer |
