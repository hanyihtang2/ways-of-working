import * as fs from "node:fs";
import * as path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import type {
  AreasConfig,
  DeterministicCheckResult,
  EvidencePackData,
  MatchedAreaInfo,
  ReviewFinding,
  ReviewVerdict,
  TaskSpec,
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
        return norm.endsWith("/") ? file.startsWith(norm) : file === norm || file.startsWith(norm);
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

export function validateReviewVerdict(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== "object") return { valid: false, errors: ["Verdict must be a JSON object."] };

  const v = data as Partial<ReviewVerdict>;
  if (!v.task_id || !/^[A-Z]+-\d+$/i.test(v.task_id)) errors.push(`Invalid task_id: '${v.task_id}'`);
  const validVerdicts: VerdictStatus[] = ["PASS", "CHANGES_REQUESTED", "ESCALATED_TO_HUMAN"];
  if (!v.verdict || !validVerdicts.includes(v.verdict)) errors.push(`Invalid verdict: '${v.verdict}'`);
  if (typeof v.iteration !== "number" || v.iteration < 1 || v.iteration > 2) errors.push(`Iteration must be 1 or 2`);
  if (!v.summary || v.summary.length < 10) errors.push(`Summary must be at least 10 chars`);

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

export function loadReviewVerdict(rootDir: string, taskId: string): ReviewVerdict | null {
  const verdictPath = path.join(rootDir, ".review", `verdict-${taskId.toLowerCase()}.json`);
  if (!fs.existsSync(verdictPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(verdictPath, "utf-8")) as ReviewVerdict;
  } catch {
    return null;
  }
}
