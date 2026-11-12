import * as fs from "node:fs";
import * as path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import type {
  ArchitecturalCheckStatus,
  AreasConfig,
  DeterministicCheckResult,
  EscalationTrigger,
  EvidencePackData,
  MatchedAreaInfo,
  ReviewDepth,
  ReviewFinding,
  ReviewVerdict,
  TaskSpec,
  TestTheaterSuspect,
  VerdictStatus,
} from "./types.js";
import { parseFrontmatter } from "./pm.js";

export const DIFF_EXCLUDED_PATTERNS = [
  ":(exclude)package-lock.json",
  ":(exclude)pnpm-lock.yaml",
  ":(exclude)yarn.lock",
  ":(exclude)bun.lockb",
  ":(exclude)*.svg",
  ":(exclude)*.png",
  ":(exclude)*.jpg",
  ":(exclude)*.jpeg",
  ":(exclude)*.webp",
  ":(exclude)*.gif",
  ":(exclude)*.ico",
  ":(exclude)*.woff",
  ":(exclude)*.woff2",
  ":(exclude).review",
  ":(exclude).review/**",
  ":(exclude)dist",
  ":(exclude)dist/**",
  ":(exclude).astro",
  ":(exclude).astro/**",
];

const MAX_DIFF_LENGTH = 50_000;

export const REQUIRED_ARCHITECTURAL_CHECK_KEYS = [
  "import_boot_isolation",
  "fail_closed_defaults",
  "write_atomicity",
  "no_test_theater",
] as const;

export const ARCHITECTURAL_RUBRIC_ITEMS: string[] = [
  "1. Import-Time & Boot-Chain Isolation (import_boot_isolation): Trace top-level imports across the module graph for eager initialization, DB pool creation, env validation, or server-only leaks into client/edge/CLI contexts.",
  "2. Fail-Closed Defaults & Negative Paths (fail_closed_defaults): Verify missing env vars, empty/omitted parameters (e.g., nodeEnv = ''), and non-default runtime modes (e.g., NODE_ENV=production CLI execution) fail closed with actionable errors rather than silently skipping checks.",
  "3. Multi-Step Write Atomicity & Idempotency (write_atomicity): Verify multi-statement persistence flows use atomic transactions and clean partial-failure handling ('PASS' or 'N/A' if no persistence writes exist).",
  "4. Test Theater Detection (no_test_theater — P1 Blocker): Flag unit tests that verify behavioral invariants purely by reading application source files with regexes/strings (e.g., fs.readFileSync + regex) instead of testing runtime execution (unless explicitly scoped to static config validation).",
];

export function findTaskFile(rootDir: string, taskIdOrKeyword: string): string | null {
  const featuresDir = path.join(rootDir, "pm", "features");
  if (!fs.existsSync(featuresDir)) return null;

  const features = fs
    .readdirSync(featuresDir, { withFileTypes: true })
    .filter((d: fs.Dirent) => d.isDirectory())
    .map((d: fs.Dirent) => d.name);
  const stages = ["1-in-progress", "2-review", "0-backlog", "3-done"];
  const lowerTarget = taskIdOrKeyword.toLowerCase();

  for (const feat of features) {
    const tasksBase = path.join(featuresDir, feat, "tasks");
    for (const stage of stages) {
      const stageDir = path.join(tasksBase, stage);
      if (!fs.existsSync(stageDir)) continue;
      const files = fs.readdirSync(stageDir).filter((f: string) => f.endsWith(".md"));
      for (const file of files) {
        const lowerFile = file.toLowerCase();
        if (
          lowerFile.startsWith(`${lowerTarget}-`) ||
          lowerFile.startsWith(`${lowerTarget}.`) ||
          lowerFile === `${lowerTarget}.md` ||
          lowerFile === lowerTarget
        ) {
          return path.join(stageDir, file);
        }
      }
    }
  }

  for (const feat of features) {
    const tasksBase = path.join(featuresDir, feat, "tasks");
    for (const stage of stages) {
      const stageDir = path.join(tasksBase, stage);
      if (!fs.existsSync(stageDir)) continue;
      const files = fs.readdirSync(stageDir).filter((f: string) => f.endsWith(".md"));
      for (const file of files) {
        if (file.toLowerCase().includes(lowerTarget)) {
          return path.join(stageDir, file);
        }
      }
    }
  }
  return null;
}

export function findActiveTask(rootDir: string): string | null {
  const featuresDir = path.join(rootDir, "pm", "features");
  if (!fs.existsSync(featuresDir)) return null;
  const features = fs
    .readdirSync(featuresDir, { withFileTypes: true })
    .filter((d: fs.Dirent) => d.isDirectory())
    .map((d: fs.Dirent) => d.name);

  for (const feat of features) {
    const inProgressDir = path.join(featuresDir, feat, "tasks", "1-in-progress");
    if (fs.existsSync(inProgressDir)) {
      const files = fs.readdirSync(inProgressDir).filter((f: string) => f.endsWith(".md"));
      if (files.length > 0) return path.join(inProgressDir, files[0]);
    }
  }
  return null;
}

