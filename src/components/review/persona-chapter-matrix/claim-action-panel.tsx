"use client";

import { useState } from "react";

import {
  buildRelationEditPayload,
  type RelationEditDraftState
} from "@/components/review/relation-editor/relation-draft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  submitReviewClaimAction,
  type ClaimReviewState,
  type PersonaChapterRelationTypeOptionDto,
  type RelationDirection,
  type ReviewClaimActionType,
  type ReviewClaimDetailRecord,
  type ReviewClaimDetailResponse,
  type ReviewClaimListItem
} from "@/lib/services/review-matrix";
import { cn } from "@/lib/utils";

type SimpleAction = Extract<ReviewClaimActionType, "ACCEPT" | "REJECT" | "DEFER">;

interface ClaimActionPanelProps {
  bookId             : string;
  claim              : ReviewClaimListItem;
  detail             : ReviewClaimDetailResponse | null;
  relationTypeOptions: PersonaChapterRelationTypeOptionDto[];
  onMutationSuccess  : () => void | Promise<void>;
  className         ?: string;
}

interface EventEditDraftState {
  chapterId                : string;
  confidence               : string;
  runId                    : string;
  subjectMentionId         : string;
  subjectPersonaCandidateId: string;
  predicate                : string;
  objectText               : string;
  objectPersonaCandidateId : string;
  locationText             : string;
  timeHintId               : string;
  eventCategory            : string;
  narrativeLens            : string;
  evidenceSpanIdsText      : string;
}

const EVENT_CATEGORY_OPTIONS = [
  ["EVENT", "一般事件"],
  ["EXAM", "科举"],
  ["CAREER", "仕途"],
  ["SOCIAL", "社交"],
  ["TRAVEL", "行旅"],
  ["BIRTH", "出生"],
  ["DEATH", "死亡"]
] as const;

const NARRATIVE_LENS_OPTIONS = [
  ["SELF", "本人"],
  ["IMPERSONATING", "冒名"],
  ["QUOTED", "转述"],
  ["REPORTED", "传闻"],
  ["HISTORICAL", "史实"]
] as const;

const RELATION_DIRECTION_OPTIONS: Array<[RelationDirection, string]> = [
  ["FORWARD", "正向"],
  ["REVERSE", "反向"],
  ["BIDIRECTIONAL", "双向"],
  ["UNDIRECTED", "无方向"]
];

const SIMPLE_ACTION_LABELS: Record<SimpleAction, string> = {
  ACCEPT: "确认采纳",
  REJECT: "删除/驳回",
  DEFER : "暂缓处理"
};

function getSimpleActions(reviewState: ClaimReviewState): SimpleAction[] {
  switch (reviewState) {
    case "PENDING":
    case "CONFLICTED":
      return ["ACCEPT", "REJECT", "DEFER"];
    case "ACCEPTED":
    case "EDITED":
      return ["DEFER"];
    case "DEFERRED":
      return ["ACCEPT", "REJECT"];
    case "REJECTED":
      return [];
  }
}

function canEditClaim(claim: ReviewClaimListItem): boolean {
  return claim.claimKind === "EVENT" || claim.claimKind === "RELATION";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "审核动作执行失败，请稍后重试。";
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toNumberText(value: unknown, fallback: number | null = null): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback === null ? "" : String(fallback);
}

function toNullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toEvidenceSpanIdsText(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value.filter((item): item is string => typeof item === "string").join(", ");
}

