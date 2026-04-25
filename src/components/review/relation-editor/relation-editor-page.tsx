"use client";

import { useEffect, useState } from "react";

import { ErrorState } from "@/components/ui/states";
import {
  fetchRelationEditorView,
  type FetchRelationEditorViewInput,
  type ReviewRelationEditorDto
} from "@/lib/services/relation-editor";
import { FocusOnlySwitch } from "@/components/review/shared/focus-only-switch";

import { RelationClaimSheet } from "./relation-claim-sheet";
import { RelationClaimList } from "./relation-claim-list";
import { RelationEditorToolbar } from "./relation-editor-toolbar";
import { RelationPairList } from "./relation-pair-list";
import {
  EMPTY_RELATION_EDITOR_FILTERS,
  type RelationEditorFilters
} from "./types";

export interface RelationEditorBookOption {
  id          : string;
  title       : string;
  personaCount: number;
}

export interface RelationEditorPageProps {
  bookId                : string;
  bookTitle             : string;
  allBooks              : RelationEditorBookOption[];
  initialRelationEditor : ReviewRelationEditorDto;
  selectedPersonaId     : string | null;
  focusOnly             : boolean;
  onFocusOnlyChange    ?: (next: boolean) => void;
}

interface SelectedPairState {
  pairKey       : string;
  leftPersonaId : string;
  rightPersonaId: string;
}

function toLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "刷新关系列表失败，请稍后重试。";
}

function toSelectedPairState(
  relationEditor: ReviewRelationEditorDto
): SelectedPairState | null {
  const selectedPair = relationEditor.selectedPair;
  if (selectedPair === null) {
    return null;
  }

  return {
    pairKey       : selectedPair.pairKey,
    leftPersonaId : selectedPair.leftPersona.personaId,
    rightPersonaId: selectedPair.rightPersona.personaId
  };
}

function findPairSelection(
  relationEditor: ReviewRelationEditorDto,
  pairKey: string
): SelectedPairState | null {
  const matchedPair = relationEditor.pairSummaries.find((pair) => pair.pairKey === pairKey);
  if (!matchedPair) {
    return null;
  }

  return {
    pairKey       : matchedPair.pairKey,
    leftPersonaId : matchedPair.leftPersonaId,
    rightPersonaId: matchedPair.rightPersonaId
  };
}

function buildRelationEditorQuery(
  bookId: string,
  filters: RelationEditorFilters,
  selectedPair: SelectedPairState | null
): FetchRelationEditorViewInput {
  const query: FetchRelationEditorViewInput = { bookId };

  if (selectedPair) {
    if (filters.personaId.length > 0) {
      if (filters.personaId === selectedPair.leftPersonaId) {
        query.personaId = selectedPair.leftPersonaId;
        query.pairPersonaId = selectedPair.rightPersonaId;
      } else if (filters.personaId === selectedPair.rightPersonaId) {
        query.personaId = selectedPair.rightPersonaId;
        query.pairPersonaId = selectedPair.leftPersonaId;
      } else {
        query.personaId = filters.personaId;
      }
    } else {
      query.personaId = selectedPair.leftPersonaId;
      query.pairPersonaId = selectedPair.rightPersonaId;
    }
  } else if (filters.personaId.length > 0) {
    query.personaId = filters.personaId;
  }

  if (filters.relationTypeKey.length > 0) {
    query.relationTypeKeys = [filters.relationTypeKey];
  }

  if (filters.reviewState !== "") {
    query.reviewStates = [filters.reviewState];
  }

  if (filters.conflictState !== "") {
    query.conflictState = filters.conflictState;
  }

  return query;
}

/**
 * 关系审核页的客户端入口：
 * - 首屏只消费 server page 注入的 reviewer-friendly DTO；
 * - 筛选与 pair 选择通过只读 route 回刷；
 * - claim detail 继续走懒加载，写入仍复用 T12 claim-first mutation。
 */
