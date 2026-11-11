/**
 * Shared Types for PM-as-Code and Two-Tier Agentic Review
 */

export type Severity = "P0" | "P1" | "P2";

export type VerdictStatus = "PASS" | "CHANGES_REQUESTED" | "ESCALATED_TO_HUMAN";

export type ReviewDepth = "standard" | "architectural";

export type RiskTier = "standard" | "high";

export type StructuralBoundary =
  | "env-boot"
  | "db-client"
  | "auth-session"
  | "edge-proxy"
  | "build-ci"
  | "cli-entrypoint"
  | "client-server-boundary"
  | (string & {});

export type ArchitecturalCheckStatus = "PASS" | "FAIL" | "N/A";

export interface ArchitecturalChecks {
  import_boot_isolation: ArchitecturalCheckStatus;
  fail_closed_defaults: ArchitecturalCheckStatus;
  write_atomicity: ArchitecturalCheckStatus;
  no_test_theater: ArchitecturalCheckStatus;
  spec_boundary_alignment?: ArchitecturalCheckStatus;
  [key: string]: ArchitecturalCheckStatus | undefined;
}

export type EscalationTriggerCategory =
  | "area-risk-boundary"
  | "critical-diff-surface"
  | "test-theater";

export interface EscalationTrigger {
  id: string;
  category: EscalationTriggerCategory;
  reason: string;
  matchedFiles: string[];
}

export interface TestTheaterSuspect {
  file: string;
  line?: number;
  pattern: string;
  snippet: string;
}

export interface AreaDefinition {
  title: string;
  description: string;
  paths: string[];
  techStack: string[];
  risk_tier?: RiskTier;
  structural_boundaries?: StructuralBoundary[];
}

export interface AreasConfig {
  $schema?: string;
  version?: string;
  config?: {
    deterministicCommand?: string;
    baseBranch?: string;
  };
  areas: Record<string, AreaDefinition>;
}

export interface TaskSpec {
  id: string;
  title: string;
  parentFeature: string;
  filePath: string;
  stage: string;
  objective: string;
  acceptanceCriteria: { text: string; completed: boolean }[];
  targetPaths: string[];
  declaredAreas: string[];
}

export interface DeterministicCheckResult {
  name: string;
  command: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  output: string;
  exitCode: number;
  durationMs: number;
}

export interface MatchedAreaInfo {
  key: string;
  title: string;
  description: string;
  techStack: string[];
  matchedFiles: string[];
  risk_tier?: RiskTier;
  structural_boundaries?: string[];
}

export interface EnvironmentAuditResult {
  envExampleVars: string[];
  referencedEnvVars: string[];
  missingEnvVars: string[];
  hardcodedLocalhostUrls: string[];
}

export interface EvidencePackData {
  taskId: string;
  targetBranch: string;
  currentBranch: string;
  timestamp: string;
  reviewDepth: ReviewDepth;
  escalationTriggers: EscalationTrigger[];
  testTheaterSuspects: TestTheaterSuspect[];
  architecturalRubric?: string[];
  taskSpec: TaskSpec;
  matchedAreas: MatchedAreaInfo[];
  outOfScopeFiles: string[];
  deterministicChecks: DeterministicCheckResult[];
  changedFiles: string[];
  gitDiff: string;
  environmentAudit?: EnvironmentAuditResult;
}

export interface ReviewFinding {
  id: string;
  severity: Severity;
  file: string;
  line_start?: number;
  line_end?: number;
  criterion_id?: string;
  category?: string;
  description: string;
  evidence: string;
  suggested_fix: string;
}

export interface ReviewVerdict {
  $schema?: string;
  task_id: string;
  verdict: VerdictStatus;
  review_depth?: ReviewDepth;
  escalation_triggers?: string[];
  iteration: number;
  evaluated_at: string;
  reviewer: string;
  deterministic_checks: Record<string, "SUCCESS" | "FAILED" | "SKIPPED">;
  architectural_checks?: ArchitecturalChecks;
  blocking_count: number;
  summary: string;
  findings: ReviewFinding[];
}

export interface Frontmatter {
  id?: string;
  title?: string;
  status?: string;
  priority?: string;
  parent_feature?: string;
  target_release?: string;
  areas?: string[];
  branch?: string;
  assigned_to?: string;
  created_at?: string;
  updated_at?: string;
  target_paths?: string[];
  dependencies?: string[];
  [key: string]: unknown;
}

export interface TaskItem {
  id: string;
  title: string;
  status: string;
  stage: "0-backlog" | "1-in-progress" | "2-review" | "3-done";
  priority: string;
  parent_feature: string;
  featureDir: string;
  featureTitle: string;
  targetRelease: string;
  assigned_to: string;
  branch: string;
  areas: string[];
  updated_at: string;
  created_at: string;
  taskRelPath: string;
  prdRelPath: string;
}