function parseEvidenceSpanIds(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function buildEventEditDraftState(claim: ReviewClaimDetailRecord): EventEditDraftState {
  return {
    chapterId                : toStringValue(claim.chapterId),
    confidence               : toNumberText(claim.confidence, 1),
    runId                    : toStringValue(claim.runId),
    subjectMentionId         : toStringValue(claim.subjectMentionId),
    subjectPersonaCandidateId: toStringValue(claim.subjectPersonaCandidateId),
    predicate                : toStringValue(claim.predicate),
    objectText               : toStringValue(claim.objectText),
    objectPersonaCandidateId : toStringValue(claim.objectPersonaCandidateId),
    locationText             : toStringValue(claim.locationText),
    timeHintId               : toStringValue(claim.timeHintId),
    eventCategory            : toStringValue(claim.eventCategory, "EVENT"),
    narrativeLens            : toStringValue(claim.narrativeLens, "SELF"),
    evidenceSpanIdsText      : toEvidenceSpanIdsText(claim.evidenceSpanIds)
  };
}

function buildRelationEditDraftState(claim: ReviewClaimDetailRecord): RelationEditDraftState {
  return {
    chapterId               : toStringValue(claim.chapterId),
    confidence              : toNumberText(claim.confidence, 1),
    runId                   : toStringValue(claim.runId),
    sourceMentionId         : toStringValue(claim.sourceMentionId),
    targetMentionId         : toStringValue(claim.targetMentionId),
    sourcePersonaCandidateId: toStringValue(claim.sourcePersonaCandidateId),
    targetPersonaCandidateId: toStringValue(claim.targetPersonaCandidateId),
    relationTypeKey         : toStringValue(claim.relationTypeKey),
    relationLabel           : toStringValue(claim.relationLabel),
    direction               : toRelationDirection(claim.direction),
    effectiveChapterStart   : toNumberText(claim.effectiveChapterStart),
    effectiveChapterEnd     : toNumberText(claim.effectiveChapterEnd),
    timeHintId              : toStringValue(claim.timeHintId),
    evidenceSpanIdsText     : toEvidenceSpanIdsText(claim.evidenceSpanIds)
  };
}

function toRelationDirection(value: unknown): RelationDirection {
  return RELATION_DIRECTION_OPTIONS.some(([direction]) => direction === value)
    ? value as RelationDirection
    : "FORWARD";
}

function toNormalizedNote(note: string): string | null {
  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildEventEditPayload(draft: EventEditDraftState) {
  return {
    bookId                   : "",
    chapterId                : draft.chapterId,
    confidence               : Number(draft.confidence),
    runId                    : draft.runId,
    subjectMentionId         : toNullableString(draft.subjectMentionId),
    subjectPersonaCandidateId: toNullableString(draft.subjectPersonaCandidateId),
    predicate                : draft.predicate.trim(),
    objectText               : toNullableString(draft.objectText),
    objectPersonaCandidateId : toNullableString(draft.objectPersonaCandidateId),
    locationText             : toNullableString(draft.locationText),
    timeHintId               : toNullableString(draft.timeHintId),
    eventCategory            : draft.eventCategory,
    narrativeLens            : draft.narrativeLens,
    evidenceSpanIds          : parseEvidenceSpanIds(draft.evidenceSpanIdsText)
  };
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange
}: {
  id      : string;
  label   : string;
  value   : string;
  options : readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </div>
  );
}

/**
 * 抽屉内 claim 审核动作面板：
 * - 所有写入只调用 T12 action endpoint，不在浏览器伪造事实状态；
 * - 编辑只支持 T13 范围内的事迹/关系结构化字段，其余 claim family 保持轻量审核动作。
 */
export function ClaimActionPanel({
  bookId,
  claim,
  detail,
  relationTypeOptions,
  onMutationSuccess,
  className
}: ClaimActionPanelProps) {
  const [note, setNote] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [eventDraft, setEventDraft] = useState<EventEditDraftState | null>(null);
  const [relationDraft, setRelationDraft] = useState<RelationEditDraftState | null>(null);
  const simpleActions = getSimpleActions(claim.reviewState);
  const isEditable = canEditClaim(claim) && detail !== null;

  async function runMutation(work: () => Promise<void>) {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await work();
      setIsEditing(false);
      await onMutationSuccess();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function openEditForm() {
    if (!detail || !canEditClaim(claim)) {
      return;
    }

    if (claim.claimKind === "EVENT") {
      setEventDraft(buildEventEditDraftState(detail.claim));
      setRelationDraft(null);
    } else if (claim.claimKind === "RELATION") {
      setRelationDraft(buildRelationEditDraftState(detail.claim));
      setEventDraft(null);
    }

    setIsEditing(true);
    setErrorMessage(null);
  }

  async function submitSimpleAction(action: SimpleAction) {
    await runMutation(async () => {
      await submitReviewClaimAction({
        bookId,
        claimKind: claim.claimKind,
        claimId  : claim.claimId,
        action,
        note     : toNormalizedNote(note)
      });
    });
  }

  async function submitEdit() {
    await runMutation(async () => {
      if (claim.claimKind === "EVENT" && eventDraft) {
        await submitReviewClaimAction({
          bookId,
          claimKind: claim.claimKind,
          claimId  : claim.claimId,
          action   : "EDIT",
          note     : toNormalizedNote(note),
          draft    : {
            ...buildEventEditPayload(eventDraft),
            bookId
          }
        });
        return;
      }

      if (claim.claimKind === "RELATION" && relationDraft) {
        await submitReviewClaimAction({
          bookId,
          claimKind: claim.claimKind,
          claimId  : claim.claimId,
          action   : "EDIT",
          note     : toNormalizedNote(note),
          draft    : buildRelationEditPayload({ draft: relationDraft, relationTypeOptions, bookId })
        });
      }
    });
  }

  return (
    <section className={cn("space-y-4 rounded-xl border bg-background p-4", className)}>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">审核动作</h3>
        <p className="text-xs text-muted-foreground">
          当前状态：{claim.reviewState}。动作会写入 claim-first 审核记录，并触发矩阵摘要刷新。
        </p>
      </div>

      {claim.reviewState === "REJECTED" ? (
        <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          该记录已删除/驳回，暂无可执行动作。
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={`claim-action-note-${claim.claimId}`}>审核备注（可选）</Label>
            <Textarea
              id={`claim-action-note-${claim.claimId}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="例如：证据范围需要复核"
              rows={2}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {simpleActions.map((action) => (
              <Button
                key={action}
                type="button"
                variant={action === "REJECT" ? "destructive" : "outline"}
                disabled={isSubmitting}
                onClick={() => {
                  void submitSimpleAction(action);
                }}
              >
                {SIMPLE_ACTION_LABELS[action]}
              </Button>
            ))}

            {isEditable ? (
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={openEditForm}
              >
                编辑记录
              </Button>
            ) : claim.claimKind !== "EVENT" && claim.claimKind !== "RELATION" ? (
              <p className="basis-full text-xs text-muted-foreground">
                当前类型暂不支持结构化编辑，可先执行采纳、删除/驳回或暂缓。
              </p>
            ) : null}
          </div>
        </>
      )}

      {errorMessage ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {isEditing && claim.claimKind === "EVENT" && eventDraft ? (
        <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`event-predicate-${claim.claimId}`}>事迹谓语</Label>
              <Input
                id={`event-predicate-${claim.claimId}`}
                value={eventDraft.predicate}
                onChange={(event) => setEventDraft({
                  ...eventDraft,
                  predicate: event.target.value
                })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`event-object-${claim.claimId}`}>对象文本</Label>
              <Input
                id={`event-object-${claim.claimId}`}
                value={eventDraft.objectText}
                onChange={(event) => setEventDraft({
                  ...eventDraft,
                  objectText: event.target.value
                })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`event-location-${claim.claimId}`}>地点</Label>
              <Input
                id={`event-location-${claim.claimId}`}
                value={eventDraft.locationText}
                onChange={(event) => setEventDraft({
                  ...eventDraft,
                  locationText: event.target.value
                })}
              />
            </div>
            <SelectField
              id={`event-category-${claim.claimId}`}
              label="事迹类别"
              value={eventDraft.eventCategory}
              options={EVENT_CATEGORY_OPTIONS}
              onChange={(value) => setEventDraft({
                ...eventDraft,
                eventCategory: value
              })}
            />
            <SelectField
              id={`event-lens-${claim.claimId}`}
              label="叙述视角"
              value={eventDraft.narrativeLens}
              options={NARRATIVE_LENS_OPTIONS}
              onChange={(value) => setEventDraft({
                ...eventDraft,
                narrativeLens: value
              })}
            />
            <div className="space-y-1.5">
              <Label htmlFor={`event-evidence-${claim.claimId}`}>证据 Span IDs（逗号分隔）</Label>
              <Input
                id={`event-evidence-${claim.claimId}`}
                value={eventDraft.evidenceSpanIdsText}
                onChange={(event) => setEventDraft({
                  ...eventDraft,
                  evidenceSpanIdsText: event.target.value
                })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setIsEditing(false)}
            >
              取消编辑
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                void submitEdit();
              }}
            >
              保存编辑
            </Button>
          </div>
        </div>
      ) : null}

      {isEditing && claim.claimKind === "RELATION" && relationDraft ? (
        <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`relation-key-${claim.claimId}`}>关系类型 Key</Label>
              <Input
                id={`relation-key-${claim.claimId}`}
                value={relationDraft.relationTypeKey}
                onChange={(event) => setRelationDraft({
                  ...relationDraft,
                  relationTypeKey: event.target.value
                })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`relation-label-${claim.claimId}`}>关系显示名称</Label>
              <Input
                id={`relation-label-${claim.claimId}`}
                value={relationDraft.relationLabel}
                onChange={(event) => setRelationDraft({
                  ...relationDraft,
                  relationLabel: event.target.value
                })}
              />
            </div>
            <SelectField
              id={`relation-direction-${claim.claimId}`}
              label="关系方向"
              value={relationDraft.direction}
              options={RELATION_DIRECTION_OPTIONS}
              onChange={(value) => setRelationDraft({
                ...relationDraft,
                direction: value as RelationDirection
              })}
            />
            <div className="space-y-1.5">
              <Label htmlFor={`relation-start-${claim.claimId}`}>生效起始章节</Label>
              <Input
                id={`relation-start-${claim.claimId}`}
                value={relationDraft.effectiveChapterStart}
                onChange={(event) => setRelationDraft({
                  ...relationDraft,
                  effectiveChapterStart: event.target.value
                })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`relation-end-${claim.claimId}`}>生效结束章节</Label>
              <Input
                id={`relation-end-${claim.claimId}`}
                value={relationDraft.effectiveChapterEnd}
                onChange={(event) => setRelationDraft({
                  ...relationDraft,
                  effectiveChapterEnd: event.target.value
                })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`relation-evidence-${claim.claimId}`}>证据 Span IDs（逗号分隔）</Label>
              <Input
                id={`relation-evidence-${claim.claimId}`}
                value={relationDraft.evidenceSpanIdsText}
                onChange={(event) => setRelationDraft({
                  ...relationDraft,
                  evidenceSpanIdsText: event.target.value
                })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setIsEditing(false)}
            >
              取消编辑
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                void submitEdit();
              }}
            >
              保存编辑
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
