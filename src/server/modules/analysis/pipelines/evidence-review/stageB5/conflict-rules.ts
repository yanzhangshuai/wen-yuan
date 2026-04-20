import {
  ClaimKind,
  ConflictSeverity,
  ConflictType
} from "@/generated/prisma/enums";
import {
  STAGE_B5_LOW_EVIDENCE_THRESHOLD,
  type StageB5AliasClaimRow,
  type StageB5ConflictFinding,
  type StageB5EventClaimRow,
  type StageB5IdentityResolutionClaimRow,
  type StageB5RelationClaimRow,
  type StageB5RepositoryPayload,
  type StageB5TimeClaimRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";

const ALIAS_BLOCK_TAGS = [
  "NEGATIVE_ALIAS_RULE",
  "IMPERSONATION",
  "MISIDENTIFICATION",
  "CONFLICTING_CANONICAL_HINTS"
] as const;

type LowEvidenceClaimRow =
  | StageB5AliasClaimRow
  | StageB5EventClaimRow
  | StageB5RelationClaimRow
  | StageB5TimeClaimRow
  | StageB5IdentityResolutionClaimRow;

interface RelationPairGroup {
  orderedPair : [string, string];
  relationType: string;
  forwardRows : StageB5RelationClaimRow[];
  backwardRows: StageB5RelationClaimRow[];
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function extractAliasBlockTags(reviewNote: string | null): string[] {
  if (reviewNote === null) {
    return [];
  }

  return ALIAS_BLOCK_TAGS.filter((tag) => reviewNote.includes(tag));
}

/**
 * 从 Stage B 身份消解 reviewNote 中消费机器标签，避免 B.5 重新解释原文导致规则漂移。
 */
export function detectAliasConflicts(
  rows: StageB5IdentityResolutionClaimRow[]
): StageB5ConflictFinding[] {
  const findings: StageB5ConflictFinding[] = [];

  for (const row of rows) {
    const tags = extractAliasBlockTags(row.reviewNote);
    if (tags.length === 0 || row.personaCandidateId === null) {
      continue;
    }

    findings.push({
      conflictType              : ConflictType.ALIAS_CONFLICT,
      severity                  : ConflictSeverity.HIGH,
      reason                    : `Stage B 对 mention=${row.mentionId} 给出了互斥 alias/身份阻断信号。`,
      summary                   : `Alias 归并存在互斥阻断：candidate=${row.personaCandidateId}`,
      recommendedActionKey      : "VERIFY_IDENTITY_SPLIT",
      sourceStageKey            : "stage_b_identity_resolution",
      relatedClaimKind          : ClaimKind.IDENTITY_RESOLUTION,
      relatedClaimIds           : [row.id],
      relatedPersonaCandidateIds: [row.personaCandidateId],
      relatedChapterIds         : row.chapterId === null ? [] : [row.chapterId],
      evidenceSpanIds           : uniqueSorted(row.evidenceSpanIds),
      tags
    });
  }

  return findings;
}

function buildRelationPairGroupKey(row: StageB5RelationClaimRow): string | null {
  if (row.sourcePersonaCandidateId === null || row.targetPersonaCandidateId === null) {
    return null;
  }

  if (row.direction === "BIDIRECTIONAL" || row.direction === "UNDIRECTED") {
    return null;
  }

  const orderedPair = uniqueSorted([
    row.sourcePersonaCandidateId,
    row.targetPersonaCandidateId
  ]);

  return `${row.relationTypeKey}:${orderedPair[0]}:${orderedPair[1]}`;
}

function resolveRelationOrientation(
  row: StageB5RelationClaimRow,
  orderedPair: [string, string]
): "forward" | "backward" {
  const [left] = orderedPair;
  const sourceStartsAtLeft = row.sourcePersonaCandidateId === left;

  if (row.direction === "FORWARD") {
    return sourceStartsAtLeft ? "forward" : "backward";
  }

  return sourceStartsAtLeft ? "backward" : "forward";
}

function ensureRelationPairGroup(
  groups: Map<string, RelationPairGroup>,
  key: string,
  row: StageB5RelationClaimRow
): RelationPairGroup | null {
  const existing = groups.get(key);
  if (existing) {
    return existing;
  }

  if (row.sourcePersonaCandidateId === null || row.targetPersonaCandidateId === null) {
    return null;
  }

  const sortedPair = uniqueSorted([
    row.sourcePersonaCandidateId,
    row.targetPersonaCandidateId
  ]);
  const orderedPair: [string, string] = [sortedPair[0], sortedPair[1]];
  const created: RelationPairGroup = {
    orderedPair,
    relationType: row.relationTypeKey,
    forwardRows : [],
    backwardRows: []
  };
  groups.set(key, created);

  return created;
}

/**
 * 检测同一关系类型、同一候选人物对上的相反有向边；无向与双向关系不进入冲突判定。
 */
export function detectRelationDirectionConflicts(
  rows: StageB5RelationClaimRow[]
): StageB5ConflictFinding[] {
  const groups = new Map<string, RelationPairGroup>();

  for (const row of rows) {
    const key = buildRelationPairGroupKey(row);
    if (key === null) {
      continue;
    }

    const group = ensureRelationPairGroup(groups, key, row);
    if (group === null) {
      continue;
    }

    const orientation = resolveRelationOrientation(row, group.orderedPair);
    if (orientation === "forward") {
      group.forwardRows.push(row);
      continue;
    }

    group.backwardRows.push(row);
  }

  const findings: StageB5ConflictFinding[] = [];
  for (const group of groups.values()) {
    if (group.forwardRows.length === 0 || group.backwardRows.length === 0) {
      continue;
    }

    const conflictingRows = [...group.forwardRows, ...group.backwardRows];
    findings.push({
      conflictType              : ConflictType.RELATION_DIRECTION_CONFLICT,
      severity                  : ConflictSeverity.HIGH,
      reason                    : `同一人物对的关系 ${group.relationType} 出现了相反方向。`,
      summary                   : `关系方向冲突：${group.relationType} 在同一人物对上方向不一致。`,
      recommendedActionKey      : "VERIFY_RELATION_DIRECTION",
      sourceStageKey            : "stage_a_extraction",
      relatedClaimKind          : ClaimKind.RELATION,
      relatedClaimIds           : uniqueSorted(conflictingRows.map((row) => row.id)),
      relatedPersonaCandidateIds: group.orderedPair,
      relatedChapterIds         : uniqueSorted(conflictingRows.map((row) => row.chapterId)),
      evidenceSpanIds           : uniqueSorted(conflictingRows.flatMap((row) => row.evidenceSpanIds)),
      tags                      : ["REVERSED_DIRECTION"]
    });
  }

  return findings;
}

function collectCandidateIds(row: LowEvidenceClaimRow): string[] {
  if ("personaCandidateId" in row && row.personaCandidateId !== null) {
    return [row.personaCandidateId];
  }

  if ("subjectPersonaCandidateId" in row && row.subjectPersonaCandidateId !== null) {
    return [row.subjectPersonaCandidateId];
  }

  if (
    "sourcePersonaCandidateId" in row &&
    row.sourcePersonaCandidateId !== null &&
    row.targetPersonaCandidateId !== null
  ) {
    return uniqueSorted([row.sourcePersonaCandidateId, row.targetPersonaCandidateId]);
  }

  return [];
}

function lowEvidenceFromFamily(
  family: Exclude<ClaimKind, "CONFLICT_FLAG">,
  rows: LowEvidenceClaimRow[]
): StageB5ConflictFinding[] {
  return rows
    .filter((row) =>
      row.confidence <= STAGE_B5_LOW_EVIDENCE_THRESHOLD &&
      row.evidenceSpanIds.length === 1
    )
    .map((row) => ({
      conflictType        : ConflictType.LOW_EVIDENCE_CLAIM,
      severity            : ConflictSeverity.LOW,
      reason              : `claim=${row.id} 只有单条证据且置信度为 ${row.confidence.toFixed(2)}。`,
      summary             : `证据薄弱：${family} claim=${row.id}`,
      recommendedActionKey: "REQUEST_MORE_EVIDENCE",
      sourceStageKey      : family === ClaimKind.IDENTITY_RESOLUTION
        ? "stage_b_identity_resolution"
        : "stage_a_extraction",
      relatedClaimKind          : family,
      relatedClaimIds           : [row.id],
      relatedPersonaCandidateIds: collectCandidateIds(row),
      relatedChapterIds         : row.chapterId === null ? [] : [row.chapterId],
      evidenceSpanIds           : row.evidenceSpanIds,
      tags                      : ["LOW_CONFIDENCE", "SINGLE_EVIDENCE_SPAN"]
    }));
}

/**
 * 标记低置信度且只有单条证据的 reviewable claim，作为人工补证据入口而不改写原 claim。
 */
export function detectLowEvidenceClaimConflicts(input: Pick<
  StageB5RepositoryPayload,
  "aliasClaims" | "eventClaims" | "relationClaims" | "timeClaims" | "identityResolutionClaims"
>): StageB5ConflictFinding[] {
  return [
    ...lowEvidenceFromFamily(ClaimKind.ALIAS, input.aliasClaims),
    ...lowEvidenceFromFamily(ClaimKind.EVENT, input.eventClaims),
    ...lowEvidenceFromFamily(ClaimKind.RELATION, input.relationClaims),
    ...lowEvidenceFromFamily(ClaimKind.TIME, input.timeClaims),
    ...lowEvidenceFromFamily(ClaimKind.IDENTITY_RESOLUTION, input.identityResolutionClaims)
  ];
}
