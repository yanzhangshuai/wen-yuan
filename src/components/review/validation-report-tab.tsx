"use client";

/**
 * =============================================================================
 * 文件定位（角色资料工作台子组件：自检报告 Tab）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/review/validation-report-tab.tsx`
 *
 * 在 Next.js 项目中的定位：
 * - 该文件是角色资料工作台中的 Client Component；
 * - 用于承载“模型自检报告”的浏览、展开详情、应用自动修正等交互。
 *
 * 业务职责：
 * 1) 展示报告列表（范围、状态、问题统计）；
 * 2) 懒加载单份报告详情（issues）；
 * 3) 对可自动修正项触发“应用自动修正”；
 * 4) 操作完成后通知父层刷新，保持列表与详情一致。
 *
 * 上下游关系：
 * - 上游：父层提供 `reports`（报告摘要列表）；
 * - 下游：调用 `fetchValidationReportDetail/applyAutoFixes` 与后端交互；
 * - 回流：通过 `onRefresh` 触发父层重新获取报告摘要。
 *
 * React 渲染语义：
 * - `expandedId` 控制“哪一份报告被展开”；
 * - `detail/detailLoading/applyLoading` 分别控制详情数据、详情加载态、自动修正提交态；
 * - 状态变化驱动局部重渲染，不影响后端真实业务状态。
 *
 * 风险提示（仅注释说明，不改逻辑）：
 * - 当前 `detail` 只有一份，若快速切换展开项，旧请求返回可能覆盖新请求；
 * - 这是典型竞态风险，后续可通过请求序号或 AbortController 优化。
 * =============================================================================
 */

import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
  Wrench,
  FileSearch
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ValidationReportItem, ValidationReportDetail } from "@/lib/services/validation-reports";
import { fetchValidationReportDetail, applyAutoFixes } from "@/lib/services/validation-reports";
import type { ValidationIssue, ValidationSeverity } from "@/types/validation";

/* ------------------------------------------------
   Constants
   ------------------------------------------------ */

const SEVERITY_CONFIG: Record<ValidationSeverity, { icon: typeof AlertCircle; color: string; label: string }> = {
  /** ERROR：阻断级问题，通常需要优先人工处理。 */
  ERROR  : { icon: AlertCircle, color: "text-destructive", label: "错误" },
  /** WARNING：风险提示，建议复核但不一定阻断流程。 */
  WARNING: { icon: AlertTriangle, color: "text-amber-500", label: "警告" },
  /** INFO：信息性提示，用于辅助理解抽取质量。 */
  INFO   : { icon: Info, color: "text-blue-500", label: "信息" }
};

/**
 * 问题类型文案映射：
 * - 将后端枚举转换为录入/校对人员可读中文；
 * - 不改变后端协议，仅做展示层语义翻译。
 */
const ISSUE_TYPE_LABELS: Record<string, string> = {
  ALIAS_AS_NEW_PERSONA      : "别名误识为新人物",
  WRONG_MERGE               : "错误合并",
  MISSING_NAME_MAPPING      : "缺少真名映射",
  INVALID_RELATIONSHIP      : "不合理关系",
  SAME_NAME_DIFFERENT_PERSON: "同名不同人",
  DUPLICATE_PERSONA         : "重复人物",
  LOW_CONFIDENCE_ENTITY     : "低置信度实体",
  ORPHAN_MENTION            : "孤立提及"
};

const ACTION_LABELS: Record<string, string> = {
  MERGE        : "合并人物",
  SPLIT        : "拆分人物",
  UPDATE_NAME  : "更新名称",
  ADD_ALIAS    : "添加别名",
  DELETE       : "删除",
  ADD_MAPPING  : "添加映射",
  MANUAL_REVIEW: "人工校对"
};

/* ------------------------------------------------
   Props
   ------------------------------------------------ */

