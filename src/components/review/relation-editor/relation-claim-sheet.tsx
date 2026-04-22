"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { ErrorState } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import {
  createManualReviewClaim,
  fetchReviewClaimDetail,
  submitReviewClaimAction,
  type RelationDirection,
  type ReviewClaimDetailRecord,
  type ReviewRelationClaimListItemDto,
  type ReviewRelationSelectedPairDto,
  type ReviewRelationTypeOptionDto
} from "@/lib/services/relation-editor";
import { cn } from "@/lib/utils";

import { TemporaryEvidenceAuditPanel } from "../shared/temporary-evidence-audit-panel";

import {
  CUSTOM_RELATION_TYPE,
  buildManualRelationDraft,
  buildRelationEditPayload,
  type ManualRelationDraftState,
  type RelationDraftTypeOption,
  type RelationEditDraftState
} from "./relation-draft";
import { RelationWarningBanner } from "./relation-warning-banner";

interface RelationClaimSheetProps {
  open               : boolean;
  bookId             : string;
  selectedPair       : ReviewRelationSelectedPairDto | null;
  selectedClaimId    : string | null;
  relationTypeOptions: ReviewRelationTypeOptionDto[];
  onOpenChange       : (open: boolean) => void;
  onMutationSuccess? : () => void | Promise<void>;
  className?         : string;
}

type RelationInputMode = "PRESET" | "CUSTOM";

const RELATION_DIRECTION_OPTIONS: Array<[RelationDirection, string]> = [
  ["FORWARD", "正向"],
  ["REVERSE", "反向"],
  ["BIDIRECTIONAL", "双向"],
  ["UNDIRECTED", "无方向"]
];

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function toNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toNumberText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function toEvidenceSpanIdsText(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value.filter((item): item is string => typeof item === "string").join(", ");
}

function isValidDetailResponse(
  value: Awaited<ReturnType<typeof fetchReviewClaimDetail>> | null | undefined
): value is Awaited<ReturnType<typeof fetchReviewClaimDetail>> {
  return value !== null
    && value !== undefined
    && typeof value === "object"
    && "claim" in value
    && typeof value.claim === "object"
    && value.claim !== null;
}

function toRelationDirection(value: unknown): RelationDirection {
  return RELATION_DIRECTION_OPTIONS.some(([direction]) => direction === value)
    ? value as RelationDirection
    : "FORWARD";
}

