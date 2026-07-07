# Roland Troubleshooting Runbook

Quick reference for the most common mission failures. Each section follows: **Symptoms → Diagnosis → Fix → Prevention**.

---

## 1. Mission stalls mid-phase

**Symptoms**

- Terminal shows `[Loop][agent] ⏳ … still running…` for many minutes with no progress
- Dashboard live panel frozen on one phase (Plan, Act, Verify, …)
- No new lines in `.roland/loop-state.json` `updatedAt`

**Diagnosis**

```bash
roland hitl-status
roland board-status --concise
roland bg-status          # if launched with --background
roland bg-logs            # tail supervisor log
```

Inspect loop state:

```bash
# Windows PowerShell
Get-Content .roland\loop-state.json | ConvertFrom-Json | Select-Object currentPhase, iteration, status, updatedAt

# macOS / Linux
cat .roland/loop-state.json | jq '{phase: .currentPhase, iter: .iteration, status, updatedAt}'
```

**Fix**

1. Wait if an agent is genuinely working (large refactors can take 10–20 min).
2. If truly stuck, stop the process (`Ctrl+C` foreground, or kill PID from `roland bg-status`).
3. Resume from checkpoint:

```bash
roland team "Continue: <original goal>" --loop-template <same-template>
```

4. For repeated stalls, run sequentially (safer on slow connections):

```bash
roland team "goal" --sequential
```

**Prevention**

- Use `small-fix-loop` for quick tasks; reserve `full-cycle-verified-loop` for heavy work.
- Set `loop_engine.timeout_ms` in `config.yaml` if missions run too long.
- Ensure `CURSOR_API_KEY` is valid: `roland doctor`

---

## 2. HITL blocker — mission paused waiting for you

**Symptoms**

- Message: `HITL pause` or blocker in synthesis
- `roland hitl-status` shows pending approval or blocked task
- Git commit approval pending in dashboard

**Diagnosis**

```bash
roland hitl-status
roland board-status
roland mission-audit --last --format markdown
```

**Fix**

```bash
# Unblock with guidance for the agent
roland unblock <task-id> "Proceed with option B — skip the migration script"

# Or inspect and clear HITL queue after manual fix
roland hitl-status
```

For git-commit approval gates, approve or reject in the dashboard or follow the prompt in stderr.

**Prevention**

- Review template `between_iterations` hooks — disable `require_approval` for trusted repos.
- Use `--force` only when you accept skipping worktree guards (not for HITL).

---

## 3. Connection drop / resume from last state

**Symptoms**

- SSH/terminal session dropped mid-mission
- Cursor closed while `roland team --background` was running
- `run-state.json` shows `planning` or `running` but process is gone

**Diagnosis**

```bash
roland bg-status
roland doctor
cat .roland/run-state.json
cat .roland/loop-checkpoint.json
```

**Fix**

1. Check if background supervisor is still alive:

```bash
roland bg-status
roland bg-logs
```

2. If dead, sanitize stale state and re-run:

```bash
roland team "Resume: <goal>" --loop-template <template>
```

ClosedLoop auto-recovers from `.roland/loop-state.json` and `loop-checkpoint.json` when phases match.

3. If state is corrupt:

```bash
roland team "goal" --clean --loop-template standard-code-loop
```

**Prevention**

- Prefer `roland team "goal" --background` for long missions.
- Enable auto-notifications (default for missions > ~3 min) — see `notifications:` in `config.yaml`.

---

## 4. Verification loops (flaky tests)

**Symptoms**

- Same verification gate fails repeatedly with identical errors
- Logs mention `flaky verification` or retry budget
- Critique phase keeps sending work back to Act

**Diagnosis**

```bash
roland mission-audit --last
grep -i flaky .roland/loop-state.json   # or Select-String on Windows
roland templates --json | jq '.templates[] | select(.name=="full-cycle-verified-loop")'
```

Config: `loop_engine.verification.flaky_escape_threshold` in `config.yaml`.

**Fix**

1. Fix the underlying flaky test or mark gate optional in template YAML.
2. Temporarily use a lighter template:

```bash
roland team "goal" --loop-template standard-code-loop
```

3. After manual fix, clear loop retry state:

```bash
roland team "goal" --clean
```

**Prevention**

- Document flaky tests in project README; Roland's flaky detector escalates after N identical failures.
- Use `small-fix-loop` when verification gates are overkill.

---

## 5. Stale state / interleaved missions

**Symptoms**

- Blackboard shows tasks from a previous mission
- `roland board-status` lists unrelated objectives
- Audit log mixes multiple runs
- `.roland-sim/` or old loop artifacts committed to git

**Diagnosis**

```bash
roland board-status --concise
ls .roland/missions/          # archived per-mission state
roland mission-audit --last
git status                    # check for .roland-sim/
```

**Fix**

```bash
# Full hygiene before next mission
roland team "goal" --clean

# Or manual archive inspection
ls .roland/missions/
```

Add to `.gitignore` (done automatically by `roland init` scaffold):

```
.roland/
.roland-sim/
```

**Prevention**

- Each new `roland team` run archives prior blackboard/audit into `.roland/missions/<id>/`.
- Use `--clean` when switching goals radically or after a failed partial run.
- Never commit `.roland/` — it is local mission state only.

---

## Quick command reference

| Command | Purpose |
|---------|---------|
| `roland doctor` | Install health, API key, MCP wiring |
| `roland doctor --fix` | Auto-repair common issues |
| `roland board-status --concise` | UNSC mission summary |
| `roland hitl-status` | Human-in-the-loop queue |
| `roland bg-status` / `roland bg-logs` | Background mission |
| `roland mission-audit --last` | Post-run timeline |
| `roland templates` | Loop templates + when to use each |
| `roland team "…" --budget 2.50` | Override mission cost ceiling |

## Logs

| Path | Contents |
|------|----------|
| `.roland/loop-state.json` | Current phase, iteration, verification |
| `.roland/pm-events.log` | Semantic audit trail (archived per mission) |
| `.roland/usage-history.json` | Per-run cost/token estimates |
| `.roland/logs/bg-*.log` | Background supervisor output |
| `.roland/missions/<id>/` | Archived blackboard + audit from prior run |
