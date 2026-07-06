# Roland Vision

**Roland is an open-source, provider-agnostic Loop Engineering Platform.**

We believe the future of agentic development lies not in one-shot prompts or brittle agents, but in **well-designed, reliable closed loops** that can take a high-level goal and drive it to completion with minimal human intervention.

---

## North Star

> Build systems that **iterate until done** — not until the token budget runs out.

Roland adopts and extends the best ideas from loops.elorm.xyz while adding production-grade engineering discipline: strong evaluation gates, persistent memory, reflection, checkpointing, and clean development workflow integration.

---

## Core Philosophy

- **Loops are the fundamental unit** of work
- **Reliability and observability** over raw intelligence
- **Provider agnostic** — works with any OpenAI-compatible backend (Ollama, Groq, OpenRouter, etc.)
- **Transparency and control** — humans can always see, pause, or intervene
- **Local-first where possible**, hybrid when beneficial

---

## Architecture Overview

Roland consists of three primary layers:

- **Orchestration Layer** — ClosedLoop Harness, EvaluationGate, PhaseIntentPoster, LoopMemory
- **Execution Layer** — Flexible routing to local models (Ollama) or cloud providers
- **Interface Layer** — CLI, Dashboard (mobile-friendly), MCP for IDEs (Cline, Cursor, etc.)

---

## Key Capabilities

### 1. Closed-Loop Harness (Core)
The heart of Roland. Supports structured loops with phases:
**Plan → Act → Verify → Critique → Retry → Escalate → Observe**

Features:
- Declarative **Exit Conditions** (confidence streak, all gates pass, command success, etc.)
- Structured **Reflection** saved to disk after each iteration
- Persistent **Loop Memory** across iterations
- Checkpointing and recovery for long-running loops

### 2. Dynamic Specialist Fleet
The orchestrator can intelligently spawn role-based agents (Critic, Researcher, Test-Author, Executor, Verifier, etc.) based on current loop needs.

### 3. Clean Development Integration
- Automatic clean PR generation with conventional titles and structured bodies
- GitHub repo discovery and one-click clone
- Mobile-friendly dashboard for monitoring and HITL

### 4. Provider Agnostic Execution
- Excellent first-class support for **local models** via Ollama
- Easy fallback/hybrid routing to cloud providers when needed

---

## Success Definition

Roland can take a complex goal such as:

> “Implement the core gameplay loop for Lumina Echoes in Godot 4.4”

…and execute it end-to-end through multiple iterations with:
- High output quality
- Clear observability (timeline, reflections, evaluation gates)
- Clean, mergeable code + PRs
- Minimal required human intervention

---

## Core Values

- Reliability and trustworthiness first
- Transparency and developer control
- Engineering discipline in agent systems
- Independence from any single model provider

---

