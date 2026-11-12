import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  archiveExistingVerdict,
  archiveReviewVerdict,
  detectTestTheater,
  evaluateReviewEscalation,
  extractVerdictFromPrBody,
  extractVerdictPayload,
  generatePrBody,
  getVerdictIterationPath,
  getVerdictPath,
  loadEvidencePack,
  loadPriorReviewVerdicts,
  loadReviewVerdict,
  matchAreas,
  saveReviewVerdict,
  validateReviewVerdict,
} from "../dist/review.js";

describe("Objective Auto-Escalation & Adversarial Architectural Review", () => {
  it("keeps review_depth as 'standard' for localized changes in a standard-risk area without structural boundaries", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-test-std-"));
    try {
      const pmDir = path.join(tmpDir, "pm");
      fs.mkdirSync(pmDir, { recursive: true });
      fs.writeFileSync(
        path.join(pmDir, "areas.json"),
        JSON.stringify({
          areas: {
            ui: {
              title: "UI Components",
              description: "Presentational components",
              paths: ["src/components/"],
              techStack: ["typescript"],
              risk_tier: "standard",
            },
          },
        }),
        "utf-8"
      );

      const changedFiles = ["src/components/Button.tsx"];
      const diff = `diff --git a/src/components/Button.tsx b/src/components/Button.tsx\n+export const Button = () => null;`;
      const areas = matchAreas(tmpDir, changedFiles);
      const res = evaluateReviewEscalation(tmpDir, changedFiles, diff, areas.matchedAreas);

      assert.equal(res.reviewDepth, "standard");
      assert.equal(res.escalationTriggers.length, 0);
      assert.equal(res.testTheaterSuspects.length, 0);
      assert.equal(res.architecturalRubric.length, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("escalates to 'architectural' when changed files match a high-risk or structural_boundaries area", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-test-high-"));
    try {
      const pmDir = path.join(tmpDir, "pm");
      fs.mkdirSync(pmDir, { recursive: true });
      fs.writeFileSync(
        path.join(pmDir, "areas.json"),
        JSON.stringify({
          areas: {
            db: {
              title: "Database Layer",
              description: "DB client and persistence",
              paths: ["src/data/"],
              techStack: ["typescript"],
              risk_tier: "high",
              structural_boundaries: ["db-client", "env-boot"],
            },
          },
        }),
        "utf-8"
      );

      const changedFiles = ["src/data/queries.ts"];
      const diff = `diff --git a/src/data/queries.ts b/src/data/queries.ts\n+export function listItems() { return []; }`;
      const areas = matchAreas(tmpDir, changedFiles);
      assert.equal(areas.matchedAreas[0].risk_tier, "high");
      assert.deepEqual(areas.matchedAreas[0].structural_boundaries, ["db-client", "env-boot"]);

      const res = evaluateReviewEscalation(tmpDir, changedFiles, diff, areas.matchedAreas);
      assert.equal(res.reviewDepth, "architectural");
      assert.ok(res.escalationTriggers.some((t) => t.id === "high-risk-area"));
      assert.ok(res.escalationTriggers.some((t) => t.id === "structural-boundary-area"));
      assert.equal(res.architecturalRubric.length, 4);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("escalates to 'architectural' when diff alters critical surfaces (CLI entrypoints, env, auth, DB, CI, dependencies)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-test-surface-"));
    try {
      const changedFiles = [
        "scripts/seed-db.ts",
        "src/auth/session.ts",
        "src/env.ts",
        "src/db/client.ts",
        ".github/workflows/ci.yml",
        "package.json",
      ];
      const diff = `+const mode = process.env.NODE_ENV;`;
      const res = evaluateReviewEscalation(tmpDir, changedFiles, diff, []);

      assert.equal(res.reviewDepth, "architectural");
      const ids = new Set(res.escalationTriggers.map((t) => t.id));
      assert.ok(ids.has("runtime-entrypoint"));
      assert.ok(ids.has("auth-session-middleware"));
      assert.ok(ids.has("env-boot-config"));
      assert.ok(ids.has("db-client-persistence"));
      assert.ok(ids.has("build-ci-workflow"));
      assert.ok(ids.has("runtime-dependencies"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("detects static source-text regex tests ('test theater') and escalates to 'architectural'", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-test-theater-"));
    try {
      const changedFiles = ["tests/seed-guard.test.ts"];
      const readCall = ["read", "FileSync"].join("");
      const targetSrc = ["src", "db", "seed.ts"].join("/");
      const fakeTestDiff = [
        "diff --git a/tests/seed-guard.test.ts b/tests/seed-guard.test.ts",
        "+++ b/tests/seed-guard.test.ts",
        `+const src = ${readCall}('${targetSrc}', 'utf8');`,
        "+expect(src).toMatch(/NODE_ENV/);",
      ].join("\n");

      const suspects = detectTestTheater(tmpDir, changedFiles, fakeTestDiff);
      assert.equal(suspects.length, 1);
      assert.equal(suspects[0].file, "tests/seed-guard.test.ts");

      const res = evaluateReviewEscalation(tmpDir, changedFiles, fakeTestDiff, []);
      assert.equal(res.reviewDepth, "architectural");
      assert.ok(res.escalationTriggers.some((t) => t.id === "test-theater-detected"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("does NOT flag legitimate data-fixture tests (e.g. reading .json or .csv fixtures with readFileSync)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-test-fixture-"));
    try {
      const changedFiles = ["tests/importer.test.ts"];
      const readCall = ["read", "FileSync"].join("");
      const fixtureTestDiff = [
        "diff --git a/tests/importer.test.ts b/tests/importer.test.ts",
        "+++ b/tests/importer.test.ts",
        "+import { parseDataset } from '../src/importer.js';",
        `+const rawJson = ${readCall}('tests/fixtures/sample-data.json', 'utf8');`,
        "+const result = parseDataset(rawJson);",
        "+expect(result.summary).toMatch(/imported 3 rows/);",
      ].join("\n");

      const suspects = detectTestTheater(tmpDir, changedFiles, fixtureTestDiff);
      assert.equal(suspects.length, 0);

      const res = evaluateReviewEscalation(tmpDir, changedFiles, fixtureTestDiff, []);
      assert.equal(res.reviewDepth, "standard");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("validates backward-compatible standard verdicts and enforces architectural_checks when escalated", () => {
    const baseVerdict = {
      task_id: "TASK-042",
      verdict: "PASS",
      iteration: 1,
      evaluated_at: "2026-11-11T17:00:00Z",
      reviewer: "agent:reviewer-subagent",
      deterministic_checks: { build: "SUCCESS" },
      blocking_count: 0,
      summary: "All acceptance criteria satisfied with clean runtime tests.",
      findings: [],
    };

    // 1. Backward compatibility: standard verdict without review_depth or architectural_checks is valid
    const stdValidation = validateReviewVerdict(baseVerdict);
    assert.equal(stdValidation.valid, true);
    assert.deepEqual(stdValidation.errors, []);

    // 2. When requiredDepth is 'architectural', omitting review_depth: 'architectural' fails
    const missingDepthValidation = validateReviewVerdict(baseVerdict, {
      requiredDepth: "architectural",
      escalationTriggers: [
        {
          id: "high-risk-area",
          category: "area-risk-boundary",
          reason: "Matched high-risk area",
          matchedFiles: ["src/db/client.ts"],
        },
      ],
    });
    assert.equal(missingDepthValidation.valid, false);
    assert.ok(missingDepthValidation.errors.some((e) => e.includes("review_depth")));
    assert.ok(missingDepthValidation.errors.some((e) => e.includes("architectural_checks")));

    // 3. When review_depth is 'architectural', a FAIL entry in architectural_checks invalidates a PASS verdict
    const failingArchVerdict = {
      ...baseVerdict,
      review_depth: "architectural",
      architectural_checks: {
        import_boot_isolation: "PASS",
        fail_closed_defaults: "FAIL",
        write_atomicity: "PASS",
        no_test_theater: "PASS",
      },
    };
    const failArchValidation = validateReviewVerdict(failingArchVerdict, {
      requiredDepth: "architectural",
    });
    assert.equal(failArchValidation.valid, false);
    assert.ok(
      failArchValidation.errors.some((e) =>
        e.includes("architectural_checks.fail_closed_defaults is 'FAIL'")
      )
    );

    // 4. Valid architectural PASS verdict with all 4 required checks attested
    const validArchVerdict = {
      ...baseVerdict,
      review_depth: "architectural",
      architectural_checks: {
        import_boot_isolation: "PASS",
        fail_closed_defaults: "PASS",
        write_atomicity: "N/A",
        no_test_theater: "PASS",
        spec_boundary_alignment: "PASS",
      },
    };
    const passArchValidation = validateReviewVerdict(validArchVerdict, {
      requiredDepth: "architectural",
    });
    assert.equal(passArchValidation.valid, true);
    assert.deepEqual(passArchValidation.errors, []);

    // 5. Verify PR body generation includes architectural review depth and JSON block
    const prBody = generatePrBody(
      {
        id: "TASK-042",
        title: "Decouple CLI DB client boot",
        parentFeature: "FEAT-010",
        filePath: "pm/features/FEAT-010/tasks/1-in-progress/TASK-042.md",
        stage: "1-in-progress",
        objective: "Decouple CLI database client import from web server env validation.",
        acceptanceCriteria: [{ text: "CLI imports DB without web env vars", completed: true }],
        targetPaths: ["src/db/"],
        declaredAreas: ["runtime/infrastructure"],
      },
      validArchVerdict
    );
    assert.ok(prBody.includes("- **Review Depth:** `architectural`"));
    assert.ok(prBody.includes('"import_boot_isolation": "PASS"'));
  });

  it("archives Iteration 1 CHANGES_REQUESTED verdicts prior to Iteration 2 overwrite without failing on stale evidence-pack cross-checks", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-test-iter-archive-"));
    try {
      const reviewDir = path.join(tmpDir, ".review");
      fs.mkdirSync(reviewDir, { recursive: true });

      const iter1Verdict = {
        task_id: "TASK-113",
        verdict: "CHANGES_REQUESTED",
        review_depth: "standard",
        iteration: 1,
        evaluated_at: "2026-11-12T10:00:00Z",
        reviewer: "agent:reviewer-subagent",
        deterministic_checks: { build: "SUCCESS" },
        blocking_count: 1,
        summary: "Iteration 1 caught a fail-open default parameter in the seed guard.",
        findings: [
          {
            id: "F-001",
            severity: "P1",
            category: "fail-closed-defaults",
            file: "src/db/seed-guard.ts",
            line_start: 14,
            line_end: 21,
            description: "Default parameter nodeEnv = '' silently skips production check.",
            evidence: "Calling assertSafeEnvironment() with NODE_ENV=production returns without throwing.",
            suggested_fix: "Resolve process.env.NODE_ENV when nodeEnv is omitted and fail closed.",
          },
        ],
      };

      // Simulate subagent writing .review/verdict-task-113.json directly in Iteration 1
      fs.writeFileSync(
        path.join(reviewDir, "verdict-task-113.json"),
        JSON.stringify(iter1Verdict, null, 2),
        "utf-8"
      );

      // Safety-net snapshot during Iteration 2 review-pack compilation
      const archivedSafetyPath = archiveExistingVerdict(tmpDir, "TASK-113");
      assert.equal(archivedSafetyPath, getVerdictIterationPath(tmpDir, "TASK-113", 1));
      assert.equal(fs.existsSync(archivedSafetyPath), true);

      // Iteration 2 evidence pack escalates to architectural depth
      const iter2Pack = {
        taskId: "TASK-113",
        targetBranch: "main",
        currentBranch: "feat/task-113",
        timestamp: "2026-11-12T10:15:00Z",
        reviewDepth: "architectural",
        escalationTriggers: [
          {
            id: "high-risk-area",
            category: "area-risk-boundary",
            reason: "Touched runtime/infrastructure",
            matchedFiles: ["src/db/seed-guard.ts"],
          },
        ],
        testTheaterSuspects: [],
        taskSpec: {
          id: "TASK-113",
          title: "Harden seed guard",
          parentFeature: "FEAT-012",
          filePath: "pm/features/FEAT-012/tasks/1-in-progress/TASK-113.md",
          stage: "1-in-progress",
          objective: "Enforce fail-closed environment checks in seed guard.",
          acceptanceCriteria: [{ text: "Seed guard fails closed on production", completed: true }],
          targetPaths: ["src/db/"],
          declaredAreas: ["runtime/infrastructure"],
        },
        matchedAreas: [],
        outOfScopeFiles: [],
        deterministicChecks: [
          {
            name: "deterministic",
            command: "npm test",
            status: "SUCCESS",
            output: "ok",
            exitCode: 0,
            durationMs: 120,
          },
        ],
        changedFiles: ["src/db/seed-guard.ts"],
        gitDiff: "",
      };
      fs.writeFileSync(
        path.join(reviewDir, "evidence-pack-task-113.md"),
        JSON.stringify(iter2Pack, null, 2),
        "utf-8"
      );

      // Iteration 2 PASS verdict overwrites active verdict-task-113.json
      const iter2Verdict = {
        task_id: "TASK-113",
        verdict: "PASS",
        review_depth: "architectural",
        iteration: 2,
        evaluated_at: "2026-11-12T10:20:00Z",
        reviewer: "agent:architect-reviewer",
        deterministic_checks: { build: "SUCCESS", test: "SUCCESS" },
        architectural_checks: {
          import_boot_isolation: "PASS",
          fail_closed_defaults: "PASS",
          write_atomicity: "N/A",
          no_test_theater: "PASS",
        },
        blocking_count: 0,
        summary: "All Iteration 1 blockers remediated and architectural checks verified.",
        findings: [],
      };
      saveReviewVerdict(tmpDir, iter2Verdict);

      const loadedActive = loadReviewVerdict(tmpDir, "TASK-113");
      assert.equal(loadedActive.verdict, "PASS");
      assert.equal(loadedActive.iteration, 2);

      // Active verdict must pass strict cross-check against Iteration 2 evidence pack
      const loadedPack = loadEvidencePack(tmpDir, "TASK-113");
      const activeValidation = validateReviewVerdict(loadedActive, {
        requiredDepth: loadedPack.reviewDepth,
        escalationTriggers: loadedPack.escalationTriggers,
      });
      assert.equal(activeValidation.valid, true);

      // Prior Iteration 1 snapshot (review_depth: 'standard') loads cleanly without failing
      // against the overwritten Iteration 2 architectural evidence pack
      const priorVerdicts = loadPriorReviewVerdicts(tmpDir, "TASK-113", loadedActive);
      assert.equal(priorVerdicts.length, 1);
      assert.equal(priorVerdicts[0].iteration, 1);
      assert.equal(priorVerdicts[0].verdict, "CHANGES_REQUESTED");
      assert.equal(priorVerdicts[0].findings[0].id, "F-001");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("omits iteration history on single-pass PRs and renders single-JSON-fence <details> history on multi-iteration PRs", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-test-pr-history-"));
    try {
      const spec = {
        id: "TASK-113",
        title: "Harden seed guard and archive verdicts",
        parentFeature: "FEAT-012",
        filePath: "pm/features/FEAT-012/tasks/1-in-progress/TASK-113.md",
        stage: "1-in-progress",
        objective: "Preserve prior review iterations as negative knowledge in PR descriptions.",
        acceptanceCriteria: [{ text: "Preserve Iteration 1 findings in PR body", completed: true }],
        targetPaths: ["src/"],
        declaredAreas: ["core"],
      };

      // 1. Clean single-pass Iteration 1 PASS
      const singlePassVerdict = {
        task_id: "TASK-113",
        verdict: "PASS",
        review_depth: "standard",
        iteration: 1,
        evaluated_at: "2026-11-12T11:00:00Z",
        reviewer: "agent:reviewer-subagent",
        deterministic_checks: { build: "SUCCESS" },
        blocking_count: 0,
        summary: "Clean single-pass implementation.",
        findings: [],
      };

      // Even if iter1 snapshot is archived during `verdict` validation, loadPriorReviewVerdicts
      // excludes snapshots with iteration >= activeVerdict.iteration (1 >= 1).
      archiveReviewVerdict(tmpDir, singlePassVerdict);
      const singlePassPriors = loadPriorReviewVerdicts(tmpDir, "TASK-113", singlePassVerdict);
      assert.equal(singlePassPriors.length, 0);

      const cleanPrBody = generatePrBody(spec, singlePassVerdict, null, singlePassPriors);
      assert.equal(cleanPrBody.includes("<details>"), false);
      assert.equal(cleanPrBody.includes("Review Iteration History"), false);
      assert.equal((cleanPrBody.match(/```json/g) || []).length, 1);

      // 2. Multi-iteration PR (Iteration 1 CHANGES_REQUESTED -> Iteration 2 PASS)
      const iter1ChangesRequested = {
        task_id: "TASK-113",
        verdict: "CHANGES_REQUESTED",
        review_depth: "architectural",
        iteration: 1,
        evaluated_at: "2026-11-12T11:10:00Z",
        reviewer: "agent:architect-reviewer",
        deterministic_checks: { build: "SUCCESS" },
        architectural_checks: {
          import_boot_isolation: "PASS",
          fail_closed_defaults: "FAIL",
          write_atomicity: "PASS",
          no_test_theater: "PASS",
        },
        blocking_count: 2,
        summary: "Found 2 blocking defects and 1 P2 suggestion in Iteration 1.",
        findings: [
          {
            id: "F-001",
            severity: "P0",
            category: "fail-closed-defaults",
            criterion_id: "ARCH-2",
            file: "src/guard.ts",
            line_start: 10,
            line_end: 18,
            description: "Production guard bypassed when env parameter is empty.",
            evidence: "```json\n{\"bypass\": true}\n```\nMulti-line evidence snippet that must not create a second JSON fence.",
            suggested_fix: "```ts\nif (!env) throw new Error('Missing env');\n```",
          },
          {
            id: "F-002",
            severity: "P1",
            category: "scope-boundary",
            file: "src/index.ts",
            line_start: 42,
            line_end: 42,
            description: "Missing error boundary around file write.",
            evidence: "Unhandled EACCES exception when directory is read-only.",
            suggested_fix: "Ensure parent directory exists and propagate structured error.",
          },
          {
            id: "F-003",
            severity: "P2",
            category: "nit",
            file: "src/guard.ts",
            line_start: 5,
            line_end: 5,
            description: "Consider exporting guard constant for reuse in unit tests.",
            evidence: "Minor ergonomics improvement.",
            suggested_fix: "Export DEFAULT_GUARD_TIMEOUT constant.",
          },
        ],
      };

      const iter2PassVerdict = {
        task_id: "TASK-113",
        verdict: "PASS",
        review_depth: "architectural",
        iteration: 2,
        evaluated_at: "2026-11-12T11:30:00Z",
        reviewer: "agent:architect-reviewer",
        deterministic_checks: { build: "SUCCESS", test: "SUCCESS" },
        architectural_checks: {
          import_boot_isolation: "PASS",
          fail_closed_defaults: "PASS",
          write_atomicity: "PASS",
          no_test_theater: "PASS",
        },
        blocking_count: 0,
        summary: "All Iteration 1 blockers and P2 suggestions resolved cleanly.",
        findings: [],
      };

      const multiPrBody = generatePrBody(spec, iter2PassVerdict, null, [iter1ChangesRequested]);

      // Verify collapsed <details> summary and finding details
      assert.ok(multiPrBody.includes("<details>"));
      assert.ok(
        multiPrBody.includes(
          "<summary>Review Iteration History (Iteration 1: CHANGES_REQUESTED — 2 blocking P0/P1, 1 P2 resolved)</summary>"
        )
      );
      assert.ok(multiPrBody.includes("**F-001** [`P0`] [`fail-closed-defaults`] (`ARCH-2`) — `src/guard.ts` (L10-L18)"));
      assert.ok(multiPrBody.includes("**F-002** [`P1`] [`scope-boundary`] — `src/index.ts` (L42)"));
      assert.ok(multiPrBody.includes("**F-003** [`P2`] [`nit`] — `src/guard.ts` (L5)"));

      // Critical constraint: strictly 1 ```json block in the entire PR body (no triple backticks inside <details>)
      const jsonFenceMatches = multiPrBody.match(/```json/gi) || [];
      assert.equal(jsonFenceMatches.length, 1);

      const detailsSectionMatch = multiPrBody.match(/<details>[\s\S]*?<\/details>/);
      assert.ok(detailsSectionMatch);
      assert.equal(detailsSectionMatch[0].includes("```"), false);

      // Verify Tier 2 CI extraction unambiguously parses the final Iteration 2 PASS verdict
      const extracted = extractVerdictFromPrBody(multiPrBody);
      assert.ok(extracted);
      assert.equal(extracted.verdict, "PASS");
      assert.equal(extracted.iteration, 2);
      assert.equal(extracted.blocking_count, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("extracts ReviewVerdict from fenced ```json subagent messages while persisting strict raw JSON on disk", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-test-verdict-extract-"));
    try {
      const sampleVerdict = {
        task_id: "TASK-115",
        verdict: "CHANGES_REQUESTED",
        review_depth: "architectural",
        iteration: 1,
        evaluated_at: "2026-11-12T17:00:00Z",
        reviewer: "agent:architect-reviewer",
        deterministic_checks: { build: "SUCCESS", test: "SUCCESS" },
        architectural_checks: {
          import_boot_isolation: "PASS",
          fail_closed_defaults: "FAIL",
          write_atomicity: "PASS",
          no_test_theater: "PASS",
        },
        blocking_count: 1,
        summary: "Found 1 fail-closed default defect in CLI guard.",
        findings: [
          {
            id: "F-001",
            severity: "P1",
            category: "fail-closed-defaults",
            file: "src/guard.ts",
            line_start: 12,
            line_end: 18,
            description: "Default parameter skips validation.",
            evidence: "```json\n{\"env\": \"\"}\n``` triggers fail-open branch.",
            suggested_fix: "Throw when env is empty.",
          },
        ],
      };

      // 1. Subagent Markdown response with 1-3 line summary + fenced ```json block
      const markdownResponse = [
        "**Verdict:** `CHANGES_REQUESTED` (`architectural`, 1 blocking defect).",
        "See structured payload below:",
        "",
        "```json",
        JSON.stringify(sampleVerdict, null, 2),
        "```",
      ].join("\n");

      const extractedFromMd = extractVerdictPayload(markdownResponse);
      assert.ok(extractedFromMd);
      assert.equal(extractedFromMd.task_id, "TASK-115");
      assert.equal(extractedFromMd.verdict, "CHANGES_REQUESTED");
      assert.equal(extractedFromMd.findings.length, 1);
      assert.ok(extractedFromMd.findings[0].evidence.includes("```json"));

      // 2. Saving extracted verdict writes strict RAW JSON (no Markdown fences) to .review/verdict-<task-id>.json
      const { verdictPath } = saveReviewVerdict(tmpDir, extractedFromMd);
      assert.equal(verdictPath, getVerdictPath(tmpDir, "TASK-115"));
      const rawOnDisk = fs.readFileSync(verdictPath, "utf-8");
      assert.equal(rawOnDisk.trimStart().startsWith("{"), true);
      assert.equal(rawOnDisk.startsWith("```"), false);
      const parsedOnDisk = JSON.parse(rawOnDisk);
      assert.equal(parsedOnDisk.task_id, "TASK-115");

      const reloaded = loadReviewVerdict(tmpDir, "TASK-115");
      assert.ok(reloaded);
      assert.equal(reloaded.verdict, "CHANGES_REQUESTED");

      // 3. Also accepts bare raw JSON and untagged ``` fenced blocks
      const extractedRaw = extractVerdictPayload(JSON.stringify(sampleVerdict, null, 2));
      assert.ok(extractedRaw);
      assert.equal(extractedRaw.task_id, "TASK-115");

      const untaggedMd = ["Summary line.", "", "```", JSON.stringify(sampleVerdict, null, 2), "```"].join("\n");
      const extractedUntagged = extractVerdictPayload(untaggedMd);
      assert.ok(extractedUntagged);
      assert.equal(extractedUntagged.task_id, "TASK-115");

      // 4. Fail-closed negative paths: empty, non-JSON prose, array, invalid JSON
      assert.equal(extractVerdictPayload(""), null);
      assert.equal(extractVerdictPayload("Verdict looks good, no JSON here."), null);
      assert.equal(extractVerdictPayload("[1, 2, 3]"), null);
      assert.equal(extractVerdictPayload("```json\n{ invalid json }\n```"), null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
