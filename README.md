# Ways of Working (WoW)

> The canonical developer platform, standards, and automation engine for **PM-as-Code** and the **Two-Tier Agentic Review Model**.

---

## 🎯 What is this repository?

As software development shifts toward autonomous AI agents, standard software engineering processes require fundamental upgrades:
1. **PM-as-Code:** Eliminates disconnected ticket tracking by maintaining PRDs, task states, roadmaps, and Kanban boards natively in Git alongside code.
2. **Pre-Coding Spec Challenge:** Mandates that coding agents validate task instructions against repository ADRs and runtime boundaries (`client` vs. `server` vs. `edge` vs. `cli`) *before* writing code.
3. **Two-Tier Agentic Review with Objective Auto-Escalation:** Eliminates self-review confirmation bias and shallow checklist reviews by orchestrating isolated, fresh-context reviewer subagents (Tier 1), automatic architectural review escalation (`standard` vs. `architectural`), and remote CI quality gates (Tier 2).

This repository serves as the **upstream source of truth** across projects (`portfolio`, `PlateMark`, `MAKER`, `CommuteShift`).

---

## 📁 Repository Organization

```text
ways-of-working/
├── standards/                         # Canonical specifications & contracts
│   ├── AGENT_REVIEW_CONTRACT.md       # P0/P1/P2 taxonomy, auto-escalation, proof-of-defect
│   ├── TIER_1_REVIEWER_SPEC.md        # Fresh-context subagent spec & architectural rubric
│   └── schemas/
│       ├── review-verdict.schema.json # Universal JSON schema for review verdicts
│       └── areas.schema.json          # Schema for pm/areas.json risk & boundary metadata
│
├── templates/                         # Scaffolding templates for projects
│   ├── AGENTS.template.md             # Starter AI agent operating manual
│   ├── prd-template.md                # Feature specification template
│   ├── task-template.md               # Execution task template
│   ├── areas.template.json            # Architecture, risk_tier & boundary mapping
│   └── pull_request_template.md       # PR template matching Tier 2 CI gate
│
├── packages/
│   └── cli/                           # Unified WoW CLI (@org/ways-of-working-cli)
│       └── src/ (kanban, roadmap, review-pack, verdict, prepare-pr)
│
├── docs/                              # Architecture & adoption guides
│   ├── pm-as-code.md                  # PM-as-Code philosophy & task lifecycle
│   ├── two-tier-agent-review.md       # Inner loop, auto-escalation & outer loop design
│   └── adoption-guide.md              # 3-step setup guide for new repositories
│
├── public/
│   └── llms.txt                       # Machine-readable discovery index for LLMs
│
└── .github/
    └── workflows/
        └── agent-quality-gate.yml     # Reusable Tier 2 GitHub Quality Gate
```

---

## 🚀 Quick Adoption (3 Steps)

### 1. Configure Boundaries (`pm/areas.json`)
Copy [`templates/areas.template.json`](templates/areas.template.json) to `pm/areas.json` in your repository (including `risk_tier` and `structural_boundaries`).

### 2. Add Agent Manual (`AGENTS.md`)
Copy [`templates/AGENTS.template.md`](templates/AGENTS.template.md) to `AGENTS.md` at your repository root.

### 3. Wire CI Quality Gate
Reference the reusable workflow in your project's `.github/workflows/quality-gate.yml`:

```yaml
name: Agent Quality Gate

on:
  pull_request:
    branches: [main]

jobs:
  gate:
    uses: hanyihtang2/ways-of-working/.github/workflows/agent-quality-gate.yml@main
    with:
      node-version: "22"
      build-command: "npm test"
```

---

## 📜 Governing Standards

- **[Agent Review Contract](standards/AGENT_REVIEW_CONTRACT.md):** P0 (Blocker), P1 (High), P2 (Nit), Pre-Coding Spec Challenge, objective auto-escalation, proof-of-defect, max 2 iterations.
- **[Tier 1 Reviewer Specification](standards/TIER_1_REVIEWER_SPEC.md):** Isolated fresh context, read-only tools, 5 core evaluation axes + 4 adversarial architectural trace checks.
- **[Review Verdict Schema](standards/schemas/review-verdict.schema.json):** Strict backward-compatible schema for machine-readable review verdicts (`review_depth` and `architectural_checks`).
- **[Areas Schema](standards/schemas/areas.schema.json):** Schema for domain boundaries, `risk_tier`, and `structural_boundaries`.
