# Architecture Decision Records

_Auto-updated by Roland after each run. Edit manually at any time._
_Each section corresponds to one Roland run that produced new decisions._

## 2026-06-07 — [Mission: fintrack-mvp-launch] [P1] Mission: Launch FinTrack MVP
Build the initi _(run mq41lbgr)_

- Chose Prisma+SQLite with Express route versioning under `/api/v1` to keep MVP self-hostable and strongly typed.
- Standardized error responses as ProblemDetails with correlation IDs to simplify debugging and client handling.

## 2026-06-07 — [Mission: roland-hardening-2026-06] [P1] force team: Mission: Roland Core Reliab _(run mq43gdec)_

- Decision: Verify and use the real `supervisor.pid` (via `waitForSupervisorReady`) before writing `mission-meta`, because it prevents false “Mission launched” UX when background supervisor spawn fails.
- Decision: Centralize “active run-state” filtering in `readActiveRunStateForClient()` and reuse it for both HTTP and WebSocket, because duplicated logic caused HTTP/WS mismatch with stale artifacts.

## 2026-06-07 — [Mission: loop-enginner] -2: Define Core Loop Phase Model & Orchestrator Primiti _(run mq49qp23)_

- [Decision: Implement loop execution as a standalone `src/loop-engine/` module with YAML templates under `recipes/loops/`, then wire it into `run-state.json` via the team CLI/onStateChange path so supervisor/status surfaces can observe loop progress.]
