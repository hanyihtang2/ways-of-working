---
id: {{TASK_ID}}
parent_feature: {{FEATURE_ID}}
title: "{{TASK_TITLE}}"
status: backlog           # backlog | in-progress | review | done
priority: P1              # P0 (Critical) | P1 (High) | P2 (Medium) | P3 (Low)
areas:
  - {{AREA_KEY}}
target_paths:
  - src/...
branch: {{FEATURE_BRANCH}}
dependencies: []
assigned_to: human        # human | agent:coder | agent:research
created_at: {{DATE}}
updated_at: {{DATE}}
---

# {{TASK_ID}}: {{TASK_TITLE}}

## 1. Objective
*A concise summary of what this task delivers.*

## 2. Context & PRD Reference
- Parent PRD: `../prd.md`
- Related areas: Check `pm/areas.json` for `risk_tier`, `structural_boundaries`, and technical context.

## 3. Technical Implementation Details
*Specific architectural patterns, scripts, functions, or schemas to use.*

### Runtime & Trust Boundary Notes
- **Runtime Profile:** `client` | `server` | `edge` | `cli`
- **Import-Time Isolation:** Ensure modules imported across runtime profiles do not execute eager environment validation or connection pool creation at top level.
- **Fail-Closed Defaults & Write Atomicity:** All guard parameters must fail closed when omitted/empty; multi-step writes must execute inside an atomic transaction.

## 4. Acceptance Criteria
- [ ] Pre-Coding Spec Challenge completed: task instructions verified against repository ADRs and runtime boundaries (`client` / `server` / `edge` / `cli`).
- [ ] Implementation satisfies requirements cleanly with strict type safety and fail-closed defaults.
- [ ] Behavioral unit/integration tests exercise runtime execution and negative paths (no `readFileSync` + regex test theater).
- [ ] Deterministic verification passes cleanly (`npm test` / `npm run build`).
- [ ] Preserves all existing code comments and architectural boundaries.
- [ ] Task file updated and moved to `2-review` upon Tier 1 subagent PASS.

## 5. Agent Run Notes & Prompt Guidance
> **Agent Instructions:**
> When executing this task:
> 1. **Pre-Coding Spec Challenge:** Validate this task spec against repository ADRs and runtime boundaries in `pm/areas.json` *before* writing code. If a prescribed pattern conflicts with an ADR or couples incompatible runtime boundaries, **stop and escalate** or propose a structural split rather than shipping a workaround.
> 2. Restrict file modifications strictly to `target_paths` unless explicitly required.
> 3. Write authentic runtime tests; never use `fs.readFileSync` + regex on application source files to simulate behavioral verification.
> 4. Verify with deterministic checks before requesting review (`npm run agent:review-pack`).
> 5. Document decisions, boundary checks, and caveats below.

### Execution Log / Decisions
*(Leave blank for agent to fill during task execution)*
