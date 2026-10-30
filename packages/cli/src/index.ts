#!/usr/bin/env node

/**
 * Ways of Working (WoW) Universal CLI
 *
 * Unified CLI orchestrator for PM-as-Code and Two-Tier Agentic Review.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import {
  generateKanbanCommand,
  generateRoadmapCommand,
  moveTaskCommand,
} from "./pm.js";
import {
  extractTaskSpec,
  findActiveTask,
  findTaskFile,
  getGitContext,
  loadReviewVerdict,
  matchAreas,
  runDeterministicCheck,
  validateReviewVerdict,
} from "./review.js";
import type { EvidencePackData } from "./types.js";

const ROOT_DIR = process.cwd();
const args = process.argv.slice(2);
const command = args[0] || "help";

async function run() {
  switch (command) {
    case "kanban":
    case "status": {
      const p = generateKanbanCommand(ROOT_DIR);
      console.log(`\x1b[32m✔ Updated Kanban:\x1b[0m ${p}`);
      break;
    }

    case "roadmap": {
      const p = generateRoadmapCommand(ROOT_DIR);
      console.log(`\x1b[32m✔ Updated Roadmap:\x1b[0m ${p}`);
      break;
    }

    case "all": {
      generateRoadmapCommand(ROOT_DIR);
      generateKanbanCommand(ROOT_DIR);
      console.log(`\x1b[32m✔ Synchronized Kanban and Roadmap.\x1b[0m`);
      break;
    }

    case "move": {
      const task = args[1];
      const stage = args[2];
      if (!task || !stage) {
        console.error("Usage: wow move <TASK-ID> <stage: backlog|in-progress|review|done>");
        process.exit(1);
      }
      const res = moveTaskCommand(ROOT_DIR, task, stage);
      console.log(`\x1b[32m✔ Moved ${task}:\x1b[0m ${res.fromStage} -> ${res.toStage}`);
      break;
    }

    case "review-pack": {
      const taskId = args[1];
      const baseBranch = args[2] || "main";
      const taskPath = taskId ? findTaskFile(ROOT_DIR, taskId) : findActiveTask(ROOT_DIR);
      if (!taskPath) {
        console.error(`Could not locate active task.`);
        process.exit(1);
      }
      const spec = extractTaskSpec(ROOT_DIR, taskPath);
      console.log(`\x1b[35m=== Compiling Evidence Pack: ${spec.id} ===\x1b[0m`);

      const detCheck = runDeterministicCheck(ROOT_DIR);
      if (detCheck.status !== "SUCCESS") {
        console.error(`\x1b[31mDeterministic check failed:\x1b[0m ${detCheck.command}`);
        console.error(detCheck.output);
        process.exit(1);
      }

      const git = getGitContext(ROOT_DIR, baseBranch);
      const areas = matchAreas(ROOT_DIR, git.changedFiles);

      const reviewDir = path.join(ROOT_DIR, ".review");
      if (!fs.existsSync(reviewDir)) fs.mkdirSync(reviewDir, { recursive: true });

      const packData: EvidencePackData = {
        taskId: spec.id,
        targetBranch: baseBranch,
        currentBranch: git.currentBranch,
        timestamp: new Date().toISOString(),
        taskSpec: spec,
        matchedAreas: areas.matchedAreas,
        outOfScopeFiles: areas.outOfScopeFiles,
        deterministicChecks: [detCheck],
        changedFiles: git.changedFiles,
        gitDiff: git.gitDiff,
      };

      const outPath = path.join(reviewDir, `evidence-pack-${spec.id.toLowerCase()}.md`);
      fs.writeFileSync(outPath, JSON.stringify(packData, null, 2), "utf-8");
      console.log(`\x1b[32m✔ Generated Evidence Pack:\x1b[0m ${outPath}`);
      break;
    }

    case "verdict": {
      const taskId = args[1];
      if (!taskId) {
        console.error("Usage: wow verdict <TASK-ID>");
        process.exit(1);
      }
      const v = loadReviewVerdict(ROOT_DIR, taskId);
      if (!v) {
        console.error(`No verdict found for ${taskId} in .review/verdict-${taskId.toLowerCase()}.json`);
        process.exit(1);
      }
      const validation = validateReviewVerdict(v);
      if (!validation.valid) {
        console.error("Verdict validation failed:");
        validation.errors.forEach((e) => console.error(`  - ${e}`));
        process.exit(1);
      }
      console.log(`\x1b[32m✔ Verdict Valid:\x1b[0m ${v.verdict} (${v.blocking_count} blockers)`);
      break;
    }

    case "prepare-pr": {
      const taskId = args[1];
      const taskPath = taskId ? findTaskFile(ROOT_DIR, taskId) : findActiveTask(ROOT_DIR);
      if (!taskPath) {
        console.error("Could not locate active task.");
        process.exit(1);
      }
      const spec = extractTaskSpec(ROOT_DIR, taskPath);
      console.log(`\x1b[35m=== Preparing PR for ${spec.id} ===\x1b[0m`);

      const v = loadReviewVerdict(ROOT_DIR, spec.id);
      if (!v || v.verdict !== "PASS") {
        console.error(`Tier 1 review verdict must be PASS (found: ${v?.verdict || "missing"}).`);
        process.exit(1);
      }

      moveTaskCommand(ROOT_DIR, spec.id, "review");
      console.log(`\x1b[32m✔ Task moved to review & boards synchronized.\x1b[0m`);
      break;
    }

    case "help":
    default: {
      console.log(`
\x1b[35mWays of Working (WoW) CLI\x1b[0m

Commands:
  wow kanban                   Regenerate pm/KANBAN.md board
  wow roadmap                  Regenerate pm/ROADMAP.md table
  wow all                      Regenerate both Kanban and Roadmap
  wow move <ID> <stage>        Move task (backlog | in-progress | review | done)
  wow review-pack [ID]         Run checks, extract diff, compile Evidence Pack
  wow verdict <ID>             Validate review verdict JSON against schema
  wow prepare-pr [ID]          Validate verdict, advance stage, prepare PR
`);
      break;
    }
  }
}

run().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
