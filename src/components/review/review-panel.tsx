"use client";

/**
 * =============================================================================
 * 文件定位（审核中心主面板 Client Component）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/review/review-panel.tsx`
 *
 * 在 Next.js 应用中的角色：
 * - 该组件由 `app/admin/review/[bookId]/page.tsx`（Server Component）渲染并注入首屏数据；
 * - 本组件声明 `'use client'`，属于 Client Component，负责审核台所有高频交互：
 *   Tab 切换、来源筛选、合并建议处理，以及全局审核视图的刷新。
 *
 * 为什么必须是 Client Component：
 * - 依赖大量浏览器事件与本地状态（useState/useEffect）；
 * - 需要在用户点击后即时更新 UI（例如选中态、加载态、错误提示）；
 * - 这些行为无法在纯 Server Component 中完成。
 *
 * 业务职责：
 * 1) 承载审核工作台主视图（角色审核/章节事迹/合并/别名/自检五个页签）；
 * 2) 通过 `src/lib/services/reviews.ts` 调用管理端 API 完成读写；
 * 3) 在“首屏服务端预取 + 客户端增量刷新”之间做状态衔接。
 *
 * 输入（上游）：
 * - `bookId/bookTitle`：来自动态路由参数与服务端查库结果；
 * - `initialDrafts/initialMergeSuggestions`：服务端首屏预取数据；
 * - `initialAliasMappings/initialValidationReports`：可选预注入，未提供时客户端懒加载。
 *
 * 输出（下游）：
 * - 渲染审核 UI；
 * - 触发 `/api/admin/*` 写操作后刷新列表；
 * - 将部分子流程委托给子组件（编辑表单、合并工具、别名审核、自检报告）。
 *
 * 维护注意：
 * - 这里的状态字段彼此存在联动（例如切换书籍必须重置活跃页签与筛选）；
 * - 角色级审核逻辑应继续收敛在 `RoleReviewWorkbench` 及其子组件中；
 * - 懒加载数据的静默 catch 是现有行为，若要改为显式提示需整体评估 UX。
 * =============================================================================
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Check,
  Filter,
  Users,
  GitMerge,
  Tags,
  ShieldCheck,
  BookOpen
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectEmptyItem,
  SelectItem,
  SelectTrigger,
  SelectValue,
  isSelectEmptyValue
} from "@/components/ui/select";
import { EntityMergeTool } from "@/components/review/entity-merge-tool";
import { ManualEntityTool } from "@/components/review/manual-entity-tool";
import { AliasReviewTab } from "@/components/review/alias-review-tab";
import { ValidationReportTab } from "@/components/review/validation-report-tab";
import { ChapterEventsWorkbench } from "@/components/review/chapter-events-workbench";
import { RoleReviewWorkbench } from "@/components/review/role-review-workbench";
import type { PersonaSummary } from "@/lib/services/personas";
import { fetchPersonaSummary } from "@/lib/services/personas";
import {
  fetchDrafts as apiFetchDrafts,
  fetchMergeSuggestions as apiFetchMergeSuggestions,
  acceptMergeSuggestion,
  rejectMergeSuggestion,
  deferMergeSuggestion,
  type MergeSuggestionItem,
  type DraftsData
} from "@/lib/services/reviews";
import {
  fetchAliasMappings as apiFetchAliasMappings,
  type AliasMappingItem
} from "@/lib/services/alias-mappings";
import {
  fetchValidationReports as apiFetchValidationReports,
  type ValidationReportItem
} from "@/lib/services/validation-reports";

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface ReviewPanelProps {
  /** 当前审核上下文的书籍 ID（路由主键），所有请求都依赖它限定范围。 */
  bookId                   : string;
  /** 当前书籍标题，仅用于界面展示，不参与请求。 */
  bookTitle                : string;
  /** 服务端首屏预取的草稿数据，避免客户端首次渲染二次请求。 */
  initialDrafts            : DraftsData;
  /** 服务端首屏预取的合并建议列表。 */
  initialMergeSuggestions  : MergeSuggestionItem[];
  /** 可选：服务端预取的别名映射；为空表示交由客户端懒加载。 */
  initialAliasMappings?    : AliasMappingItem[];
  /** 可选：服务端预取的自检报告；为空表示交由客户端懒加载。 */
  initialValidationReports?: ValidationReportItem[];
}

/* ------------------------------------------------
   Tab types
   ------------------------------------------------ */
type ReviewTab = "roleReview" | "chapterEvents" | "merge" | "aliases" | "validation";

