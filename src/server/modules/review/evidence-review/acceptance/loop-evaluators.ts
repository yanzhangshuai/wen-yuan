import type { AcceptanceLoopKey } from "./contracts";

const REQUIRED_REVIEW_ACTIONS = [
  "ACCEPT",
  "REJECT",
  "DEFER",
  "EDIT",
  "CREATE_MANUAL_CLAIM",
  "RELINK_EVIDENCE",
  "MERGE_PERSONA",
  "SPLIT_PERSONA"
] as const;

interface AcceptanceLoopEvaluationResult {
  loopKey      : AcceptanceLoopKey;
  passed       : boolean;
  blocking     : boolean;
  summary      : string;
  evidenceLines: string[];
  artifactPaths: string[];
}

interface AcceptanceManualCheckSummary {
  passed       : boolean;
  blocking     : boolean;
  [key: string]: unknown;
}

interface AcceptanceLoopDecisionSummary {
  passed       : boolean;
  blocking     : boolean;
  [key: string]: unknown;
}

interface AcceptanceRiskSummary {
  severity: "BLOCKING" | "NON_BLOCKING";
}

interface EvidenceLoopClaim {
  claimKind  : string;
  claimId    : string;
  reviewState: string;
  evidence   : Array<{
    id         : string;
    chapterId  : string;
    quotedText : string;
    startOffset: number | null;
    endOffset  : number | null;
  }>;
}

function hasEvidenceJumpMetadata(claim: EvidenceLoopClaim): boolean {
  return claim.evidence.some((item) => {
    return item.id.trim().length > 0
      && item.chapterId.trim().length > 0
      && item.quotedText.trim().length > 0;
  });
}

/**
 * 证据闭环必须证明每条 accepted claim 都还能跳回原文证据。
 * 这里不检查 UI，只锁定 runner/report 依赖的最小链路元数据是否完整。
 */
export function evaluateEvidenceLoop(input: {
  claimDetails: EvidenceLoopClaim[];
}): AcceptanceLoopEvaluationResult {
  const acceptedClaims = input.claimDetails.filter((claim) => claim.reviewState === "ACCEPTED");
  const failedClaims = acceptedClaims.filter((claim) => !hasEvidenceJumpMetadata(claim));

  return {
    loopKey : "EVIDENCE",
    passed  : failedClaims.length === 0,
    blocking: failedClaims.length > 0,
    summary : failedClaims.length === 0
      ? `Validated ${acceptedClaims.length} accepted claim evidence chains.`
      : `${failedClaims.length} accepted claims are missing evidence jumps.`,
    evidenceLines: failedClaims.length === 0
      ? acceptedClaims.map((claim) => `${claim.claimKind}:${claim.claimId} has evidence`)
      : failedClaims.map((claim) => `${claim.claimKind}:${claim.claimId} missing evidence span`),
    artifactPaths: []
  };
}

/**
 * 审核闭环要求八种关键人工动作都能在审计链路中被重放到。
 * 这里只认审计事实，不把 UI 层的可见状态当作验收证据。
 */
export function evaluateReviewLoop(input: {
  auditActions    : string[];
  expectedActions?: string[];
}): AcceptanceLoopEvaluationResult {
  const requiredActions = input.expectedActions !== undefined && input.expectedActions.length > 0
    ? [...new Set(input.expectedActions)]
    : [...REQUIRED_REVIEW_ACTIONS];
  const missingActions = requiredActions.filter((action) => !input.auditActions.includes(action));
  const usingScenarioExpectedActions = input.expectedActions !== undefined && input.expectedActions.length > 0;

  return {
    loopKey : "REVIEW",
    passed  : missingActions.length === 0,
    blocking: missingActions.length > 0,
    summary : missingActions.length === 0
      ? usingScenarioExpectedActions
        ? "Observed all expected review mutations."
        : "Observed all required review mutations."
      : `Missing review actions: ${missingActions.join(", ")}`,
    evidenceLines: missingActions.length === 0
      ? requiredActions.map((action) => `Observed ${action}`)
      : missingActions.map((action) => `Missing ${action}`),
    artifactPaths: []
  };
}

