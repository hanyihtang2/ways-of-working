# Repository Agent Operating Manual (AGENTS.md)

Welcome to {{REPO_NAME}}. This repository is governed by **PM-as-Code** and the **Two-Tier Agentic Review Model**.

All AI coding agents must adhere to the operating procedures below.

---

## 1. Prime Directives (Non-Negotiable Guardrails)

1. **Deterministic Priority:** An LLM review or PR preparation must **never** run on code that fails deterministic checks. Always verify `{{DETERMINISTIC_COMMAND}}` passes cleanly with 0 errors and 0 warnings before proceeding.
2. **Pre-Coding Spec Challenge & Boundary Sanity Check:** Before writing any code, validate the task specification against repository ADRs and runtime/trust boundaries (`client` vs. `server` vs. `edge` vs. `cli`). If a task spec prescribes an implementation pattern that conflicts with an ADR, couples incompatible runtime profiles (e.g., importing eager server/web environment validation into a standalone CLI script or client module), or weakens a security/production guard, **STOP before coding** and escalate or propose a clean structural split rather than shipping a workaround.
3. **Scope Containment:** Before modifying or adding files, inspect [`pm/areas.json`](pm/areas.json) (including `risk_tier` and `structural_boundaries`). Do not touch files outside your assigned task's `target_paths` or registered areas without documented rationale.
4. **Authentic Behavioral Testing (No Test Theater):** Unit and integration tests must exercise runtime code execution (including negative paths, missing parameters, and fail-closed guards). Never write tests that assert behavioral invariants by reading application source files via `fs.readFileSync` / `readFile` and matching regular expressions or strings (`P1` Blocker).
5. **No Self-Review & Objective Auto-Escalation:** Primary coding agents do not review their own work. Always compile an Evidence Pack (`npm run agent:review-pack`) and request an isolated fresh-context subagent review. When objective escalation triggers fire (`review_depth: "architectural"`), the review must complete the 4-point Adversarial Architectural Checklist (`architectural_checks`).
6. **No Ad-Hoc PR Descriptions:** Never hand-write or guess PR descriptions. Always generate them using `npm run agent:prepare-pr <TASK-ID>` to satisfy the Tier 2 GitHub Actions Quality Gate.
7. **Human Merge Authority:** AI agents do not possess auto-merge authority. Human maintainers hold the merge key.
8. **Zero-Config Local Dev & Environment Parity:** Any new environment variable (`process.env.*`) introduced in code must be documented in `.env.example`. Any external third-party service integration (OAuth, APIs, payment, storage) must work out-of-the-box in local development (`npm run dev`) with an offline/dev fallback or a clear, actionable in-UI configuration guidance banner. Client code must never hardcode localhost URLs.

---

## 2. Standard Task Lifecycle

When assigned a task (e.g. `TASK-001`):

```text
1. Inspect Task, Areas & Pre-Coding Spec Challenge
   └── Read task spec in pm/features/<FEAT>/tasks/1-in-progress/
   └── Cross-reference target paths, risk_tier, and structural_boundaries in pm/areas.json
   └── Validate task instructions against ADRs and runtime boundaries (client / server / edge / cli)
   └── (If spec conflicts with an ADR or runtime boundary: STOP and escalate / propose structural split)

2. Code & Deterministic Verification
   └── Implement changes in targeted files (fail-closed defaults, import-time isolation, atomic writes)
   └── Write behavioral runtime unit/integration tests (no readFileSync + regex test theater)
   └── Run: {{DETERMINISTIC_COMMAND}} (must pass 0 errors)

3. Compile Evidence Pack & Evaluate Review Depth
   └── Run: npm run agent:review-pack <TASK-ID>
   └── Output generated at: .review/evidence-pack-<task-id>.md
   └── Auto-detects review_depth ("standard" | "architectural") and escalation_triggers

4. Tier 1 Reviewer Subagent (Fresh Context)
   └── Subagent evaluates .review/evidence-pack-<task-id>.md
   └── If review_depth == "architectural": traces import isolation, fail-closed defaults,
       write atomicity, and test theater; attests architectural_checks in verdict JSON
   └── Subagent saves verdict to: .review/verdict-<task-id>.json
   └── Validate via: npm run agent:verdict <TASK-ID>
   └── (If CHANGES_REQUESTED: address blockers, max 2 iterations)

5. Prepare Pull Request
   └── Run: npm run agent:prepare-pr <TASK-ID>
   └── Auto-moves task to 2-review/, syncs KANBAN.md, and creates .review/pr-body-<task-id>.md
   └── Push branch & open PR with body-file
```

---

## 3. Pre-Coding Spec Challenge & Architectural Auto-Escalation

### Pre-Coding Sanity Check Checklist
Before writing implementation code, verify:
- **Runtime Profile Isolation:** Does any module imported by a standalone CLI script (`cli-entrypoint`), edge route (`edge-proxy`), or client component (`client-server-boundary`) trigger eager server environment validation or connection pool creation at module top level?
- **Fail-Closed Contracts:** Do guard functions and configuration readers fail closed when parameters are omitted, empty (`""`), or executed under non-default runtime modes (e.g., `NODE_ENV=production`)?
- **Transactional Write Integrity:** Are multi-step database or storage mutations wrapped in an atomic transaction?
- **ADR Alignment:** Does the task specification contradict any existing ADR? If yes, **stop and escalate** before writing code.

### Objective Auto-Escalation Triggers (`review_depth: "architectural"`)
`npm run agent:review-pack` and the Tier 2 CI gate automatically escalate a task to `review_depth: "architectural"` when:
1. Changed files match an area in `pm/areas.json` with `risk_tier: "high"` or `structural_boundaries`, or cross multiple architectural boundaries.
2. The diff alters runtime entrypoints, auth/session/middleware, env schemas, DB client initialization, build/CI workflows, or runtime dependencies.
3. Changed or added tests use static source-text matching (`readFileSync` / `readFile` + regex assertions on app source files).

---

## 4. Essential CLI Commands

| Command | Purpose |
| :--- | :--- |
| `{{DETERMINISTIC_COMMAND}}` | Deterministic verification (must pass 0 errors) |
| `npm run pm:all` | Regenerates both `pm/KANBAN.md` and `pm/ROADMAP.md` |
| `npm run pm -- move <id> <stage>` | Move task between `0-backlog`, `1-in-progress`, `2-review`, `3-done` |
| `npm run agent:review-pack [id]` | Extracts diff, matches areas, evaluates escalation triggers, and compiles Evidence Pack |
| `npm run agent:verdict [id]` | Validates `.review/verdict-<id>.json` against review contract and required review depth |
| `npm run agent:prepare-pr [id]` | Validates verdict & architectural attestations, advances task to review, generates PR description |

---

## 5. Governing Documents & Standards Reference

Shared standards are sourced from [`ways-of-working`](https://github.com/hanyihtang2/ways-of-working):
- **Review Severity, Auto-Escalation & Proof-of-Defect:** `standards/AGENT_REVIEW_CONTRACT.md`
- **Reviewer Subagent & Architectural Checklist Specification:** `standards/TIER_1_REVIEWER_SPEC.md`
- **Verdict Schema:** `standards/schemas/review-verdict.schema.json`
- **Areas Schema:** `standards/schemas/areas.schema.json`
