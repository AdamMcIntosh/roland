# roland-web (Experimental)

> **Status: Experimental** — This is a separate hosted UI prototype for Roland. It is **not** required for daily use. Primary interfaces are the Roland CLI (`roland team`, `roland mission-audit`) and Cursor MCP (`@roland`).

For production workflows, use:

- **Execute:** `roland team "goal"` or `roland mission "goal"`
- **Monitor:** `roland status`, `roland live`, `roland hitl-status`
- **Post-run audit:** `roland mission-audit --last --format markdown`
- **Optional dashboard:** `npm run serve-dashboard` (read-only monitor at http://127.0.0.1:8081)

This directory may be moved to its own repository in a future release.

See `SELF-HOST.md` for deployment notes if you want to experiment with the web UI.
