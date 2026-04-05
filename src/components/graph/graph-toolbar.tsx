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

/**
 * =============================================================================
 * 文件定位（图谱工具栏）
 * -----------------------------------------------------------------------------
 * 组件角色：图谱页面左上角“操作入口”聚合区。
 * 组件类型：Client Component（依赖点击、输入、展开状态）。
 *
 * 业务职责：
 * - 聚合图谱筛选、关键词搜索、路径查找、布局切换、导出、全屏；
 * - 作为“纯交互控制层”，不直接请求后端，也不维护主图数据。
 *
 * 上下游关系：
 * - 上游：`GraphView` 传入当前 filter/layout 与回调；
 * - 下游：无，直接渲染按钮与展开面板。
 *
 * 重要约束：
 * - 此组件只发出“用户意图”，具体业务执行由容器层决定；
 * - 重置筛选时的默认值属于业务规则，需与图谱默认展示策略保持一致。
 * =============================================================================
 */

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface GraphToolbarProps {
  /** 当前图谱筛选条件（受控状态）。 */
  filter                : GraphFilter;
  /** 筛选条件变更回调，调用方负责持久化到容器状态。 */
  onFilterChange        : (filter: GraphFilter) => void;
  /** 当前布局模式（受控状态）。 */
  layoutMode            : GraphLayoutMode;
  /** 布局模式变更回调。 */
  onLayoutChange        : (mode: GraphLayoutMode) => void;
  /** 路径查找触发回调，参数为起点/终点人物名称。 */
  onPathFind            : (sourceName: string, targetName: string) => void;
  /** 导出回调（支持 png/svg/json 三种外部契约格式）。 */
  onExport              : (format: "png" | "svg" | "json") => void;
  /** 全屏切换回调（由上层决定具体作用元素）。 */
  onFullscreen          : () => void;
  /** 当前快照中可用的关系类型集合（用于筛选面板选项）。 */
  availableRelationTypes: string[];
}

/* ------------------------------------------------
   Sub-panels
   ------------------------------------------------ */
/**
 * 工具栏当前展开面板标识。
 * - `null` 表示仅显示图标列；
 * - 其余值对应各功能面板。
 */
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
  /** 当前打开的面板；用于控制“单面板互斥展开”。 */
  const [activePanel, setActivePanel] = useState<ToolbarPanel>(null);
  /** 搜索框本地输入态：与全局 filter 解耦，避免每次按键都触发大图重筛选。 */
  const [searchInput, setSearchInput] = useState(filter.searchQuery);
  /** 路径查找起点输入。 */
  const [pathSource, setPathSource] = useState("");
  /** 路径查找终点输入。 */
  const [pathTarget, setPathTarget] = useState("");

  /**
   * 面板切换逻辑：
   * - 点击已展开面板 -> 收起；
   * - 点击其他面板 -> 切换到新面板。
   */
  function togglePanel(panel: ToolbarPanel) {
    setActivePanel(prev => (prev === panel ? null : panel));
  }

  /** 提交关键词搜索：把本地输入同步到容器 filter。 */
  function handleSearchSubmit() {
    onFilterChange({ ...filter, searchQuery: searchInput });
  }

  /**
   * 提交路径查找。
   * 防御目的：要求起点和终点都非空，避免触发无意义请求。
   */
  function handlePathSubmit() {
    if (pathSource && pathTarget) {
      onPathFind(pathSource, pathTarget);
      // 成功触发后自动收起面板，避免遮挡图谱视图。
      setActivePanel(null);
    }
  }

  /** 切换关系类型筛选（多选）。 */
  function toggleRelationType(type: string) {
    const next = filter.relationTypes.includes(type)
      ? filter.relationTypes.filter(t => t !== type)
      : [...filter.relationTypes, type];
    onFilterChange({ ...filter, relationTypes: next });
  }

  /** 切换审核状态筛选（多选）。 */
  function toggleStatus(status: ProcessingStatus) {
    const next = filter.statuses.includes(status)
      ? filter.statuses.filter(s => s !== status)
      : [...filter.statuses, status];
    onFilterChange({ ...filter, statuses: next });
  }

  /** 工具按钮元数据（用于统一渲染图标列）。 */
  const toolButtons: { id: ToolbarPanel; icon: React.ReactNode; label: string }[] = [
    { id: "filter", icon: <Filter size={18} />, label: "筛选" },
    { id: "search", icon: <Search size={18} />, label: "搜索" },
    { id: "path", icon: <Route size={18} />, label: "路径查找" },
    { id: "layout", icon: <LayoutGrid size={18} />, label: "布局" },
    { id: "export", icon: <Download size={18} />, label: "导出" }
  ];

  return (
    <div className="graph-toolbar absolute left-4 top-4 z-10 flex flex-col gap-2">
      {/*
        工具图标列：
        1) 左上角固定悬浮；
        2) Tooltip 解释按钮语义，降低新人学习成本；
        3) active 状态高亮，提示当前展开功能。
      */}
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

      {/* 可展开功能面板：根据 activePanel 条件渲染。 */}
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

          {/*
            筛选面板：
            - 关系类型：业务语义是“边级过滤”；
            - 审核状态：业务语义是“只看草稿/已审核/已拒绝”；
            - 重置：回到默认全量可见状态。
          */}
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

          {/*
            搜索面板：
            - 输入阶段只更新本地态，避免高频触发主图重算；
            - Enter/按钮点击才真正提交。
          */}
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

          {/* 路径查询面板：用于触发“人物最短路径”业务流程。 */}
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

          {/* 布局面板：切换图谱排布策略，不改变底层实体关系。 */}
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
                  onClick={() => onLayoutChange(opt.mode)}
                  className={`rounded-md px-2 py-1 text-left text-sm transition-colors ${
                    layoutMode === opt.mode
                      ? "bg-primary text-(--color-primary-fg)"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* 导出面板：对外导出图谱数据/图片，便于复盘与分享。 */}
          {activePanel === "export" && (
            <div className="flex flex-col gap-1">
              {([
                { format: "png" as const, label: "导出 PNG" },
                { format: "svg" as const, label: "导出 SVG" },
                { format: "json" as const, label: "导出 JSON" }
              ]).map(opt => (
                <button
                  key={opt.format}
                  type="button"
                  onClick={() => onExport(opt.format)}
                  className="rounded-md px-2 py-1 text-left text-sm text-foreground transition-colors hover:bg-muted"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
