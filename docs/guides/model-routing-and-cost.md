# Model Routing & Cost

Single source of truth for Roland model routing, cost targets, and budget behavior.

Configuration lives in `config.yaml` at the repo root (copied to npm package). Override per role with env vars: `ROLAND_MODEL_<ROLE>`, `ROLAND_MODEL_<ROLE>_PROVIDER`.

---

## Loop Engineering roles (ClosedLoop hot path)

| Role | Default model | Provider | Purpose |
|------|---------------|----------|---------|
| **pm** | grok-4.3 | openrouter | Planning scope per iteration |
| **coding** | qwen/qwen3-coder-next | openrouter | Implementation (Act phase) |
| **critic** | deepseek/deepseek-chat | openrouter | Structured critique (rule-assisted) |
| **verifier** | deepseek/deepseek-v3-0324 | openrouter | Verification analysis |
| **planner** | minimax/minimax-m2.5 | openrouter | Lightweight plan scoping |
| **researcher** | deepseek/deepseek-v3-0324 | openrouter | Research loops |
| **reasoning** | minimax/minimax-m2.5 | openrouter | Architecture / high-stakes |

Each role supports a **fallback** model when the primary is unavailable or over budget.

### Local Ollama

Set `provider: ollama` per role in `config.yaml` and enable `ollama.enabled: true`. Env overrides still apply.

---

## PM Team (Cursor-native — legacy opt-in)

When `use_pm_team: true` or non-loop team runs, routing uses **Cursor subscription models** (not OpenRouter):

| Lane | Default | Used for |
|------|---------|----------|
| Lead PM | gpt-5.4-nano | Orchestration, planning |
| Engineers | composer-2.5 | Implementation, tests, docs |

Configure under `pm:` in `config.yaml`.

---

## Complexity tiers (recipe / triage routing)

| Tier | Models | Typical use |
|------|--------|-------------|
| **local** | codellama:7b (Ollama) | Zero-cost local |
| **simple** | deepseek-v3, gemini-flash | Light tasks, QA |
| **medium** | qwen3-coder-next | Default coding |
| **complex** | minimax-m2.5 | Architecture, security |
| **explain** | deepseek-v3 | Documentation |
| **prototype** | qwen3-coder-next | Scaffolding |

See `routing:` in `config.yaml`.

---

## Cost targets (moderate usage ~15M tokens/month)

Estimates from `config.yaml` header comments:

| Component | Share | Est. cost |
|-----------|------:|----------:|
| Critic / Architect (minimax-m2.5) | ~15% | ~$5/mo |
| Executor / Coder (qwen3-coder-next) | ~55% | ~$8/mo |
| QA / Simple (deepseek-v3) | ~20% | ~$2/mo |
| Main session (claude-haiku) | — | ~$4/mo |
| **Total** | | **~$19/mo** |

Track live spend via MCP tools `track_cost`, `manage_budget`, `get_analytics`. History persists in `.roland/usage-history.json`.

---

## Budget enforcement

```yaml
budget:
  monthly_budget: 85
  budget_degradation_threshold: 0.8   # switch to free models at 80%
  known_free_models: [...]
```

At 80% of monthly budget, Roland degrades to configured free models (`free_model_coding`, `free_model_reasoning`).

---

## Telemetry (opt-in)

Error and session reporting via Sentry — **disabled by default**.

| Enable | How |
|--------|-----|
| Env | `RCO_TELEMETRY_CONSENT=1` or `RCO_CONSENT=yes` |
| Consent file | `~/.rco/telemetry-consent.json` → `{ "consent": true }` |
| DSN | `SENTRY_DSN` or `RCO_SENTRY_DSN` |

Initialized at CLI bootstrap when consent is present. No data is sent without explicit opt-in.

---

## Phase timing metrics

ClosedLoop records per-phase durations in `.roland/loop-metrics.json`:

```bash
roland mission-audit --last    # includes Phase Timing table
```

Metrics include count, avg ms, total ms, success/failure counts per PACVRE phase.

---

## Related docs

- [closed-loop-harness.md](closed-loop-harness.md) — loop templates and gates
- [budget-guide.md](budget-guide.md) — detailed budget MCP tools
- [README.md](../../README.md) — quick start