/**
 * projection 闭环只比较 accepted truth 的稳定快照。
 * 只要 rebuild 前后 canonical key 不一致，就必须直接阻断最终验收。
 */
export function evaluateProjectionLoop(input: {
  beforeSnapshotKeys: string[];
  afterSnapshotKeys : string[];
}): AcceptanceLoopEvaluationResult {
  const before = [...input.beforeSnapshotKeys].sort();
  const after = [...input.afterSnapshotKeys].sort();
  const identical = JSON.stringify(before) === JSON.stringify(after);

  return {
    loopKey : "PROJECTION",
    passed  : identical,
    blocking: !identical,
    summary : identical
      ? `Projection rebuild preserved ${before.length} canonical keys.`
      : "Projection rebuild changed accepted snapshot truth.",
    evidenceLines: identical
      ? before.map((key) => `Preserved ${key}`)
      : [
          `before=${before.join(", ")}`,
          `after=${after.join(", ")}`
        ],
    artifactPaths: []
  };
}

/**
 * 知识闭环同时约束“知识能参与候选生成”和“知识不能绕过审核直写 truth”。
 * 任一约束失效，都说明 KB 集成方式还不能作为上线依据。
 */
export function evaluateKnowledgeLoop(input: {
  relationCatalogAvailable     : boolean;
  reviewedClaimBackedProjection: boolean;
}): AcceptanceLoopEvaluationResult {
  const passed = input.relationCatalogAvailable && input.reviewedClaimBackedProjection;

  return {
    loopKey : "KNOWLEDGE",
    passed,
    blocking: !passed,
    summary : passed
      ? "Reviewed knowledge influences normalization and still flows through reviewable claims."
      : "Knowledge loop is incomplete: catalog or reviewed-claim gating is missing.",
    evidenceLines: [
      `relationCatalogAvailable=${String(input.relationCatalogAvailable)}`,
      `reviewedClaimBackedProjection=${String(input.reviewedClaimBackedProjection)}`
    ],
    artifactPaths: []
  };
}

/**
 * rebuild 闭环引用 T21 的对比结论，而不是在 T22 里再发明一套成本模型。
 * 三个条件缺一不可：有参考报告、truth 一致、且能看到成本比较。
 */
export function evaluateRebuildLoop(input: {
  hasReferenceReport: boolean;
  rerunIdentical    : boolean;
  hasCostComparison : boolean;
}): AcceptanceLoopEvaluationResult {
  const passed = input.hasReferenceReport && input.rerunIdentical && input.hasCostComparison;

  return {
    loopKey : "REBUILD",
    passed,
    blocking: !passed,
    summary : passed
      ? "T21 rerun comparison confirms identical truth and cost comparison is available."
      : "Rebuild loop evidence is incomplete or divergent.",
    evidenceLines: [
      `hasReferenceReport=${String(input.hasReferenceReport)}`,
      `rerunIdentical=${String(input.rerunIdentical)}`,
      `hasCostComparison=${String(input.hasCostComparison)}`
    ],
    artifactPaths: []
  };
}

/**
 * 最终 go/no-go 只接受显式通过的闭环、人工核验和风险登记。
 * 任何 blocking 失败都必须把最终决策压回 NO_GO，避免 runner 误放行。
 */
export function classifyFinalAcceptanceDecision(input: {
  loopResults : AcceptanceLoopDecisionSummary[];
  manualChecks: AcceptanceManualCheckSummary[];
  risks       : AcceptanceRiskSummary[];
}): "GO" | "NO_GO" {
  const hasBlockingLoop = input.loopResults.some((item) => !item.passed && item.blocking);
  const hasBlockingManual = input.manualChecks.some((item) => !item.passed && item.blocking);
  const hasBlockingRisk = input.risks.some((item) => item.severity === "BLOCKING");

  return hasBlockingLoop || hasBlockingManual || hasBlockingRisk ? "NO_GO" : "GO";
}