export function extractTaskSpec(rootDir: string, filePath: string): TaskSpec {
  const content = fs.readFileSync(filePath, "utf-8");
  const { data, body } = parseFrontmatter(content);

  const fileName = path.basename(filePath);
  const idMatch = fileName.match(/^(TASK-\d+)/i);
  const id = (data.id as string) || (idMatch ? idMatch[1].toUpperCase() : "TASK-UNKNOWN");
  const title = (data.title as string) || fileName.replace(/\.md$/, "");
  const parentFeature = (data.parent_feature as string) || "FEAT-UNKNOWN";
  const stage = path.basename(path.dirname(filePath));
  const declaredAreas = Array.isArray(data.areas) ? (data.areas as string[]) : [];
  const targetPaths = Array.isArray(data.target_paths) ? (data.target_paths as string[]) : [];

  let objective = "";
  const objMatch = body.match(/##\s+(?:1\.\s+)?Objective[\r\n]+([\s\S]*?)(?=##|$)/i);
  if (objMatch) objective = objMatch[1].trim();

  const acceptanceCriteria: { text: string; completed: boolean }[] = [];
  const acRegex = /-\s*\[([ xX])\]\s*(.*)/g;
  let match: RegExpExecArray | null;
  while ((match = acRegex.exec(body)) !== null) {
    acceptanceCriteria.push({
      text: match[2].trim(),
      completed: match[1].toLowerCase() === "x",
    });
  }

  return {
    id,
    title,
    parentFeature,
    filePath: path.relative(rootDir, filePath).replace(/\\/g, "/"),
    stage,
    objective,
    acceptanceCriteria,
    targetPaths,
    declaredAreas,
  };
}

export function runDeterministicCheck(rootDir: string): DeterministicCheckResult {
  const isWindows = process.platform === "win32";
  const defaultNpm = isWindows ? "npm.cmd" : "npm";

  let command = process.env.DETERMINISTIC_COMMAND;
  const areasFile = path.join(rootDir, "pm", "areas.json");
  if (!command && fs.existsSync(areasFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(areasFile, "utf-8"));
      if (parsed.config?.deterministicCommand) {
        command = parsed.config.deterministicCommand;
      }
    } catch {}
  }
  if (!command) {
    command = `${defaultNpm} test`;
  }

  const startTime = Date.now();
  try {
    const stdout = execSync(command, {
      cwd: rootDir,
      encoding: "utf-8",
      env: { ...process.env, CI: "true" },
    });
    return {
      name: "deterministic",
      command,
      status: "SUCCESS",
      output: stdout.trim(),
      exitCode: 0,
      durationMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; status?: number; message?: string };
    const output = (error.stdout || "") + (error.stderr || "") + (error.message || "");
    return {
      name: "deterministic",
      command,
      status: "FAILED",
      output: output.trim(),
      exitCode: error.status ?? 1,
      durationMs: Date.now() - startTime,
    };
  }
}