export interface ValidationReportTabProps {
  /** 当前书籍 ID：作为报告详情查询与自动修正接口的路径参数。 */
  bookId   : string;
  /** 报告摘要列表：由父层读取后传入。 */
  reports  : ValidationReportItem[];
  /** 刷新回调：当子组件触发写操作后通知父层更新摘要。 */
  onRefresh: () => void;
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */

export function ValidationReportTab({ bookId, reports, onRefresh }: ValidationReportTabProps) {
  /** 当前展开的报告 ID。null 表示全部折叠。 */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** 当前展开报告的详情数据。 */
  const [detail, setDetail] = useState<ValidationReportDetail | null>(null);
  /** 报告详情加载中状态。 */
  const [detailLoading, setDetailLoading] = useState(false);
  /** 正在执行“应用自动修正”的报告 ID。 */
  const [applyLoading, setApplyLoading] = useState<string | null>(null);

  /**
   * 展开/折叠某份报告，并在展开时懒加载详情。
   * 设计原因：
   * - 列表页先展示摘要，详情按需请求，减少首屏请求量；
   * - 展开同一项再次点击会折叠，符合手风琴交互预期。
   */
  async function handleToggleExpand(reportId: string) {
    // 分支 1：点击已展开项 -> 收起并清空详情，避免显示过期数据。
    if (expandedId === reportId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }

    // 分支 2：切换到新项 -> 打开并拉取详情。
    setExpandedId(reportId);
    setDetailLoading(true);
    try {
      const d = await fetchValidationReportDetail(bookId, reportId);
      setDetail(d);
    } catch {
      // 查询失败时清空详情，交由下方“加载失败”空态承接。
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  /**
   * 对指定报告应用自动修正。
   * 业务步骤：
   * 1) 标记按钮 loading，防止重复触发；
   * 2) 提交自动修正请求；
   * 3) 重新拉取该报告详情，确保详情区展示最新 issues；
   * 4) 通知父层刷新摘要统计；
   * 5) 清理 loading。
   */
  async function handleApplyFixes(reportId: string) {
    setApplyLoading(reportId);
    try {
      const result = await applyAutoFixes(bookId, reportId);
      // After applying, re-expand to show updated detail + refresh parent
      const d = await fetchValidationReportDetail(bookId, reportId);
      setDetail(d);
      onRefresh();
      // Optionally show success via alert (keeping it simple)
      if (result.appliedCount > 0) {
        // silent success, the UI will update
      }
    } catch {
      // silent
    } finally {
      setApplyLoading(null);
    }
  }

  /**
   * 空态分支：
   * - 当没有任何报告时直接展示空态，不渲染列表容器；
   * - 减少视觉噪音并明确“当前无需校对”。
   */
  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 rounded-full bg-muted p-3">
          <Check size={20} className="text-success" />
        </div>
        <p className="text-sm text-muted-foreground">暂无自检报告</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {reports.map(report => {
        // 当前卡片是否展开：由 expandedId 与 report.id 比较得出。
        const isExpanded = expandedId === report.id;
        // 摘要引用，减少 JSX 内重复访问 report.summary。
        const s = report.summary;
        // 报告作用域转换为中文文案。
        const scopeLabel = report.scope === "CHAPTER" ? "章节级" : "全书级";
        // 报告状态文案转换：用于 Badge 与业务语义提示。
        const statusLabel = report.status === "APPLIED" ? "已应用" : report.status === "REVIEWED" ? "已确认" : "待处理";
        // 报告状态视觉样式：已应用 > 已确认 > 待处理。
        const statusVariant = report.status === "APPLIED" ? "default" as const : report.status === "REVIEWED" ? "secondary" as const : "outline" as const;

        return (
          <div key={report.id} className="rounded-lg border border-border bg-card shadow-sm">
            {/* Report header — clickable to expand */}
            <button
              type="button"
              onClick={() => { void handleToggleExpand(report.id); }}
              className="flex w-full items-center justify-between p-3 text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <FileSearch size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{scopeLabel}自检报告</span>
                  <Badge variant={statusVariant} className="text-[10px]">{statusLabel}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  <span>共 {s.totalIssues} 个问题</span>
                  {s.errorCount > 0 && <span className="text-destructive">🔴 {s.errorCount} 错误</span>}
                  {s.warningCount > 0 && <span className="text-amber-500">⚠️ {s.warningCount} 警告</span>}
                  {s.infoCount > 0 && <span className="text-blue-500">ℹ️ {s.infoCount} 信息</span>}
                  <span>可自动修正 {s.autoFixable} 项</span>
                  <span className="ml-auto text-muted-foreground/70">
                    {new Date(report.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>
              </div>
              {isExpanded
                ? <ChevronUp size={16} className="text-muted-foreground shrink-0" />
                : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-border px-3 pb-3">
                {detailLoading && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 size={18} className="animate-spin text-muted-foreground" />
                  </div>
                )}

                {!detailLoading && detail && (
                  <>
                    {/* Auto-fix button */}
                    {report.status !== "APPLIED" && s.autoFixable > 0 && (
                      <div className="mt-3 mb-2">
                        <Button
                          size="sm"
                          onClick={() => { void handleApplyFixes(report.id); }}
                          disabled={applyLoading === report.id}
                        >
                          {applyLoading === report.id
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Wrench size={14} />}
                          <span className="ml-1">应用自动修正（{s.autoFixable} 项）</span>
                        </Button>
                      </div>
                    )}

                    {/* Issue list */}
                    <div className="mt-2 flex flex-col gap-2">
                      {detail.issues.map(issue => (
                        <IssueCard key={issue.id} issue={issue} />
                      ))}
                    </div>
                  </>
                )}

                {!detailLoading && !detail && (
                  <p className="py-4 text-center text-sm text-muted-foreground">加载报告详情失败</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------
   Issue Card sub-component
   ------------------------------------------------ */

function IssueCard({ issue }: { issue: ValidationIssue }) {
  // 防御性兜底：未知 severity 时默认 INFO 视觉，避免渲染崩溃。
  const sev = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.INFO;
  const SevIcon = sev.icon;
  // 未知问题类型回退展示原始编码，便于排查后端新枚举。
  const typeLabel = ISSUE_TYPE_LABELS[issue.type] ?? issue.type;
  // 同理：未知建议动作回退为原始 action。
  const actionLabel = ACTION_LABELS[issue.suggestion.action] ?? issue.suggestion.action;

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
      <div className="flex items-start gap-2">
        <SevIcon size={14} className={`mt-0.5 shrink-0 ${sev.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">{typeLabel}</Badge>
            <span className="text-[10px] text-muted-foreground">
              置信度 {Math.round(issue.confidence * 100)}%
            </span>
          </div>
          <p className="mt-1 text-xs text-foreground">{issue.description}</p>
          {issue.evidence && (
            <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
              证据：{issue.evidence}
            </p>
          )}
          {/* Suggestion */}
          <div className="mt-1.5 flex items-center gap-1.5 rounded bg-muted/60 px-2 py-1">
            <Wrench size={10} className="text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground">
              建议：<span className="font-medium text-foreground">{actionLabel}</span>
              {issue.suggestion.reason && ` — ${issue.suggestion.reason}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
