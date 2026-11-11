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
- **Review Depth:** `standard` <!-- or `architectural` when escalation triggers apply -->
- **Iteration Count:** `1` of `2`
- **Reviewer:** `agent:reviewer-subagent`
- **Blocking Count (P0 + P1):** `0`

```json
{
  "task_id": "{{TASK_ID}}",
  "verdict": "PASS",
  "review_depth": "standard",
  "iteration": 1,
  "evaluated_at": "{{TIMESTAMP}}",
  "reviewer": "agent:reviewer-subagent",
  "deterministic_checks": {
    "build": "SUCCESS"
  },
  "architectural_checks": {
    "import_boot_isolation": "PASS",
    "fail_closed_defaults": "PASS",
    "write_atomicity": "N/A",
    "no_test_theater": "PASS"
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

- [ ] Pre-Coding Spec Challenge completed: task instructions verified against repository ADRs and runtime boundaries (`client` / `server` / `edge` / `cli`).
- [ ] All modified files reside within domains mapped in [`pm/areas.json`](pm/areas.json).
- [ ] No files outside the task's declared `target_paths` were modified without documented rationale.
- [ ] When `review_depth: "architectural"` applies, all four `architectural_checks` (`import_boot_isolation`, `fail_closed_defaults`, `write_atomicity`, `no_test_theater`) are attested.
- [ ] No secrets, tokens, or private credentials committed.
- [ ] Deterministic behavioral tests pass locally with zero regressions and zero static source-regex test theater.

---

## Human Reviewer Sign-Off

> [!IMPORTANT]
> Merging to `main` requires manual review and sign-off by a human repository maintainer. Automated agents do not possess direct merge authority.
