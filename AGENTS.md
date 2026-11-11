# Repository Agent Operating Manual (AGENTS.md)

Welcome to **Ways of Working (WoW)**. This repository hosts the universal standards, schemas, templates, and CLI tools for PM-as-Code and Two-Tier Agentic Review.

---

## 1. Prime Directives

1. **Standard Stability & Framework Agnosticism:** Changes to `standards/` and `schemas/` must remain backwards-compatible with downstream adopting repositories (`portfolio`, `PlateMark`, `MAKER`, `CommuteShift`) and strictly language/framework-agnostic.
2. **Pre-Coding Spec Challenge & Boundary Sanity Check:** Before writing any code, validate task instructions against repository ADRs and runtime/trust boundaries (`client` vs. `server` vs. `edge` vs. `cli`). If a task spec conflicts with an ADR or runtime boundary, stop and escalate or propose a structural split rather than shipping a workaround.
3. **Deterministic Checks:** Always ensure TypeScript compiles cleanly (`npm run build`) and deterministic tests pass (`npm test`) before preparing changes.
4. **No Unstructured Reviews & Objective Auto-Escalation:** All automated reviews across projects must adhere to `standards/AGENT_REVIEW_CONTRACT.md`, automatically escalating to `review_depth: "architectural"` with `architectural_checks` attestations whenever objective escalation triggers fire.
5. **Authentic Behavioral Testing (No Test Theater):** Unit tests must verify runtime behavior (including fail-closed negative paths) rather than reading application source files via `fs.readFileSync` + regex (`P1` Blocker).
6. **Zero-Config Local Dev & Environment Parity:** New configuration keys must be documented in `.env.example`, and standards must mandate out-of-the-box local development resilience across all adopting repositories.

---

## 2. Repository Structure

```text
ways-of-working/
├── standards/             # Canonical review contracts & verdict/areas schemas
├── templates/             # Starter templates for downstream repositories
├── packages/
│   └── cli/               # The Universal PM-as-Code & Review CLI
├── docs/                  # Architecture & adoption documentation
├── public/                # Machine-readable LLM indexes (llms.txt)
└── .github/workflows/     # Reusable Tier 2 GitHub Quality Gate
```
