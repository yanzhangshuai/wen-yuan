import type {
  ReviewClaimDetailRecord,
  ReviewClaimDetailResponse
} from "@/lib/services/review-matrix";

import { ReviewStateBadge } from "./review-state-badge";

interface TemporaryEvidenceAuditPanelProps {
  detail    : ReviewClaimDetailResponse;
  className?: string;
}

interface EvidenceItem {
  id                 : string;
  chapterId          : string;
  startOffset        : number | null;
  endOffset          : number | null;
  quotedText         : string;
  normalizedText     : string;
  speakerHint        : string | null;
  narrativeRegionType: string | null;
  createdAt          : string | null;
}

interface AuditHistoryItem {
  id             : string;
  action         : string;
  actorUserId    : string | null;
  note           : string | null;
  evidenceSpanIds: string[];
  beforeState    : unknown;
  afterState     : unknown;
  createdAt      : string | null;
}

const CLAIM_KIND_LABELS: Record<string, string> = {
  ALIAS              : "别名",
  EVENT              : "事件",
  RELATION           : "关系",
  TIME               : "时间",
  IDENTITY_RESOLUTION: "身份归并",
  CONFLICT_FLAG      : "冲突"
};

const CLAIM_SOURCE_LABELS: Record<string, string> = {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readString(item))
    .filter((item): item is string => item !== null);
}

function coerceEvidenceItem(value: unknown): EvidenceItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const chapterId = readString(value.chapterId);
  const quotedText = readString(value.quotedText) ?? readString(value.normalizedText);

  if (id === null || chapterId === null || quotedText === null) {
    return null;
  }

  return {
    id,
    chapterId,
    startOffset        : readNumber(value.startOffset),
    endOffset          : readNumber(value.endOffset),
    quotedText,
    normalizedText     : readString(value.normalizedText) ?? quotedText,
    speakerHint        : readString(value.speakerHint),
    narrativeRegionType: readString(value.narrativeRegionType),
    createdAt          : readString(value.createdAt)
  };
}

function coerceAuditHistoryItem(value: unknown): AuditHistoryItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const action = readString(value.action);

  if (id === null || action === null) {
    return null;
  }

  return {
    id,
    action,
    actorUserId    : readString(value.actorUserId),
    note           : readString(value.note),
    evidenceSpanIds: readStringArray(value.evidenceSpanIds),
    beforeState    : value.beforeState ?? null,
    afterState     : value.afterState ?? null,
    createdAt      : readString(value.createdAt)
  };
}

function toClaimKindLabel(claimKind: string): string {
  return CLAIM_KIND_LABELS[claimKind] ?? claimKind;
}

function toClaimSourceLabel(source: string): string {
  return CLAIM_SOURCE_LABELS[source] ?? source;
}

function toAuditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

function toNarrativeRegionLabel(regionType: string | null): string | null {
  if (regionType === null) {
    return null;
  }

  return NARRATIVE_REGION_LABELS[regionType] ?? regionType;
}