export function RelationEditorPage({
  bookId,
  bookTitle,
  allBooks,
  initialRelationEditor,
  selectedPersonaId,
  focusOnly,
  onFocusOnlyChange
}: RelationEditorPageProps) {
  const [filters, setFilters] = useState(EMPTY_RELATION_EDITOR_FILTERS);
  const [relationEditor, setRelationEditor] = useState(initialRelationEditor);
  const [selectedPair, setSelectedPair] = useState<SelectedPairState | null>(
    toSelectedPairState(initialRelationEditor)
  );
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const displayedPairSummaries = (focusOnly && selectedPersonaId)
    ? relationEditor.pairSummaries.filter((pair) =>
        pair.leftPersonaId === selectedPersonaId || pair.rightPersonaId === selectedPersonaId
      )
    : relationEditor.pairSummaries;

  const highlightedPersonaId = (!focusOnly && selectedPersonaId) ? selectedPersonaId : null;

  useEffect(() => {
    setFilters(EMPTY_RELATION_EDITOR_FILTERS);
    setRelationEditor(initialRelationEditor);
    setSelectedPair(toSelectedPairState(initialRelationEditor));
    setSelectedClaimId(null);
    setLoadError(null);
    setIsLoading(false);
  }, [bookId, initialRelationEditor]);

  async function refreshRelationEditor(
    nextFilters: RelationEditorFilters,
    nextSelectedPair: SelectedPairState | null
  ) {
    setFilters(nextFilters);
    setIsLoading(true);
    setLoadError(null);

    try {
      const nextRelationEditor = await fetchRelationEditorView(buildRelationEditorQuery(
        bookId,
        nextFilters,
        nextSelectedPair
      ));

      setRelationEditor(nextRelationEditor);

      const resolvedSelectedPair = nextSelectedPair
        ? findPairSelection(nextRelationEditor, nextSelectedPair.pairKey)
        : null;
      setSelectedPair(resolvedSelectedPair);
      setSelectedClaimId((previousClaimId) => {
        if (
          previousClaimId
          && nextRelationEditor.selectedPair?.claims.some((claim) => claim.claimId === previousClaimId)
        ) {
          return previousClaimId;
        }

        return null;
      });
    } catch (error) {
      setLoadError(toLoadErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshCurrentRelationEditor() {
    await refreshRelationEditor(filters, selectedPair);
  }

  function handleFiltersChange(nextFilters: RelationEditorFilters) {
    void refreshRelationEditor(nextFilters, selectedPair);
  }

  function handleReset() {
    setSelectedClaimId(null);
    void refreshRelationEditor(EMPTY_RELATION_EDITOR_FILTERS, null);
  }

  function handleSelectPair(pairKey: string) {
    const nextSelectedPair = findPairSelection(relationEditor, pairKey);
    if (nextSelectedPair === null) {
      return;
    }

    setSelectedClaimId(null);
    void refreshRelationEditor(filters, nextSelectedPair);
  }

  return (
    <>
      <header className="flex flex-col gap-2 border-b pb-4">
        <p className="text-sm font-medium text-muted-foreground">人物关系</p>
        <h1 className="text-2xl font-semibold tracking-tight">{bookTitle}</h1>
        <p className="text-sm text-muted-foreground">
          当前书籍 {bookId}，可切换 {allBooks.length} 本书。关系对列表会按当前筛选条件回源刷新。
        </p>
      </header>

      <div className="mt-4 space-y-4">
        <div className="space-y-3">
          <RelationEditorToolbar
            filters={filters}
            personaOptions={relationEditor.personaOptions}
            relationTypeOptions={relationEditor.relationTypeOptions}
            pairCount={relationEditor.pairSummaries.length}
            isLoading={isLoading}
            onFiltersChange={handleFiltersChange}
            onReset={handleReset}
          />

          {onFocusOnlyChange && selectedPersonaId && (
            <div className="rounded-xl border bg-background px-4 py-3">
              <FocusOnlySwitch
                checked={focusOnly}
                onCheckedChange={onFocusOnlyChange}
                disabled={isLoading}
              />
            </div>
          )}
        </div>

        {isLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
          >
            关系列表刷新中...
          </div>
        ) : null}

        {loadError ? (
          <ErrorState
            title="关系加载失败"
            description={loadError}
            onRetry={() => {
              void refreshCurrentRelationEditor();
            }}
            className="rounded-xl border bg-background"
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
            <RelationPairList
              pairSummaries={displayedPairSummaries}
              relationTypeOptions={relationEditor.relationTypeOptions}
              selectedPairKey={selectedPair?.pairKey ?? null}
              onSelectPair={handleSelectPair}
              highlightedPersonaId={highlightedPersonaId}
            />

            <RelationClaimList
              selectedPair={relationEditor.selectedPair}
              relationTypeOptions={relationEditor.relationTypeOptions}
              selectedClaimId={selectedClaimId}
              onSelectClaim={setSelectedClaimId}
            />
          </div>
        )}
      </div>

      <RelationClaimSheet
        open={selectedClaimId !== null}
        bookId={bookId}
        selectedPair={relationEditor.selectedPair}
        selectedClaimId={selectedClaimId}
        relationTypeOptions={relationEditor.relationTypeOptions}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSelectedClaimId(null);
          }
        }}
        onMutationSuccess={refreshCurrentRelationEditor}
      />
    </>
  );
}