/**
 * Tab 展示配置。
 * 说明：
 * - `id` 是业务语义键，用于切换渲染分支；
 * - `label` 是用户可见文案；
 * - `icon` 是视觉辅助，帮助审核员快速定位功能区。
 */
const TAB_CONFIG: { id: ReviewTab; label: string; icon: ReactNode }[] = [
  { id: "roleReview", label: "角色审核", icon: <Users size={14} /> },
  { id: "chapterEvents", label: "章节事迹", icon: <BookOpen size={14} /> },
  { id: "merge", label: "合并建议", icon: <GitMerge size={14} /> },
  { id: "aliases", label: "别名映射", icon: <Tags size={14} /> },
  { id: "validation", label: "自检报告", icon: <ShieldCheck size={14} /> }
];

function getTabBadgeCount(args: {
  tabId            : ReviewTab;
  drafts           : DraftsData | null;
  mergeCount       : number;
  pendingAliasCount: number;
  validationCount  : number;
}): number | null {
  switch (args.tabId) {
    case "roleReview":
      return args.drafts?.summary.total ?? 0;
    case "merge":
      return args.mergeCount;
    case "aliases":
      return args.pendingAliasCount;
    case "validation":
      return args.validationCount;
    case "chapterEvents":
      return null;
  }
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function ReviewPanel({
  bookId,
  bookTitle,
  initialDrafts,
  initialMergeSuggestions,
  initialAliasMappings,
  initialValidationReports
}: ReviewPanelProps) {
  // 当前激活页签。默认进入角色为中心的审核工作台。
  const [activeTab, setActiveTab] = useState<ReviewTab>("roleReview");
  // 来源筛选（AI / MANUAL / 全部）。null 表示“不筛选来源”。
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  // 草稿主数据集。初始化采用服务端预取值，保证首屏直出。
  const [drafts, setDrafts] = useState<DraftsData | null>(initialDrafts);
  // 合并建议列表。与草稿分离存储，避免一次刷新影响全部面板。
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestionItem[]>(initialMergeSuggestions);
  // 别名映射列表。可由服务端预注入，也可客户端懒加载补齐。
  const [aliasMappings, setAliasMappings] = useState<AliasMappingItem[]>(initialAliasMappings ?? []);
  // 自检报告列表。结构较独立，单独刷新不会影响草稿主列表。
  const [validationReports, setValidationReports] = useState<ValidationReportItem[]>(initialValidationReports ?? []);
  // 草稿刷新中的加载态（影响骨架屏显示）。
  const [loading, setLoading] = useState(false);
  // 通用加载错误提示文案，展示在面板顶部。
  const [loadError, setLoadError] = useState<string | null>(null);
  // 合并预览上下文：点击“接受合并”后，切换到合并工具并传入 source/target 详情 Promise。
  const [mergePreview, setMergePreview] = useState<{
    suggestionId : string;
    sourcePromise: Promise<PersonaSummary | null>;
    targetPromise: Promise<PersonaSummary | null>;
  } | null>(null);
  useEffect(() => {
    /* 模块切换时重置本地状态，避免旧书籍的筛选/选中态遗留到新 bookId。 */
    // 这里依赖 `bookId + initial*`，是因为从左侧切书时不仅路由变，首屏注入数据也会整体替换。
    setDrafts(initialDrafts);
    setMergeSuggestions(initialMergeSuggestions);
    setAliasMappings(initialAliasMappings ?? []);
    setValidationReports(initialValidationReports ?? []);
    setActiveTab("roleReview");
    setSourceFilter(null);
    setLoading(false);
    setLoadError(null);
    setMergePreview(null);
  }, [bookId, initialDrafts, initialMergeSuggestions, initialAliasMappings, initialValidationReports]);

  /* 未通过 SSR 预载别名/自检数据时，客户端首次挂载懒加载。 */
  useEffect(() => {
    // 分支 1：页面未提供 alias 初始值时，客户端兜底请求，保证页签可用。
    if (!initialAliasMappings) {
      void apiFetchAliasMappings(bookId).then(setAliasMappings).catch(() => { /* silent */ });
    }
    // 分支 2：页面未提供 validation 初始值时，同样做懒加载。
    if (!initialValidationReports) {
      void apiFetchValidationReports(bookId).then(setValidationReports).catch(() => { /* silent */ });
    }
  // 设计说明：
  // - 故意只监听 bookId，避免每次 state 更新都重新触发懒加载；
  // - 该策略牺牲了部分 hooks 依赖“完备性”，换取“只在切书时拉取一次”的业务语义。
  // 风险提示：silent catch 会降低错误可观测性，后续可考虑接入埋点或轻量 toast。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  /**
   * 刷新草稿主列表（人物/关系/传记）。
   * @param nextSourceFilter 新的来源筛选值；传 null 表示全部来源。
   */
  const fetchDrafts = useCallback(async (nextSourceFilter: string | null) => {
    setLoading(true);
    // 每次新请求前清空旧错误，避免“错误文案残留”误导用户。
    setLoadError(null);
    try {
      const data = await apiFetchDrafts(bookId, nextSourceFilter);
      setDrafts(data);
    } catch {
      // 统一错误提示，隐藏底层异常细节，避免泄露实现信息。
      setLoadError("刷新审核列表失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  /** 刷新合并建议列表。 */
  const fetchMerge = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiFetchMergeSuggestions(bookId);
      setMergeSuggestions(data);
    } catch {
      setLoadError("刷新合并建议失败，请稍后重试。");
    }
  }, [bookId]);

  /** 刷新别名映射页签数据。 */
  const fetchAliases = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiFetchAliasMappings(bookId);
      setAliasMappings(data);
    } catch {
      setLoadError("刷新别名映射失败，请稍后重试。");
    }
  }, [bookId]);

  /** 刷新自检报告页签数据。 */
  const fetchValidation = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiFetchValidationReports(bookId);
      setValidationReports(data);
    } catch {
      setLoadError("刷新自检报告失败，请稍后重试。");
    }
  }, [bookId]);

  /**
   * 处理合并建议的轻量动作（拒绝/暂缓，或在其它入口触发接受）。
   * @param id 合并建议 ID
   * @param action 动作类型：accept / reject / defer
   */
  async function handleMergeAction(id: string, action: "accept" | "reject" | "defer") {
    try {
      // 分支语义：
      // - accept：直接接受建议（当前主流程更多通过 EntityMergeTool 执行精细合并）；
      // - reject：明确不合并；
      // - defer：暂缓，留待后续复审。
      if (action === "accept") await acceptMergeSuggestion(id);
      else if (action === "reject") await rejectMergeSuggestion(id);
      else await deferMergeSuggestion(id);
      // 动作完成后刷新建议列表，确保状态徽标与可操作按钮立即同步。
      void fetchMerge();
    } catch {
      setLoadError("处理合并建议失败，请重试。");
    }
  }

  return (
    <div className="review-panel flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      {/* 头部区域：展示当前书名与汇总统计，帮助审核员快速判断待审规模。 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{bookTitle}</h2>
          {drafts && (
            <p className="text-sm text-muted-foreground">
              共 {drafts.summary.total} 条待审核
              （人物 {drafts.summary.persona} · 关系 {drafts.summary.relationship} · 传记 {drafts.summary.biography}）
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 来源筛选：
              - 全部来源：不过滤；
              - AI / 手动：只看指定来源。
              变更筛选后立即刷新草稿列表，保持“所见即所得”审核体验。 */}
          <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
            <Filter size={14} className="text-muted-foreground" />
            <Select
              value={sourceFilter ?? ""}
              onValueChange={(value) => {
                const nextFilter = isSelectEmptyValue(value) ? null : value || null;
                setSourceFilter(nextFilter);
                void fetchDrafts(nextFilter);
              }}
            >
              <SelectTrigger className="h-auto border-0 shadow-none px-0 py-0.5 text-xs bg-transparent gap-1 w-auto min-w-18">
                <SelectValue placeholder="全部来源" />
              </SelectTrigger>
              <SelectContent>
                <SelectEmptyItem>全部来源</SelectEmptyItem>
                <SelectItem value="AI">AI 生成</SelectItem>
                <SelectItem value="MANUAL">手动录入</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tab 导航：
          - activeTab 决定下方渲染哪个业务区。 */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted p-1">
        {TAB_CONFIG.map(tab => {
          const badgeCount = getTabBadgeCount({
            tabId            : tab.id,
            drafts,
            mergeCount       : mergeSuggestions.length,
            pendingAliasCount: aliasMappings.filter(m => m.status === "PENDING").length,
            validationCount  : validationReports.reduce((sum, r) => sum + r.summary.needsReview, 0)
          });
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setActiveTab(tab.id); }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                activeTab === tab.id
                  ? "bg-card font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
              {badgeCount !== null && (
                <span className="ml-1 rounded-full bg-primary-subtle px-1.5 py-0.5 text-xs">
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 刷新中骨架屏：只覆盖主列表区，保留顶部筛选和 tab，避免用户失去上下文。 */}
      {loading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* 非加载态下展示错误提示，避免骨架屏与错误文案叠加造成信息冲突。 */}
      {!loading && loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {!loading && activeTab === "roleReview" && drafts && (
        <div className="min-h-0 flex-1 overflow-hidden">
          <RoleReviewWorkbench
            bookId={bookId}
            drafts={drafts}
            aliasMappings={aliasMappings}
            onRefreshDrafts={() => { void fetchDrafts(sourceFilter); }}
            onRefreshAliases={() => { void fetchAliases(); }}
          />
        </div>
      )}

      {!loading && activeTab === "chapterEvents" && (
        <div className="min-h-0 flex-1 overflow-hidden">
          <ChapterEventsWorkbench
            bookId={bookId}
            onOpenRoles={() => {
              setActiveTab("roleReview");
            }}
          />
        </div>
      )}

      {/* 合并建议页签：
          这里处理“疑似同人”建议，支持拒绝/暂缓，或进入精细化合并工具。 */}
      {!loading && activeTab === "merge" && (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-2">
            <ManualEntityTool
              bookId={bookId}
              onDone={() => {
                setMergePreview(null);
                void fetchMerge();
                void fetchDrafts(sourceFilter);
              }}
            />

            {mergeSuggestions.length === 0 && (
              <EmptyState text="暂无合并建议" />
            )}
            {mergeSuggestions.map(sug => (
              // 分支 A：当前建议处于“预览合并”态，渲染 EntityMergeTool。
              mergePreview?.suggestionId === sug.id ? (
                <EntityMergeTool
                  key={sug.id}
                  sourcePromise={mergePreview.sourcePromise}
                  targetPromise={mergePreview.targetPromise}
                  suggestionId={sug.id}
                  reason={sug.reason}
                  confidence={sug.confidence}
                  onDone={() => {
                    // 合并完成后同时刷新建议与草稿列表：
                    // - 建议状态会从 PENDING 变更；
                    // - 草稿列表可能因实体合并产生联动变化。
                    setMergePreview(null);
                    void fetchMerge();
                    void fetchDrafts(sourceFilter);
                  }}
                  onCancel={() => setMergePreview(null)}
                />
              ) : (
                <div
                  key={sug.id}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{sug.sourceName}</span>
                        <GitMerge size={14} className="text-muted-foreground" />
                        <span className="font-medium text-foreground">{sug.targetName}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{sug.reason}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>置信度 {(sug.confidence * 100).toFixed(0)}%</span>
                        <Badge variant="outline" className="text-xs">
                          {/* 状态文案映射：让审核员一眼识别当前处理进度。 */}
                          {sug.status === "PENDING" ? "待处理" : sug.status === "ACCEPTED" ? "已接受" : sug.status === "REJECTED" ? "已拒绝" : "已暂缓"}
                        </Badge>
                      </div>
                    </div>
                    {sug.status === "PENDING" && (
                      // 仅“待处理”状态允许操作，已处理建议只读展示，防止流程逆转。
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          onClick={() => {
                            // 点击“接受合并”先拉取双方人物摘要，交给合并工具做人审确认。
                            setMergePreview({
                              suggestionId : sug.id,
                              sourcePromise: fetchPersonaSummary(sug.sourcePersonaId),
                              targetPromise: fetchPersonaSummary(sug.targetPersonaId)
                            });
                          }}
                        >
                          接受合并
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { void handleMergeAction(sug.id, "reject"); }}
                        >
                          拒绝
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { void handleMergeAction(sug.id, "defer"); }}
                        >
                          稍后
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {/* 别名映射页签：交由专门子组件处理，父组件仅提供 bookId、数据与刷新入口。 */}
      {!loading && activeTab === "aliases" && (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <AliasReviewTab
            bookId={bookId}
            aliasMappings={aliasMappings}
            onRefresh={() => { void fetchAliases(); }}
          />
        </div>
      )}

      {/* 自检报告页签：展示 AI 自检结果，供人工补充复核。 */}
      {!loading && activeTab === "validation" && (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <ValidationReportTab
            bookId={bookId}
            reports={validationReports}
            onRefresh={() => { void fetchValidation(); }}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------
   Empty state
   ------------------------------------------------ */
/**
 * 通用空态组件。
 * @param text 业务空态文案（按页签场景传入）。
 */
function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 rounded-full bg-muted p-3">
        <Check size={20} className="text-success" />
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
