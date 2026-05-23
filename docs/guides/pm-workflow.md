# PM Team Workflow — You Are the PM

Roland turns Cursor into a small engineering team that **you manage**. You stay
on Claude Opus 4.7 as the Lead PM; your engineers run on Cursor's Composer 2.5
models. Your job is not to write code — it's to **decompose work, delegate it,
and keep the team unblocked.**

> **The mantra:** *I am the PM. Roland runs the team. Keep them unblocked.*

This guide walks one feature end to end.

---

## The core loop

Every turn, you do the same five things — in this order:

1. **`pm_standup`** — read the rendered board. Blockers are always on top.
2. **`unblock_task`** — resolve every open blocker before anything else.
3. **`review_task`** — accept/reject anything in review.
4. **start work** — `spawn_task`, `assign_task`, or `start_team_recipe`.
5. **`synthesize_deliverable`** — when the board is clear.

That's it. The standup tells you which step you're on.

---

## Worked example: "Add dark mode"

### 1. Adopt the PM posture

```
get_pm_playbook
```
Adopt the returned system prompt. You're now the Lead Engineering Manager.

### 2. Kick off a standard workflow

Rather than decompose by hand, drop a whole task graph onto the board:

```
start_team_recipe { recipe: "full-feature-team", goal: "add dark mode" }
```

This seeds five linked tasks — `design → implement → (test ∥ review) → docs` —
namespaced so they never collide, and returns **dispatch packets** for the
tasks that are ready right now (here, just `design`, which has no dependencies).

### 3. Launch the first engineer

Each dispatch packet has a `cursorLaunch` field — copy-paste-ready instructions:

```
▶ Launch in Cursor (architect for task:add-dark-mode-…-design):
  1. Open a new AI chat / Composer pane.
  2. Select model: composer-2.5-fast
  3. Paste the brief below as the engineer's instructions.
  4. Attach context: src/theme.ts, src/App.tsx
  5. The engineer reports back by calling complete_task (include model + tokens).

--- BRIEF ---
[Engineer persona: architect]
… the full role prompt + task + acceptance criteria …
```

Follow those steps in Cursor: open a new AI pane, pick `composer-2.5-fast`, paste
the brief, attach the files. The architect is now working — on a different model
than you, in its own context.

### 4. The engineer reports back

When the architect finishes, it calls (from its pane):

```
complete_task {
  taskKey: "task:add-dark-mode-…-design",
  summary: "Design: CSS variables + a useTheme() hook",
  content: "<the design doc>",
  author: "architect",
  model: "composer-2.5-fast",
  input_tokens: 4200, output_tokens: 1800
}
```

The task moves to `in_review`, and the token usage is attributed to it.

### 5. Run the standup again

```
pm_standup
```

```
## ☀ Standup
**1 task(s) awaiting your review. Clear the review queue next.**

### 🟡 Review queue (1)
- "Design: add dark mode" is awaiting your review (1 artifact(s)).
  - `review_task { taskKey: "task:add-dark-mode-…-design", decision: "accept" | "reject", notes: "..." }`

**Board:** open 4 · in_progress 0 · blocked 0 · in_review 1 · done 0
**Usage:** 6.0k tokens across 1 engineer(s) · 1 request(s) (Cursor subscription)
```

### 6. Review, then unblock the graph

```
review_task { taskKey: "task:add-dark-mode-…-design", decision: "accept" }
```

Accepting `design` (→ done) makes `implement` ready. `pm_standup` now shows it
under 🟢 Ready to start with the exact `assign_task` call. Assign it to the
executor (routes to `composer-2.5-standard`), launch via its `cursorLaunch`, and
continue.

### 7. Handle a blocker (the most important move)

If the executor gets stuck, it calls:

```
mark_blocked { taskKey: "…-implement", need: "Which CSS-in-JS lib are we standardizing on?", raisedBy: "executor" }
```

Your next `pm_standup` puts this **at the very top**, in red, with the resolution
call pre-written:

```
### 🔴 Unblock first (1)
- "Implement: add dark mode" blocked — needs: Which CSS-in-JS lib…? (raised by executor) _(open 3m)_
  - `unblock_task { taskKey: "…-implement", blockerKey: "blocker:…", resolution: "<your decision>" }`
```

Make the call decisively:

```
unblock_task { taskKey: "…-implement", blockerKey: "blocker:…", resolution: "Use the existing styled-components setup." }
```

The decision is recorded on the Blackboard (the whole team sees it) and the
executor is notified to resume. **This is your highest-value action** — a blocked
engineer is wasted capacity.

### 8. Finish

When test, review, and docs are accepted and the board is clear:

```
synthesize_deliverable
```

You get a single rollup of every completed task and its artifacts — the thing
you hand to your stakeholder.

---

## Running engineers in parallel

When several tasks are ready at once (e.g. `test` and `review` both depend only
on `implement`), `pm_standup`/`get_team_context` will show **multiple** ready
items. Launch them in **separate Cursor panes** simultaneously — that's the whole
point of having a team. They coordinate through the shared Blackboard, not
through you.

## Observability

- **`get_pm_events { format: "markdown" }`** — the timeline: who did what, when.
- **`get_team_usage { format: "markdown" }`** — token usage by engineer and task
  (figures are usage, not dollars — the team runs on your Cursor subscription).
- **`roland pm-log`** — the same timeline from your terminal.

## Quick reference

| Tool | When |
|---|---|
| `get_pm_playbook` | Once, at the start — adopt the PM posture. |
| `pm_standup` | Top of every turn. |
| `list_team` / `list_team_recipes` | See your engineers / workflow templates. |
| `spawn_task` / `start_team_recipe` | Create work. |
| `assign_task` | Hand a task to an engineer (returns a dispatch packet). |
| `mark_blocked` / `unblock_task` | Raise / resolve blockers. |
| `complete_task` | Engineer submits work (+ optional usage). |
| `review_task` | Accept or reject. |
| `report_usage` / `get_team_usage` | Attribute / review Cursor usage. |
| `get_pm_events` | Audit timeline. |
| `synthesize_deliverable` | Final rollup. |
