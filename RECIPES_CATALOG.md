# Recipes Catalog

Roland includes 9 multi-agent workflow recipes. Recipes can be driven two ways:

## How Recipes Work

### Option A — Autonomous (Goose, recommended)

Each step spawns a headless Goose session with real file/shell access via the Developer extension. Agents actually edit files and run commands, not just produce text.

```bash
npx tsx scripts/run-recipe.ts --recipe BugFix --task "Fix login timeout" --project /path/to/project
npx tsx scripts/run-recipe.ts --recipe VB6Migration --task "Migrate Form1.frm" --dry-run
npx tsx scripts/run-recipe.ts --recipe PlanExecRevEx --task "Build a REST API" --max-retries 2
```

Options: `--recipe`, `--task`, `--project`, `--dry-run`, `--timeout <seconds>`, `--max-turns <n>`, `--max-retries <n>`

### Option B — IDE-driven (Cursor / VS Code)

The IDE drives each step manually via MCP tools. The agent produces text; the IDE applies changes.

1. **`start_recipe`** — Pass recipe name + task. Returns first agent's prompt.
2. **IDE executes** the prompt with its own model.
3. **`advance_recipe`** — Pass output back, get next prompt (or summary when done).
4. Repeat until complete.

### Session continuity

In autonomous mode, steps share a named Goose session (`--session roland-<id>`) so each agent sees the full conversation history of prior steps. A `SessionContextManager` also tracks decisions, file changes, and patterns across the run.

## Available Recipes

### Solo Recipes

Lean, fast recipes optimised for solo developers. Fewer agents, less ceremony, preferred by triage when their trigger keywords match.

#### QuickShip
**3-Agent Ship Loop**
Plan, implement with tests inline, QA and auto-commit — all in one pass.

| Step | Agent | Role |
|------|-------|------|
| 1 | Planner | Brief actionable breakdown — no architecture deep-dive |
| 2 | Executor | Implement feature + write tests inline |
| 3 | QA | Run tests, verify, auto-commit if passing |

Settings: `auto_commit: true`, `max_loops: 2`, `require_tests: true`
Triggers: `ship`, `implement`, `build`, `add feature`

#### Spike
**2-Agent Feasibility Spike**
Explore the problem space, then prototype — no tests required.

| Step | Agent | Role |
|------|-------|------|
| 1 | Explorer | Investigate feasibility, find relevant code, recommend approach |
| 2 | Executor | Prototype implementation |

Settings: `require_tests: false`, `max_loops: 1`
Triggers: `spike`, `prototype`, `explore`, `try`, `experiment`

#### Refactor
**3-Agent Refactor Loop**
Analyse coverage, refactor with existing tests as safety net, verify no behavior change.

| Step | Agent | Role |
|------|-------|------|
| 1 | Analyst | Identify what to change, check test coverage |
| 2 | Executor | Refactor using existing test suite as safety net |
| 3 | QA | Run full suite, diff review, verify behavior unchanged |

Settings: `require_tests: true`, `max_loops: 3`, `require_no_behavior_change: true`
Triggers: `refactor`, `clean up`, `restructure`, `reorganize`

#### Debug
**2-Agent Debug Loop**
Reproduce and isolate root cause, then apply fix with regression test.

| Step | Agent | Role |
|------|-------|------|
| 1 | Researcher | Reproduce, isolate root cause, identify fix location |
| 2 | Executor | Apply fix + add regression test |

Settings: `require_tests: true`, `max_loops: 2`
Triggers: `debug`, `fix bug`, `broken`, `failing`, `error`, `crash`

---

### Enterprise Recipes

Full multi-agent pipelines for larger, team-scale work.

### PlanExecRevEx
**4-Agent Coding Team**
Autonomous loop: plan → execute → review → explain.

| Step | Agent | Role |
|------|-------|------|
| 1 | Planner | Break task into actionable steps |
| 2 | Executor | Implement the plan |
| 3 | Reviewer | Review code for issues |
| 4 | Explainer | Summarize what was done |

### BugFix
**Systematic Bug Resolution**
Full pipeline from triage through fix, test, and documentation.

| Step | Agent | Role |
|------|-------|------|
| 1 | Analyst | Triage and classify the bug |
| 2 | Researcher | Investigate root cause |
| 3 | Architect | Design the fix |
| 4 | Executor | Implement the fix |
| 5 | QA-Tester | Write and run tests |
| 6 | Critic | Review the fix |
| 7 | Writer | Document the change |

