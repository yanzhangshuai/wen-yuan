"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ClaimActionPanel } from "@/components/review/persona-chapter-matrix/claim-action-panel";
import type { PersonaChapterRelationTypeOptionDto } from "@/lib/services/review-matrix";
import {
  submitReviewClaimAction,
  type ClaimReviewState,
  type ReviewClaimActionType,
  type ReviewClaimDetailRecord,
  type ReviewClaimDetailResponse,
  type ReviewClaimListItem,
  type ReviewTimeAxisType
} from "@/lib/services/review-time-matrix";
import { cn } from "@/lib/utils";

type SimpleAction = Extract<ReviewClaimActionType, "ACCEPT" | "REJECT" | "DEFER">;

interface TimeClaimActionPanelProps {
  bookId             : string;
  claim              : ReviewClaimListItem;
  detail             : ReviewClaimDetailResponse | null;
  relationTypeOptions: PersonaChapterRelationTypeOptionDto[];
  onMutationSuccess  : () => void | Promise<void>;
  className?         : string;
}

interface TimeEditDraftState {
  chapterId              : string;
  confidence             : string;
  runId                  : string;
  evidenceSpanIdsText    : string;
  rawTimeText            : string;
  timeType               : ReviewTimeAxisType;
  normalizedLabel        : string;
  relativeOrderWeightText: string;
  chapterRangeStartText  : string;
  chapterRangeEndText    : string;
}

interface ParsedTimeNumbers {
  relativeOrderWeight: number | null;
  chapterRangeStart  : number | null;
  chapterRangeEnd    : number | null;
}

interface TimeEditPayload extends Record<string, unknown> {
  bookId             : string;
  chapterId          : string;
  confidence         : number;
  runId              : string;
  evidenceSpanIds    : string[];
  rawTimeText        : string;
  timeType           : ReviewTimeAxisType;
  normalizedLabel    : string;
  relativeOrderWeight: number | null;
  chapterRangeStart  : number | null;
  chapterRangeEnd    : number | null;
}

