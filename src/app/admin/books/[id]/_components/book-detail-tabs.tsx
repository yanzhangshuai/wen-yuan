"use client";

/**
 * ============================================================================
 * 文件定位：`src/app/admin/books/[id]/_components/book-detail-tabs.tsx`
 * ----------------------------------------------------------------------------
 * 这是书籍详情页的 Tab 容器组件，负责在客户端切换四个业务面板：
 * - 解析进度
 * - 解析任务
 * - 人物
 * - 模型策略
 *
 * Next.js / React 语义：
 * - `"use client"` 必须保留：Tab 切换依赖 `useState` 与点击事件；
 * - 该组件本身不直接拉取所有数据，而是按 Tab 拆分给子面板，实现“按需加载 + 职责隔离”。
 *
 * 业务价值：
 * - 将详情页复杂信息分区，降低单屏认知负担；
 * - 统一 Tabs 导航样式，确保导入页第 4 步与详情页主视图一致。
 * ============================================================================
 */

import { useState } from "react";

import { cn } from "@/lib/utils";

import { AnalysisJobsPanel } from "./analysis-jobs-panel";
import { BookStrategyPanel } from "./book-strategy-panel";
import { ParseProgressPanel } from "./parse-progress-panel";
import { PersonasPanel } from "./personas-panel";

/**
 * 组件入参。
 */
interface BookDetailTabsProps {
  /** 书籍 ID，用于各子面板请求自身数据。 */
  bookId       : string;
  /** 详情页服务端首屏状态，用作进度面板初始值，减少首屏闪烁。 */
  initialStatus: string;
}

/**
 * Tab 标识。
 * 这是前端 UI 枚举，不直接等同后端字段。
 */
type Tab = "overview" | "jobs" | "personas" | "strategy";

/**
 * Tab 配置列表。
 * 统一维护可见标签与顺序，避免在 JSX 中写死多个按钮导致维护分散。
 */
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "解析进度" },
  { id: "jobs",     label: "解析任务" },
  { id: "personas", label: "人物"     },
  { id: "strategy", label: "模型策略" }
];

/**
 * 书籍详情 Tabs 容器组件（容器型客户端组件）。
 *
 * @param bookId 上游页面传入的书籍主键
 * @param initialStatus 服务端首屏状态快照
 */
export function BookDetailTabs({ bookId, initialStatus }: BookDetailTabsProps) {
  /** 当前激活的 tab，默认展示“解析进度”，符合管理员排障优先级。 */
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div className="space-y-4">
      {/*
        Tab 导航条：
        - `activeTab` 驱动样式切换；
        - 使用按钮而非链接，因为这里是同页状态切换而非路由跳转。
      */}
      <div className="flex border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/*
        Tab 内容区：
        - 条件渲染保证只挂载当前面板；
        - 减少无关面板副作用（轮询、请求）并降低客户端开销。
      */}
      {activeTab === "overview" && (
        <ParseProgressPanel
          bookId={bookId}
          initialStatus={initialStatus}
        />
      )}

      {activeTab === "jobs" && (
        <AnalysisJobsPanel bookId={bookId} />
      )}

      {activeTab === "personas" && (
        <PersonasPanel bookId={bookId} />
      )}

      {activeTab === "strategy" && (
        <BookStrategyPanel bookId={bookId} />
      )}
    </div>
  );
}
