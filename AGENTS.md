# Repository Agent Operating Manual (AGENTS.md)

Welcome to **Ways of Working (WoW)**. This repository hosts the universal standards, schemas, templates, and CLI tools for PM-as-Code and Two-Tier Agentic Review.

---

## 1. Prime Directives

1. **Standard Stability:** Changes to `standards/` and `schemas/` must remain backwards-compatible with downstream adopting repositories (`portfolio`, `PlateMark`, `MAKER`, `CommuteShift`).
2. **Deterministic Checks:** Always ensure TypeScript compiles cleanly (`npm run build`) before preparing changes.
3. **No Unstructured Reviews:** All automated reviews across projects must adhere to `standards/AGENT_REVIEW_CONTRACT.md`.

---

## 2. Repository Structure

```text
ways-of-working/
├── standards/             # Canonical review contracts & verdict schema
├── templates/             # Starter templates for downstream repositories
├── packages/
│   └── cli/               # The Universal PM-as-Code & Review CLI
├── docs/                  # Architecture & adoption documentation
├── public/                # Machine-readable LLM indexes (llms.txt)
└── .github/workflows/     # Reusable Tier 2 GitHub Quality Gate
```
