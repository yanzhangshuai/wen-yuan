"use client";

/**
 * =============================================================================
 * 文件定位（审核中心子组件：别名映射审核 Tab）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/review/alias-review-tab.tsx`
 *
 * 在 Next.js 项目中的角色：
 * - 该文件是审核中心页面中的一个“客户端交互 Tab”；
 * - 使用 `'use client'`，因此是 Client Component，会在浏览器侧响应用户筛选与点击操作。
 *
 * 所属业务场景：
 * - 模型抽取后会产出“别名 -> 真名”的映射建议；
 * - 审核员在本 Tab 中按状态/类型筛选建议，并对 `PENDING` 项执行“确认/拒绝”。
 *
 * 上下游协作关系：
 * - 上游：父组件传入 `aliasMappings`（通常由服务层 `fetchAliasMappings` 拉取）；
 * - 下游：点击操作会调用 `confirmAliasMapping/rejectAliasMapping`，由接口层写回后端；
 * - 回流：操作成功后触发 `onRefresh`，通知父组件重新拉取最新数据。
 *
 * React 运行语义：
 * - 本组件内部维护筛选与加载状态，状态变化会触发重新渲染；
 * - 这是交互层状态管理，不改变后端业务规则。
 *
 * 维护注意：
 * - 此处“可操作条件 = status === PENDING”是业务规则，不是技术限制；
 * - 组件目前对操作失败采用静默策略（仅不刷新），如需增强 UX 建议在父层补全全局错误提示。
 * =============================================================================
 */

import { useState } from "react";
import { Check, X as XIcon, ArrowRight, Loader2, Tag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectEmptyItem,
  SelectItem,
  SelectTrigger,
  SelectValue,
  isSelectEmptyValue
} from "@/components/ui/select";
import type { AliasMappingItem } from "@/lib/services/alias-mappings";
import {
  confirmAliasMapping,
  rejectAliasMapping
} from "@/lib/services/alias-mappings";

/* ------------------------------------------------
   Constants
   ------------------------------------------------ */

const ALIAS_TYPE_LABELS: Record<string, string> = {
  /** 称号/封号：如“某公”“某王”等身份称呼。 */
  TITLE        : "称号/封号",
  /** 官职职位：用于标识人物在组织中的职务身份。 */
  POSITION     : "职位",
  /** 亲属称呼：如“父亲”“兄长”等关系称呼。 */
  KINSHIP      : "亲属称呼",
  /** 绰号：人物在文本中的俗称或外号。 */
  NICKNAME     : "绰号",
  /** 字号：传统姓名体系中的“字/号”。 */
  COURTESY_NAME: "字/号"
};

/**
 * 审核状态到 UI 展示元信息的映射表。
 * 设计原因：
 * - 状态文案和视觉变体集中定义，避免在渲染过程中散落硬编码；
 * - 当状态文案策略变更时，只需改一处。
 */
const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PENDING  : { label: "待审核", variant: "outline" },
  CONFIRMED: { label: "已确认", variant: "default" },
  REJECTED : { label: "已拒绝", variant: "destructive" }
};

/* ------------------------------------------------
   Props
   ------------------------------------------------ */

