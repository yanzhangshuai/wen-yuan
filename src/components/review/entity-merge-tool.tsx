"use client";

/**
 * =============================================================================
 * 文件定位（审核中心子组件：人物合并执行面板）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/review/entity-merge-tool.tsx`
 *
 * 在 Next.js 项目中的角色：
 * - 这是 `ReviewPanel`（审核主面板）下的子组件，负责“接受合并建议”这条高风险操作链路；
 * - 文件声明 `'use client'`，属于 Client Component。
 *
 * 为什么必须是 Client Component：
 * - 需要响应用户点击“确认合并/取消”；
 * - 需要本地交互状态（`merging/error`）即时驱动按钮禁用与错误提示；
 * - 这些交互依赖浏览器事件循环，不能仅靠 Server Component 完成。
 *
 * 核心业务职责：
 * 1) 将上游传入的 source/target 人物摘要并排展示，帮助审核员做人审比对；
 * 2) 在点击确认后调用 `/api/admin/merge-suggestions/:id/accept`；
 * 3) 告知父组件合并完成（`onDone`）或取消（`onCancel`）。
 *
 * 上游输入：
 * - `sourcePromise/targetPromise`：由父组件发起的人物摘要请求 Promise；
 * - `suggestionId`：本次处理的合并建议主键；
 * - `onDone/onCancel`：父组件提供的流程回调。
 *
 * 下游输出：
 * - UI 上显示合并预览与执行结果；
 * - 调用成功后触发父组件刷新“建议列表 + 草稿列表”。
 *
 * 维护注意：
 * - 本组件不直接做实体合并规则判断，规则全部在服务端模块保证；
 * - 本组件展示的“合并结果预览”是前端提示，不是最终落库真值（真值以服务端事务结果为准）。
 * =============================================================================
 */

import { use, useState } from "react";
import {
  GitMerge,
  Loader2,
  ArrowRight,
  X as XIcon,
  AlertTriangle,
  User
} from "lucide-react";

import { readClientApiErrorMessage } from "@/lib/client-api";
import { acceptMergeSuggestion } from "@/lib/services/reviews";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import type { PersonaSummary } from "@/lib/services/personas";

/* ------------------------------------------------
   Re-export types from api layer
   ------------------------------------------------ */
/**
 * 透出人物摘要类型和拉取函数给父层复用。
 * 设计原因：
 * - `EntityMergeTool` 与父组件都围绕“人物摘要”协作，集中从同一服务层导出可减少重复 import；
 * - 不改变业务行为，仅优化调用方使用一致性。
 */
