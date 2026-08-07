"use client";

/**
 * =============================================================================
 * 文件定位（角色资料工作台子组件：实体合并执行面板）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/review/entity-merge-tool.tsx`
 *
 * 在 Next.js 项目中的角色：
 * - 这是 `RoleWorkbenchPanel`（角色资料工作台主面板）下的子组件，负责“接受合并建议”这条高风险操作链路；
 * - 文件声明 `'use client'`，属于 Client Component。
 *
 * 核心业务职责：
 * 1) 将上游传入的 source/target 实体名并排展示，帮助录入人员做人审比对；
 * 2) 在点击确认后调用 `/api/admin/merge-suggestions/:id/accept`；
 * 3) 告知父组件合并完成（`onDone`）或取消（`onCancel`）。
 *
 * v5 适配说明：
 * - v4 版通过 `fetchPersonaSummary` 拉取双方 Persona 摘要做并排展示，但顶层
 *   `/api/personas` 路由已删除；v5 合并建议本身已携带实体名，故改为直接接收
 *   `sourceName/targetName` 字符串，去掉 Promise + `use()` 渲染。
 * - “关系/时间线合计”等聚合数字在当前数据源下不可得，统一标注“待管线数据”，
 *   避免展示误导性计数；合并规则与最终落库以服务端事务结果为准。
 * =============================================================================
 */

import { useState } from "react";
import { GitMerge, Loader2, ArrowRight, User, X as XIcon } from "lucide-react";

import { readClientApiErrorMessage } from "@/lib/client-api";
import { acceptMergeSuggestion } from "@/lib/services/role-workbench";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface EntityMergeToolProps {
  /** 来源实体名（通常将是“被合并掉”的一方）。 */
  sourceName  : string;
  /** 目标实体名（将是“被保留”的一方）。 */
  targetName  : string;
  /** 合并建议 ID，用于调用接受接口。 */
  suggestionId: string;
  /** 建议合并理由（来自 AI 判断），用于录入/校对人员参考。 */
  reason?     : string;
  /** 建议置信度（0~1）。 */
  confidence? : number;
  /** 合并成功回调：通知父组件刷新数据并退出本面板。 */
  onDone      : () => void;
  /** 取消回调：关闭本面板并返回上一视图。 */
  onCancel    : () => void;
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function EntityMergeTool({
  sourceName,
  targetName,
  suggestionId,
  reason,
  confidence,
  onDone,
  onCancel
}: EntityMergeToolProps) {
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

  return (
    <div className="rounded-lg border-2 border-primary bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <GitMerge size={16} className="text-primary" />
        <span className="font-medium text-foreground">实体合并预览</span>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label="关闭"
        >
          <XIcon size={16} />
        </button>
      </div>

      {/* 并排比对区：让录入/校对人员先看 source/target 差异，再决定是否执行。 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <NameCard name={sourceName} label="来源（将被合并）" variant="source" />
        <NameCard name={targetName} label="目标（保留）" variant="target" />
      </div>

      {/* 合并依据（AI 给出的合并理由与置信度）。 */}
      {reason && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-xs">
          <p className="mb-1 font-medium text-foreground">合并依据</p>
          <p className="text-muted-foreground">{reason}</p>
          {confidence !== undefined && (
            <p className="mt-1 text-muted-foreground">
              置信度：<span className="font-medium text-foreground">{(confidence * 100).toFixed(0)}%</span>
            </p>
          )}
        </div>
      )}

      {/* 合并结果预览（前端提示）：最终落库以服务端事务逻辑为准。 */}
      <div className="mt-3 rounded-md bg-muted p-3">
        <p className="mb-1 text-xs font-medium text-foreground">合并结果预览</p>
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          <li>
            保留名称：<span className="font-medium text-foreground">{targetName}</span>
          </li>
          <li>来源实体并入目标实体，别名取并集（以服务端合并结果为准）。</li>
          <li>关系 / 时间线数据随实体合并自动归并，具体计数待管线数据。</li>
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
   Name card sub-component
   ------------------------------------------------ */
/**
 * 实体名展示卡片（纯展示子组件）。
 * 设计目的：
 * - 把 source/target 的共用渲染结构抽离，减少主组件重复 JSX；
 * - 通过 `variant` 控制视觉语义（source 风险色、target 保留色）。
 */
function NameCard({
  name,
  label,
  variant
}: {
  /** 待展示的实体名。 */
  name   : string;
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
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <User size={14} className="text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        {variant === "source" && (
          // 仅来源侧显示箭头，强调“流向目标实体”的业务语义。
          <ArrowRight size={14} className="ml-auto text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