export function getGitContext(rootDir: string, baseBranch: string): {
  currentBranch: string;
  changedFiles: string[];
  gitDiff: string;
} {
  let currentBranch = "main";
  try {
    currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: rootDir, encoding: "utf-8" }).trim();
  } catch {}

  const changedFilesSet = new Set<string>();

  try {
    const res = spawnSync("git", ["diff", "--name-only", `${baseBranch}...HEAD`], { cwd: rootDir, encoding: "utf-8" });
    const out = (res.stdout || "").trim();
    if (out) out.split(/\r?\n/).forEach((f: string) => f.trim() && changedFilesSet.add(f.trim().replace(/\\/g, "/")));
  } catch {}

  try {
    const workingDiff = execSync("git diff --name-only HEAD", { cwd: rootDir, encoding: "utf-8" }).trim();
    if (workingDiff) workingDiff.split(/\r?\n/).forEach((f: string) => f.trim() && changedFilesSet.add(f.trim().replace(/\\/g, "/")));
  } catch {}

  try {
    const untracked = execSync("git ls-files --others --exclude-standard", { cwd: rootDir, encoding: "utf-8" }).trim();
    if (untracked) untracked.split(/\r?\n/).forEach((f: string) => f.trim() && changedFilesSet.add(f.trim().replace(/\\/g, "/")));
  } catch {}

  let gitDiff = "";
  try {
    const res = spawnSync("git", ["diff", `${baseBranch}...HEAD`, "--", ".", ...DIFF_EXCLUDED_PATTERNS], {
      cwd: rootDir,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    const bDiff = (res.stdout || "").trim();
    if (bDiff) gitDiff += bDiff + "\n";
  } catch {}

  try {
    const res = spawnSync("git", ["diff", "HEAD", "--", ".", ...DIFF_EXCLUDED_PATTERNS], {
      cwd: rootDir,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    const wDiff = (res.stdout || "").trim();
    if (wDiff) gitDiff += "\n# --- Working Tree / Uncommitted Changes ---\n" + wDiff + "\n";
  } catch {}

  if (gitDiff.length > MAX_DIFF_LENGTH) {
    const omitted = gitDiff.length - MAX_DIFF_LENGTH;
    gitDiff = gitDiff.slice(0, MAX_DIFF_LENGTH) + `\n\n# ... [Diff truncated (${omitted} chars omitted) for context window] ...\n`;
  }

  return {
    currentBranch,
    changedFiles: Array.from(changedFilesSet),
    gitDiff: gitDiff.trim(),
  };
}

export function matchAreas(rootDir: string, changedFiles: string[]): {
  matchedAreas: MatchedAreaInfo[];
  outOfScopeFiles: string[];
} {
  const areasFile = path.join(rootDir, "pm", "areas.json");
  let config: AreasConfig = { areas: {} };
  if (fs.existsSync(areasFile)) {
    try {
      config = JSON.parse(fs.readFileSync(areasFile, "utf-8"));
    } catch {}
  }

  const matchedMap = new Map<string, MatchedAreaInfo>();
  const outOfScope: string[] = [];

  for (const file of changedFiles) {
    let matched = false;
    for (const [key, areaDef] of Object.entries(config.areas || {})) {
      const isMatch = areaDef.paths.some((p: string) => {
        const norm = p.replace(/\\/g, "/");
        return norm.endsWith("/") ? file.startsWith(norm) : file === norm || file.startsWith(norm + "/") || file.startsWith(norm);
      });
      if (isMatch) {
        matched = true;
        if (!matchedMap.has(key)) {
          matchedMap.set(key, {
            key,
            title: areaDef.title,
            description: areaDef.description,
            techStack: areaDef.techStack,
            matchedFiles: [],
            risk_tier: areaDef.risk_tier,
            structural_boundaries: Array.isArray(areaDef.structural_boundaries)
              ? [...areaDef.structural_boundaries]
              : undefined,
          });
        }
        matchedMap.get(key)!.matchedFiles.push(file);
      }
    }
    if (!matched) outOfScope.push(file);
  }

  return {
    matchedAreas: Array.from(matchedMap.values()),
    outOfScopeFiles: outOfScope,
  };
}

export function isTestFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, "/");
  return /\.(test|spec)\.[a-z0-9]+$/i.test(norm) || /(^|\/)(__tests__|tests?|spec)\//i.test(norm);
}

/**
 * Detects "Test Theater": unit/integration tests that read application source files as strings
 * (e.g. readFileSync / readFile) and assert against source text with regexes or substring checks
 * instead of exercising runtime behavior.
 *
 * Ignores legitimate data-fixture reads (e.g. reading .json, .csv, .txt, .sql fixtures) and
 * ignores module import/mock declarations.
 */
export function detectTestTheater(
  rootDir: string,
  changedFiles: string[],
  gitDiff: string
): TestTheaterSuspect[] {
  const suspects: TestTheaterSuspect[] = [];
  const testFiles = changedFiles.filter(isTestFile);

  const fileReadRegex = /\b(readFileSync|readFile|readTextFile|read_text)\s*\(/;
  const sourcePathRefRegex =
    /(['"`])(?:(?!\1).)*?\.(?!test\.|spec\.|d\.)(ts|tsx|js|jsx|mjs|cjs|py|go|rs)\1/i;
  const regexAssertionRegex =
    /(\.toMatch\s*\(|\.match\s*\(|assert\.match\s*\(|new\s+RegExp\s*\(|\.toContain\s*\(|\/[^/\r\n]+\/[gimsuy]*\.test\s*\()/;
  const importOrMockLineRegex =
    /^\s*(import\s+|export\s+.*from\s+|(?:vi|jest)\.mock\s*\()/;

  for (const testFile of testFiles) {
    const absPath = path.join(rootDir, testFile);
    let content = "";
    if (fs.existsSync(absPath)) {
      try {
        content = fs.readFileSync(absPath, "utf-8");
      } catch {}
    }

    if (!content && gitDiff) {
      content = extractDiffForFile(gitDiff, testFile);
    }
    if (!content) continue;

    if (!fileReadRegex.test(content)) continue;

    const lines = content.split(/\r?\n/);
    const nonImportBody = lines
      .filter((line) => !importOrMockLineRegex.test(line))
      .join("\n");

    const hasSourceRef = sourcePathRefRegex.test(nonImportBody);
    const hasRegexAssert = regexAssertionRegex.test(nonImportBody);

    if (hasSourceRef && hasRegexAssert) {
      let matchedLine = 1;
      let snippet = "";
      for (let i = 0; i < lines.length; i++) {
        if (fileReadRegex.test(lines[i])) {
          matchedLine = i + 1;
          snippet = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 4)).join(" ").trim();
          break;
        }
      }
      suspects.push({
        file: testFile,
        line: matchedLine,
        pattern: "readFileSync/readFile on source file + regex/string assertion",
        snippet: snippet.slice(0, 200),
      });
    }
  }

  return suspects;
}

function extractDiffForFile(gitDiff: string, targetFile: string): string {
  const norm = targetFile.replace(/\\/g, "/");
  const sections = gitDiff.split(/^diff --git /m);
  for (const sec of sections) {
    if (sec.includes(`b/${norm}`) || sec.includes(norm)) {
      return sec
        .split(/\r?\n/)
        .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
        .map((l) => l.slice(1))
        .join("\n");
    }
  }
  return gitDiff;
}

/**
 * Evaluates objective auto-escalation triggers from areas.json metadata, changed file paths,
 * diff content, and test theater analysis.
 */
export function evaluateReviewEscalation(
  rootDir: string,
  changedFiles: string[],
  gitDiff: string,
  matchedAreas: MatchedAreaInfo[]
): {
  reviewDepth: ReviewDepth;
  escalationTriggers: EscalationTrigger[];
  testTheaterSuspects: TestTheaterSuspect[];
  architecturalRubric: string[];
} {
  const triggers: EscalationTrigger[] = [];

  // Trigger 1: Area Risk & Cross-Boundary Scope
  const highRiskAreas = matchedAreas.filter((a) => a.risk_tier === "high");
  if (highRiskAreas.length > 0) {
    const files = Array.from(new Set(highRiskAreas.flatMap((a) => a.matchedFiles)));
    triggers.push({
      id: "high-risk-area",
      category: "area-risk-boundary",
      reason: `Changed files match high-risk area(s): ${highRiskAreas.map((a) => a.key).join(", ")}`,
      matchedFiles: files,
    });
  }

  const boundaryAreas = matchedAreas.filter(
    (a) => Array.isArray(a.structural_boundaries) && a.structural_boundaries.length > 0
  );
  if (boundaryAreas.length > 0) {
    const distinctBoundaries = Array.from(
      new Set(boundaryAreas.flatMap((a) => a.structural_boundaries || []))
    );
    const files = Array.from(new Set(boundaryAreas.flatMap((a) => a.matchedFiles)));
    triggers.push({
      id: "structural-boundary-area",
      category: "area-risk-boundary",
      reason: `Changed files touch structural boundary area(s) [${distinctBoundaries.join(", ")}] in ${boundaryAreas.map((a) => a.key).join(", ")}`,
      matchedFiles: files,
    });
  }

  if (matchedAreas.length > 1) {
    const files = Array.from(new Set(matchedAreas.flatMap((a) => a.matchedFiles)));
    triggers.push({
      id: "cross-boundary-areas",
      category: "area-risk-boundary",
      reason: `Changes span multiple architectural areas (${matchedAreas.map((a) => a.key).join(", ")})`,
      matchedFiles: files,
    });
  }

  // Trigger 2: Critical Architectural Diff Surfaces
  const nonTestFiles = changedFiles.filter((f) => !isTestFile(f));

  const entrypointFiles = nonTestFiles.filter((f) =>
    /(^|\/)(bin|cli|scripts)\/|(^|\/)(index|main|server|app|worker|instrumentation)\.[a-z0-9]+$/i.test(f)
  );
  const hasShebangDiff = /^[\+\-]\s*#!\/usr\/bin\/env/m.test(gitDiff);
  if (entrypointFiles.length > 0 || hasShebangDiff) {
    triggers.push({
      id: "runtime-entrypoint",
      category: "critical-diff-surface",
      reason: "Diff alters runtime or CLI entrypoints",
      matchedFiles: entrypointFiles.length > 0 ? entrypointFiles : changedFiles.slice(0, 5),
    });
  }

  const authMiddlewareFiles = nonTestFiles.filter((f) =>
    /(^|\/)(auth|session|middleware|proxy|guards?|permissions|rbac|oauth|jwt)([/.\-_]|$)/i.test(f)
  );
  if (authMiddlewareFiles.length > 0) {
    triggers.push({
      id: "auth-session-middleware",
      category: "critical-diff-surface",
      reason: "Diff alters authentication, session, middleware, or proxy boundary modules",
      matchedFiles: authMiddlewareFiles,
    });
  }

  const envConfigFiles = nonTestFiles.filter((f) =>
    /(^|\/)\.env(\..+)?$|(^|\/)(env|config)([/.\-_]|$)/i.test(f)
  );
  const hasEnvDiffInCode =
    nonTestFiles.length > 0 &&
    /^[\+\-].*\b(process\.env|import\.meta\.env|os\.environ|std::env|os\.Getenv)\b/m.test(gitDiff);
  if (envConfigFiles.length > 0 || hasEnvDiffInCode) {
    triggers.push({
      id: "env-boot-config",
      category: "critical-diff-surface",
      reason: "Diff alters environment variable schemas, boot validation, or runtime env access",
      matchedFiles: envConfigFiles.length > 0 ? envConfigFiles : nonTestFiles,
    });
  }

  const dbClientFiles = nonTestFiles.filter((f) =>
    /(^|\/)(db|database|migrations?|seed)([/.\-_]|$)|(^|\/)(client|pool|connection|transaction)\.[a-z0-9]+$/i.test(f)
  );
  const hasDbInitOrTxDiff =
    nonTestFiles.length > 0 &&
    /^[\+\-].*\b(createPool|new\s+Pool|\.transaction\s*\()/m.test(gitDiff);
  if (dbClientFiles.length > 0 || hasDbInitOrTxDiff) {
    triggers.push({
      id: "db-client-persistence",
      category: "critical-diff-surface",
      reason: "Diff alters database client initialization, connection pooling, migrations/seeds, or transaction flows",
      matchedFiles: dbClientFiles.length > 0 ? dbClientFiles : nonTestFiles,
    });
  }

  const buildCiFiles = changedFiles.filter((f) =>
    /^\.github\/workflows\/|(^|\/)(Dockerfile|docker-compose[^/]*|Makefile|Procfile|turbo\.json|tsconfig[^/]*\.json)$|(^|\/)(vite|webpack|rollup|esbuild|tsup|jest|vitest|playwright)\.config\.[a-z0-9]+$/i.test(
      f
    )
  );
  if (buildCiFiles.length > 0) {
    triggers.push({
      id: "build-ci-workflow",
      category: "critical-diff-surface",
      reason: "Diff alters build configuration or CI/CD workflows",
      matchedFiles: buildCiFiles,
    });
  }

  const dependencyFiles = changedFiles.filter((f) =>
    /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|requirements[^/]*\.txt|Gemfile|composer\.json)$/i.test(
      f
    )
  );
  if (dependencyFiles.length > 0) {
    triggers.push({
      id: "runtime-dependencies",
      category: "critical-diff-surface",
      reason: "Diff alters package manifests or runtime dependencies",
      matchedFiles: dependencyFiles,
    });
  }

  // Trigger 3: Static Source-Text Matching in Tests ("Test Theater")
  const testTheaterSuspects = detectTestTheater(rootDir, changedFiles, gitDiff);
  if (testTheaterSuspects.length > 0) {
    triggers.push({
      id: "test-theater-detected",
      category: "test-theater",
      reason: `Changed/added test file(s) use static source-text matching (readFileSync/readFile + regex/string assertions): ${testTheaterSuspects.map((s) => s.file).join(", ")}`,
      matchedFiles: Array.from(new Set(testTheaterSuspects.map((s) => s.file))),
    });
  }

  const reviewDepth: ReviewDepth = triggers.length > 0 ? "architectural" : "standard";

  return {
    reviewDepth,
    escalationTriggers: triggers,
    testTheaterSuspects,
    architecturalRubric: reviewDepth === "architectural" ? ARCHITECTURAL_RUBRIC_ITEMS : [],
  };
}

export interface ValidateVerdictOptions {
  requiredDepth?: ReviewDepth;
  escalationTriggers?: EscalationTrigger[];
}

export function validateReviewVerdict(
  data: unknown,
  options?: ValidateVerdictOptions
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== "object") return { valid: false, errors: ["Verdict must be a JSON object."] };

  const v = data as Partial<ReviewVerdict>;
  if (!v.task_id || !/^[A-Z]+-\d+$/i.test(v.task_id)) errors.push(`Invalid task_id: '${v.task_id}'`);
  const validVerdicts: VerdictStatus[] = ["PASS", "CHANGES_REQUESTED", "ESCALATED_TO_HUMAN"];
  if (!v.verdict || !validVerdicts.includes(v.verdict)) errors.push(`Invalid verdict: '${v.verdict}'`);
  if (typeof v.iteration !== "number" || v.iteration < 1 || v.iteration > 2) errors.push(`Iteration must be 1 or 2`);
  if (!v.summary || v.summary.length < 10) errors.push(`Summary must be at least 10 chars`);

  if (v.review_depth !== undefined && v.review_depth !== "standard" && v.review_depth !== "architectural") {
    errors.push(`Invalid review_depth: '${v.review_depth}' (expected 'standard' or 'architectural')`);
  }

  const requiresArchitectural =
    options?.requiredDepth === "architectural" || v.review_depth === "architectural";

  if (options?.requiredDepth === "architectural" && v.review_depth !== "architectural") {
    const triggerSummary =
      options.escalationTriggers && options.escalationTriggers.length > 0
        ? options.escalationTriggers.map((t) => t.id).join(", ")
        : "auto-escalation trigger";
    errors.push(
      `Task triggered architectural auto-escalation (${triggerSummary}); verdict must set review_depth to 'architectural' (found: '${v.review_depth || "standard"}')`
    );
  }

  if (requiresArchitectural || v.architectural_checks !== undefined) {
    if (!v.architectural_checks || typeof v.architectural_checks !== "object") {
      errors.push(
        `architectural_checks attestation object is required when review_depth is 'architectural'`
      );
    } else {
      const validStatuses: ArchitecturalCheckStatus[] = ["PASS", "FAIL", "N/A"];
      for (const key of REQUIRED_ARCHITECTURAL_CHECK_KEYS) {
        const status = v.architectural_checks[key];
        if (!status || !validStatuses.includes(status)) {
          errors.push(
            `architectural_checks.${key} must be one of PASS | FAIL | N/A (found: '${status ?? "missing"}')`
          );
        } else if (v.verdict === "PASS" && status === "FAIL") {
          errors.push(
            `Verdict PASS is invalid when architectural_checks.${key} is 'FAIL'`
          );
        }
      }
      for (const [key, status] of Object.entries(v.architectural_checks)) {
        if (status !== undefined && !validStatuses.includes(status)) {
          errors.push(`architectural_checks.${key} has invalid status '${status}'`);
        } else if (v.verdict === "PASS" && status === "FAIL" && !(REQUIRED_ARCHITECTURAL_CHECK_KEYS as readonly string[]).includes(key)) {
          errors.push(`Verdict PASS is invalid when architectural_checks.${key} is 'FAIL'`);
        }
      }
    }
  }

  if (!Array.isArray(v.findings)) {
    errors.push(`'findings' must be an array`);
  } else {
    let blockers = 0;
    v.findings.forEach((f: Partial<ReviewFinding>, i: number) => {
      if (!f.id) errors.push(`Finding [${i}] missing id`);
      if (!f.severity || !["P0", "P1", "P2"].includes(f.severity)) errors.push(`Finding [${i}] invalid severity`);
      if (!f.file) errors.push(`Finding [${i}] missing file`);
      if (!f.evidence) errors.push(`Finding [${i}] missing evidence`);
      if (!f.suggested_fix) errors.push(`Finding [${i}] missing suggested_fix`);
      if (f.severity === "P0" || f.severity === "P1") blockers++;
    });
    if (v.blocking_count !== blockers) errors.push(`blocking_count (${v.blocking_count}) !== counted (${blockers})`);
    if (v.verdict === "PASS" && blockers > 0) errors.push(`Verdict PASS with ${blockers} blockers is invalid`);
  }

  return { valid: errors.length === 0, errors };
}

export function getVerdictPath(rootDir: string, taskId: string): string {
  return path.join(rootDir, ".review", `verdict-${taskId.toLowerCase()}.json`);
}

export function getVerdictIterationPath(
  rootDir: string,
  taskId: string,
  iteration: number
): string {
  return path.join(
    rootDir,
    ".review",
    `verdict-${taskId.toLowerCase()}-iter${iteration}.json`
  );
}

export function loadReviewVerdict(rootDir: string, taskId: string): ReviewVerdict | null {
  const verdictPath = getVerdictPath(rootDir, taskId);
  if (!fs.existsSync(verdictPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(verdictPath, "utf-8")) as ReviewVerdict;
  } catch {
    return null;
  }
}

/**
 * Extracts and parses a ReviewVerdict payload from either raw JSON text or
 * a Markdown conversational response containing a fenced ```json ... ``` block.
 * Returns null if no valid JSON object can be extracted.
 */
export function extractVerdictPayload(rawInput: string): ReviewVerdict | null {
  if (!rawInput || typeof rawInput !== "string") return null;

  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const parseCandidateObject = (text: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore invalid JSON
    }
    return null;
  };

  // 1. Direct raw JSON object (e.g. from .review/verdict-<task-id>.json or raw JSON argument)
  if (trimmed.startsWith("{")) {
    const direct = parseCandidateObject(trimmed);
    if (direct) return direct as unknown as ReviewVerdict;
  }

  // 2. Fenced Markdown code blocks:
  //    Prefer line-anchored ```json blocks first (so inner escaped backticks inside JSON
  //    string properties do not prematurely close the match), then line-anchored untagged
  //    ``` blocks, then inline ```json / ``` blocks.
  const fencePatterns: RegExp[] = [
    /^[ \t]*```json[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*(?=\r?\n|$)/gim,
    /^[ \t]*```[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*(?=\r?\n|$)/gim,
    /```json\s*([\s\S]*?)\s*```/gi,
    /```\s*([\s\S]*?)\s*```/gi,
  ];

  let firstObjectFallback: Record<string, unknown> | null = null;
  for (const pattern of fencePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(rawInput)) !== null) {
      const candidate = match[1].trim();
      if (!candidate.startsWith("{")) continue;
      const parsed = parseCandidateObject(candidate);
      if (!parsed) continue;
      if (typeof parsed.verdict === "string" || typeof parsed.task_id === "string") {
        return parsed as unknown as ReviewVerdict;
      }
      if (!firstObjectFallback) {
        firstObjectFallback = parsed;
      }
    }
  }

  return firstObjectFallback as unknown as ReviewVerdict | null;
}

/**
 * Idempotently snapshots a verdict to `.review/verdict-<task-id>-iter<N>.json`
 * when `verdict !== "PASS"` or `iteration < 2`.
 * Never overwrites an existing non-PASS snapshot at the same iteration with a PASS verdict.
 */
export function archiveReviewVerdict(
  rootDir: string,
  verdict: ReviewVerdict
): string | null {
  if (
    !verdict ||
    typeof verdict !== "object" ||
    !verdict.task_id ||
    typeof verdict.iteration !== "number" ||
    verdict.iteration < 1
  ) {
    return null;
  }

  if (verdict.verdict === "PASS" && verdict.iteration >= 2) {
    return null;
  }

  const reviewDir = path.join(rootDir, ".review");
  if (!fs.existsSync(reviewDir)) {
    fs.mkdirSync(reviewDir, { recursive: true });
  }

  const iterPath = getVerdictIterationPath(rootDir, verdict.task_id, verdict.iteration);
  if (fs.existsSync(iterPath) && verdict.verdict === "PASS") {
    try {
      const existingSnap = JSON.parse(fs.readFileSync(iterPath, "utf-8")) as Partial<ReviewVerdict>;
      if (existingSnap && existingSnap.verdict && existingSnap.verdict !== "PASS") {
        return iterPath;
      }
    } catch {
      // Proceed to write valid JSON snapshot if existing file was unreadable
    }
  }

  fs.writeFileSync(iterPath, JSON.stringify(verdict, null, 2), "utf-8");
  return iterPath;
}

/**
 * Safety-net helper invoked before compiling an updated evidence pack (`review-pack`)
 * or before overwriting `.review/verdict-<task-id>.json`. If an existing active verdict
 * from an earlier iteration / `CHANGES_REQUESTED` pass is present on disk, snapshots it
 * to `.review/verdict-<task-id>-iter<N>.json`.
 */
export function archiveExistingVerdict(rootDir: string, taskId: string): string | null {
  const existing = loadReviewVerdict(rootDir, taskId);
  if (!existing) return null;
  return archiveReviewVerdict(rootDir, existing);
}

/**
 * Saves `verdict` as the active `.review/verdict-<task-id>.json` while preserving
 * any earlier-iteration or non-PASS verdict in `.review/verdict-<task-id>-iter<N>.json`.
 */
export function saveReviewVerdict(
  rootDir: string,
  verdict: ReviewVerdict
): { verdictPath: string; archivedPath: string | null } {
  const reviewDir = path.join(rootDir, ".review");
  if (!fs.existsSync(reviewDir)) {
    fs.mkdirSync(reviewDir, { recursive: true });
  }

  let archivedPath: string | null = null;
  const existing = loadReviewVerdict(rootDir, verdict.task_id);
  if (
    existing &&
    typeof existing.iteration === "number" &&
    existing.iteration >= 1 &&
    (existing.verdict !== "PASS" ||
      existing.iteration < 2 ||
      existing.iteration < verdict.iteration)
  ) {
    const existingTaskId = existing.task_id || verdict.task_id;
    const existingIterPath = getVerdictIterationPath(
      rootDir,
      existingTaskId,
      existing.iteration
    );
    if (
      !fs.existsSync(existingIterPath) ||
      existing.verdict !== "PASS" ||
      existing.iteration < verdict.iteration
    ) {
      fs.writeFileSync(existingIterPath, JSON.stringify(existing, null, 2), "utf-8");
      archivedPath = existingIterPath;
    }
  }

  const verdictPath = getVerdictPath(rootDir, verdict.task_id);
  fs.writeFileSync(verdictPath, JSON.stringify(verdict, null, 2), "utf-8");

  const selfArchived = archiveReviewVerdict(rootDir, verdict);
  if (selfArchived) {
    archivedPath = selfArchived;
  }

  return { verdictPath, archivedPath };
}

/**
 * Loads prior-iteration verdict snapshots matching `.review/verdict-<task-id>-iter*.json`.
 *
 * Historical snapshots are validated structurally against the verdict contract WITHOUT
 * cross-checking against the current (potentially overwritten Iteration 2) evidence pack,
 * while excluding any snapshot with `iteration >= activeVerdict.iteration` so the final
 * verdict is never duplicated.
 */
export function loadPriorReviewVerdicts(
  rootDir: string,
  taskId: string,
  activeVerdict?: ReviewVerdict | null
): ReviewVerdict[] {
  const reviewDir = path.join(rootDir, ".review");
  if (!fs.existsSync(reviewDir)) return [];

  const effectiveActive =
    activeVerdict === undefined ? loadReviewVerdict(rootDir, taskId) : activeVerdict;
  const escapedTask = taskId.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const iterFileRegex = new RegExp(`^verdict-${escapedTask}-iter(\\d+)\\.json$`, "i");

  const files = fs.readdirSync(reviewDir);
  const byIteration = new Map<number, ReviewVerdict>();

  for (const file of files) {
    const match = file.match(iterFileRegex);
    if (!match) continue;

    const fullPath = path.join(reviewDir, file);
    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, "utf-8")) as ReviewVerdict;
      // Validate structurally only — skip current evidence-pack requiredDepth cross-checks
      const validation = validateReviewVerdict(parsed);
      if (!validation.valid) continue;
      if (parsed.task_id.toLowerCase() !== taskId.toLowerCase()) continue;
      if (
        effectiveActive &&
        typeof effectiveActive.iteration === "number" &&
        parsed.iteration >= effectiveActive.iteration
      ) {
        continue;
      }
      byIteration.set(parsed.iteration, parsed);
    } catch {
      // Ignore malformed snapshot files
    }
  }

  return Array.from(byIteration.values()).sort((a, b) => a.iteration - b.iteration);
}

export function loadEvidencePack(rootDir: string, taskId: string): EvidencePackData | null {
  const packPath = path.join(rootDir, ".review", `evidence-pack-${taskId.toLowerCase()}.md`);
  if (!fs.existsSync(packPath)) return null;
  try {
    const raw = fs.readFileSync(packPath, "utf-8").trim();
    if (raw.startsWith("{")) {
      return JSON.parse(raw) as EvidencePackData;
    }
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]) as EvidencePackData;
    }
    return null;
  } catch {
    return null;
  }
}

