"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import {
  fetchReviewClaimDetail,
  fetchTimeCellClaims,
  type PersonaTimeMatrixDto,
  type PersonaTimeMatrixPersonaDto,
  type PersonaTimeSliceDto,
  type ReviewClaimDetailResponse,
  type ReviewClaimListItem
} from "@/lib/services/review-time-matrix";

import { ReviewClaimDetailPanel } from "../evidence-panel";

import { TimeCellClaimList } from "./time-cell-claim-list";
import type { PersonaTimeSelection } from "./types";

interface TimeCellDrilldownSheetProps {
  open        : boolean;
  matrix      : PersonaTimeMatrixDto;
  selection   : PersonaTimeSelection | null;
  onOpenChange: (open: boolean) => void;
  className?  : string;
}

interface ActiveTimeCellContext {
  persona: PersonaTimeMatrixPersonaDto;
  slice  : PersonaTimeSliceDto;
}

function toErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
}

function findTimeSlice(
  matrix: PersonaTimeMatrixDto,
  timeKey: string
): PersonaTimeSliceDto | null {
  for (const group of matrix.timeGroups) {
    const slice = group.slices.find((item) => item.timeKey === timeKey);

    if (slice) {
      return slice;
    }
  }

  return null;
}

function resolveActiveContext(
  matrix: PersonaTimeMatrixDto,
  selection: PersonaTimeSelection | null
): ActiveTimeCellContext | null {
  if (selection === null) {
    return null;
  }

  const persona = matrix.personas.find((item) => item.personaId === selection.personaId) ?? null;
  const slice = findTimeSlice(matrix, selection.timeKey);

  if (persona === null || slice === null) {
    return null;
  }

  return { persona, slice };
}

function buildChapterRangeText(slice: PersonaTimeSliceDto): string | null {
  if (slice.chapterRangeStart === null && slice.chapterRangeEnd === null) {
    return null;
  }

  if (slice.chapterRangeStart === slice.chapterRangeEnd) {
    return `章节范围：第 ${slice.chapterRangeStart} 回`;
  }

  if (slice.chapterRangeStart !== null && slice.chapterRangeEnd !== null) {
    return `章节范围：第 ${slice.chapterRangeStart}-${slice.chapterRangeEnd} 回`;
  }

  return slice.chapterRangeStart !== null
    ? `章节范围：第 ${slice.chapterRangeStart} 回起`
    : `章节范围：至第 ${slice.chapterRangeEnd} 回`;
}

function buildChapterMatrixHref(bookId: string, personaId: string, chapterId: string): string {
  const searchParams = new URLSearchParams({
    personaId,
    chapterId
  });

  return `/admin/review/${bookId}?${searchParams.toString()}`;
}

/**
 * 时间矩阵钻取层复用 T12 claim API 和 T16 共享证据面板。
 * 这里保留本地请求序号，避免 reviewer 快速切换时间片时旧请求覆盖新面板。
 */
