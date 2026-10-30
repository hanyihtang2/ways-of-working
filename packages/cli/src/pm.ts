import * as fs from "node:fs";
import * as path from "node:path";
import type { Frontmatter, TaskItem } from "./types.js";

export const STAGE_FOLDERS: Record<string, "0-backlog" | "1-in-progress" | "2-review" | "3-done"> = {
  "0": "0-backlog",
  backlog: "0-backlog",
  "1": "1-in-progress",
  "in-progress": "1-in-progress",
  inprogress: "1-in-progress",
  active: "1-in-progress",
  "2": "2-review",
  review: "2-review",
  "3": "3-done",
  done: "3-done",
  completed: "3-done",
};

export const STAGE_STATUS_LABEL: Record<string, string> = {
  "0-backlog": "backlog",
  "1-in-progress": "in-progress",
  "2-review": "review",
  "3-done": "done",
};

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function parseFrontmatter(content: string): { data: Frontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { data: {}, body: content };

  const rawYaml = match[1];
  const body = match[2];
  const data: Frontmatter = {};

  let currentKey = "";
  for (const line of rawYaml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("- ") && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      const val = trimmed.slice(2).trim().replace(/^["']|["']$/g, "");
      (data[currentKey] as string[]).push(val);
      continue;
    }

    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      let inDouble = false;
      let inSingle = false;
      let commentIdx = -1;
      for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === '"' && !inSingle) inDouble = !inDouble;
        else if (ch === "'" && !inDouble) inSingle = !inSingle;
        else if (ch === "#" && !inDouble && !inSingle) {
          if (i === 0 || /\s/.test(value[i - 1])) {
            commentIdx = i;
            break;
          }
        }
      }
      if (commentIdx >= 0) value = value.slice(0, commentIdx).trim();

      currentKey = key;

      if (value.startsWith("[") && value.endsWith("]")) {
        data[key] = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      } else {
        value = value.replace(/^["']|["']$/g, "");
        data[key] = value === "" ? [] : value;
      }
    }
  }

  return { data, body };
}

