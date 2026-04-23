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
  fetchCellClaims,
  fetchReviewClaimDetail,
  type PersonaChapterMatrixDto,
  type ReviewClaimDetailResponse,
  type ReviewClaimListItem
} from "@/lib/services/review-matrix";

import { ReviewClaimDetailPanel } from "../evidence-panel";

import { ClaimActionPanel } from "./claim-action-panel";
import { CellClaimList } from "./cell-claim-list";
import { ManualClaimForm } from "./manual-claim-form";
import type { MatrixCellSelection } from "./types";

interface CellDrilldownSheetProps {
  open              : boolean;
  matrix            : PersonaChapterMatrixDto;
  selection         : MatrixCellSelection | null;
  onOpenChange      : (open: boolean) => void;
  onMutationSuccess?: () => void | Promise<void>;
  className   ?     : string;
}

function toErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
}

function selectionExists(
  matrix: PersonaChapterMatrixDto,
  selection: MatrixCellSelection
): boolean {
  return matrix.personas.some((persona) => persona.personaId === selection.personaId)
    && matrix.chapters.some((chapter) => chapter.chapterId === selection.chapterId);
}

function buildTimeMatrixHref(bookId: string, personaId: string, timeLabel: string): string {
  const searchParams = new URLSearchParams({
    personaId,
    timeLabel
  });

  return `/admin/review/${bookId}/time?${searchParams.toString()}`;
}

/**
 * 单元格钻取抽屉：
 * - 只在 reviewer 明确点击单元格后才懒加载 claim list/detail，避免首屏把全书 claim 全量拉到浏览器；
 * - 抽屉内部负责请求竞态隔离，确保快速切换单元格时旧请求不会覆盖新结果。
 */
export function CellDrilldownSheet({
  open,
  matrix,
  selection,
  onOpenChange,
  onMutationSuccess,
  className
}: CellDrilldownSheetProps) {
  const [claims, setClaims] = useState<ReviewClaimListItem[]>([]);
  const [isClaimsLoading, setIsClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewClaimDetailResponse | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const claimsRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);

  const activeSelection = selection !== null && selectionExists(matrix, selection)
    ? selection
    : null;
  const persona = activeSelection === null
    ? null
    : matrix.personas.find((item) => item.personaId === activeSelection.personaId) ?? null;
  const chapter = activeSelection === null
    ? null
    : matrix.chapters.find((item) => item.chapterId === activeSelection.chapterId) ?? null;
  const selectedClaim = selectedClaimId === null
    ? null
    : claims.find((claim) => claim.claimId === selectedClaimId) ?? null;
  const selectedTimeLabel = detail?.claim.timeLabel ?? selectedClaim?.timeLabel ?? null;

  const loadClaims = useCallback(async (nextSelection: MatrixCellSelection) => {
    const requestId = claimsRequestIdRef.current + 1;
    claimsRequestIdRef.current = requestId;
    setIsClaimsLoading(true);
    setClaimsError(null);
    setClaims([]);
    setSelectedClaimId(null);
    setDetail(null);
    setDetailError(null);
    setIsDetailLoading(false);

    try {
      const response = await fetchCellClaims({
        bookId   : matrix.bookId,
        personaId: nextSelection.personaId,
        chapterId: nextSelection.chapterId,
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

      setClaimsError(toErrorMessage(error, "单元格加载失败，请稍后重试。"));
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

  const handleMutationSuccess = useCallback(async () => {
    if (activeSelection !== null) {
      await loadClaims(activeSelection);
    }

    await onMutationSuccess?.();
  }, [activeSelection, loadClaims, onMutationSuccess]);

  useEffect(() => {
    if (!open || activeSelection === null) {
      return;
    }

    void loadClaims(activeSelection);
  }, [activeSelection, loadClaims, open]);

  useEffect(() => {
    if (!open || selectedClaim === null) {
      return;
    }

    void loadClaimDetail(selectedClaim);
  }, [loadClaimDetail, open, selectedClaim]);

  if (!open || persona === null || chapter === null) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={className ?? "w-full gap-0 overflow-hidden p-0 sm:max-w-5xl"}
      >
        <SheetHeader className="border-b pb-4">
          <SheetTitle>{persona.displayName} · {chapter.label}</SheetTitle>
          <SheetDescription>
            {chapter.title} · 查看该人物在本章节的事迹、关系、冲突记录，以及对应的原文证据与 AI 提取依据。
          </SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(21rem,24rem)_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col border-b p-4 lg:border-r lg:border-b-0">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">本章可审核记录</h3>
                <p className="text-xs text-muted-foreground">
                  按 claim-first 模式查看当前人物在本章节的事迹、关系与冲突。
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{claims.length} 条记录</span>
            </div>

            <ManualClaimForm
              bookId={matrix.bookId}
              persona={persona}
              chapter={chapter}
              personas={matrix.personas}
              relationTypeOptions={matrix.relationTypeOptions ?? []}
              onMutationSuccess={handleMutationSuccess}
              className="mb-4"
            />

            <div className="min-h-0 flex-1 overflow-y-auto">
              {isClaimsLoading ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
                >
                  单元格加载中...
                </div>
              ) : claimsError ? (
                <ErrorState
                  title="单元格加载失败"
                  description={claimsError}
                  onRetry={() => {
                    if (activeSelection !== null) {
                      void loadClaims(activeSelection);
                    }
                  }}
                  className="rounded-xl border bg-background"
                />
              ) : claims.length === 0 ? (
                <EmptyState
                  title="当前单元格还没有可审核记录"
                  description="可在下一步补录事迹、关系或冲突说明。"
                  className="rounded-xl border bg-background"
                />
              ) : (
                <CellClaimList
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
                description="左侧可切换事迹、关系或冲突记录；右侧会展示原文证据和 AI 提取依据。"
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
              <div className="space-y-4">
                {selectedTimeLabel ? (
                  <Link
                    href={buildTimeMatrixHref(matrix.bookId, persona.personaId, selectedTimeLabel)}
                    className="inline-flex rounded-md border px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-accent"
                  >
                    查看时间矩阵
                  </Link>
                ) : null}
                <ReviewClaimDetailPanel detail={detail} />
                <ClaimActionPanel
                  bookId={matrix.bookId}
                  claim={selectedClaim}
                  detail={detail}
                  relationTypeOptions={matrix.relationTypeOptions ?? []}
                  onMutationSuccess={handleMutationSuccess}
                />
              </div>
            ) : null}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
