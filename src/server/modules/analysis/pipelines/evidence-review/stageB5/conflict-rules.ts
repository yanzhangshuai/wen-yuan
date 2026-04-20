import {
  ClaimKind,
  ConflictSeverity,
  ConflictType
} from "@/generated/prisma/enums";
import { areMutuallyExclusive } from "@/server/modules/analysis/preprocessor/locationExclusivityGraph";
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

/**
 * 保守标记同一候选人在死亡章节之后继续发生非死亡事件的情况，不尝试推断复活、梦境等文学叙事。
 */
export function detectPostMortemActionConflicts(
  rows: StageB5EventClaimRow[]
): StageB5ConflictFinding[] {
  const deathByCandidate = new Map<string, StageB5EventClaimRow>();

  for (const row of rows) {
    const candidateId = row.subjectPersonaCandidateId;
    if (row.eventCategory !== "DEATH" || candidateId === null) {
      continue;
    }

    const current = deathByCandidate.get(candidateId);
    if (!current || row.chapterNo < current.chapterNo) {
      deathByCandidate.set(candidateId, row);
    }
  }

  const findings: StageB5ConflictFinding[] = [];
  for (const row of rows) {
    const candidateId = row.subjectPersonaCandidateId;
    if (candidateId === null || row.eventCategory === "DEATH") {
      continue;
    }

    const death = deathByCandidate.get(candidateId);
    if (!death || row.chapterNo <= death.chapterNo) {
      continue;
    }

    findings.push({
      conflictType              : ConflictType.POST_MORTEM_ACTION,
      severity                  : ConflictSeverity.CRITICAL,
      reason                    : `candidate=${candidateId} 在第 ${death.chapterNo} 回死亡后，又在第 ${row.chapterNo} 回出现主动事件。`,
      summary                   : `死亡后行动冲突：candidate=${candidateId} 在死亡章节之后仍有事件。`,
      recommendedActionKey      : "VERIFY_IDENTITY_SPLIT",
      sourceStageKey            : "stage_a_extraction",
      relatedClaimKind          : ClaimKind.EVENT,
      relatedClaimIds           : uniqueSorted([death.id, row.id]),
      relatedPersonaCandidateIds: [candidateId],
      relatedChapterIds         : uniqueSorted([death.chapterId, row.chapterId]),
      evidenceSpanIds           : uniqueSorted([...death.evidenceSpanIds, ...row.evidenceSpanIds]),
      tags                      : ["POST_DEATH_EVENT"]
    });
  }

  return findings;
}

/**
 * 只复用通用地点互斥表做同候选人、同章节的硬冲突检测，避免把作品专属地名常识写进规则层。
 */
export function detectImpossibleLocationConflicts(
  rows: StageB5EventClaimRow[]
): StageB5ConflictFinding[] {
  const groups = new Map<string, StageB5EventClaimRow[]>();

  for (const row of rows) {
    const candidateId = row.subjectPersonaCandidateId;
    if (candidateId === null || row.locationText === null) {
      continue;
    }

    const key = `${candidateId}:${row.chapterId}`;
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }

  const findings: StageB5ConflictFinding[] = [];
  for (const group of groups.values()) {
    for (let index = 0; index < group.length; index += 1) {
      const left = group[index];
      if (!left) {
        continue;
      }

      for (let inner = index + 1; inner < group.length; inner += 1) {
        const right = group[inner];
        if (!right) {
          continue;
        }

        const candidateId = left.subjectPersonaCandidateId;
        if (
          candidateId === null ||
          left.locationText === null ||
          right.locationText === null ||
          !areMutuallyExclusive(left.locationText, right.locationText)
        ) {
          continue;
        }

        findings.push({
          conflictType              : ConflictType.IMPOSSIBLE_LOCATION,
          severity                  : ConflictSeverity.HIGH,
          reason                    : `candidate=${candidateId} 在同一章节同时落在互斥地点 ${left.locationText} / ${right.locationText}。`,
          summary                   : `同章跨地点冲突：${left.locationText} 与 ${right.locationText} 互斥。`,
          recommendedActionKey      : "VERIFY_LOCATION_ATTRIBUTION",
          sourceStageKey            : "stage_a_extraction",
          relatedClaimKind          : ClaimKind.EVENT,
          relatedClaimIds           : uniqueSorted([left.id, right.id]),
          relatedPersonaCandidateIds: [candidateId],
          relatedChapterIds         : [left.chapterId],
          evidenceSpanIds           : uniqueSorted([...left.evidenceSpanIds, ...right.evidenceSpanIds]),
          tags                      : ["MUTUALLY_EXCLUSIVE_LOCATIONS"]
        });
      }
    }
  }

  return findings;
}

