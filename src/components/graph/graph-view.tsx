"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useTheme } from "next-themes";

import type {
  GraphEdge,
  GraphFilter,
  GraphLayoutMode,
  GraphNode,
  GraphSnapshot
} from "@/types/graph";
import { fetchBookGraph, searchPersonaPath } from "@/lib/services/graph";
import { fetchPersonaDetail } from "@/lib/services/personas";
import { fetchChapterContent } from "@/lib/services/books";
import {
  ForceGraph,
  GraphToolbar,
  PersonaDetailPanel,
  ChapterTimeline,
  TextReaderPanel,
  GraphContextMenu
} from "@/components/graph";
import { AsyncErrorBoundary } from "@/components/ui/async-error-boundary";

interface SelectedPersonaState {
  id     : string;
  promise: ReturnType<typeof fetchPersonaDetail>;
}

interface TextReaderState {
  chapterId : string;
  paraIndex?: number;
  promise   : ReturnType<typeof fetchChapterContent>;
}

interface PanelFallbackProps {
  message: string;
  onClose: () => void;
}

function PanelFallback({ message, onClose }: PanelFallbackProps) {
  return (
    <aside className="absolute right-0 top-0 z-30 flex h-full w-96 flex-col border-l border-border bg-card shadow-xl">
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        {message}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="border-t border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
      >
        关闭
      </button>
    </aside>
  );
}

