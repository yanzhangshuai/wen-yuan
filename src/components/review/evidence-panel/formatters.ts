import type {
  ClaimSource,
  ReviewClaimAuditHistoryItemDto,
  ReviewClaimDetailRecord,
  ReviewClaimEvidenceSpanDto,
  ReviewClaimRawOutputSummaryDto,
  ReviewClaimVersionDiffDto,
  ReviewableClaimKind
} from "@/lib/services/review-matrix";

const CLAIM_KIND_LABELS: Record<ReviewableClaimKind, string> = {
  ALIAS              : "别名",
  EVENT              : "事迹",
  RELATION           : "关系",
  TIME               : "时间",
  IDENTITY_RESOLUTION: "身份归并",
  CONFLICT_FLAG      : "冲突"
};

const CLAIM_SOURCE_LABELS: Record<ClaimSource, string> = {
  AI      : "AI 抽取",
  RULE    : "规则检测",
  MANUAL  : "人工创建",
  IMPORTED: "导入"
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  ACCEPT                  : "接受",
  REJECT                  : "拒绝",
  DEFER                   : "暂缓",
  EDIT                    : "修订",
  RELINK_EVIDENCE         : "重绑证据",
  CREATE_MANUAL_CLAIM     : "创建手工 claim",
  MERGE_PERSONA           : "合并人物",
  SPLIT_PERSONA           : "拆分人物",
  CHANGE_RELATION_TYPE    : "修改关系类型",
  CHANGE_RELATION_INTERVAL: "修改关系区间"
};

const NARRATIVE_REGION_LABELS: Record<string, string> = {
  TITLE           : "标题",
  NARRATIVE       : "叙事",
  DIALOGUE_LEAD   : "对白引导",
  DIALOGUE_CONTENT: "对白",
  POEM            : "诗词",
  COMMENTARY      : "评述",
  UNKNOWN         : "未分类"
};

const VERSION_SOURCE_LABELS: Record<ReviewClaimVersionDiffDto["versionSource"], string> = {
  AUDIT_EDIT    : "最近一次修订",
  MANUAL_LINEAGE: "手工 lineage 比对",
  NONE          : "无版本差异"
};

export function formatClaimKind(claimKind: string | null): string {
  if (claimKind === null) {
    return "未分类";
  }

  return CLAIM_KIND_LABELS[claimKind as ReviewableClaimKind] ?? claimKind;
}

export function formatClaimSource(source: string | null): string {
  if (source === null) {
    return "来源未知";
  }

  return CLAIM_SOURCE_LABELS[source as ClaimSource] ?? source;
}

export function formatAuditAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function formatNarrativeRegion(regionType: string | null): string | null {
  if (regionType === null) {
    return null;
  }

  return NARRATIVE_REGION_LABELS[regionType] ?? regionType;
}

export function formatVersionSource(source: ReviewClaimVersionDiffDto["versionSource"]): string {
  return VERSION_SOURCE_LABELS[source];
}

export function formatDateTime(value: string | null): string {
  if (value === null) {
    return "时间未知";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

export function formatNullableText(value: string | null, fallback = "未填写"): string {
  if (value === null) {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function formatConfidence(confidence: number | null): string {
  if (confidence === null || Number.isNaN(confidence)) {
    return "置信度未知";
  }

  return `置信度 ${(confidence * 100).toFixed(0)}%`;
}

export function formatChapterLabel(chapterLabel: string | null, chapterId: string): string {
  return formatNullableText(chapterLabel, chapterId);
}

export function sortEvidence(
  evidence: ReviewClaimEvidenceSpanDto[]
): ReviewClaimEvidenceSpanDto[] {
  return [...evidence].sort((left, right) => {
    const byChapter = left.chapterId.localeCompare(right.chapterId);
    if (byChapter !== 0) {
      return byChapter;
    }

    const leftStart = left.startOffset ?? Number.MAX_SAFE_INTEGER;
    const rightStart = right.startOffset ?? Number.MAX_SAFE_INTEGER;
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }

    return left.id.localeCompare(right.id);
  });
}

export function sortAuditHistory(
  auditHistory: ReviewClaimAuditHistoryItemDto[]
): ReviewClaimAuditHistoryItemDto[] {
  return [...auditHistory].sort((left, right) => {
    const leftTime = left.createdAt === null ? 0 : Date.parse(left.createdAt);
    const rightTime = right.createdAt === null ? 0 : Date.parse(right.createdAt);

    if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return right.id.localeCompare(left.id);
  });
}

export function buildBasisFallbackLines(
  claim: ReviewClaimDetailRecord | null
): string[] {
  if (claim === null) {
    return [];
  }

  const lines = [
    claim.chapterId ? `章节：${claim.chapterId}` : null,
    claim.relationTypeKey ? `关系类型：${claim.relationTypeKey}` : null,
    claim.timeLabel ? `时间：${claim.timeLabel}` : null,
    `来源：${formatClaimSource(claim.source)}`
  ];

  const summaryCandidates = [
    claim.relationLabel,
    claim.predicate,
    claim.summary,
    claim.reason,
    claim.rationale,
    claim.aliasText,
    claim.normalizedLabel,
    claim.rawTimeText
  ];
  const summary = summaryCandidates.find((value) => typeof value === "string" && value.trim().length > 0);

  if (typeof summary === "string") {
    lines.push(`摘要：${summary}`);
  }

  return lines.filter((line): line is string => line !== null);
}

export function collectRawOutputWarnings(
  rawOutput: ReviewClaimRawOutputSummaryDto | null
): string[] {
  if (rawOutput === null) {
    return [];
  }

  return [
    rawOutput.parseError,
    rawOutput.schemaError,
    rawOutput.discardReason
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