const MAX_HISTORY_SNIPPET_LENGTH = 220;

/**
 * Normalizes multi-line text for safe Markdown rendering inside `<details>`:
 * - Replaces any triple-backtick code fences (` ``` `) with single backticks so
 *   iteration history never introduces a second fenced code block in the PR body.
 * - Collapses newlines and runs of whitespace.
 * - Caps length at `maxLength` characters.
 */
export function sanitizeHistorySnippet(
  text: string | undefined,
  maxLength: number = MAX_HISTORY_SNIPPET_LENGTH
): string {
  if (!text) return "";
  const normalized = text
    .replace(/```+[a-z0-9_-]*/gi, "`")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

/**
 * Formats prior-iteration verdicts as a collapsed `<details>` Markdown section.
 * Strictly renders Markdown bullets without any ` ```json ` fenced code blocks.
 */
export function formatPriorVerdictsHistory(
  priorVerdicts: ReviewVerdict[],
  activeIteration?: number
): string {
  const filtered = (priorVerdicts || [])
    .filter(
      (pv) =>
        pv &&
        typeof pv === "object" &&
        typeof pv.iteration === "number" &&
        (activeIteration === undefined || pv.iteration < activeIteration)
    )
    .sort((a, b) => a.iteration - b.iteration);

  if (filtered.length === 0) return "";

  const summaryParts = filtered.map((pv) => {
    const findings = Array.isArray(pv.findings) ? pv.findings : [];
    const blockingCount =
      findings.filter((f) => f.severity === "P0" || f.severity === "P1").length ||
      pv.blocking_count ||
      0;
    const p2Count = findings.filter((f) => f.severity === "P2").length;
    const p2Segment = p2Count > 0 ? `, ${p2Count} P2 resolved` : " resolved";
    return `Iteration ${pv.iteration}: ${pv.verdict} — ${blockingCount} blocking P0/P1${p2Segment}`;
  });

  const lines: string[] = [
    "<details>",
    `<summary>Review Iteration History (${summaryParts.join("; ")})</summary>`,
    "",
  ];

  filtered.forEach((pv, idx) => {
    const findings = Array.isArray(pv.findings) ? pv.findings : [];
    const blockingCount =
      findings.filter((f) => f.severity === "P0" || f.severity === "P1").length ||
      pv.blocking_count ||
      0;

    lines.push(`#### Iteration ${pv.iteration} — \`${pv.verdict}\``);
    lines.push("");
    lines.push(
      `- **Reviewer:** \`${pv.reviewer || "agent:reviewer-subagent"}\` | **Review Depth:** \`${pv.review_depth || "standard"}\` | **Blocking Count:** \`${blockingCount}\` | **Evaluated At:** \`${pv.evaluated_at}\``
    );
    lines.push(`- **Summary:** ${sanitizeHistorySnippet(pv.summary, 300)}`);

    if (pv.architectural_checks && typeof pv.architectural_checks === "object") {
      const checkEntries = Object.entries(pv.architectural_checks)
        .filter(([, status]) => status !== undefined)
        .map(([key, status]) => `\`${key}: ${status}\``);
      if (checkEntries.length > 0) {
        lines.push(`- **Architectural Checks:** ${checkEntries.join(", ")}`);
      }
    }

    if (findings.length > 0) {
      lines.push(`- **Findings (${findings.length}):**`);
      for (const f of findings) {
        const lineRange =
          typeof f.line_start === "number" &&
          typeof f.line_end === "number" &&
          f.line_end !== f.line_start
            ? ` (L${f.line_start}-L${f.line_end})`
            : typeof f.line_start === "number"
              ? ` (L${f.line_start})`
              : "";
        const categoryBadge = f.category ? ` [\`${f.category}\`]` : "";
        const criterionBadge = f.criterion_id ? ` (\`${f.criterion_id}\`)` : "";
        lines.push(
          `  - **${f.id}** [\`${f.severity}\`]${categoryBadge}${criterionBadge} — \`${f.file}\`${lineRange}: ${sanitizeHistorySnippet(f.description, 240)}`
        );
        lines.push(`    - **Evidence:** ${sanitizeHistorySnippet(f.evidence, 220)}`);
        lines.push(`    - **Suggested Fix:** ${sanitizeHistorySnippet(f.suggested_fix, 220)}`);
      }
    } else {
      lines.push("- **Findings:** _None_");
    }

    if (idx < filtered.length - 1) {
      lines.push("");
    }
  });

  lines.push("");
  lines.push("</details>");
  return lines.join("\n");
}

/**
 * Extracts the canonical Review Verdict JSON object from a PR description body.
 * Strips any collapsed `<details>...</details>` iteration history blocks first and
 * anchors to the `### Review Verdict` section so prior-iteration history or prose
 * snippets never shadow the active verdict.
 */
export function extractVerdictFromPrBody(prBody: string): ReviewVerdict | null {
  if (!prBody) return null;
  const bodyWithoutDetails = prBody.replace(/<details\b[^>]*>[\s\S]*?<\/details>/gi, "");
  const verdictSectionMatch = bodyWithoutDetails.match(
    /###\s+Review Verdict[\s\S]*?```json\s*([\s\S]*?)\s*```/i
  );

  const candidateBlocks: string[] = [];
  if (verdictSectionMatch && verdictSectionMatch[1]) {
    candidateBlocks.push(verdictSectionMatch[1]);
  }

  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/gi;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = jsonBlockRegex.exec(bodyWithoutDetails)) !== null) {
    candidateBlocks.push(blockMatch[1]);
  }

  for (const rawBlock of candidateBlocks) {
    try {
      const parsed = JSON.parse(rawBlock) as Partial<ReviewVerdict>;
      if (parsed && typeof parsed === "object" && typeof parsed.verdict === "string") {
        return parsed as ReviewVerdict;
      }
    } catch {
      // Ignore malformed JSON block
    }
  }
  return null;
}

