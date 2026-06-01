#!/usr/bin/env node
/**
 * Roland CLI entry point.
 *
 * Primary commands:
 *   roland "goal"       Run a PM team on a goal (shortcut for `roland team`)
 *   roland team         PM-first parallel agent execution with live TUI
 *   roland watch        Monitor git commits / file changes; auto-run on change
 *   roland pr [number]  Review (and optionally fix) a GitHub PR via `gh`
 *   roland status       Live TUI observer for a running job
 *
 * Utility commands:
 *   roland serve        Start the stdio MCP server (default when no subcommand)
 *   roland mcp-config   Print / merge the ~/.cursor/mcp.json entry
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