function ReaderPanelFallback({ message, onClose }: PanelFallbackProps) {
  return (
    <aside className="absolute right-0 top-0 z-30 flex h-full w-[480px] flex-col border-l border-border bg-card shadow-xl">
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        {message}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="border-t border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
      >
        关闭
      </button>
    </aside>
  );
}

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface GraphViewProps {
  bookId         : string;
  initialSnapshot: GraphSnapshot;
  totalChapters  : number;
  chapterUnit?   : string;
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function GraphView({
  bookId,
  initialSnapshot,
  totalChapters,
  chapterUnit = "回"
}: GraphViewProps) {
  const { resolvedTheme } = useTheme();

  // Graph data
  const [snapshot, setSnapshot] = useState<GraphSnapshot>(initialSnapshot);
  const [currentChapter, setCurrentChapter] = useState(totalChapters);
  const [loading, setLoading] = useState(false);

  // Interaction state
  const [selectedPersona, setSelectedPersona] = useState<SelectedPersonaState | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ node: GraphNode; position: { x: number; y: number } } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<GraphEdge | null>(null);

  // Toolbar state
  const [filter, setFilter] = useState<GraphFilter>({
    relationTypes : [],
    statuses      : [],
    factionIndices: [],
    searchQuery   : ""
  });
  const [layoutMode, setLayoutMode] = useState<GraphLayoutMode>("force");
  const [highlightPathIds, setHighlightPathIds] = useState<Set<string>>(new Set());

  // Text reader state
  const [textReader, setTextReader] = useState<TextReaderState | null>(null);

  // Available relation types (derived from data)
  const availableRelationTypes = useMemo(
    () => [...new Set(snapshot.edges.map(e => e.type))],
    [snapshot.edges]
  );

  // Fetch graph with chapter filter
  const fetchGraph = useCallback(async (chapter: number) => {
    setLoading(true);
    try {
      const data = await fetchBookGraph(bookId, chapter);
      setSnapshot(data);
    } catch {
      // Silently keep existing data on network error
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  // Chapter change handler
  function handleChapterChange(chapter: number) {
    setCurrentChapter(chapter);
    void fetchGraph(chapter);
  }

  function openPersonaDetail(personaId: string) {
    setSelectedPersona({
      id     : personaId,
      promise: fetchPersonaDetail(personaId)
    });
  }

  // Node click → open detail panel
  function handleNodeClick(node: GraphNode) {
    openPersonaDetail(node.id);
    setContextMenu(null);
  }

  // Double-click → focus mode
  function handleNodeDoubleClick(node: GraphNode) {
    setFocusedNodeId(prev => (prev === node.id ? null : node.id));
  }

  // Right-click → context menu
  function handleNodeRightClick(node: GraphNode, position: { x: number; y: number }) {
    setContextMenu({ node, position });
  }

  // Background click → clear selection
  function handleBackgroundClick() {
    setSelectedPersona(null);
    setFocusedNodeId(null);
    setContextMenu(null);
    setHighlightPathIds(new Set());
  }

  function findPersonaIdByName(name: string): string | null {
    const normalizedName = name.trim();
    if (!normalizedName) {
      return null;
    }

    const exactMatch = snapshot.nodes.find(node => node.name === normalizedName);
    if (exactMatch) {
      return exactMatch.id;
    }

    const lowerCaseName = normalizedName.toLowerCase();
    const caseInsensitiveMatch = snapshot.nodes.find(node => node.name.toLowerCase() === lowerCaseName);
    return caseInsensitiveMatch?.id ?? null;
  }

  // Path finding
  function handlePathFind(sourceName: string, targetName: string) {
    void (async () => {
      const sourcePersonaId = findPersonaIdByName(sourceName);
      const targetPersonaId = findPersonaIdByName(targetName);
      if (!sourcePersonaId || !targetPersonaId) {
        setHighlightPathIds(new Set());
        return;
      }

      try {
        const result = await searchPersonaPath({
          bookId,
          sourcePersonaId,
          targetPersonaId
        });
        if (result.found) {
          const pathNodeIds = new Set<string>(result.nodes.map(node => node.id));
          setHighlightPathIds(pathNodeIds);
          return;
        }
      } catch {
        // Keep UI stable on network failure
      }

      setHighlightPathIds(new Set());
    })();
  }

  // Export
  function handleExport(format: "png" | "svg" | "json") {
    if (format === "json") {
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `graph-${bookId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    // PNG/SVG export is deferred to Phase 5
  }

  // Fullscreen
  function handleFullscreen() {
    const el = document.querySelector(".graph-view-container");
    if (el) {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void el.requestFullscreen();
      }
    }
  }

  // Evidence click → open text reader
  function handleEvidenceClick(chapterId: string, paraIndex?: number) {
    setTextReader({
      chapterId,
      paraIndex,
      promise: fetchChapterContent(bookId, chapterId, paraIndex)
    });
  }

  return (
    <div className="graph-view-container relative h-full w-full overflow-hidden">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-(--color-graph-bg)/50">
          <div className="rounded-lg bg-card px-4 py-2 text-sm text-foreground shadow-lg">
            加载中...
          </div>
        </div>
      )}

      {/* D3 Force Graph */}
      <ForceGraph
        snapshot={snapshot}
        theme={resolvedTheme}
        chapterCap={currentChapter}
        filter={filter}
        layoutMode={layoutMode}
        focusedNodeId={focusedNodeId}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeRightClick={handleNodeRightClick}
        onEdgeHover={setHoveredEdge}
        onBackgroundClick={handleBackgroundClick}
        highlightPathIds={highlightPathIds.size > 0 ? highlightPathIds : undefined}
      />

      {/* Toolbar */}
      <GraphToolbar
        filter={filter}
        onFilterChange={setFilter}
        layoutMode={layoutMode}
        onLayoutChange={setLayoutMode}
        onPathFind={handlePathFind}
        onExport={handleExport}
        onFullscreen={handleFullscreen}
        availableRelationTypes={availableRelationTypes}
      />

      {/* Edge hover tooltip */}
      {hoveredEdge && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-md bg-card px-3 py-1.5 text-xs shadow-md"
          style={{ borderColor: "var(--color-border)", borderWidth: 1 }}
        >
          <span className="text-foreground">{hoveredEdge.type}</span>
          <span className="ml-2 text-muted-foreground">
            权重 {hoveredEdge.weight}
          </span>
        </div>
      )}

      {/* Chapter Timeline */}
      {totalChapters > 1 && (
        <ChapterTimeline
          totalChapters={totalChapters}
          currentChapter={currentChapter}
          onChapterChange={handleChapterChange}
          chapterUnit={chapterUnit}
        />
      )}

      {/* Person Detail Panel */}
      {selectedPersona && (
        <AsyncErrorBoundary fallback={<PanelFallback message="人物详情加载失败" onClose={() => setSelectedPersona(null)} />}>
          <Suspense fallback={<PanelFallback message="人物详情加载中..." onClose={() => setSelectedPersona(null)} />}>
            <PersonaDetailPanel
              personaPromise={selectedPersona.promise}
              bookId={bookId}
              onClose={() => setSelectedPersona(null)}
              onEvidenceClick={handleEvidenceClick}
              onEditClick={(id) => {
                void id; // Phase 4: inline editing
              }}
            />
          </Suspense>
        </AsyncErrorBoundary>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <GraphContextMenu
          node={contextMenu.node}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onViewDetail={() => openPersonaDetail(contextMenu.node.id)}
          onEdit={() => {
            // Phase 4 inline editing
            openPersonaDetail(contextMenu.node.id);
          }}
          onMerge={() => {
            // Phase 4 merge
          }}
          onDelete={() => {
            // Phase 4 delete
          }}
        />
      )}

      {/* Text Reader Panel */}
      {textReader && (
        <AsyncErrorBoundary fallback={<ReaderPanelFallback message="原文加载失败" onClose={() => setTextReader(null)} />}>
          <Suspense fallback={<ReaderPanelFallback message="原文加载中..." onClose={() => setTextReader(null)} />}>
            <TextReaderPanel
              bookId={bookId}
              chapterPromise={textReader.promise}
              highlightParaIndex={textReader.paraIndex}
              onClose={() => setTextReader(null)}
            />
          </Suspense>
        </AsyncErrorBoundary>
      )}
    </div>
  );
}
