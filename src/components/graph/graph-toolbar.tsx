"use client";

import { useState } from "react";
import {
  Filter,
  Search,
  Route,
  LayoutGrid,
  Maximize,
  Download,
  X
} from "lucide-react";

import type { GraphFilter, GraphLayoutMode, ProcessingStatus } from "@/types/graph";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface GraphToolbarProps {
  filter                : GraphFilter;
  onFilterChange        : (filter: GraphFilter) => void;
  layoutMode            : GraphLayoutMode;
  onLayoutChange        : (mode: GraphLayoutMode) => void;
  onPathFind            : (sourceName: string, targetName: string) => void;
  onExport              : (format: "png" | "svg" | "json") => void;
  onFullscreen          : () => void;
  availableRelationTypes: string[];
}

/* ------------------------------------------------
   Sub-panels
   ------------------------------------------------ */
type ToolbarPanel = "filter" | "search" | "path" | "layout" | "export" | null;

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function GraphToolbar({
  filter,
  onFilterChange,
  layoutMode,
  onLayoutChange,
  onPathFind,
  onExport,
  onFullscreen,
  availableRelationTypes
}: GraphToolbarProps) {
  const [activePanel, setActivePanel] = useState<ToolbarPanel>(null);
  const [searchInput, setSearchInput] = useState(filter.searchQuery);
  const [pathSource, setPathSource] = useState("");
  const [pathTarget, setPathTarget] = useState("");

  function togglePanel(panel: ToolbarPanel) {
    setActivePanel(prev => (prev === panel ? null : panel));
  }

  function handleSearchSubmit() {
    onFilterChange({ ...filter, searchQuery: searchInput });
  }

  function handlePathSubmit() {
    if (pathSource && pathTarget) {
      onPathFind(pathSource, pathTarget);
      setActivePanel(null);
    }
  }

  function toggleRelationType(type: string) {
    const next = filter.relationTypes.includes(type)
      ? filter.relationTypes.filter(t => t !== type)
      : [...filter.relationTypes, type];
    onFilterChange({ ...filter, relationTypes: next });
  }

  function toggleStatus(status: ProcessingStatus) {
    const next = filter.statuses.includes(status)
      ? filter.statuses.filter(s => s !== status)
      : [...filter.statuses, status];
    onFilterChange({ ...filter, statuses: next });
  }

  const toolButtons: { id: ToolbarPanel; icon: React.ReactNode; label: string }[] = [
    { id: "filter", icon: <Filter size={18} />, label: "筛选" },
    { id: "search", icon: <Search size={18} />, label: "搜索" },
    { id: "path", icon: <Route size={18} />, label: "路径查找" },
    { id: "layout", icon: <LayoutGrid size={18} />, label: "布局" },
    { id: "export", icon: <Download size={18} />, label: "导出" }
  ];

  return (
    <div className="graph-toolbar absolute left-4 top-4 z-10 flex flex-col gap-2">
      {/* Toolbar buttons */}
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card/80 backdrop-blur-md p-1 shadow-lg">
          {toolButtons.map(btn => (
            <Tooltip key={btn.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => togglePanel(btn.id)}
                  className={`flex items-center justify-center rounded-md p-2 transition-colors hover:bg-accent ${
                    activePanel === btn.id ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                  }`}
                  aria-label={btn.label}
                >
                  {btn.icon}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{btn.label}</TooltipContent>
            </Tooltip>
          ))}

          <div className="my-0.5 h-px bg-border/60" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onFullscreen}
                className="flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent"
                aria-label="全屏"
              >
                <Maximize size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">全屏</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* Expandable panels */}
      {activePanel && (
        <div className="w-64 rounded-lg border border-border/60 bg-card/80 backdrop-blur-md p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              {toolButtons.find(b => b.id === activePanel)?.label ?? ""}
            </span>
            <button
              type="button"
              onClick={() => setActivePanel(null)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="关闭"
            >
              <X size={14} />
            </button>
          </div>

          {/* Filter panel */}
          {activePanel === "filter" && (
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">关系类型</p>
                <div className="flex flex-wrap gap-1">
                  {availableRelationTypes.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleRelationType(type)}
                      className={`rounded-sm px-2 py-0.5 text-xs transition-colors ${
                        filter.relationTypes.includes(type)
                          ? "bg-primary text-(--color-primary-fg)"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">审核状态</p>
                <div className="flex gap-1">
                  {(["DRAFT", "VERIFIED", "REJECTED"] as ProcessingStatus[]).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleStatus(s)}
                      className={`rounded-sm px-2 py-0.5 text-xs transition-colors ${
                        filter.statuses.includes(s)
                          ? "bg-primary text-(--color-primary-fg)"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {s === "DRAFT" ? "草稿" : s === "VERIFIED" ? "已审核" : "已拒绝"}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onFilterChange({
                  relationTypes : [],
                  statuses      : [],
                  factionIndices: [],
                  searchQuery   : ""
                })}
              >
                重置筛选
              </Button>
            </div>
          )}

          {/* Search panel */}
          {activePanel === "search" && (
            <div className="flex gap-2">
              <Input
                placeholder="搜索人物..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
                className="h-8 text-sm"
              />
              <Button size="sm" onClick={handleSearchSubmit}>
                搜索
              </Button>
            </div>
          )}

          {/* Path find panel */}
          {activePanel === "path" && (
            <div className="flex flex-col gap-2">
              <Input
                placeholder="起点人物名..."
                value={pathSource}
                onChange={(e) => setPathSource(e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                placeholder="终点人物名..."
                value={pathTarget}
                onChange={(e) => setPathTarget(e.target.value)}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                onClick={handlePathSubmit}
                disabled={!pathSource || !pathTarget}
              >
                查找路径
              </Button>
            </div>
          )}

          {/* Layout panel */}
          {activePanel === "layout" && (
            <div className="flex flex-col gap-1">
              {([
                { mode: "force" as const, label: "力导向" },
                { mode: "radial" as const, label: "同心圆" },
                { mode: "tree" as const, label: "层级树" }
              ]).map(opt => (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => {
                    onLayoutChange(opt.mode);
                    setActivePanel(null);
                  }}
                  className={`rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                    layoutMode === opt.mode
                      ? "bg-primary-subtle text-primary"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Export panel */}
          {activePanel === "export" && (
            <div className="flex flex-col gap-1">
              {(["png", "svg", "json"] as const).map(fmt => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => {
                    onExport(fmt);
                    setActivePanel(null);
                  }}
                  className="rounded-md px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                >
                  导出 {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
