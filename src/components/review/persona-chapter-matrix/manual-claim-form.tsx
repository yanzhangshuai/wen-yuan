"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createManualReviewClaim,
  type PersonaChapterMatrixChapterDto,
  type PersonaChapterMatrixPersonaDto,
  type PersonaChapterRelationTypeOptionDto,
  type RelationDirection
} from "@/lib/services/review-matrix";
import { cn } from "@/lib/utils";

type ManualClaimKind = "EVENT" | "RELATION";

interface ManualClaimFormProps {
  bookId             : string;
  persona            : PersonaChapterMatrixPersonaDto;
  chapter            : PersonaChapterMatrixChapterDto;
  personas           : PersonaChapterMatrixPersonaDto[];
  relationTypeOptions: PersonaChapterRelationTypeOptionDto[];
  onMutationSuccess  : () => void | Promise<void>;
  className         ?: string;
}

interface ManualEventDraftState {
  runId                   : string;
  evidenceSpanIdsText     : string;
  predicate               : string;
  objectText              : string;
  objectPersonaCandidateId: string;
  locationText            : string;
  timeHintId              : string;
  eventCategory           : string;
  narrativeLens           : string;
}

interface ManualRelationDraftState {
  runId                : string;
  evidenceSpanIdsText  : string;
  targetPersonaId      : string;
  relationTypeChoice   : string;
  customRelationTypeKey: string;
  customRelationLabel  : string;
  direction            : RelationDirection;
  effectiveChapterStart: string;
  effectiveChapterEnd  : string;
  timeHintId           : string;
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

const CUSTOM_RELATION_TYPE = "__custom__";

function parseEvidenceSpanIds(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toNullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "人工补录失败，请稍后重试。";
}

function buildInitialEventState(): ManualEventDraftState {
  return {
    runId                   : "",
    evidenceSpanIdsText     : "",
    predicate               : "",
    objectText              : "",
    objectPersonaCandidateId: "",
    locationText            : "",
    timeHintId              : "",
    eventCategory           : "EVENT",
    narrativeLens           : "SELF"
  };
}

function buildInitialRelationState(
  chapterNo: number,
  relationTypeOptions: PersonaChapterRelationTypeOptionDto[]
): ManualRelationDraftState {
  const firstOption = relationTypeOptions[0];

  return {
    runId                : "",
    evidenceSpanIdsText  : "",
    targetPersonaId      : "",
    relationTypeChoice   : firstOption?.relationTypeKey ?? CUSTOM_RELATION_TYPE,
    customRelationTypeKey: "",
    customRelationLabel  : "",
    direction            : firstOption?.direction ?? "FORWARD",
    effectiveChapterStart: String(chapterNo),
    effectiveChapterEnd  : "",
    timeHintId           : ""
  };
}

export function buildManualEventDraft(input: {
  bookId                   : string;
  chapterId                : string;
  subjectPersonaCandidateId: string;
  draft                    : ManualEventDraftState;
}) {
  return {
    bookId                   : input.bookId,
    chapterId                : input.chapterId,
    confidence               : 1,
    runId                    : input.draft.runId.trim(),
    subjectMentionId         : null,
    subjectPersonaCandidateId: input.subjectPersonaCandidateId,
    predicate                : input.draft.predicate.trim(),
    objectText               : toNullableString(input.draft.objectText),
    objectPersonaCandidateId : toNullableString(input.draft.objectPersonaCandidateId),
    locationText             : toNullableString(input.draft.locationText),
    timeHintId               : toNullableString(input.draft.timeHintId),
    eventCategory            : input.draft.eventCategory,
    narrativeLens            : input.draft.narrativeLens,
    evidenceSpanIds          : parseEvidenceSpanIds(input.draft.evidenceSpanIdsText)
  };
}

export function buildManualRelationDraft(input: {
  bookId                  : string;
  chapterId               : string;
  sourcePersonaCandidateId: string;
  targetPersonaCandidateId: string;
  draft                   : ManualRelationDraftState;
  relationTypeOptions     : PersonaChapterRelationTypeOptionDto[];
}) {
  const preset = input.relationTypeOptions.find((option) => option.relationTypeKey === input.draft.relationTypeChoice);
  const isCustom = input.draft.relationTypeChoice === CUSTOM_RELATION_TYPE || preset === undefined;

  return {
    bookId                  : input.bookId,
    chapterId               : input.chapterId,
    confidence              : 1,
    runId                   : input.draft.runId.trim(),
    sourceMentionId         : null,
    targetMentionId         : null,
    sourcePersonaCandidateId: input.sourcePersonaCandidateId,
    targetPersonaCandidateId: input.targetPersonaCandidateId,
    relationTypeKey         : isCustom
      ? input.draft.customRelationTypeKey.trim()
      : preset.relationTypeKey,
    relationLabel: isCustom
      ? input.draft.customRelationLabel.trim()
      : preset.label,
    relationTypeSource   : isCustom ? "CUSTOM" : "PRESET",
    direction            : isCustom ? input.draft.direction : preset.direction,
    effectiveChapterStart: toNullableNumber(input.draft.effectiveChapterStart),
    effectiveChapterEnd  : toNullableNumber(input.draft.effectiveChapterEnd),
    timeHintId           : toNullableString(input.draft.timeHintId),
    evidenceSpanIds      : parseEvidenceSpanIds(input.draft.evidenceSpanIdsText)
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
 * 人工补录表单：
 * - 只负责组装 T12 manual claim payload，不在前端推断 projection；
 * - 当前 runId / evidence span 仍采用临时输入方式，等待后续专用选择器接管。
 */
export function ManualClaimForm({
  bookId,
  persona,
  chapter,
  personas,
  relationTypeOptions,
  onMutationSuccess,
  className
}: ManualClaimFormProps) {
  const [activeKind, setActiveKind] = useState<ManualClaimKind>("EVENT");
  const [eventDraft, setEventDraft] = useState<ManualEventDraftState>(() => buildInitialEventState());
  const [relationDraft, setRelationDraft] = useState<ManualRelationDraftState>(
    () => buildInitialRelationState(chapter.chapterNo, relationTypeOptions)
  );
  const [note, setNote] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const primaryPersonaCandidateId = persona.primaryPersonaCandidateId;
  const canCreate = primaryPersonaCandidateId !== null;
  const targetPersonaOptions = personas.filter((item) =>
    item.personaId !== persona.personaId && item.primaryPersonaCandidateId !== null
  );
  const selectedTargetPersona = targetPersonaOptions.find(
    (item) => item.personaId === relationDraft.targetPersonaId
  ) ?? null;

  async function handleCreateEvent() {
    if (!canCreate || primaryPersonaCandidateId === null) {
      setErrorMessage("当前人物没有 primary persona candidate id，暂不能补录 claim。");
      return;
    }

    const draft = buildManualEventDraft({
      bookId,
      chapterId                : chapter.chapterId,
      subjectPersonaCandidateId: primaryPersonaCandidateId,
      draft                    : eventDraft
    });

    if (draft.runId.length === 0) {
      setErrorMessage("请填写运行 ID（临时必填）。");
      return;
    }
    if (draft.evidenceSpanIds.length === 0) {
      setErrorMessage("请填写至少一个证据 Span ID。");
      return;
    }
    if (draft.predicate.length === 0) {
      setErrorMessage("请填写事迹谓语。");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await createManualReviewClaim({
        claimKind: "EVENT",
        note     : toNullableString(note),
        draft
      });
      await onMutationSuccess();
      setEventDraft(buildInitialEventState());
      setNote("");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateRelation() {
    if (!canCreate || primaryPersonaCandidateId === null) {
      setErrorMessage("当前人物没有 primary persona candidate id，暂不能补录 claim。");
      return;
    }
    if (selectedTargetPersona?.primaryPersonaCandidateId === null || selectedTargetPersona === null) {
      setErrorMessage("请先选择目标人物。");
      return;
    }

    const draft = buildManualRelationDraft({
      bookId,
      chapterId               : chapter.chapterId,
      sourcePersonaCandidateId: primaryPersonaCandidateId,
      targetPersonaCandidateId: selectedTargetPersona.primaryPersonaCandidateId,
      draft                   : relationDraft,
      relationTypeOptions
    });

    if (draft.runId.length === 0) {
      setErrorMessage("请填写运行 ID（临时必填）。");
      return;
    }
    if (draft.evidenceSpanIds.length === 0) {
      setErrorMessage("请填写至少一个证据 Span ID。");
      return;
    }
    if (draft.relationTypeKey.length === 0 || draft.relationLabel.length === 0) {
      setErrorMessage("请补全关系类型 Key 和显示名称。");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await createManualReviewClaim({
        claimKind: "RELATION",
        note     : toNullableString(note),
        draft
      });
      await onMutationSuccess();
      setRelationDraft(buildInitialRelationState(chapter.chapterNo, relationTypeOptions));
      setNote("");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className={cn("rounded-xl border bg-background p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">人工补录</h3>
          <p className="text-xs text-muted-foreground">
            当前人物：{persona.displayName} · {chapter.label}。补录结果会写入现有 review manual claim 流程。
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={activeKind === "EVENT" ? "default" : "outline"}
            size="sm"
            disabled={!canCreate || isSubmitting}
            onClick={() => {
              setActiveKind("EVENT");
              setErrorMessage(null);
            }}
          >
            新增事迹
          </Button>
          <Button
            type="button"
            variant={activeKind === "RELATION" ? "default" : "outline"}
            size="sm"
            disabled={!canCreate || isSubmitting}
            onClick={() => {
              setActiveKind("RELATION");
              setErrorMessage(null);
            }}
          >
            新增关系
          </Button>
        </div>
      </div>

      {!canCreate ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          当前人物没有 primary persona candidate id，暂不能补录 claim。
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="manual-claim-run-id">运行 ID（临时必填）</Label>
          <Input
            id="manual-claim-run-id"
            value={activeKind === "EVENT" ? eventDraft.runId : relationDraft.runId}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (activeKind === "EVENT") {
                setEventDraft((current) => ({ ...current, runId: nextValue }));
                return;
              }

              setRelationDraft((current) => ({ ...current, runId: nextValue }));
            }}
            placeholder="例如：analysis run uuid"
            disabled={!canCreate || isSubmitting}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manual-claim-evidence">证据 Span IDs（临时必填）</Label>
          <Textarea
            id="manual-claim-evidence"
            value={activeKind === "EVENT"
              ? eventDraft.evidenceSpanIdsText
              : relationDraft.evidenceSpanIdsText}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (activeKind === "EVENT") {
                setEventDraft((current) => ({ ...current, evidenceSpanIdsText: nextValue }));
                return;
              }

              setRelationDraft((current) => ({ ...current, evidenceSpanIdsText: nextValue }));
            }}
            placeholder="临时输入，支持逗号或换行分隔"
            className="min-h-20"
            disabled={!canCreate || isSubmitting}
          />
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <Label htmlFor="manual-claim-note">补录备注（可选）</Label>
        <Textarea
          id="manual-claim-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="说明为何需要人工补录"
          className="min-h-20"
          disabled={!canCreate || isSubmitting}
        />
      </div>

      {activeKind === "EVENT" ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="manual-event-predicate">事迹谓语</Label>
              <Input
                id="manual-event-predicate"
                value={eventDraft.predicate}
                onChange={(event) => {
                  setEventDraft((current) => ({ ...current, predicate: event.target.value }));
                }}
                placeholder="例如：中举、赴试、拜访"
                disabled={!canCreate || isSubmitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="manual-event-object-text">宾语文本</Label>
              <Input
                id="manual-event-object-text"
                value={eventDraft.objectText}
                onChange={(event) => {
                  setEventDraft((current) => ({ ...current, objectText: event.target.value }));
                }}
                placeholder="例如：乡试"
                disabled={!canCreate || isSubmitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="manual-event-location">地点文本</Label>
              <Input
                id="manual-event-location"
                value={eventDraft.locationText}
                onChange={(event) => {
                  setEventDraft((current) => ({ ...current, locationText: event.target.value }));
                }}
                placeholder="例如：省城"
                disabled={!canCreate || isSubmitting}
              />
            </div>

            <SelectField
              id="manual-event-category"
              label="事件类型"
              value={eventDraft.eventCategory}
              options={EVENT_CATEGORY_OPTIONS}
              onChange={(value) => {
                setEventDraft((current) => ({ ...current, eventCategory: value }));
              }}
            />

            <SelectField
              id="manual-event-lens"
              label="叙事视角"
              value={eventDraft.narrativeLens}
              options={NARRATIVE_LENS_OPTIONS}
              onChange={(value) => {
                setEventDraft((current) => ({ ...current, narrativeLens: value }));
              }}
            />
          </div>

          <Button
            type="button"
            onClick={() => {
              void handleCreateEvent();
            }}
            disabled={!canCreate || isSubmitting}
          >
            {isSubmitting ? "创建中..." : "创建事迹"}
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="manual-relation-target">目标人物</Label>
              <select
                id="manual-relation-target"
                value={relationDraft.targetPersonaId}
                onChange={(event) => {
                  setRelationDraft((current) => ({
                    ...current,
                    targetPersonaId: event.target.value
                  }));
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                disabled={!canCreate || isSubmitting}
              >
                <option value="">请选择目标人物</option>
                {targetPersonaOptions.map((item) => (
                  <option key={item.personaId} value={item.personaId}>{item.displayName}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="manual-relation-type">关系类型</Label>
              <select
                id="manual-relation-type"
                value={relationDraft.relationTypeChoice}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  const preset = relationTypeOptions.find((option) => option.relationTypeKey === nextValue);

                  setRelationDraft((current) => ({
                    ...current,
                    relationTypeChoice: nextValue,
                    direction         : preset?.direction ?? current.direction
                  }));
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                disabled={!canCreate || isSubmitting}
              >
                {relationTypeOptions.map((option) => (
                  <option key={option.relationTypeKey} value={option.relationTypeKey}>
                    {option.label} ({option.relationTypeKey})
                  </option>
                ))}
                <option value={CUSTOM_RELATION_TYPE}>自定义关系</option>
              </select>
            </div>

            {relationDraft.relationTypeChoice === CUSTOM_RELATION_TYPE ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="manual-relation-custom-key">自定义关系 Key</Label>
                  <Input
                    id="manual-relation-custom-key"
                    value={relationDraft.customRelationTypeKey}
                    onChange={(event) => {
                      setRelationDraft((current) => ({
                        ...current,
                        customRelationTypeKey: event.target.value
                      }));
                    }}
                    placeholder="例如：same_clan_of"
                    disabled={!canCreate || isSubmitting}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="manual-relation-custom-label">自定义关系名称</Label>
                  <Input
                    id="manual-relation-custom-label"
                    value={relationDraft.customRelationLabel}
                    onChange={(event) => {
                      setRelationDraft((current) => ({
                        ...current,
                        customRelationLabel: event.target.value
                      }));
                    }}
                    placeholder="例如：同宗"
                    disabled={!canCreate || isSubmitting}
                  />
                </div>
              </>
            ) : null}

            <SelectField
              id="manual-relation-direction"
              label="关系方向"
              value={relationDraft.direction}
              options={RELATION_DIRECTION_OPTIONS}
              onChange={(value) => {
                setRelationDraft((current) => ({
                  ...current,
                  direction: value as RelationDirection
                }));
              }}
            />

            <div className="space-y-1.5">
              <Label htmlFor="manual-relation-effective-start">生效起始章节号</Label>
              <Input
                id="manual-relation-effective-start"
                value={relationDraft.effectiveChapterStart}
                onChange={(event) => {
                  setRelationDraft((current) => ({
                    ...current,
                    effectiveChapterStart: event.target.value
                  }));
                }}
                inputMode="numeric"
                disabled={!canCreate || isSubmitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="manual-relation-effective-end">生效结束章节号</Label>
              <Input
                id="manual-relation-effective-end"
                value={relationDraft.effectiveChapterEnd}
                onChange={(event) => {
                  setRelationDraft((current) => ({
                    ...current,
                    effectiveChapterEnd: event.target.value
                  }));
                }}
                inputMode="numeric"
                disabled={!canCreate || isSubmitting}
              />
            </div>
          </div>

          <Button
            type="button"
            onClick={() => {
              void handleCreateRelation();
            }}
            disabled={!canCreate || isSubmitting}
          >
            {isSubmitting ? "创建中..." : "创建关系"}
          </Button>
        </div>
      )}

      {errorMessage ? (
        <p className="mt-3 text-sm text-destructive" role="alert">{errorMessage}</p>
      ) : null}
    </section>
  );
}