function readClaimString(claim: ReviewClaimDetailRecord | null, key: string): string | null {
  if (claim === null) {
    return null;
  }

  const value = claim[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function buildRelationEditDraftState(claim: ReviewClaimDetailRecord): RelationEditDraftState {
  return {
    chapterId               : toStringValue(claim.chapterId),
    confidence              : toNumberText(claim.confidence || 1),
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

function buildInitialCreateDraftState(
  selectedClaim: ReviewRelationClaimListItemDto,
  relationTypeOptions: RelationDraftTypeOption[]
): ManualRelationDraftState {
  const firstPreset = relationTypeOptions[0];

  return {
    runId                : "",
    evidenceSpanIdsText  : "",
    targetPersonaId      : "",
    relationTypeChoice   : firstPreset?.relationTypeKey ?? CUSTOM_RELATION_TYPE,
    customRelationTypeKey: "",
    customRelationLabel  : "",
    direction            : firstPreset?.direction ?? "FORWARD",
    effectiveChapterStart: selectedClaim.effectiveChapterStart === null
      ? ""
      : String(selectedClaim.effectiveChapterStart),
    effectiveChapterEnd: selectedClaim.effectiveChapterEnd === null
      ? ""
      : String(selectedClaim.effectiveChapterEnd),
    timeHintId: ""
  };
}

function resolveInputMode(
  relationTypeKey: string,
  relationTypeOptions: RelationDraftTypeOption[]
): RelationInputMode {
  return relationTypeOptions.some((option) => option.relationTypeKey === relationTypeKey)
    ? "PRESET"
    : "CUSTOM";
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false
}: {
  id       : string;
  label    : string;
  value    : string;
  options  : readonly (readonly [string, string])[];
  onChange : (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger id={id} aria-label={label} className="w-full">
          <SelectValue placeholder={options.length > 0 ? "请选择" : "暂无可选项"} />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function InputModeFields({
  prefix,
  mode,
  presetValue,
  onModeChange,
  onPresetChange,
  customRelationTypeKey,
  onCustomRelationTypeKeyChange,
  relationLabel,
  onRelationLabelChange,
  direction,
  onDirectionChange,
  relationTypeOptions,
  disabled = false
}: {
  prefix                       : "edit" | "create";
  mode                         : RelationInputMode;
  presetValue                  : string;
  onModeChange                 : (mode: RelationInputMode) => void;
  onPresetChange               : (relationTypeKey: string) => void;
  customRelationTypeKey        : string;
  onCustomRelationTypeKeyChange: (value: string) => void;
  relationLabel                : string;
  onRelationLabelChange        : (value: string) => void;
  direction                    : RelationDirection;
  onDirectionChange            : (direction: RelationDirection) => void;
  relationTypeOptions          : RelationDraftTypeOption[];
  disabled?                    : boolean;
}) {
  const isEdit = prefix === "edit";
  const presetRadioLabel = isEdit ? "编辑预设模板" : "新增预设模板";
  const customRadioLabel = isEdit ? "编辑自定义输入" : "新增自定义输入";
  const presetSelectLabel = isEdit ? "关系模板" : "新增关系模板";
  const relationKeyLabel = isEdit ? "关系类型 Key" : "新增关系类型 Key";
  const relationLabelText = isEdit ? "关系显示名称" : "新增关系显示名称";
  const directionLabel = isEdit ? "关系方向" : "新增关系方向";

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">关系输入模式</p>
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name={`${prefix}-relation-mode`}
              checked={mode === "PRESET"}
              disabled={disabled}
              onChange={() => onModeChange("PRESET")}
            />
            {presetRadioLabel}
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name={`${prefix}-relation-mode`}
              checked={mode === "CUSTOM"}
              disabled={disabled}
              onChange={() => onModeChange("CUSTOM")}
            />
            {customRadioLabel}
          </label>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SelectField
          id={`${prefix}-relation-template`}
          label={presetSelectLabel}
          value={presetValue}
          options={relationTypeOptions.map((option) => [option.relationTypeKey, option.label] as const)}
          onChange={onPresetChange}
          disabled={disabled || relationTypeOptions.length === 0}
        />

        {mode === "CUSTOM" ? (
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-relation-key`}>{relationKeyLabel}</Label>
            <Input
              id={`${prefix}-relation-key`}
              value={customRelationTypeKey}
              onChange={(event) => onCustomRelationTypeKeyChange(event.target.value)}
              disabled={disabled}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>{relationKeyLabel}</Label>
            <div className="rounded-md border bg-background px-3 py-2 text-sm text-foreground">
              {presetValue.length > 0 ? `预设键：${presetValue}` : "未选择关系模板"}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`${prefix}-relation-label`}>{relationLabelText}</Label>
          <Input
            id={`${prefix}-relation-label`}
            value={relationLabel}
            onChange={(event) => onRelationLabelChange(event.target.value)}
            disabled={disabled}
          />
        </div>

        <SelectField
          id={`${prefix}-relation-direction`}
          label={directionLabel}
          value={direction}
          options={RELATION_DIRECTION_OPTIONS}
          onChange={(value) => onDirectionChange(value as RelationDirection)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

/**
 * 关系 claim 详情抽屉：
 * - 首屏只在 claim 被选中后懒加载 T12 detail；
 * - 所有编辑/新增仍复用现有 claim-first mutation；
 * - detail 中间层保留原始抽取文本与 evidence/audit 面板，方便 reviewer 直接比对。
 */
export function RelationClaimSheet({
  open,
  bookId,
  selectedPair,
  selectedClaimId,
  relationTypeOptions,
  onOpenChange,
  onMutationSuccess,
  className
}: RelationClaimSheetProps) {
  const selectedClaim = useMemo(() => {
    if (selectedPair === null || selectedClaimId === null) {
      return null;
    }

    return selectedPair.claims.find((claim) => claim.claimId === selectedClaimId) ?? null;
  }, [selectedClaimId, selectedPair]);
  const relationDraftOptions = useMemo(() => relationTypeOptions.map((option) => ({
    relationTypeKey: option.relationTypeKey,
    label          : option.label,
    direction      : option.direction
  })), [relationTypeOptions]);
  const detailRequestIdRef = useRef(0);
  const selectedClaimRef = useRef<ReviewRelationClaimListItemDto | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchReviewClaimDetail>> | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<RelationInputMode>("PRESET");
  const [editDraft, setEditDraft] = useState<RelationEditDraftState | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [createMode, setCreateMode] = useState<RelationInputMode>("PRESET");
  const [createDraft, setCreateDraft] = useState<ManualRelationDraftState | null>(null);
  const [createNote, setCreateNote] = useState("");
  const [createErrorMessage, setCreateErrorMessage] = useState<string | null>(null);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const selectedClaimKey = selectedClaim?.claimId ?? null;

  useEffect(() => {
    selectedClaimRef.current = selectedClaim;
  }, [selectedClaim]);

  const loadDetail = useCallback(async (claim: ReviewRelationClaimListItemDto) => {
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    setIsDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setEditErrorMessage(null);
    setCreateErrorMessage(null);

    try {
      const response = await fetchReviewClaimDetail({
        bookId,
        claimKind: "RELATION",
        claimId  : claim.claimId
      });

      if (!isValidDetailResponse(response)) {
        throw new Error("关系详情响应格式无效。");
      }

      if (detailRequestIdRef.current !== requestId) {
        return;
      }

      setDetail(response);
      setEditMode(resolveInputMode(toStringValue(response.claim.relationTypeKey), relationDraftOptions));
      setEditDraft(buildRelationEditDraftState(response.claim));
      setEditNote("");
      setCreateMode(relationTypeOptions.length > 0 ? "PRESET" : "CUSTOM");
      setCreateDraft(buildInitialCreateDraftState(claim, relationDraftOptions));
      setCreateNote("");
    } catch (error) {
      if (detailRequestIdRef.current !== requestId) {
        return;
      }

      setDetailError(toErrorMessage(error, "关系详情加载失败，请稍后重试。"));
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setIsDetailLoading(false);
      }
    }
  }, [bookId, relationDraftOptions, relationTypeOptions.length]);

  useEffect(() => {
    if (!open || selectedClaimKey === null || selectedClaimRef.current === null) {
      return;
    }

    void loadDetail(selectedClaimRef.current);
  }, [loadDetail, open, selectedClaimKey]);

  if (!open || selectedPair === null || selectedClaim === null) {
    return null;
  }

  const basisRelationLabel = readClaimString(detail?.basisClaim ?? null, "relationLabel")
    ?? readClaimString(detail?.basisClaim ?? null, "predicate")
    ?? "未提供";
  const activeChapterId = detail === null ? selectedClaim.chapterId : toStringValue(detail.claim.chapterId);
  const sourcePersonaCandidateId = detail === null
    ? null
    : toNullableText(toStringValue(detail.claim.sourcePersonaCandidateId));
  const targetPersonaCandidateId = detail === null
    ? null
    : toNullableText(toStringValue(detail.claim.targetPersonaCandidateId));

  async function handleEditSubmit() {
    if (selectedClaimId === null || editDraft === null) {
      return;
    }

    const payload = buildRelationEditPayload({
      draft              : editDraft,
      relationTypeOptions: relationDraftOptions,
      bookId
    });

    if (payload.relationTypeKey.length === 0 || payload.relationLabel.length === 0) {
      setEditErrorMessage("请补全关系类型 Key 和显示名称。");
      return;
    }

    setIsEditSubmitting(true);
    setEditErrorMessage(null);

    try {
      await submitReviewClaimAction({
        bookId,
        claimKind: "RELATION",
        claimId  : selectedClaimId,
        action   : "EDIT",
        note     : toNullableText(editNote),
        draft    : payload
      });
      setEditNote("");
      await onMutationSuccess?.();
    } catch (error) {
      setEditErrorMessage(toErrorMessage(error, "关系修改保存失败，请稍后重试。"));
    } finally {
      setIsEditSubmitting(false);
    }
  }

  async function handleCreateSubmit() {
    if (createDraft === null) {
      return;
    }

    const activeSelectedClaim = selectedClaim;
    if (activeSelectedClaim === null) {
      return;
    }

    if (activeChapterId === null || activeChapterId.length === 0) {
      setCreateErrorMessage("当前 claim 未提供章节 ID，暂不能新增关系。");
      return;
    }
    if (sourcePersonaCandidateId === null || targetPersonaCandidateId === null) {
      setCreateErrorMessage("当前关系缺少人物 candidate 绑定，暂不能沿用该 pair 新增关系。");
      return;
    }

    const payload = buildManualRelationDraft({
      bookId,
      chapterId          : activeChapterId,
      sourcePersonaCandidateId,
      targetPersonaCandidateId,
      draft              : createDraft,
      relationTypeOptions: relationDraftOptions
    });

    if (payload.runId.length === 0) {
      setCreateErrorMessage("请填写新增运行 ID。");
      return;
    }
    if (payload.evidenceSpanIds.length === 0) {
      setCreateErrorMessage("请填写至少一个新增证据 Span ID。");
      return;
    }
    if (payload.relationTypeKey.length === 0 || payload.relationLabel.length === 0) {
      setCreateErrorMessage("请补全新增关系类型 Key 和显示名称。");
      return;
    }

    setIsCreateSubmitting(true);
    setCreateErrorMessage(null);

    try {
      await createManualReviewClaim({
        claimKind: "RELATION",
        note     : toNullableText(createNote),
        draft    : payload
      });
      setCreateDraft(buildInitialCreateDraftState(activeSelectedClaim, relationDraftOptions));
      setCreateNote("");
      await onMutationSuccess?.();
    } catch (error) {
      setCreateErrorMessage(toErrorMessage(error, "新增关系 claim 失败，请稍后重试。"));
    } finally {
      setIsCreateSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn("w-full gap-0 overflow-y-auto p-0 sm:max-w-5xl", className)}
      >
        <SheetHeader className="border-b pb-4">
          <SheetTitle>
            {selectedPair.leftPersona.displayName} ↔ {selectedPair.rightPersona.displayName}
          </SheetTitle>
          <SheetDescription>
            查看当前关系 claim 的规范化字段、原始抽取文本，以及对应原文证据和审核记录。
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 p-4">
          <RelationWarningBanner warnings={selectedPair.warnings} />

          {isDetailLoading ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
            >
              关系详情加载中...
            </div>
          ) : detailError ? (
            <ErrorState
              title="关系详情加载失败"
              description={detailError}
              onRetry={() => {
                void loadDetail(selectedClaim);
              }}
              className="rounded-xl border bg-background"
            />
          ) : detail === null || editDraft === null || createDraft === null ? null : (
            <>
              <section className="rounded-xl border bg-background p-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">当前关系类型 Key</p>
                    <p className="text-sm text-foreground">{toStringValue(detail.claim.relationTypeKey)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">当前关系显示名称</p>
                    <p className="text-sm text-foreground">{toStringValue(detail.claim.relationLabel)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">当前关系方向</p>
                    <p className="text-sm text-foreground">{toRelationDirection(detail.claim.direction)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">原始抽取关系文本</p>
                    <p className="text-sm text-foreground">{basisRelationLabel}</p>
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border bg-background p-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">编辑当前关系</h3>
                  <p className="text-xs text-muted-foreground">
                    当前 claim：{selectedClaim.claimId}。保存后沿用 T12 claim action 流程并回刷关系摘要。
                  </p>
                </div>

                <InputModeFields
                  prefix="edit"
                  mode={editMode}
                  presetValue={editDraft.relationTypeKey}
                  onModeChange={(mode) => {
                    setEditMode(mode);
                    if (mode === "PRESET" && relationTypeOptions.length > 0) {
                      const preset = relationTypeOptions.find((option) => (
                        option.relationTypeKey === editDraft.relationTypeKey
                      )) ?? relationTypeOptions[0];

                      setEditDraft((current) => current === null ? current : {
                        ...current,
                        relationTypeKey: preset.relationTypeKey,
                        relationLabel  : preset.label,
                        direction      : preset.direction
                      });
                    }
                  }}
                  onPresetChange={(relationTypeKey) => {
                    const preset = relationTypeOptions.find((option) => option.relationTypeKey === relationTypeKey);
                    if (!preset) {
                      return;
                    }

                    setEditDraft((current) => current === null ? current : {
                      ...current,
                      relationTypeKey: preset.relationTypeKey,
                      relationLabel  : preset.label,
                      direction      : preset.direction
                    });
                  }}
                  customRelationTypeKey={editDraft.relationTypeKey}
                  onCustomRelationTypeKeyChange={(value) => {
                    setEditDraft((current) => current === null ? current : {
                      ...current,
                      relationTypeKey: value
                    });
                  }}
                  relationLabel={editDraft.relationLabel}
                  onRelationLabelChange={(value) => {
                    setEditDraft((current) => current === null ? current : {
                      ...current,
                      relationLabel: value
                    });
                  }}
                  direction={editDraft.direction}
                  onDirectionChange={(direction) => {
                    setEditDraft((current) => current === null ? current : {
                      ...current,
                      direction
                    });
                  }}
                  relationTypeOptions={relationDraftOptions}
                  disabled={isEditSubmitting}
                />

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-chapter-start">生效起始章节</Label>
                    <Input
                      id="edit-chapter-start"
                      value={editDraft.effectiveChapterStart}
                      onChange={(event) => {
                        setEditDraft((current) => current === null ? current : {
                          ...current,
                          effectiveChapterStart: event.target.value
                        });
                      }}
                      disabled={isEditSubmitting}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="edit-chapter-end">生效结束章节</Label>
                    <Input
                      id="edit-chapter-end"
                      value={editDraft.effectiveChapterEnd}
                      onChange={(event) => {
                        setEditDraft((current) => current === null ? current : {
                          ...current,
                          effectiveChapterEnd: event.target.value
                        });
                      }}
                      disabled={isEditSubmitting}
                    />
                  </div>

                  <div className="space-y-1.5 xl:col-span-2">
                    <Label htmlFor="edit-evidence-span-ids">证据 Span IDs</Label>
                    <Textarea
                      id="edit-evidence-span-ids"
                      value={editDraft.evidenceSpanIdsText}
                      onChange={(event) => {
                        setEditDraft((current) => current === null ? current : {
                          ...current,
                          evidenceSpanIdsText: event.target.value
                        });
                      }}
                      className="min-h-20"
                      disabled={isEditSubmitting}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-note">编辑备注（可选）</Label>
                  <Textarea
                    id="edit-note"
                    value={editNote}
                    onChange={(event) => setEditNote(event.target.value)}
                    className="min-h-20"
                    disabled={isEditSubmitting}
                  />
                </div>

                {editErrorMessage ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {editErrorMessage}
                  </p>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    disabled={isEditSubmitting}
                    onClick={() => {
                      void handleEditSubmit();
                    }}
                  >
                    {isEditSubmitting ? "保存中..." : "保存关系修改"}
                  </Button>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border bg-background p-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">新增关系 claim</h3>
                  <p className="text-xs text-muted-foreground">
                    沿用当前 pair 的人物 candidate 绑定创建人工关系，不写入关系真值表。
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="create-run-id">新增运行 ID</Label>
                    <Input
                      id="create-run-id"
                      value={createDraft.runId}
                      onChange={(event) => {
                        setCreateDraft((current) => current === null ? current : {
                          ...current,
                          runId: event.target.value
                        });
                      }}
                      disabled={isCreateSubmitting}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="create-evidence-span-ids">新增证据 Span IDs</Label>
                    <Textarea
                      id="create-evidence-span-ids"
                      value={createDraft.evidenceSpanIdsText}
                      onChange={(event) => {
                        setCreateDraft((current) => current === null ? current : {
                          ...current,
                          evidenceSpanIdsText: event.target.value
                        });
                      }}
                      className="min-h-20"
                      disabled={isCreateSubmitting}
                    />
                  </div>
                </div>

                <InputModeFields
                  prefix="create"
                  mode={createMode}
                  presetValue={createDraft.relationTypeChoice === CUSTOM_RELATION_TYPE
                    ? relationTypeOptions[0]?.relationTypeKey ?? ""
                    : createDraft.relationTypeChoice}
                  onModeChange={(mode) => {
                    setCreateMode(mode);
                    setCreateDraft((current) => {
                      if (current === null) {
                        return current;
                      }
                      if (mode === "PRESET" && relationTypeOptions.length > 0) {
                        const preset = relationTypeOptions[0];
                        return {
                          ...current,
                          relationTypeChoice: preset.relationTypeKey,
                          direction         : preset.direction
                        };
                      }

                      return {
                        ...current,
                        relationTypeChoice: CUSTOM_RELATION_TYPE
                      };
                    });
                  }}
                  onPresetChange={(relationTypeKey) => {
                    const preset = relationTypeOptions.find((option) => option.relationTypeKey === relationTypeKey);
                    if (!preset) {
                      return;
                    }

                    setCreateDraft((current) => current === null ? current : {
                      ...current,
                      relationTypeChoice: preset.relationTypeKey,
                      direction         : preset.direction
                    });
                  }}
                  customRelationTypeKey={createDraft.relationTypeChoice === CUSTOM_RELATION_TYPE
                    ? createDraft.customRelationTypeKey
                    : createDraft.customRelationTypeKey}
                  onCustomRelationTypeKeyChange={(value) => {
                    setCreateDraft((current) => current === null ? current : {
                      ...current,
                      relationTypeChoice   : CUSTOM_RELATION_TYPE,
                      customRelationTypeKey: value
                    });
                  }}
                  relationLabel={createMode === "PRESET"
                    ? relationTypeOptions.find((option) => option.relationTypeKey === createDraft.relationTypeChoice)?.label
                      ?? createDraft.customRelationLabel
                    : createDraft.customRelationLabel}
                  onRelationLabelChange={(value) => {
                    setCreateDraft((current) => current === null ? current : {
                      ...current,
                      customRelationLabel: value
                    });
                  }}
                  direction={createDraft.direction}
                  onDirectionChange={(direction) => {
                    setCreateDraft((current) => current === null ? current : {
                      ...current,
                      direction
                    });
                  }}
                  relationTypeOptions={relationDraftOptions}
                  disabled={isCreateSubmitting}
                />

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="create-chapter-start">新增生效起始章节</Label>
                    <Input
                      id="create-chapter-start"
                      value={createDraft.effectiveChapterStart}
                      onChange={(event) => {
                        setCreateDraft((current) => current === null ? current : {
                          ...current,
                          effectiveChapterStart: event.target.value
                        });
                      }}
                      disabled={isCreateSubmitting}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="create-chapter-end">新增生效结束章节</Label>
                    <Input
                      id="create-chapter-end"
                      value={createDraft.effectiveChapterEnd}
                      onChange={(event) => {
                        setCreateDraft((current) => current === null ? current : {
                          ...current,
                          effectiveChapterEnd: event.target.value
                        });
                      }}
                      disabled={isCreateSubmitting}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="create-note">新增备注（可选）</Label>
                  <Textarea
                    id="create-note"
                    value={createNote}
                    onChange={(event) => setCreateNote(event.target.value)}
                    className="min-h-20"
                    disabled={isCreateSubmitting}
                  />
                </div>

                {createErrorMessage ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {createErrorMessage}
                  </p>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    disabled={isCreateSubmitting}
                    onClick={() => {
                      void handleCreateSubmit();
                    }}
                  >
                    {isCreateSubmitting ? "新增中..." : "新增关系 claim"}
                  </Button>
                </div>
              </section>

              <TemporaryEvidenceAuditPanel detail={detail} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
