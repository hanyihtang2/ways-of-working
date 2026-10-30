# Sibling Repository Adoption Guide

How to adopt PM-as-Code and the Two-Tier Agentic Review Model in any sibling repository (`PlateMark`, `MAKER`, `CommuteShift`, etc.).

---

## 1. Quick Setup (3 Steps)

### Step 1: Add `pm/areas.json`
Create `pm/areas.json` to define your repository's architectural domains and deterministic verification command:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "version": "1.0.0",
  "config": {
    "deterministicCommand": "npm test && npm run build"
  },
  "areas": {
    "core": {
      "title": "Core Domain",
      "description": "Main business logic and services.",
      "paths": ["src/"],
      "techStack": ["typescript"]
    }
  }
}
```

### Step 2: Add `AGENTS.md` at Repository Root
Copy `templates/AGENTS.template.md` to your repository root as `AGENTS.md`. Customize the title and deterministic test command.

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
# 1. Regenerate task boards
npm run pm:all

# 2. Compile an isolated evidence pack for Tier 1 subagent review
npm run agent:review-pack TASK-001

# 3. Validate Tier 1 verdict
npm run agent:verdict TASK-001

# 4. Prepare PR (advances task to review & generates PR description)
npm run agent:prepare-pr TASK-001
```
