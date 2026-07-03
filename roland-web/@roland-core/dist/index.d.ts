#!/usr/bin/env node
/**
 * Roland CLI entry point.
 *
 * Primary commands:
 *   roland "goal"       Run a PM team on a goal (shortcut for `roland team`)
 *   roland team         PM-first parallel agent execution with live TUI
 *   roland status       Unified mission snapshot (board + HITL + supervisor)
 *   roland live         Continuous live monitor (refreshes every 5s)
 *   roland watch        Monitor git commits / file changes; auto-run on change
 *   roland pr [number]  Review (and optionally fix) a GitHub PR via `gh`
 *
 * Monitoring (CLI primary — Hermes uses MCP parity):
 *   roland board-status   UNSC summary
 *   roland hitl-status    HITL gates and blockers
 *   roland mission-summary  Last terminal mission outcome
 *
 * Utility commands:
 *   roland serve        Start stdio MCP (Cursor) or HTTP MCP with --mcp
 *   roland mcp          Streamable HTTP MCP server (Hermes / external clients)
 *   roland mcp-config   Print / merge ~/.cursor/mcp.json (or --general for HTTP)
 *   roland doctor       Diagnose the install
 *   roland pm-log       Print the PM event timeline for the current project
 *
 * Global environment:
 *   ROLAND_NOTIFY=1     Enable desktop/webhook notifications for all commands
 *   CURSOR_API_KEY      Required for agent execution
 *   ROLAND_AGENT_TIMEOUT_MS  Override agent timeout (default: 25 min)
 */
export {};
//# sourceMappingURL=index.d.ts.map