export function TimeCellDrilldownSheet({
  open,
  matrix,
  selection,
  onOpenChange,
  className
}: TimeCellDrilldownSheetProps) {
  const [claims, setClaims] = useState<ReviewClaimListItem[]>([]);
  const [isClaimsLoading, setIsClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewClaimDetailResponse | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedEvidenceSpanId, setSelectedEvidenceSpanId] = useState<string | null>(null);
  const claimsRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);

  const activeContext = resolveActiveContext(matrix, selection);
  const persona = activeContext?.persona ?? null;
  const slice = activeContext?.slice ?? null;
  const activePersonaId = persona?.personaId ?? null;
  const activeTimeLabel = slice?.normalizedLabel ?? null;
  const selectedClaim = selectedClaimId === null
    ? null
    : claims.find((claim) => claim.claimId === selectedClaimId) ?? null;
  const chapterRangeText = slice === null ? null : buildChapterRangeText(slice);

  const loadClaims = useCallback(async (input: { personaId: string; timeLabel: string }) => {
    const requestId = claimsRequestIdRef.current + 1;
    claimsRequestIdRef.current = requestId;
    setIsClaimsLoading(true);
    setClaimsError(null);
    setClaims([]);
    setSelectedClaimId(null);
    setDetail(null);
    setDetailError(null);
    setIsDetailLoading(false);
    setSelectedEvidenceSpanId(null);

    try {
      const response = await fetchTimeCellClaims({
        bookId   : matrix.bookId,
        personaId: input.personaId,
        timeLabel: input.timeLabel,
        limit    : 50
      });

      if (claimsRequestIdRef.current !== requestId) {
        return;
      }

      setClaims(response.items);
    } catch (error) {
      if (claimsRequestIdRef.current !== requestId) {
        return;
      }

      setClaimsError(toErrorMessage(error, "时间单元格加载失败，请稍后重试。"));
    } finally {
      if (claimsRequestIdRef.current === requestId) {
        setIsClaimsLoading(false);
      }
    }
  }, [matrix.bookId]);

  const loadClaimDetail = useCallback(async (claim: ReviewClaimListItem) => {
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    setIsDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setSelectedEvidenceSpanId(null);

    try {
      const response = await fetchReviewClaimDetail({
        bookId   : matrix.bookId,
        claimKind: claim.claimKind,
        claimId  : claim.claimId
      });

      if (detailRequestIdRef.current !== requestId) {
        return;
      }

      setDetail(response);
    } catch (error) {
      if (detailRequestIdRef.current !== requestId) {
        return;
      }

      setDetailError(toErrorMessage(error, "明细加载失败，请稍后重试。"));
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setIsDetailLoading(false);
      }
    }
  }, [matrix.bookId]);

  useEffect(() => {
    if (!open || activePersonaId === null || activeTimeLabel === null) {
      return;
    }

    void loadClaims({
      personaId: activePersonaId,
      timeLabel: activeTimeLabel
    });
  }, [activePersonaId, activeTimeLabel, loadClaims, open]);

  useEffect(() => {
    if (!open || selectedClaim === null) {
      return;
    }

    void loadClaimDetail(selectedClaim);
  }, [loadClaimDetail, open, selectedClaim]);

  if (!open || persona === null || slice === null) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={className ?? "time-cell-drilldown-sheet w-full gap-0 overflow-hidden p-0 sm:max-w-5xl"}
      >
        <SheetHeader className="border-b pb-4">
          <SheetTitle>{persona.displayName} · {slice.normalizedLabel}</SheetTitle>
          <SheetDescription>
            查看该人物在当前时间片的时间归一化、事迹、关系、冲突记录，以及对应的原文证据与 AI 提取依据。
          </SheetDescription>

          <div className="mt-3 space-y-3 text-sm">
            {chapterRangeText ? (
              <p className="text-muted-foreground">{chapterRangeText}</p>
            ) : null}

            {slice.rawLabels.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">原文时间</span>
                {slice.rawLabels.map((rawLabel) => (
                  <span
                    key={rawLabel}
                    className="rounded-full border bg-muted/30 px-2 py-1 text-xs text-foreground"
                  >
                    {rawLabel}
                  </span>
                ))}
              </div>
            ) : null}

            {slice.linkedChapters.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">关联章节</span>
                {slice.linkedChapters.map((chapter) => (
                  <Link
                    key={chapter.chapterId}
                    href={buildChapterMatrixHref(matrix.bookId, persona.personaId, chapter.chapterId)}
                    className="rounded-full border bg-background px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
                  >
                    {chapter.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(21rem,24rem)_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col border-b p-4 lg:border-r lg:border-b-0">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">本时间片可审核记录</h3>
                <p className="text-xs text-muted-foreground">
                  先确认时间 claim，再核对事迹、关系和冲突记录。
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{claims.length} 条记录</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {isClaimsLoading ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
                >
                  时间单元格加载中...
                </div>
              ) : claimsError ? (
                <ErrorState
                  title="时间单元格加载失败"
                  description={claimsError}
                  onRetry={() => {
                    if (activePersonaId !== null && activeTimeLabel !== null) {
                      void loadClaims({
                        personaId: activePersonaId,
                        timeLabel: activeTimeLabel
                      });
                    }
                  }}
                  className="rounded-xl border bg-background"
                />
              ) : claims.length === 0 ? (
                <EmptyState
                  title="当前时间片还没有可审核记录"
                  description="可返回矩阵选择其他人物或时间片继续审核。"
                  className="rounded-xl border bg-background"
                />
              ) : (
                <TimeCellClaimList
                  claims={claims}
                  selectedClaimId={selectedClaimId}
                  onSelectClaim={(claim) => {
                    setSelectedClaimId(claim.claimId);
                  }}
                />
              )}
            </div>
          </section>

          <section className="min-h-0 overflow-y-auto p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">证据与 AI 依据</h3>
              <p className="text-xs text-muted-foreground">
                先从左侧选择一条记录，再查看它的原文证据、AI 依据与审核轨迹。
              </p>
            </div>

            {selectedClaim === null ? (
              <EmptyState
                title="请选择一条记录查看证据"
                description="左侧可切换时间、事迹、关系或冲突记录；右侧会展示共享证据面板。"
                className="rounded-xl border bg-background"
              />
            ) : isDetailLoading ? (
              <div
                role="status"
                aria-live="polite"
                className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
              >
                明细加载中...
              </div>
            ) : detailError ? (
              <ErrorState
                title="明细加载失败"
                description={detailError}
                onRetry={() => {
                  if (selectedClaim !== null) {
                    void loadClaimDetail(selectedClaim);
                  }
                }}
                className="rounded-xl border bg-background"
              />
            ) : detail ? (
              <ReviewClaimDetailPanel
                detail={detail}
                selectedEvidenceSpanId={selectedEvidenceSpanId}
                onSelectEvidenceSpan={setSelectedEvidenceSpanId}
              />
            ) : null}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
