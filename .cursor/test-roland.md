# Roland Cursor Chat — Test Prompts

Open this file alongside a Cursor Agent chat.
Paste each prompt in order. After each one, expand the **"Used N tools"**
section in the chat to confirm the expected tool was called.

---

## Test 1 — Welcome + project state
**Paste this:**
```
hello roland, what can you do?
```
**Expected tool call:** `roland_hello`  
**Expected response:** Welcome banner listing Roland's two modes (Direct / PM Team), current memory entries, board status.

---

## Test 2 — Triage fires on a coding task
**Paste this:**
```
add a /healthz endpoint to the Express API that returns 200 OK with { status: "ok", uptime: <seconds> }
```
**Expected tool call:** `triage`  
**Expected response:** Roland adopts a persona (likely `executor` or `architect`) and either handles it directly or offers to run the PM team.

---

## Test 3 — Triage fires on a complex goal
**Paste this:**
```
build a complete JWT authentication system with refresh token rotation, Redis session storage, and role-based access control
```
**Expected tool call:** `triage` → then an offer to call `roland_run_team`  
**Expected response:** Roland identifies this as a full-team job and asks to confirm before launching.

---

## Test 4 — PM board check
**Paste this:**
```
what's the current team status?
```
**Expected tool call:** `pm_standup`  
**Expected response:** A standup-style board snapshot — shows "Team idle" if no run is active, or live task/blocker breakdown if a run is in progress.

---

## Test 5 — Agent roster
**Paste this:**
```
what engineers do you have available?
```
**Expected tool call:** `list_team`  
**Expected response:** A table of available specialist agents (executor, architect, test-author, security-reviewer, etc.).

---

## ✅ Pass criteria

| Test | Tool you should see called |
|------|---------------------------|
| 1 | `roland_hello` |
| 2 | `triage` |
| 3 | `triage` |
| 4 | `pm_standup` |
| 5 | `list_team` |

If tool calls don't appear, check:
1. `roland doctor` — is the MCP server connected?
2. `roland mcp-config --write` — is the global entry set?
3. Restart Cursor after any MCP config change.
