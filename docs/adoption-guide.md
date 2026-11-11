# Sibling Repository Adoption Guide

How to adopt PM-as-Code and the Two-Tier Agentic Review Model in any sibling repository (`PlateMark`, `MAKER`, `CommuteShift`, etc.).

---

## 1. Quick Setup (3 Steps)

### Step 1: Add `pm/areas.json` with Risk & Boundary Metadata
Create `pm/areas.json` to define your repository's architectural domains, deterministic verification command, `risk_tier`, and `structural_boundaries`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "version": "1.1.0",
  "config": {
    "deterministicCommand": "npm test && npm run build"
  },
  "areas": {
    "core": {
      "title": "Core Domain",
      "description": "Main business logic and services.",
      "paths": ["src/"],
      "techStack": ["typescript"],
      "risk_tier": "standard",
      "structural_boundaries": ["client-server-boundary"]
    },
    "runtime/infrastructure": {
      "title": "Runtime Boot, Persistence & CLI Entrypoints",
      "description": "Environment validation, database client, auth sessions, and CLI scripts.",
      "paths": ["src/db/", "src/auth/", "src/env", "scripts/"],
      "techStack": ["typescript", "node"],
      "risk_tier": "high",
      "structural_boundaries": ["env-boot", "db-client", "auth-session", "cli-entrypoint"]
    }
  }
}
```

### Step 2: Add `AGENTS.md` at Repository Root
Copy `templates/AGENTS.template.md` to your repository root as `AGENTS.md`. Customize the title and deterministic test command. This enables the **Pre-Coding Spec Challenge Protocol**, **Objective Auto-Escalation**, and **Anti-Test-Theater** rules.

### Step 3: Add the Tier 2 CI Workflow
Add `.github/workflows/agent-quality-gate.yml` referencing the reusable workflow:

```yaml
name: Agent Quality Gate

on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened, edited]

jobs:
  gate:
    uses: hanyihtang2/ways-of-working/.github/workflows/agent-quality-gate.yml@main
    with:
      node-version: "22"
      build-command: "npm test"
```

---

## 2. Daily Developer / Agent Workflow

```bash
# 0. Pre-Coding Spec Challenge: verify task spec against ADRs and pm/areas.json boundaries

# 1. Regenerate task boards
npm run pm:all

# 2. Compile an isolated evidence pack (auto-evaluates review_depth: standard | architectural)
npm run agent:review-pack TASK-001

# 3. Validate Tier 1 verdict (and architectural_checks when escalated)
npm run agent:verdict TASK-001

# 4. Prepare PR (advances task to review & generates PR description)
npm run agent:prepare-pr TASK-001
```