function toIsoDateTime(value: string | null): string {
  if (value === null) {
    return "时间未知";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().replace("T", " ").slice(0, 19);
}

function compareAuditHistoryNewestFirst(
  left: AuditHistoryItem,
  right: AuditHistoryItem
): number {
  const leftTime = left.createdAt === null ? 0 : Date.parse(left.createdAt);
  const rightTime = right.createdAt === null ? 0 : Date.parse(right.createdAt);

  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  return right.id.localeCompare(left.id);
}

function toJsonPreview(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
}

function readClaimExtraString(
  claim: ReviewClaimDetailRecord,
  key: string
): string | null {
  return readString(claim[key]);
}

function buildBasisSummaryLines(claim: ReviewClaimDetailRecord): string[] {
  const lines = [
    claim.chapterId ? `章节：${claim.chapterId}` : null,
    claim.relationTypeKey ? `关系类型：${claim.relationTypeKey}` : null,
    claim.timeLabel ? `时间：${claim.timeLabel}` : null,
    `来源：${toClaimSourceLabel(claim.source)}`
  ];

  const summary = readClaimExtraString(claim, "relationLabel")
    ?? readClaimExtraString(claim, "predicate")
    ?? readClaimExtraString(claim, "summary")
    ?? readClaimExtraString(claim, "reason")
    ?? readClaimExtraString(claim, "rationale")
    ?? readClaimExtraString(claim, "aliasText")
    ?? readClaimExtraString(claim, "normalizedLabel")
    ?? readClaimExtraString(claim, "rawTimeText");

  if (summary !== null) {
    lines.push(`摘要：${summary}`);
  }

  return lines.filter((line): line is string => line !== null);
}

/**
 * T13 临时适配器：先把 T12 detail DTO 以 reviewer 可读方式展示出来。
 * 等到 T16 抽取共享 evidence/audit 面板后，这里应被替换或下沉为更薄的包装层。
 */
export function TemporaryEvidenceAuditPanel({
  detail,
  className
}: TemporaryEvidenceAuditPanelProps) {
  const evidenceItems = detail.evidence
    .map((item) => coerceEvidenceItem(item))
    .filter((item): item is EvidenceItem => item !== null);
  const auditHistory = detail.auditHistory
    .map((item) => coerceAuditHistoryItem(item))
    .filter((item): item is AuditHistoryItem => item !== null)
    .sort(compareAuditHistoryNewestFirst);
  const basisSummaryLines = detail.basisClaim === null
    ? []
    : buildBasisSummaryLines(detail.basisClaim);

  return (
    <section
      className={[
        "temporary-evidence-audit-panel grid gap-4 lg:grid-cols-2",
        className ?? ""
      ].join(" ").trim()}
    >
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">原文证据</h2>
        {evidenceItems.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">暂无原文证据</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {evidenceItems.map((item) => {
              const regionLabel = toNarrativeRegionLabel(item.narrativeRegionType);
              const metaParts = [
                `章节：${item.chapterId}`,
                regionLabel ? `区段：${regionLabel}` : null,
                item.startOffset !== null && item.endOffset !== null
                  ? `偏移：${item.startOffset}-${item.endOffset}`
                  : null,
                item.speakerHint ? `说话人：${item.speakerHint}` : null
              ].filter((part): part is string => part !== null);

              return (
                <li
                  key={item.id}
                  className="rounded-lg border bg-muted/20 p-3"
                  data-testid="temporary-evidence-item"
                >
                  <blockquote className="border-l-2 border-border pl-3 text-sm leading-6 text-foreground">
                    {item.quotedText}
                  </blockquote>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {metaParts.join(" · ")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    入库时间：{toIsoDateTime(item.createdAt)}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight">AI 提取依据</h2>
        {detail.basisClaim === null ? (
          <p className="mt-3 text-sm text-muted-foreground">暂无 AI 依据</p>
        ) : (
          <div className="mt-3 rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {toClaimKindLabel(detail.basisClaim.claimKind)}
              </p>
              <ReviewStateBadge
                reviewState={detail.basisClaim.reviewState}
                conflictState={detail.basisClaim.conflictState}
              />
            </div>
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {basisSummaryLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm lg:col-span-2">
        <h2 className="text-base font-semibold tracking-tight">审核记录（最新在上）</h2>
        {auditHistory.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">暂无审核记录</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {auditHistory.map((item) => {
              const beforeState = toJsonPreview(item.beforeState);
              const afterState = toJsonPreview(item.afterState);

              return (
                <li
                  key={item.id}
                  className="rounded-lg border bg-muted/20 p-3"
                  data-testid="temporary-audit-item"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {toAuditActionLabel(item.action)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {toIsoDateTime(item.createdAt)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    执行人：{item.actorUserId ?? "系统"}
                  </p>
                  {item.note ? (
                    <p className="mt-2 text-sm text-foreground">{item.note}</p>
                  ) : null}
                  {item.evidenceSpanIds.length > 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      关联证据：{item.evidenceSpanIds.join("、")}
                    </p>
                  ) : null}
                  {beforeState ? (
                    <pre className="mt-2 overflow-x-auto rounded-md bg-background p-2 text-xs text-muted-foreground">
                      变更前：{beforeState}
                    </pre>
                  ) : null}
                  {afterState ? (
                    <pre className="mt-2 overflow-x-auto rounded-md bg-background p-2 text-xs text-muted-foreground">
                      变更后：{afterState}
                    </pre>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </section>
  );
}
