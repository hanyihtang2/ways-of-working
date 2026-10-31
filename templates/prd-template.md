---
id: {{FEATURE_ID}}
title: {{FEATURE_TITLE}}
status: draft             # draft | ready | active | completed | archived
priority: P1              # P0 (Critical) | P1 (High) | P2 (Medium) | P3 (Low)
target_release: v0.1.0
lead: human
created_at: {{DATE}}
branch_prefix: feat/{{FEATURE_SLUG}}
areas:
  - {{PRIMARY_AREA}}
---

# PRD: {{FEATURE_TITLE}}

## 1. Executive Summary & Problem Statement
*What problem are we solving, and why now?*

## 2. User Stories
- **As a** [developer / user / maintainer]
- **I want to** [action]
- **So that** [value / outcome]

## 3. Scope & Key Capabilities
### In Scope
- [Feature capability 1]
- [Feature capability 2]

### Out of Scope
- [Explicit non-goals for this release milestone]

## 4. User Experience & Flows
*Describe screen layouts, interactive behaviors, terminal outputs, or automation sequences.*

## 5. Technical Architecture & Constraints
- **Primary Code Areas**: (See `pm/areas.json`)
- **Impacted Files & Modules**:
- **Dependencies & Tools**:
- **Constraints**: (Deterministic tests pass, 0 regressions, security boundaries preserved)

## 6. Acceptance Criteria
- [ ] Core happy path functional and verified
- [ ] Edge cases handled cleanly
- [ ] Deterministic verification passes cleanly (0 errors)
- [ ] Code formatted and linted cleanly

## 7. Task Breakdown Index
*Tasks are tracked in `tasks/` under `0-backlog`, `1-in-progress`, `2-review`, and `3-done`.*
- [ ] `TASK-001`: [Title]
- [ ] `TASK-002`: [Title]