### RESTfulAPI
**API Design Through Documentation**

| Step | Agent | Role |
|------|-------|------|
| 1 | APIDesign | Design endpoints and schemas |
| 2 | APIImplementation | Build the API |
| 3 | APITesting | Test endpoints |
| 4 | APIDocumentation | Write API docs |

### SecurityAudit
**Threat Modeling to Remediation**

| Step | Agent | Role |
|------|-------|------|
| 1 | ThreatModeling | Identify threats |
| 2 | CodeSecurityReview | Review code for vulnerabilities |
| 3 | VulnerabilityAssessment | Assess severity and impact |
| 4 | RemediationPlan | Plan fixes |

### WebAppFullStack
**Full-Stack Development**

| Step | Agent | Role |
|------|-------|------|
| 1 | ArchitectureDesign | System architecture |
| 2 | UIDesign | UI/UX design |
| 3 | Implementation | Build it |
| 4 | QualityAssurance | Test and verify |
| 5 | Deployment | Deploy strategy |

### MicroservicesArchitecture
**Service Decomposition**

| Step | Agent | Role |
|------|-------|------|
| 1 | ServiceDecomposition | Break into services |
| 2 | ServiceImplementation | Implement services |
| 3 | IntegrationTesting | Test interactions |
| 4 | DeploymentStrategy | Plan deployment |

### DocumentationRefactor
**Codebase-Aware Doc Improvement**

| Step | Agent | Role |
|------|-------|------|
| 1 | audit-docs | Audit existing documentation |
| 2 | plan-changes | Plan improvements |
| 3 | execute-changes | Make changes |
| 4 | verify-changes | Verify accuracy |

### DesktopApp
**Desktop/Native App Development**

Full pipeline for cross-platform desktop apps: framework selection, UI design, implementation, testing, packaging, and distribution.

| Step | Agent | Role |
|------|-------|------|
| 1 | ArchitectureDesign | Framework selection & system architecture |
| 2 | UIDesign | Desktop UI/UX design |
| 3 | Implementation | Build the app |
| 4 | Testing | Test strategy & execution |
| 5 | QualityReview | Code review & security |
| 6 | PackagingAndDistribution | Build, sign, distribute |

### VB6Migration
**Legacy VB6 → Modern C# Migration**

Structured pipeline for migrating Visual Basic 6 codebases to C#. Loads project context from `roland-context.json`, plans the migration, executes it, reviews for issues, and persists new rules/patterns back to the context file. Supports loop/retry on blockers.

| Step | Agent | Role |
|------|-------|------|
| 1 | ContextLoader | Load roland-context.json mapping rules into session |
| 2 | Planner | Break migration into ordered steps |
| 3 | Executor | Migrate the file/module |
| 4 | Reviewer | Check for correctness, flag blockers (triggers loop if BLOCKER found) |
| 5 | Explainer | Summarise changes and update roland-context.json with new rules |

**Best run autonomously** — Executor writes real files, Reviewer runs build/tests:

```bash
npx tsx scripts/run-recipe.ts --recipe VB6Migration \
  --task "Migrate src/Forms/Form1.frm to C#" \
  --project /path/to/vb6-project
```

### CodeReviewCompliance
**Code Review & Requirements Compliance**

Comprehensive code review workflow that validates code against best practices and a requirements document, with adversarial critique and a polished compliance report.

| Step | Agent | Role |
|------|-------|------|
| 1 | requirements-analysis | Analyze requirements doc & map codebase |
| 2 | code-review | Review code for best practices & requirements |
| 3 | critique-review | Adversarial validation of findings |
| 4 | compliance-report | Generate compliance report |

## Quick Start

### Autonomous (Goose)

```bash
# Run end-to-end — Goose edits files, runs tests, commits
npx tsx scripts/run-recipe.ts --recipe PlanExecRevEx --task "Refactor the auth module to use JWT tokens"

# Preview prompts without executing
npx tsx scripts/run-recipe.ts --recipe BugFix --task "Fix login timeout" --dry-run
```

### IDE-driven (Cursor / VS Code)

```
Use the start_recipe tool with recipe "PlanExecRevEx" and task "Refactor the auth module to use JWT tokens"
```

Then follow each prompt, passing output back with `advance_recipe` until the workflow completes.

## Recipe YAML Files

Recipe definitions live in `recipes/*.yaml`. Each YAML defines the agent chain, per-step prompts, and variable interpolation (e.g., `{{user_task}}`). The server reads these directly at runtime.
