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
  auditActions: string[];
}): AcceptanceLoopEvaluationResult {
  const missingActions = REQUIRED_REVIEW_ACTIONS.filter((action) => !input.auditActions.includes(action));

  return {
    loopKey : "REVIEW",
    passed  : missingActions.length === 0,
    blocking: missingActions.length > 0,
    summary : missingActions.length === 0
      ? "Observed all required review mutations."
      : `Missing review actions: ${missingActions.join(", ")}`,
    evidenceLines: missingActions.length === 0
      ? input.auditActions.map((action) => `Observed ${action}`)
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