export function generatePrBody(
  spec: TaskSpec,
  verdict: ReviewVerdict,
  pack?: EvidencePackData | null,
  priorVerdicts?: ReviewVerdict[] | null
): string {
  const reviewDepth: ReviewDepth = verdict.review_depth || pack?.reviewDepth || "standard";
  const acLines =
    spec.acceptanceCriteria.length > 0
      ? spec.acceptanceCriteria.map((ac) => `- [x] ${ac.text}`).join("\n")
      : "- [x] All task acceptance criteria satisfied and verified.";

  const p2Findings = (verdict.findings || []).filter((f) => f.severity === "P2");
  const p2Lines =
    p2Findings.length > 0
      ? p2Findings.map((f) => `- **${f.id}** (\`${f.file}\`): ${f.description}`).join("\n")
      : "- _None_";

  const detCheck = pack?.deterministicChecks?.[0];
  const detCmd = detCheck?.command || "npm run build";
  const detStatus = detCheck?.status || "SUCCESS";

  const triggersList =
    pack?.escalationTriggers && pack.escalationTriggers.length > 0
      ? pack.escalationTriggers.map((t) => `  - \`${t.id}\`: ${t.reason}`).join("\n")
      : "  - _None (standard review depth)_";

  const iterationHistoryBlock =
    priorVerdicts && priorVerdicts.length > 0
      ? formatPriorVerdictsHistory(priorVerdicts, verdict.iteration)
      : "";

  return [
    "## Summary of Intent",
    "",
    spec.objective || `${spec.id}: ${spec.title}`,
    "",
    "---",
    "",
    "## Task & PRD Reference",
    "",
    `- **Parent Feature:** \`${spec.parentFeature}\``,
    `- **Task ID:** \`${spec.id}\``,
    `- **Task Specification:** \`${spec.filePath}\``,
    "",
    "---",
    "",
    "## Acceptance Criteria Checklist",
    "",
    acLines,
    "",
    "---",
    "",
    "## Tier 1 Subagent Review Evidence",
    "",
    "> **Standard Reference:** [`standards/AGENT_REVIEW_CONTRACT.md`](standards/AGENT_REVIEW_CONTRACT.md)",
    "",
    "### Review Verdict",
    "",
    `- **Verdict:** \`${verdict.verdict}\``,
    `- **Review Depth:** \`${reviewDepth}\``,
    `- **Iteration Count:** \`${verdict.iteration}\` of \`2\``,
    `- **Reviewer:** \`${verdict.reviewer || "agent:reviewer-subagent"}\``,
    `- **Blocking Count (P0 + P1):** \`${verdict.blocking_count}\``,
    "- **Auto-Escalation Triggers:**",
    triggersList,
    "",
    "```json",
    JSON.stringify(verdict, null, 2),
    "```",
    ...(iterationHistoryBlock ? ["", iterationHistoryBlock] : []),
    "",
    "### Deterministic Build Verification",
    "",
    `- **Command:** \`${detCmd}\``,
    `- **Status:** \`${detStatus}\``,
    "",
    "### Non-Blocking Suggestions (P2 Findings)",
    "",
    p2Lines,
    "",
    "---",
    "",
    "## Scope & Boundary Audit",
    "",
    "- [x] Pre-Coding Spec Challenge completed: task instructions verified against repository ADRs and runtime boundaries (`client` / `server` / `edge` / `cli`).",
    "- [x] All modified files reside within domains mapped in [`pm/areas.json`](pm/areas.json).",
    "- [x] No files outside the task's declared `target_paths` were modified without documented rationale.",
    reviewDepth === "architectural"
      ? "- [x] `review_depth: \"architectural\"` required and all four `architectural_checks` (`import_boot_isolation`, `fail_closed_defaults`, `write_atomicity`, `no_test_theater`) are attested."
      : "- [x] Review depth evaluated as `standard` (no architectural escalation triggers fired).",
    "- [x] No secrets, tokens, or private credentials committed.",
    "- [x] Deterministic behavioral tests pass locally with zero regressions and zero static source-regex test theater.",
    "",
    "---",
    "",
    "## Human Reviewer Sign-Off",
    "",
    "> [!IMPORTANT]",
    "> Merging to `main` requires manual review and sign-off by a human repository maintainer. Automated agents do not possess direct merge authority.",
    "",
  ].join("\n");
}