export function formatFrontmatter(data: Frontmatter, body: string): string {
  const lines: string[] = ["---"];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${item}`);
        }
      }
    } else if (typeof value === "string") {
      if (value.includes(":") || value.includes("#") || value.includes('"') || value.includes("'")) {
        lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push("---");
  lines.push(body.startsWith("\n") ? body.slice(1) : body);
  return lines.join("\n");
}

export function collectAllTasks(rootDir: string): {
  tasks: TaskItem[];
  featureMap: Map<string, { title: string; release: string }>;
} {
  const pmDir = path.join(rootDir, "pm");
  const featuresDir = path.join(pmDir, "features");
  const tasks: TaskItem[] = [];
  const featureMap = new Map<string, { title: string; release: string }>();

  if (!fs.existsSync(featuresDir)) {
    return { tasks, featureMap };
  }

  const features = fs
    .readdirSync(featuresDir, { withFileTypes: true })
    .filter((d: fs.Dirent) => d.isDirectory())
    .map((d: fs.Dirent) => d.name);

  for (const featDir of features) {
    const featPath = path.join(featuresDir, featDir);
    const prdPath = path.join(featPath, "prd.md");
    let prdData: Frontmatter = {};

    if (fs.existsSync(prdPath)) {
      const content = fs.readFileSync(prdPath, "utf-8");
      prdData = parseFrontmatter(content).data;
    }

    const featIdMatch = featDir.match(/^([A-Z]+-\d+)/i);
    const featId = featIdMatch ? featIdMatch[1].toUpperCase() : featDir;
    const featTitle = (prdData.title as string) || featDir;
    const featRelease = (prdData.target_release as string) || "v0.1.0";
    featureMap.set(featId, { title: featTitle, release: featRelease });
    featureMap.set(featDir, { title: featTitle, release: featRelease });

    const tasksBase = path.join(featPath, "tasks");
    const stages: ("0-backlog" | "1-in-progress" | "2-review" | "3-done")[] = [
      "0-backlog",
      "1-in-progress",
      "2-review",
      "3-done",
    ];

    for (const stage of stages) {
      const stageDir = path.join(tasksBase, stage);
      if (!fs.existsSync(stageDir)) continue;

      const files = fs.readdirSync(stageDir).filter((f: string) => f.endsWith(".md")).sort();
      for (const file of files) {
        const filePath = path.join(stageDir, file);
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const parsed = parseFrontmatter(fileContent).data;

        const taskIdMatch = file.match(/^(TASK-\d+)/i);
        const id = (parsed.id as string) || (taskIdMatch ? taskIdMatch[1].toUpperCase() : file.replace(".md", ""));
        const title = (parsed.title as string) || file.replace(/\.md$/, "");
        const priority = (parsed.priority as string) || "P1";
        const status = (parsed.status as string) || STAGE_STATUS_LABEL[stage] || stage;
        const parentFeature = (parsed.parent_feature as string) || featId;
        const assignedTo = (parsed.assigned_to as string) || "unassigned";
        const branch = (parsed.branch as string) || "-";
        const updatedAt = (parsed.updated_at as string) || (parsed.created_at as string) || "-";
        const createdAt = (parsed.created_at as string) || "-";
        const areas = Array.isArray(parsed.areas) ? (parsed.areas as string[]) : [];

        tasks.push({
          id,
          title,
          status,
          stage,
          priority,
          parent_feature: parentFeature,
          featureDir: featDir,
          featureTitle: featTitle,
          targetRelease: featRelease,
          assigned_to: assignedTo,
          branch,
          areas,
          updated_at: updatedAt,
          created_at: createdAt,
          taskRelPath: path.relative(pmDir, filePath).replace(/\\/g, "/"),
          prdRelPath: path.relative(pmDir, prdPath).replace(/\\/g, "/"),
        });
      }
    }
  }

  return { tasks, featureMap };
}

export function generateKanbanCommand(rootDir: string = process.cwd()): string {
  const pmDir = path.join(rootDir, "pm");
  const kanbanPath = path.join(pmDir, "KANBAN.md");
  const { tasks } = collectAllTasks(rootDir);

  const inProgress = tasks.filter((t) => t.stage === "1-in-progress");
  const inReview = tasks.filter((t) => t.stage === "2-review");
  const backlog = tasks.filter((t) => t.stage === "0-backlog");
  const done = tasks.filter((t) => t.stage === "3-done");

  const total = tasks.length;
  const doneCount = done.length;
  const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const lines: string[] = [];
  lines.push("# Task Kanban Board\n");
  lines.push("> Real-time status board tracking feature tasks, active initiatives, and completion metrics.");
  lines.push("> Regenerate anytime with: `npx wow kanban`\n");
  lines.push("| Total Tasks | 🚀 In Progress | 🔍 In Review | 📋 Backlog | ✅ Done | Progress |");
  lines.push("| :---: | :---: | :---: | :---: | :---: | :---: |");
  lines.push(`| **${total}** | **${inProgress.length}** | **${inReview.length}** | **${backlog.length}** | **${doneCount}** | **${progressPct}%** |\n`);
  lines.push("---\n");

  // In Progress
  lines.push(`## 🚀 In Progress (${inProgress.length})\n`);
  if (inProgress.length === 0) {
    lines.push("_No tasks currently in progress._\n");
  } else {
    lines.push("| Task | Feature | Priority | Assignee | Branch | Updated |");
    lines.push("| :--- | :--- | :---: | :--- | :--- | :---: |");
    for (const t of inProgress) {
      lines.push(`| [${t.id}: ${t.title}](./${t.taskRelPath}) | [${t.parent_feature}](./${t.prdRelPath}) | \`${t.priority}\` | \`${t.assigned_to}\` | \`${t.branch}\` | ${t.updated_at} |`);
    }
    lines.push("");
  }

  // In Review
  lines.push(`## 🔍 In Review (${inReview.length})\n`);
  if (inReview.length === 0) {
    lines.push("_No tasks currently in review._\n");
  } else {
    lines.push("| Task | Feature | Priority | Assignee | Branch | Updated |");
    lines.push("| :--- | :--- | :---: | :--- | :--- | :---: |");
    for (const t of inReview) {
      lines.push(`| [${t.id}: ${t.title}](./${t.taskRelPath}) | [${t.parent_feature}](./${t.prdRelPath}) | \`${t.priority}\` | \`${t.assigned_to}\` | \`${t.branch}\` | ${t.updated_at} |`);
    }
    lines.push("");
  }

  // Backlog
  lines.push(`## 📋 Backlog (${backlog.length})\n`);
  if (backlog.length === 0) {
    lines.push("_No tasks currently in backlog._\n");
  } else {
    lines.push("| Task | Feature | Priority | Target Release | Assignee |");
    lines.push("| :--- | :--- | :---: | :---: | :--- |");
    for (const t of backlog) {
      lines.push(`| [${t.id}: ${t.title}](./${t.taskRelPath}) | [${t.parent_feature}](./${t.prdRelPath}) | \`${t.priority}\` | ${t.targetRelease} | \`${t.assigned_to}\` |`);
    }
    lines.push("");
  }

  // Completed
  lines.push(`## ✅ Completed (${done.length})\n`);
  if (done.length === 0) {
    lines.push("_No completed tasks yet._\n");
  } else {
    lines.push("<details>");
    lines.push(`<summary><b>Click to expand completed tasks (${done.length})</b></summary>\n`);
    lines.push("| Task | Feature | Priority | Assignee | Completed Date |");
    lines.push("| :--- | :--- | :---: | :--- | :---: |");
    for (const t of done) {
      lines.push(`| [${t.id}: ${t.title}](./${t.taskRelPath}) | [${t.parent_feature}](./${t.prdRelPath}) | \`${t.priority}\` | \`${t.assigned_to}\` | ${t.updated_at} |`);
    }
    lines.push("\n</details>\n");
  }

  fs.writeFileSync(kanbanPath, lines.join("\n"), "utf-8");
  return kanbanPath;
}

