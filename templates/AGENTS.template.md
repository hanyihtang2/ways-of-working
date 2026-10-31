# Repository Agent Operating Manual (AGENTS.md)

Welcome to {{REPO_NAME}}. This repository is governed by **PM-as-Code** and the **Two-Tier Agentic Review Model**.

All AI coding agents must adhere to the operating procedures below.

---

## 1. Prime Directives (Non-Negotiable Guardrails)

1. **Deterministic Priority:** An LLM review or PR preparation must **never** run on code that fails deterministic checks. Always verify `{{DETERMINISTIC_COMMAND}}` passes cleanly with 0 errors and 0 warnings before proceeding.
2. **Scope Containment:** Before modifying or adding files, inspect [`pm/areas.json`](pm/areas.json). Do not touch files outside your assigned task's `target_paths` or registered areas without documented rationale.
3. **No Self-Review:** Primary coding agents do not review their own work. Always compile an Evidence Pack (`npm run agent:review-pack`) and request an isolated fresh-context subagent review.
4. **No Ad-Hoc PR Descriptions:** Never hand-write or guess PR descriptions. Always generate them using `npm run agent:prepare-pr <TASK-ID>` to satisfy the Tier 2 GitHub Actions Quality Gate.
5. **Human Merge Authority:** AI agents do not possess auto-merge authority. Human maintainers hold the merge key.
6. **Zero-Config Local Dev & Environment Parity:** Any new environment variable (`process.env.*`) introduced in code must be documented in `.env.example`. Any external third-party service integration (OAuth, APIs, payment, storage) must work out-of-the-box in local development (`npm run dev`) with an offline/dev fallback or a clear, actionable in-UI configuration guidance banner. Client code must never hardcode localhost URLs.

---

## 2. Standard Task Lifecycle

When assigned a task (e.g. `TASK-001`):

```text
1. Inspect Task & Areas
   └── Read task spec in pm/features/<FEAT>/tasks/1-in-progress/
   └── Cross-reference target paths with pm/areas.json

2. Code & Deterministic Verification
   └── Implement changes in targeted files
   └── Run: {{DETERMINISTIC_COMMAND}} (must pass 0 errors)

3. Compile Evidence Pack
   └── Run: npm run agent:review-pack <TASK-ID>
   └── Output generated at: .review/evidence-pack-<task-id>.md

4. Tier 1 Reviewer Subagent (Fresh Context)
   └── Subagent evaluates .review/evidence-pack-<task-id>.md
   └── Subagent saves verdict to: .review/verdict-<task-id>.json
   └── (If CHANGES_REQUESTED: address blockers, max 2 iterations)

5. Prepare Pull Request
   └── Run: npm run agent:prepare-pr <TASK-ID>
   └── Auto-moves task to 2-review/, syncs KANBAN.md, and creates .review/pr-body-<task-id>.md
   └── Push branch & open PR with body-file
```

---

## 3. Essential CLI Commands

| Command | Purpose |
| :--- | :--- |
| `{{DETERMINISTIC_COMMAND}}` | Deterministic verification (must pass 0 errors) |
| `npm run pm:all` | Regenerates both `pm/KANBAN.md` and `pm/ROADMAP.md` |
| `npm run pm -- move <id> <stage>` | Move task between `0-backlog`, `1-in-progress`, `2-review`, `3-done` |
| `npm run agent:review-pack [id]` | Extracts diff, matches areas, and compiles Evidence Pack |
| `npm run agent:verdict [id]` | Validates `.review/verdict-<id>.json` against review contract |
| `npm run agent:prepare-pr [id]` | Validates verdict, advances task to review, generates PR description |

---

## 4. Governing Documents & Standards Reference

Shared standards are sourced from [`ways-of-working`](https://github.com/hanyihtang2/ways-of-working):
- **Review Severity & Proof-of-Defect:** `standards/AGENT_REVIEW_CONTRACT.md`
- **Reviewer Subagent Specification:** `standards/TIER_1_REVIEWER_SPEC.md`
- **Verdict Schema:** `standards/schemas/review-verdict.schema.json`