export interface AliasReviewTabProps {
  /** 当前书籍 ID：作为所有别名审核接口的路径参数。 */
  bookId       : string;
  /** 待展示的别名映射列表：由父层预先拉取并传入。 */
  aliasMappings: AliasMappingItem[];
  /** 刷新回调：子组件完成操作后通知父层重新取数。 */
  onRefresh    : () => void;
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */

export function AliasReviewTab({ bookId, aliasMappings, onRefresh }: AliasReviewTabProps) {
  /** 状态筛选值：空字符串表示“不过滤状态”。 */
  const [statusFilter, setStatusFilter] = useState<string>("");
  /** 类型筛选值：空字符串表示“不过滤类型”。 */
  const [typeFilter, setTypeFilter] = useState<string>("");
  /** 当前正在提交操作的映射 ID；用于按钮 loading 与防重复点击。 */
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  /**
   * 前端过滤逻辑（纯函数）：
   * - 先按状态过滤，再按类型过滤；
   * - 两个筛选器均为空时返回全量列表。
   *
   * 这样写的业务意图：
   * - 让审核员在本地快速缩小待处理范围，避免频繁回源请求；
   * - 保持筛选行为可预期（AND 关系）。
   */
  const filtered = aliasMappings.filter(m => {
    // 当用户显式选择状态时，仅保留同状态项。
    if (statusFilter && m.status !== statusFilter) return false;
    // 当用户显式选择类型时，仅保留同类型项。
    if (typeFilter && m.aliasType !== typeFilter) return false;
    return true;
  });

  /**
   * 处理单条映射的审核动作（确认 / 拒绝）。
   * 业务步骤：
   * 1) 标记当前行进入 loading，防止重复提交；
   * 2) 根据 action 调用对应接口；
   * 3) 成功后触发父层刷新；
   * 4) 无论成功失败都清理 loading。
   *
   * 异常策略：
   * - 当前版本选择静默失败（不弹 toast）；
   * - 这是产品交互取舍，不是技术限制，后续可统一接入错误提示体系。
   */
  async function handleAction(mappingId: string, action: "confirm" | "reject") {
    setActionLoading(mappingId);
    try {
      if (action === "confirm") await confirmAliasMapping(bookId, mappingId);
      else await rejectAliasMapping(bookId, mappingId);
      onRefresh();
    } catch {
      // silent for now — the parent's error state can be extended
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
          <Tag size={14} className="text-muted-foreground" />
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(isSelectEmptyValue(value) ? "" : value)}
          >
            <SelectTrigger className="h-auto border-0 shadow-none px-0 py-0.5 text-xs bg-transparent gap-1 w-auto min-w-18">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectEmptyItem>全部状态</SelectEmptyItem>
              <SelectItem value="PENDING">待审核</SelectItem>
              <SelectItem value="CONFIRMED">已确认</SelectItem>
              <SelectItem value="REJECTED">已拒绝</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
          <Select
            value={typeFilter}
            onValueChange={(value) => setTypeFilter(isSelectEmptyValue(value) ? "" : value)}
          >
            <SelectTrigger className="h-auto border-0 shadow-none px-0 py-0.5 text-xs bg-transparent gap-1 w-auto min-w-18">
              <SelectValue placeholder="全部类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectEmptyItem>全部类型</SelectEmptyItem>
              {Object.entries(ALIAS_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} 条记录
        </span>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 rounded-full bg-muted p-3">
            <Check size={20} className="text-success" />
          </div>
          <p className="text-sm text-muted-foreground">暂无别名映射记录</p>
        </div>
      )}

      {/* List */}
      {filtered.map(m => {
        // 仅当前行处于 actionLoading 时显示 loading，避免整个列表被阻塞。
        const isLoading = actionLoading === m.id;
        // 防御性兜底：若后端新增状态但前端未配置，退化为原始状态文本。
        const statusInfo = STATUS_LABELS[m.status] ?? { label: m.status, variant: "outline" as const };
        // 同理，未知别名类型时回退显示原始类型编码，避免信息丢失。
        const typeLabel = ALIAS_TYPE_LABELS[m.aliasType] ?? m.aliasType;

        return (
          <div key={m.id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              {/* Main content */}
              <div className="flex-1 min-w-0">
                {/* Alias → RealName */}
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-primary">&ldquo;{m.alias}&rdquo;</span>
                  <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                  <span className={m.resolvedName ? "text-foreground" : "text-muted-foreground italic"}>
                    {m.resolvedName ?? "？待确认"}
                  </span>
                </div>
                {/* Badges */}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">{typeLabel}</Badge>
                  <Badge variant={statusInfo.variant} className="text-[10px]">{statusInfo.label}</Badge>
                  <span className="text-[10px] text-muted-foreground">
                    置信度 {Math.round(m.confidence * 100)}%
                  </span>
                  {(m.chapterStart != null || m.chapterEnd != null) && (
                    <span className="text-[10px] text-muted-foreground">
                      第{m.chapterStart ?? "?"}–{m.chapterEnd ?? "?"}回
                    </span>
                  )}
                </div>
                {/* Evidence */}
                {m.evidence && (
                  <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                    依据：{m.evidence}
                  </p>
                )}
              </div>
              {/* Actions — only for PENDING */}
              {m.status === "PENDING" && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={isLoading}
                    onClick={() => { void handleAction(m.id, "confirm"); }}
                  >
                    {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    <span className="ml-1">确认</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    disabled={isLoading}
                    onClick={() => { void handleAction(m.id, "reject"); }}
                  >
                    <XIcon size={12} />
                    <span className="ml-1">拒绝</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
