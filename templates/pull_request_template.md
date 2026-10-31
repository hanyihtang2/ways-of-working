## Summary of Intent

<!-- Provide a concise description of the changes introduced in this PR and why they were made. -->

---

## Task & PRD Reference

- **Parent Feature:** `pm/features/{{FEAT_ID}}`
- **Task ID:** `{{TASK_ID}}`
- **Governing PRD:** [PRD Document](pm/features/{{FEAT_ID}}/prd.md)
- **Task Specification:** [Task Document](pm/features/{{FEAT_ID}}/tasks/{{STAGE}}/{{TASK_ID}}.md)

---

## Acceptance Criteria Checklist

<!-- Check off all acceptance criteria verified in this task -->
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

---

## Tier 1 Subagent Review Evidence

> **Standard Reference:** [`pm/standards/AGENT_REVIEW_CONTRACT.md`](pm/standards/AGENT_REVIEW_CONTRACT.md)

### Review Verdict

- **Verdict:** `PASS`
- **Iteration Count:** `1` of `2`
- **Reviewer:** `agent:reviewer-subagent`
- **Blocking Count (P0 + P1):** `0`

```json
{
  "task_id": "{{TASK_ID}}",
  "verdict": "PASS",
  "iteration": 1,
  "deterministic_checks": {
    "build": "SUCCESS"
  },
  "blocking_count": 0,
  "summary": "Verified all criteria against unified diff. Zero blockers found.",
  "findings": []
}
```

### Deterministic Build Verification

- **Command:** `npm run build`
- **Status:** `SUCCESS` (0 errors, 0 warnings)

### Non-Blocking Suggestions (P2 Findings)

- _None_

---

## Scope & Boundary Audit

- [ ] All modified files reside within domains mapped in [`pm/areas.json`](pm/areas.json).
- [ ] No files outside the task's declared `target_paths` were modified without documented rationale.
- [ ] No secrets, tokens, or private credentials committed.
- [ ] Deterministic tests pass locally with zero regressions.

---

## Human Reviewer Sign-Off

> [!IMPORTANT]
> Merging to `main` requires manual review and sign-off by a human repository maintainer. Automated agents do not possess direct merge authority.

