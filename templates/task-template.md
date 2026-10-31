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
- Related areas: Check `pm/areas.json` for technical context and dependencies.

## 3. Technical Implementation Details
*Specific architectural patterns, scripts, functions, or schemas to use.*

## 4. Acceptance Criteria
- [ ] Implementation satisfies requirements cleanly with strict type safety.
- [ ] Deterministic verification passes cleanly (`npm test` / `npm run build`).
- [ ] Preserves all existing code comments and architectural boundaries.
- [ ] Task file updated and moved to `2-review` upon Tier 1 subagent PASS.

## 5. Agent Run Notes & Prompt Guidance
> **Agent Instructions:**
> When executing this task:
> 1. Restrict file modifications strictly to `target_paths` unless explicitly required.
> 2. Verify with deterministic checks before requesting review.
> 3. Document decisions and caveats below.

### Execution Log / Decisions
*(Leave blank for agent to fill during task execution)*

