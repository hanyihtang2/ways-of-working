# Two-Tier Agentic Review Model

A robust architecture for AI-native code review designed to eliminate **self-review blindness** and **post-hoc CI latency**.

---

## 1. The Core Failure Modes of AI Code Review

When deploying LLMs to write and review production code, two failure modes emerge:

### Failure Mode 1: Self-Review Blindness (In-Session Bias)
A primary coding agent accumulates tens of thousands of tokens of reasoning, trials, and terminal errors. When asked to evaluate its own code, it suffers from:
- **Confirmation Bias:** Evaluating its *intent* rather than the actual code in the file.
- **Context Pollution:** Residual hallucinations from earlier failed attempts degrade audit rigor.

### Failure Mode 2: Post-Hoc PR Latency (Out-of-Loop Bots)
Relying solely on external PR bot comments (e.g., webhook bots) terminates the active coding session before feedback arrives. Fixing PR comments requires re-initiating the agent, creating fragmented commits, high token costs, and slow feedback cycles.

---

## 2. The Two-Tier Solution

The Two-Tier Model partitions code verification into two distinct feedback loops:

```text
┌────────────────────────────────────────────────────────┐
│ Tier 1: Inner Loop (Local Pre-PR)                      │
│ 1. Primary Agent writes code                           │
│ 2. Deterministic Check (tests, types, build) passes    │
│ 3. Isolated Evidence Pack generated (.review/)         │
│ 4. Fresh-Context Reviewer Subagent audits diff         │
│ 5. Auto-remediation in active session (Max 2 cycles)   │
└───────────────────────────┬────────────────────────────┘
                            │ PASS
                            ▼
┌────────────────────────────────────────────────────────┐
│ Tier 2: Outer Loop (GitHub PR & CI Quality Gate)       │
│ 1. PR opened with structured Evidence Pack             │
│ 2. GitHub Actions runs deterministic test matrix       │
│ 3. Actions validates Tier 1 PASS verdict & structure   │
│ 4. Human maintainer signs off and merges               │
└────────────────────────────────────────────────────────┘
```

---

## 3. The 3 Severities: P0, P1, and P2

All reviewer subagent findings are classified into three strict levels:

| Severity | Label | Impact | Loop Trigger | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`P0`** | **Blocker** | **BLOCKS** | **Yes** | Test/build failure, broken acceptance criteria, crash, data corruption, security leak. |
| **`P1`** | **High** | **BLOCKS** | **Yes** | Scope violation outside `pm/areas.json`, missing I/O error boundaries, API contract break. |
| **`P2`** | **Nit** | **DOES NOT BLOCK** | **No** | Non-blocking readability or refactoring suggestions. |

---

## 4. The Proof-of-Defect Invariant

To eliminate hallucinated bikeshedding, every P0 and P1 finding **MUST** supply:
1. Exact file path and line numbers.
2. Violated acceptance criterion reference.
3. Concrete execution proof (the exact failing input scenario).
4. Actionable remediation diff.