export function generateRoadmapCommand(rootDir: string = process.cwd()): string {
  const pmDir = path.join(rootDir, "pm");
  const roadmapPath = path.join(pmDir, "ROADMAP.md");
  const featuresDir = path.join(pmDir, "features");

  if (!fs.existsSync(featuresDir)) return "";

  const features = fs
    .readdirSync(featuresDir, { withFileTypes: true })
    .filter((d: fs.Dirent) => d.isDirectory())
    .map((d: fs.Dirent) => d.name);
  const rows: string[] = [];

  for (const featDir of features) {
    const featPath = path.join(featuresDir, featDir);
    const prdPath = path.join(featPath, "prd.md");
    let prdData: Frontmatter = {};

    if (fs.existsSync(prdPath)) {
      prdData = parseFrontmatter(fs.readFileSync(prdPath, "utf-8")).data;
    }

    const featIdMatch = featDir.match(/^([A-Z]+-\d+)/i);
    const featId = featIdMatch ? featIdMatch[1].toUpperCase() : featDir;
    const title = prdData.title || featDir;
    const priority = prdData.priority || "P1";
    const status = prdData.status || "active";
    const release = prdData.target_release || "v0.1.0";

    const tasksBase = path.join(featPath, "tasks");
    let totalTasks = 0;
    let doneTasks = 0;

    for (const stage of ["0-backlog", "1-in-progress", "2-review", "3-done"]) {
      const sDir = path.join(tasksBase, stage);
      if (fs.existsSync(sDir)) {
        const count = fs.readdirSync(sDir).filter((f: string) => f.endsWith(".md")).length;
        totalTasks += count;
        if (stage === "3-done") doneTasks += count;
      }
    }

    const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    const progressStr = `${doneTasks}/${totalTasks} (${pct}%)`;
    const relLink = `[${featId}: ${title}](./features/${featDir}/prd.md)`;
    rows.push(`| ${relLink} | \`${priority}\` | \`${status}\` | ${release} | ${progressStr} |`);
  }

  const lines = [
    "# Product Roadmap\n",
    "> Living feature roadmap tracking progress, targets, and deliverable metrics.",
    "> Regenerate anytime with: `npx wow roadmap`\n",
    "| Feature | Priority | Status | Target Release | Progress |",
    "| :--- | :---: | :---: | :---: | :---: |",
    rows.join("\n"),
    "",
  ];

  fs.writeFileSync(roadmapPath, lines.join("\n"), "utf-8");
  return roadmapPath;
}

export function moveTaskCommand(
  rootDir: string,
  taskTarget: string,
  targetStageRaw: string
): { success: boolean; fromStage: string; toStage: string } {
  const pmDir = path.join(rootDir, "pm");
  const featuresDir = path.join(pmDir, "features");

  const targetStageFolder = STAGE_FOLDERS[targetStageRaw.toLowerCase()];
  if (!targetStageFolder) {
    throw new Error(`Unknown stage "${targetStageRaw}". Valid: backlog, in-progress, review, done.`);
  }

  const features = fs
    .readdirSync(featuresDir, { withFileTypes: true })
    .filter((d: fs.Dirent) => d.isDirectory())
    .map((d: fs.Dirent) => d.name);
  let foundFilePath = "";
  let foundFeature = "";
  let currentStageFolder = "";

  for (const f of features) {
    const tasksBase = path.join(featuresDir, f, "tasks");
    for (const stage of ["0-backlog", "1-in-progress", "2-review", "3-done"]) {
      const sDir = path.join(tasksBase, stage);
      if (fs.existsSync(sDir)) {
        const lowerTarget = taskTarget.toLowerCase();
        const files = fs.readdirSync(sDir);
        for (const file of files) {
          const lowerFile = file.toLowerCase();
          if (
            lowerFile.startsWith(`${lowerTarget}-`) ||
            lowerFile.startsWith(`${lowerTarget}.`) ||
            lowerFile === `${lowerTarget}.md` ||
            lowerFile === lowerTarget
          ) {
            foundFilePath = path.join(sDir, file);
            foundFeature = f;
            currentStageFolder = stage;
            break;
          }
        }
      }
      if (foundFilePath) break;
    }
    if (foundFilePath) break;
  }

  if (!foundFilePath) {
    throw new Error(`Could not locate task matching "${taskTarget}".`);
  }

  if (currentStageFolder === targetStageFolder) {
    return { success: true, fromStage: currentStageFolder, toStage: targetStageFolder };
  }

  const fileName = path.basename(foundFilePath);
  const destDir = path.join(featuresDir, foundFeature, "tasks", targetStageFolder);
  ensureDir(destDir);
  const destFilePath = path.join(destDir, fileName);

  const content = fs.readFileSync(foundFilePath, "utf-8");
  const { data, body } = parseFrontmatter(content);
  data.status = STAGE_STATUS_LABEL[targetStageFolder] || targetStageFolder;
  data.updated_at = new Date().toISOString().split("T")[0];

  fs.writeFileSync(destFilePath, formatFrontmatter(data, body), "utf-8");
  fs.unlinkSync(foundFilePath);

  generateKanbanCommand(rootDir);
  generateRoadmapCommand(rootDir);

  return { success: true, fromStage: currentStageFolder, toStage: targetStageFolder };
}