export type { PersonaSummary } from "@/lib/services/personas";
export { fetchPersonaSummary } from "@/lib/services/personas";

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface EntityMergeToolProps {
  /** 来源人物摘要 Promise（通常是“将被合并掉”的一方）。 */
  sourcePromise: Promise<PersonaSummary | null>;
  /** 目标人物摘要 Promise（通常是“将被保留”的一方）。 */
  targetPromise: Promise<PersonaSummary | null>;
  /** 合并建议 ID，用于调用接受接口。 */
  suggestionId : string;
  /** 合并成功回调：通知父组件刷新数据并退出本面板。 */
  onDone       : () => void;
  /** 取消回调：关闭本面板并返回上一视图。 */
  onCancel     : () => void;
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function EntityMergeTool({
  sourcePromise,
  targetPromise,
  suggestionId,
  onDone,
  onCancel
}: EntityMergeToolProps) {
  /**
   * 使用 React `use()` 直接消费 Promise：
   * - 这里把 source/target 合并为 `Promise.all`，保证两个摘要同时可用后再进入主渲染；
   * - 若父层用 Suspense 包裹，会由上层控制等待态。
   *
   * 这是 React 渲染机制选择，不是业务规则。
   */
  const [source, target] = use(Promise.all([sourcePromise, targetPromise]));

  /** 是否正在提交“确认合并”。用于禁用按钮、防止重复提交。 */
  const [merging, setMerging] = useState(false);
  /** 合并失败提示文案；为 null 表示当前无错误。 */
  const [error, setError] = useState<string | null>(null);

  /**
   * 处理“确认合并”点击。
   * 业务步骤：
   * 1) 进入提交态并清空旧错误；
   * 2) 调用接受接口，触发服务端真实合并事务；
   * 3) 成功后回调父组件；
   * 4) 失败时展示可读错误；
   * 5) 最终退出提交态。
   */
  async function handleMerge() {
    setMerging(true);
    setError(null);
    try {
      await acceptMergeSuggestion(suggestionId);
      onDone();
    } catch (err) {
      // 优先展示服务端回传的业务错误（如状态冲突），兜底显示通用文案。
      setError(err instanceof Error ? err.message : readClientApiErrorMessage(null, "合并失败"));
    } finally {
      setMerging(false);
    }
  }

  /**
   * 防御分支：任一人物摘要为空时，不允许进入合并执行。
   * 场景示例：人物被并发删除、权限变化、请求异常。
   */
  if (!source || !target) {
    return (
      <div className="rounded-lg border border-destructive bg-card p-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle size={16} />
          <span className="text-sm">无法加载人物数据，请稍后重试。</span>
        </div>
        <Button size="sm" variant="ghost" className="mt-2" onClick={onCancel}>
          关闭
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-primary bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <GitMerge size={16} className="text-primary" />
        <span className="font-medium text-foreground">人物合并预览</span>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label="关闭"
        >
          <XIcon size={16} />
        </button>
      </div>

      {/* 并排比对区：让审核员先看 source/target 差异，再决定是否执行。 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <PersonaCard persona={source} label="来源（将被合并）" variant="source" />
        <PersonaCard persona={target} label="目标（保留）" variant="target" />
      </div>

      {/*
        合并结果预览（前端估算）：
        - 主要用于降低操作不确定性；
        - 最终落库以服务端事务逻辑为准。
      */}
      <div className="mt-3 rounded-md bg-muted p-3">
        <p className="mb-1 text-xs font-medium text-foreground">合并结果预览</p>
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          <li>
            保留名称：<span className="font-medium text-foreground">{target.name}</span>
          </li>
          <li>
            合并别名：{[...new Set([...target.aliases, source.name, ...source.aliases])].join("、") || "无"}
          </li>
          <li>
            关系合计：{source.relationshipCount + target.relationshipCount} 条
          </li>
          <li>
            时间线合计：{source.timelineCount + target.timelineCount} 条
          </li>
        </ul>
      </div>

      {/* 错误提示只在当前操作失败时显示，不占用常态布局。 */}
      {error && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={merging}>
          取消
        </Button>
        <Button size="sm" onClick={() => { void handleMerge(); }} disabled={merging}>
          {merging ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <GitMerge size={14} />
          )}
          <span className="ml-1">确认合并</span>
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------
   Persona card sub-component
   ------------------------------------------------ */
/**
 * 人物摘要展示卡片（纯展示子组件）。
 *
 * 设计目的：
 * - 把 source/target 的共用渲染结构抽离，减少主组件重复 JSX；
 * - 通过 `variant` 控制视觉语义（source 风险色、target 保留色）。
 */
function PersonaCard({
  persona,
  label,
  variant
}: {
  /** 待展示的人物摘要数据。 */
  persona: PersonaSummary;
  /** 卡片副标题（来源/目标语义）。 */
  label  : string;
  /** 展示模式：source 表示将被合并，target 表示保留。 */
  variant: "source" | "target";
}) {
  const borderColor =
    variant === "source"
      ? "border-destructive/30"
      : "border-success/30";

  return (
    <div className={`rounded-md border ${borderColor} p-3`}>
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
          <User size={14} className="text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{persona.name}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        {variant === "source" && (
          // 仅来源侧显示箭头，强调“流向目标人物”的业务语义。
          <ArrowRight size={14} className="ml-auto text-muted-foreground" />
        )}
      </div>

      <div className="space-y-1 text-xs">
        {persona.aliases.length > 0 && (
          <p className="text-muted-foreground">
            别名：{persona.aliases.join("、")}
          </p>
        )}
        {persona.gender && (
          <p className="text-muted-foreground">性别：{persona.gender}</p>
        )}
        {persona.hometown && (
          <p className="text-muted-foreground">籍贯：{persona.hometown}</p>
        )}
        <div className="flex flex-wrap gap-1 pt-1">
          {persona.globalTags.map(tag => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
        <p className="text-muted-foreground">
          关系 {persona.relationshipCount} 条 · 时间线 {persona.timelineCount} 条
        </p>
      </div>
    </div>
  );
}
