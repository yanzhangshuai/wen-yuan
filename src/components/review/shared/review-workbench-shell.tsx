"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ReviewModeNav, type ReviewMode } from "./review-mode-nav";
import { BookSelector, type BookOption } from "./book-selector";
import { PersonaSidebar } from "./persona-sidebar";
import { type PersonaListItem } from "./persona-list-summary";

interface ReviewWorkbenchShellProps {
  bookId      : string;
  bookTitle   : string;
  books       : BookOption[];
  mode        : ReviewMode;
  personaItems: PersonaListItem[];
  renderMain  : (state: { 
    selectedPersonaId: string | null; 
    focusOnly        : boolean;
    onFocusOnlyChange: (next: boolean) => void;
  }) => ReactNode;
  initialSelectedPersonaId?: string | null;
  initialFocusOnly        ?: boolean;
}

const SS_KEY = (bookId: string) => `reviewWorkbench:lastSelectedPersonaId:${bookId}`;

export function ReviewWorkbenchShell({
  bookId,
  bookTitle,
  books,
  mode,
  personaItems,
  renderMain,
  initialSelectedPersonaId = null,
  initialFocusOnly         = false
}: ReviewWorkbenchShellProps) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(initialSelectedPersonaId);
  const [focusOnly,         setFocusOnly]         = useState<boolean>(initialFocusOnly);

  useEffect(() => {
    if (initialSelectedPersonaId === null && typeof window !== "undefined") {
      const cached = window.sessionStorage.getItem(SS_KEY(bookId));
      if (cached && personaItems.some((p) => p.personaId === cached)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 初始化时从 sessionStorage 恢复状态
        setSelectedPersonaId(cached);
      }
    }
  }, [bookId, initialSelectedPersonaId, personaItems]);

  const writeUrl = useCallback((nextPersona: string | null, nextFocus: boolean) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (nextPersona) params.set("personaId", nextPersona);
    else             params.delete("personaId");
    if (nextFocus)   params.set("focus", "1");
    else             params.delete("focus");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, router, searchParams]);

  const handleSelect = useCallback((personaId: string | null) => {
    setSelectedPersonaId(personaId);
    if (personaId === null && focusOnly) setFocusOnly(false);
    writeUrl(personaId, personaId === null ? false : focusOnly);
    if (typeof window !== "undefined") {
      if (personaId) window.sessionStorage.setItem(SS_KEY(bookId), personaId);
      else           window.sessionStorage.removeItem(SS_KEY(bookId));
    }
  }, [bookId, focusOnly, writeUrl]);

  const handleToggleFocus = useCallback((next: boolean) => {
    setFocusOnly(next);
    writeUrl(selectedPersonaId, next);
  }, [selectedPersonaId, writeUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "Escape") {
        if (selectedPersonaId) {
          e.preventDefault();
          handleSelect(null);
        }
        return;
      }
      if (isEditable) return;
      if (e.key === "f" || e.key === "F") {
        if (selectedPersonaId) {
          e.preventDefault();
          handleToggleFocus(!focusOnly);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusOnly, handleSelect, handleToggleFocus, selectedPersonaId]);

  const mainState = useMemo(
    () => ({ selectedPersonaId, focusOnly, onFocusOnlyChange: handleToggleFocus }),
    [selectedPersonaId, focusOnly, handleToggleFocus]
  );

  const selectedPersona = useMemo(
    () => personaItems.find((p) => p.personaId === selectedPersonaId),
    [personaItems, selectedPersonaId]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <BookSelector books={books} currentBookId={bookId} basePath="/admin/review" />
        <ReviewModeNav bookId={bookId} active={mode} preserveQuery />
      </div>
      {selectedPersona && (
        <nav aria-label="面包屑补充" className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>审核中心</span>
          <span>/</span>
          <span className="font-medium text-foreground">{selectedPersona.displayName}</span>
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-accent hover:text-foreground"
            aria-label="清除角色筛选"
          >
            ×
          </button>
        </nav>
      )}
      <div className="flex gap-4">
        <PersonaSidebar
          items            ={personaItems}
          selectedPersonaId={selectedPersonaId}
          onSelect         ={handleSelect}
        />
        <main className="min-w-0 flex-1">
          {renderMain(mainState)}
          <input type="hidden" data-testid="shell-book-title" value={bookTitle} readOnly />
          {focusOnly && selectedPersonaId && (
            <div className="sr-only" data-testid="focus-banner">已切换到只看当前角色</div>
          )}
        </main>
      </div>
    </div>
  );
}
