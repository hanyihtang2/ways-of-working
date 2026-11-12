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
  archiveExistingVerdict,
  archiveReviewVerdict,
  evaluateReviewEscalation,
  extractTaskSpec,
  findActiveTask,
  findTaskFile,
  generatePrBody,
  getGitContext,
  loadEvidencePack,
  loadPriorReviewVerdicts,
  loadReviewVerdict,
  matchAreas,
  runDeterministicCheck,
  saveReviewVerdict,
  validateReviewVerdict,
} from "./review.js";
import type { EvidencePackData, ReviewVerdict } from "./types.js";

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
      const escalation = evaluateReviewEscalation(
        ROOT_DIR,
        git.changedFiles,
        git.gitDiff,
        areas.matchedAreas
      );

      const reviewDir = path.join(ROOT_DIR, ".review");
      if (!fs.existsSync(reviewDir)) fs.mkdirSync(reviewDir, { recursive: true });

      const archivedIterPath = archiveExistingVerdict(ROOT_DIR, spec.id);
      if (archivedIterPath) {
        console.log(`\x1b[36mℹ Archived prior iteration verdict:\x1b[0m ${archivedIterPath}`);
      }

      const packData: EvidencePackData = {
        taskId: spec.id,
        targetBranch: baseBranch,
        currentBranch: git.currentBranch,
        timestamp: new Date().toISOString(),
        reviewDepth: escalation.reviewDepth,
        escalationTriggers: escalation.escalationTriggers,
        testTheaterSuspects: escalation.testTheaterSuspects,
        architecturalRubric:
          escalation.architecturalRubric.length > 0 ? escalation.architecturalRubric : undefined,
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
      console.log(
        `\x1b[36mℹ Review Depth:\x1b[0m ${escalation.reviewDepth.toUpperCase()} (${escalation.escalationTriggers.length} escalation trigger(s))`
      );
      if (escalation.escalationTriggers.length > 0) {
        for (const t of escalation.escalationTriggers) {
          console.log(`  \x1b[33m⚡ [${t.id}]\x1b[0m ${t.reason}`);
        }
      }
      if (escalation.testTheaterSuspects.length > 0) {
        console.warn(
          `\x1b[31m⚠ Test Theater Suspect(s) Detected (P1 Blocker risk):\x1b[0m`
        );
        for (const s of escalation.testTheaterSuspects) {
          console.warn(`  - ${s.file}:${s.line ?? 1} (${s.pattern})`);
        }
      }
      break;
    }

    case "save-verdict":
    case "verdict": {
      const isExplicitSave =
        command === "save-verdict" || (args[1] && args[1].toLowerCase() === "save");
      const taskId = isExplicitSave && args[1]?.toLowerCase() === "save" ? args[2] : args[1];
      const sourceArg = isExplicitSave && args[1]?.toLowerCase() === "save" ? args[3] : args[2];

      if (!taskId) {
        console.error("Usage: wow verdict <TASK-ID> [json-file]");
        process.exit(1);
      }

      if (sourceArg) {
        const rawJson = fs.existsSync(sourceArg)
          ? fs.readFileSync(sourceArg, "utf-8")
          : sourceArg;
        let parsedInput: ReviewVerdict;
        try {
          parsedInput = JSON.parse(rawJson) as ReviewVerdict;
        } catch {
          console.error(`Failed to parse verdict JSON from '${sourceArg}'.`);
          process.exit(1);
        }
        saveReviewVerdict(ROOT_DIR, parsedInput);
      }

      const v = loadReviewVerdict(ROOT_DIR, taskId);
      if (!v) {
        console.error(`No verdict found for ${taskId} in .review/verdict-${taskId.toLowerCase()}.json`);
        process.exit(1);
      }
      const pack = loadEvidencePack(ROOT_DIR, taskId);
      const validation = validateReviewVerdict(v, {
        requiredDepth: pack?.reviewDepth,
        escalationTriggers: pack?.escalationTriggers,
      });
      if (!validation.valid) {
        console.error("Verdict validation failed:");
        validation.errors.forEach((e) => console.error(`  - ${e}`));
        process.exit(1);
      }

      const archivedPath = archiveReviewVerdict(ROOT_DIR, v);
      const depthLabel = v.review_depth || pack?.reviewDepth || "standard";
      console.log(
        `\x1b[32m✔ Verdict Valid:\x1b[0m ${v.verdict} [depth=${depthLabel}, iter=${v.iteration}] (${v.blocking_count} blockers)`
      );
      if (archivedPath) {
        console.log(`\x1b[36mℹ Snapshot preserved:\x1b[0m ${archivedPath}`);
      }
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

      const pack = loadEvidencePack(ROOT_DIR, spec.id);
      const validation = validateReviewVerdict(v, {
        requiredDepth: pack?.reviewDepth,
        escalationTriggers: pack?.escalationTriggers,
      });
      if (!validation.valid) {
        console.error("Cannot prepare PR — verdict failed contract validation:");
        validation.errors.forEach((e) => console.error(`  - ${e}`));
        process.exit(1);
      }

      const priorVerdicts = loadPriorReviewVerdicts(ROOT_DIR, spec.id, v);
      const reviewDir = path.join(ROOT_DIR, ".review");
      if (!fs.existsSync(reviewDir)) fs.mkdirSync(reviewDir, { recursive: true });
      const prBodyPath = path.join(reviewDir, `pr-body-${spec.id.toLowerCase()}.md`);
      fs.writeFileSync(prBodyPath, generatePrBody(spec, v, pack, priorVerdicts), "utf-8");

      moveTaskCommand(ROOT_DIR, spec.id, "review");
      console.log(`\x1b[32m✔ Task moved to review & boards synchronized.\x1b[0m`);
      if (priorVerdicts.length > 0) {
        console.log(
          `\x1b[36mℹ Included ${priorVerdicts.length} prior review iteration(s) in PR history.\x1b[0m`
        );
      }
      console.log(`\x1b[32m✔ Generated PR Body:\x1b[0m ${prBodyPath}`);
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
  wow review-pack [ID]         Run checks, extract diff, evaluate escalation, compile Evidence Pack
  wow verdict <ID> [file]      Validate (and optionally save) review verdict JSON & snapshot iteration
  wow prepare-pr [ID]          Validate verdict & architectural sign-off, advance stage, prepare PR
`);
      break;
    }
  }
}

run().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