const TIME_TYPE_OPTIONS: Array<[ReviewTimeAxisType, string]> = [
  ["CHAPTER_ORDER", "章节顺序"],
  ["RELATIVE_PHASE", "相对阶段"],
  ["NAMED_EVENT", "事件节点"],
  ["HISTORICAL_YEAR", "历史年份"],
  ["BATTLE_PHASE", "战役阶段"],
  ["UNCERTAIN", "不确定"]
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

function toReviewTimeAxisType(value: unknown): ReviewTimeAxisType {
  return TIME_TYPE_OPTIONS.some(([timeType]) => timeType === value)
    ? value as ReviewTimeAxisType
    : "UNCERTAIN";
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

function toNormalizedNote(note: string): string | null {
  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildTimeEditDraftState(claim: ReviewClaimDetailRecord): TimeEditDraftState {
  return {
    chapterId              : toStringValue(claim.chapterId),
    confidence             : toNumberText(claim.confidence, 1),
    runId                  : toStringValue(claim.runId),
    evidenceSpanIdsText    : toEvidenceSpanIdsText(claim.evidenceSpanIds),
    rawTimeText            : toStringValue(claim.rawTimeText),
    timeType               : toReviewTimeAxisType(claim.timeType),
    normalizedLabel        : toStringValue(claim.normalizedLabel),
    relativeOrderWeightText: toNumberText(claim.relativeOrderWeight),
    chapterRangeStartText  : toNumberText(claim.chapterRangeStart),
    chapterRangeEndText    : toNumberText(claim.chapterRangeEnd)
  };
}

function parseOptionalFiniteNumber(value: string, errorMessage: string): {
  value: number | null;
  error: string | null;
} {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { value: null, error: null };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: errorMessage };
  }

  return { value: parsed, error: null };
}

function parseOptionalPositiveInteger(value: string, errorMessage: string): {
  value: number | null;
  error: string | null;
} {
  const parsed = parseOptionalFiniteNumber(value, errorMessage);

  if (parsed.error !== null || parsed.value === null) {
    return parsed;
  }

  if (!Number.isInteger(parsed.value) || parsed.value <= 0) {
    return { value: null, error: errorMessage };
  }

  return parsed;
}

function parseTimeEditNumbers(draft: TimeEditDraftState): {
  numbers: ParsedTimeNumbers | null;
  errors : string[];
} {
  const errors: string[] = [];
  const relativeOrderWeight = parseOptionalFiniteNumber(
    draft.relativeOrderWeightText,
    "相对顺序权重必须是数字"
  );
  const chapterRangeStart = parseOptionalPositiveInteger(
    draft.chapterRangeStartText,
    "起始章节回次必须是正整数"
  );
  const chapterRangeEnd = parseOptionalPositiveInteger(
    draft.chapterRangeEndText,
    "结束章节回次必须是正整数"
  );

  for (const result of [relativeOrderWeight, chapterRangeStart, chapterRangeEnd]) {
    if (result.error !== null) {
      errors.push(result.error);
    }
  }

  if (
    chapterRangeStart.value !== null &&
    chapterRangeEnd.value !== null &&
    chapterRangeEnd.value < chapterRangeStart.value
  ) {
    errors.push("结束章节回次不能小于起始章节回次");
  }

  if (errors.length > 0) {
    return { numbers: null, errors };
  }

  return {
    numbers: {
      relativeOrderWeight: relativeOrderWeight.value,
      chapterRangeStart  : chapterRangeStart.value,
      chapterRangeEnd    : chapterRangeEnd.value
    },
    errors
  };
}

function buildTimeEditPayload({
  bookId,
  draft,
  numbers
}: {
  bookId : string;
  draft  : TimeEditDraftState;
  numbers: ParsedTimeNumbers;
}): TimeEditPayload {
  return {
    bookId,
    chapterId          : draft.chapterId,
    confidence         : Number(draft.confidence),
    runId              : draft.runId,
    evidenceSpanIds    : parseEvidenceSpanIds(draft.evidenceSpanIdsText),
    rawTimeText        : draft.rawTimeText.trim(),
    timeType           : draft.timeType,
    normalizedLabel    : draft.normalizedLabel.trim(),
    relativeOrderWeight: numbers.relativeOrderWeight,
    chapterRangeStart  : numbers.chapterRangeStart,
    chapterRangeEnd    : numbers.chapterRangeEnd
  };
}

function TimeTypeSelectField({
  id,
  value,
  onChange,
  disabled
}: {
  id       : string;
  value    : ReviewTimeAxisType;
  onChange : (value: ReviewTimeAxisType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>时间类型</Label>
      <Select
        value={value}
        onValueChange={(nextValue) => onChange(toReviewTimeAxisType(nextValue))}
        disabled={disabled}
      >
        <SelectTrigger id={id} aria-label="时间类型" className="w-full">
          <SelectValue placeholder="请选择时间类型" />
        </SelectTrigger>
        <SelectContent>
          {TIME_TYPE_OPTIONS.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * 时间矩阵的动作面板只为 TIME claim 增补归一化编辑。
 * EVENT / RELATION 继续委托章节矩阵面板，避免同一审核动作在两个页面维护两套写入规则。
 */
export function TimeClaimActionPanel({
  bookId,
  claim,
  detail,
  relationTypeOptions,
  onMutationSuccess,
  className
}: TimeClaimActionPanelProps) {
  const [note, setNote] = useState("");
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [timeDraft, setTimeDraft] = useState<TimeEditDraftState | null>(null);

  if (claim.claimKind !== "TIME") {
    return (
      <ClaimActionPanel
        bookId={bookId}
        claim={claim}
        detail={detail}
        relationTypeOptions={relationTypeOptions}
        onMutationSuccess={onMutationSuccess}
        className={className}
      />
    );
  }

  const simpleActions = getSimpleActions(claim.reviewState);
  const isEditable = detail !== null;

  async function runMutation(work: () => Promise<void>) {
    setIsSubmitting(true);
    setErrorMessages([]);

    try {
      await work();
      setIsEditing(false);
      await onMutationSuccess();
    } catch (error) {
      setErrorMessages([toErrorMessage(error)]);
    } finally {
      setIsSubmitting(false);
    }
  }

  function openEditForm() {
    if (detail === null) {
      return;
    }

    setTimeDraft(buildTimeEditDraftState(detail.claim));
    setIsEditing(true);
    setErrorMessages([]);
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
    if (timeDraft === null) {
      return;
    }

    const parsedNumbers = parseTimeEditNumbers(timeDraft);

    const numbers = parsedNumbers.numbers;

    if (numbers === null) {
      setErrorMessages(parsedNumbers.errors);
      return;
    }

    await runMutation(async () => {
      await submitReviewClaimAction({
        bookId,
        claimKind: claim.claimKind,
        claimId  : claim.claimId,
        action   : "EDIT",
        note     : toNormalizedNote(note),
        draft    : buildTimeEditPayload({
          bookId,
          draft: timeDraft,
          numbers
        })
      });
    });
  }

  return (
    <section className={cn("time-claim-action-panel space-y-4 rounded-xl border bg-background p-4", className)}>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">审核动作</h3>
        <p className="text-xs text-muted-foreground">
          当前状态：{claim.reviewState}。时间编辑会保留原始表达与归一化标签，写入 T12 claim 审核记录。
        </p>
      </div>

      {claim.reviewState === "REJECTED" ? (
        <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          该记录已删除/驳回，暂无可执行动作。
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={`time-claim-action-note-${claim.claimId}`}>审核备注（可选）</Label>
            <Textarea
              id={`time-claim-action-note-${claim.claimId}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="例如：时间归一化需参考前后章节"
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
            ) : (
              <p className="basis-full text-xs text-muted-foreground">
                明细加载完成后可编辑时间归一化字段。
              </p>
            )}
          </div>
        </>
      )}

      {errorMessages.length > 0 ? (
        <div
          role="alert"
          className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {errorMessages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}

      {isEditing && timeDraft ? (
        <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`time-raw-${claim.claimId}`}>原始时间表达</Label>
              <Input
                id={`time-raw-${claim.claimId}`}
                value={timeDraft.rawTimeText}
                onChange={(event) => setTimeDraft({
                  ...timeDraft,
                  rawTimeText: event.target.value
                })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`time-normalized-${claim.claimId}`}>归一化时间标签</Label>
              <Input
                id={`time-normalized-${claim.claimId}`}
                value={timeDraft.normalizedLabel}
                onChange={(event) => setTimeDraft({
                  ...timeDraft,
                  normalizedLabel: event.target.value
                })}
              />
            </div>

            <TimeTypeSelectField
              id={`time-type-${claim.claimId}`}
              value={timeDraft.timeType}
              disabled={isSubmitting}
              onChange={(nextTimeType) => setTimeDraft({
                ...timeDraft,
                timeType: nextTimeType
              })}
            />

            <div className="space-y-1.5">
              <Label htmlFor={`time-order-${claim.claimId}`}>相对顺序权重</Label>
              <Input
                id={`time-order-${claim.claimId}`}
                value={timeDraft.relativeOrderWeightText}
                onChange={(event) => setTimeDraft({
                  ...timeDraft,
                  relativeOrderWeightText: event.target.value
                })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`time-chapter-start-${claim.claimId}`}>起始章节回次</Label>
              <Input
                id={`time-chapter-start-${claim.claimId}`}
                value={timeDraft.chapterRangeStartText}
                onChange={(event) => setTimeDraft({
                  ...timeDraft,
                  chapterRangeStartText: event.target.value
                })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`time-chapter-end-${claim.claimId}`}>结束章节回次</Label>
              <Input
                id={`time-chapter-end-${claim.claimId}`}
                value={timeDraft.chapterRangeEndText}
                onChange={(event) => setTimeDraft({
                  ...timeDraft,
                  chapterRangeEndText: event.target.value
                })}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`time-evidence-${claim.claimId}`}>证据 Span IDs（逗号分隔）</Label>
              <Input
                id={`time-evidence-${claim.claimId}`}
                value={timeDraft.evidenceSpanIdsText}
                onChange={(event) => setTimeDraft({
                  ...timeDraft,
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
