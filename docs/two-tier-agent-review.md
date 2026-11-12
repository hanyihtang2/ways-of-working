# Two-Tier Agentic Review Model

A robust architecture for AI-native code review designed to eliminate **self-review blindness**, **shallow architectural coupling**, **test theater**, and **post-hoc CI latency**.

---

## 1. The Core Failure Modes of AI Code Review

When deploying LLMs to write and review production code, three failure modes emerge:

### Failure Mode 1: Self-Review Blindness (In-Session Bias)
A primary coding agent accumulates tens of thousands of tokens of reasoning, trials, and terminal errors. When asked to evaluate its own code, it suffers from:
- **Confirmation Bias:** Evaluating its *intent* rather than the actual code in the file.
- **Context Pollution:** Residual hallucinations from earlier failed attempts degrade audit rigor.

### Failure Mode 2: Shallow Checklist Review vs. Architectural Bugs
Even when a reviewer agent has fresh context, checking only "diff vs. acceptance criteria" can miss subtle architectural failure modes:
- **Import-Time Side Effects & Runtime Profile Coupling:** Importing a shared DB client inside a standalone CLI script triggers eager web-server environment variable validation at module load time.
- **Fail-Open Default Parameters:** Permissive default parameters (e.g., `nodeEnv = ""`) silently bypass production or security safeguards when omitted.
- **Non-Atomic Multi-Step Writes:** Sequential persistence mutations without transaction wrapping leave corrupted state on partial failure.
- **Test Theater:** Unit tests asserting source-file text via `fs.readFileSync` + regex instead of exercising runtime behavior.
- **Blindly Following Contradictory Specs:** Shipping boundary-violating workarounds instead of challenging an ADR/runtime conflict before coding.

### Failure Mode 3: Post-Hoc PR Latency (Out-of-Loop Bots)
Relying solely on external PR bot comments (e.g., webhook bots) terminates the active coding session before feedback arrives. Fixing PR comments requires re-initiating the agent, creating fragmented commits, high token costs, and slow feedback cycles.

---

## 2. The Two-Tier Solution with Objective Auto-Escalation

The Two-Tier Model partitions code verification into a pre-coding gate and two distinct feedback loops:

```text
┌────────────────────────────────────────────────────────┐
│ Pre-Coding: Spec Challenge Protocol                    │
│ 1. Agent inspects task spec, ADRs, & pm/areas.json     │
│ 2. Validates runtime boundaries (client/server/edge/cli│
│ 3. Halts & escalates if spec conflicts with ADRs       │
└───────────────────────────┬────────────────────────────┘
                            │ Aligned
                            ▼
┌────────────────────────────────────────────────────────┐
│ Tier 1: Inner Loop (Local Pre-PR)                      │
│ 1. Primary Agent writes code & runtime behavioral tests│
│ 2. Deterministic Check (tests, types, build) passes    │
│ 3. Evidence Pack auto-evaluates review_depth:          │
│    - "standard" (5 baseline evaluation axes)           │
│    - "architectural" (+ 4 adversarial trace checks)    │
│ 4. Fresh-Context Reviewer Subagent audits diff         │
│ 5. Auto-remediation in active session (Max 2 cycles)   │
└───────────────────────────┬────────────────────────────┘
                            │ PASS
                            ▼
┌────────────────────────────────────────────────────────┐
│ Tier 2: Outer Loop (GitHub PR & CI Quality Gate)       │
│ 1. PR opened with structured Evidence Pack             │
│    (+ collapsed <details> Iteration 1 history if multi)│
│ 2. GitHub Actions runs deterministic test matrix       │
│ 3. Actions validates Tier 1 PASS verdict, escalation   │
│    triggers, & required architectural_checks sign-off  │
│ 4. Human maintainer signs off and merges               │
└────────────────────────────────────────────────────────┘
```

---

## 3. Objective Auto-Escalation (`standard` vs. `architectural`)

A task is automatically elevated to `review_depth: "architectural"` when any of three objective triggers fire:
1. **Area Risk & Cross-Boundary Scope:** Changed files match an area in `pm/areas.json` with `risk_tier: "high"` or `structural_boundaries` (`env-boot`, `db-client`, `auth-session`, `edge-proxy`, `build-ci`, `cli-entrypoint`, `client-server-boundary`), or cross multiple architectural boundaries.
2. **Critical Architectural Diff Surfaces:** The diff alters runtime entrypoints, auth/session/middleware, env schemas, DB client initialization, build/CI workflows, or runtime dependencies.
3. **Static Source-Text Matching in Tests ("Test Theater"):** Changed or added tests use `readFileSync` / `readFile` + regex assertions on application source files.

When escalated to `review_depth: "architectural"`, the reviewer must complete and attest to four adversarial trace checks (`architectural_checks`):
- `import_boot_isolation`: Top-level imports traced for eager initialization, DB pool creation, env validation, or server-only leaks into client/edge/CLI contexts.
- `fail_closed_defaults`: Missing env vars, empty/omitted parameters, and non-default runtime modes verified to fail closed with actionable errors.
- `write_atomicity`: Multi-statement persistence flows verified to use atomic transactions and clean partial-failure handling.
- `no_test_theater`: Unit tests verified to exercise runtime execution rather than static source-file regex matching (`P1` Blocker).

---

## 4. The 3 Severities: P0, P1, and P2

All reviewer subagent findings are classified into three strict levels:

| Severity | Label | Impact | Loop Trigger | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`P0`** | **Blocker** | **BLOCKS** | **Yes** | Test/build failure, broken acceptance criteria, crash, non-atomic data corruption, fail-open security/production bypass, security leak. |
| **`P1`** | **High** | **BLOCKS** | **Yes** | Scope violation (`pm/areas.json`), import-time runtime coupling, fail-open default parameters, non-atomic multi-step writes, test theater (`readFileSync` + regex on source), unchallenged ADR conflict, missing I/O error boundaries, API contract break. |
| **`P2`** | **Nit** | **DOES NOT BLOCK** | **No** | Non-blocking readability or refactoring suggestions. |

---

## 5. The Proof-of-Defect Invariant

To eliminate hallucinated bikeshedding, every P0 and P1 finding **MUST** supply:
1. Exact file path and line numbers.
2. Violated acceptance criterion or architectural rule reference.
3. Concrete execution proof (the exact failing input scenario or import trace).
4. Actionable remediation diff.