export function detectTimeOrderConflicts(input: {
  eventClaims   : StageB5EventClaimRow[];
  relationClaims: StageB5RelationClaimRow[];
  timeClaims    : StageB5TimeClaimRow[];
}): StageB5ConflictFinding[] {
  const timeById = new Map(input.timeClaims.map((row) => [row.id, row]));
  const findings: StageB5ConflictFinding[] = [];

  for (const event of input.eventClaims) {
    if (event.timeHintId === null) {
      continue;
    }

    const time = timeById.get(event.timeHintId);
    if (!time) {
      continue;
    }

    const isBeforeRange = time.chapterRangeStart !== null && event.chapterNo < time.chapterRangeStart;
    const isAfterRange = time.chapterRangeEnd !== null && event.chapterNo > time.chapterRangeEnd;
    if (!isBeforeRange && !isAfterRange) {
      continue;
    }

    findings.push({
      conflictType              : ConflictType.TIME_ORDER_CONFLICT,
      severity                  : ConflictSeverity.HIGH,
      reason                    : `事件 claim=${event.id} 位于第 ${event.chapterNo} 回，但 timeHint=${time.id} 约束在 ${time.chapterRangeStart}-${time.chapterRangeEnd}。`,
      summary                   : "时间顺序冲突：事件章节超出 timeHint 范围。",
      recommendedActionKey      : "VERIFY_TIME_ALIGNMENT",
      sourceStageKey            : "stage_a_extraction",
      relatedClaimKind          : null,
      relatedClaimIds           : uniqueSorted([event.id, time.id]),
      relatedPersonaCandidateIds: event.subjectPersonaCandidateId ? [event.subjectPersonaCandidateId] : [],
      relatedChapterIds         : [event.chapterId],
      evidenceSpanIds           : uniqueSorted([...event.evidenceSpanIds, ...time.evidenceSpanIds]),
      tags                      : ["EVENT_TIME_RANGE_MISMATCH"]
    });
  }

  for (const relation of input.relationClaims) {
    if (relation.timeHintId === null) {
      continue;
    }

    const time = timeById.get(relation.timeHintId);
    if (!time) {
      continue;
    }

    const start = relation.effectiveChapterStart ?? relation.chapterNo;
    const end = relation.effectiveChapterEnd ?? relation.chapterNo;
    const isBeforeRange = time.chapterRangeStart !== null && end < time.chapterRangeStart;
    const isAfterRange = time.chapterRangeEnd !== null && start > time.chapterRangeEnd;
    if (!isBeforeRange && !isAfterRange) {
      continue;
    }

    const relatedPersonaCandidateIds = uniqueSorted([
      relation.sourcePersonaCandidateId ?? "",
      relation.targetPersonaCandidateId ?? ""
    ].filter(Boolean));

    findings.push({
      conflictType        : ConflictType.TIME_ORDER_CONFLICT,
      severity            : ConflictSeverity.HIGH,
      reason              : `关系 claim=${relation.id} 的有效区间 ${start}-${end} 与 timeHint=${time.id} 的章节范围不一致。`,
      summary             : "时间顺序冲突：关系生效区间与 timeHint 范围不一致。",
      recommendedActionKey: "VERIFY_TIME_ALIGNMENT",
      sourceStageKey      : "stage_a_extraction",
      relatedClaimKind    : null,
      relatedClaimIds     : uniqueSorted([relation.id, time.id]),
      relatedPersonaCandidateIds,
      relatedChapterIds   : [relation.chapterId],
      evidenceSpanIds     : uniqueSorted([...relation.evidenceSpanIds, ...time.evidenceSpanIds]),
      tags                : ["RELATION_TIME_RANGE_MISMATCH"]
    });
  }

  return findings;
}

export function detectStageB5Conflicts(input: StageB5RepositoryPayload): StageB5ConflictFinding[] {
  return [
    ...detectAliasConflicts(input.identityResolutionClaims),
    ...detectRelationDirectionConflicts(input.relationClaims),
    ...detectLowEvidenceClaimConflicts(input),
    ...detectPostMortemActionConflicts(input.eventClaims),
    ...detectImpossibleLocationConflicts(input.eventClaims),
    ...detectTimeOrderConflicts({
      eventClaims   : input.eventClaims,
      relationClaims: input.relationClaims,
      timeClaims    : input.timeClaims
    })
  ].sort((left, right) => left.summary.localeCompare(right.summary));
}
