import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  detectTestTheater,
  evaluateReviewEscalation,
  generatePrBody,
  matchAreas,
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
});
