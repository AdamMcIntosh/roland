# Recipes Catalog

Roland includes 7 multi-agent workflow recipes. Each recipe defines a sequence of agent steps that Cursor drives one at a time via `start_recipe` and `advance_recipe`.

## How Recipes Work

1. **`start_recipe`** — Pass a recipe name and your task description. Returns the first agent's prompt.
2. **Cursor executes** the prompt using its own model.
3. **`advance_recipe`** — Pass the output back. Returns the next agent's prompt (or a summary when done).
4. Repeat until all steps complete.

The IDE controls the model and context for every step — Roland just orchestrates the sequence.

## Available Recipes

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

## Quick Start

In Cursor chat:

```
Use the start_recipe tool with recipe "PlanExecRevEx" and task "Refactor the auth module to use JWT tokens"
```

Then follow each prompt, passing output back with `advance_recipe` until the workflow completes.

## Recipe YAML Files

Recipe definitions live in `recipes/*.yaml`. Each YAML defines the agent chain, per-step prompts, and variable interpolation (e.g., `{{user_task}}`). The server reads these directly at runtime.
