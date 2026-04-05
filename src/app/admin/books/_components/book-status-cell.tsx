"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { fetchBookStatus, type BookStatusSnapshot } from "@/lib/services/books";
import { cn } from "@/lib/utils";

/**
 * =============================================================================
 * 文件定位（书籍状态单元格组件）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/admin/books/_components/book-status-cell.tsx`
 * 组件类型：Client Component
 *
 * 业务职责：
 * - 在书籍列表行内展示“状态 + 阶段文案 + 进度条”；
 * - 进入页面后主动拉取最新状态；
 * - 当状态为 PROCESSING 时自动轮询，持续刷新进度。
 *
 * 设计原因：
 * - 状态变化频繁，且只影响单行，不适合让整个列表频繁刷新；
 * - 将轮询粒度下沉到单元格，可减少页面级状态管理复杂度；
 * - 轮询失败采取静默策略，避免短暂网络抖动打断管理操作。
 *
 * 上游输入：
 * - `bookId`：查询目标书籍；
 * - `initialStatus`：由服务端列表首屏提供的状态快照。
 *
 * 下游输出：
 * - 向用户展示当前状态、阶段信息、进度百分比。
 *
 * 维护注意：
 * - `toUiStatus` 是状态白名单收敛点，新增后端状态时需同步更新；
 * - `POLLING_INTERVAL_MS` 属于体验与后端压力折中值，随意缩短会增加接口负担；
 * - 静默失败是当前产品策略，不代表错误不重要，建议后续配套监控埋点。
 * =============================================================================
 */

/**
 * 组件入参。
 */
interface BookStatusCellProps {
  /** 当前行书籍 ID，用于请求状态接口。 */
  bookId       : string;
  /** 首屏状态（来自服务端列表）。 */
  initialStatus: string;
}

/**
 * UI 侧可识别的状态集合。
 *
 * 说明：这是展示层状态，不完全等同于后端内部枚举。
 * 任何未知状态都会被映射为 `PENDING`，保证 UI 不崩溃。
 */
type UiBookStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "ERROR";

/**
 * 状态展示配置。
 * `label` 是用户可读文案，`badgeVariant` 控制视觉语义（颜色）。
 */
const STATUS_META_MAP: Record<UiBookStatus, { label: string; badgeVariant: "secondary" | "warning" | "success" | "destructive" }> = {
  PENDING: {
    label       : "待处理",
    badgeVariant: "secondary"
  },
  PROCESSING: {
    label       : "解析中",
    badgeVariant: "warning"
  },
  COMPLETED: {
    label       : "已完成",
    badgeVariant: "success"
  },
  ERROR: {
    label       : "失败",
    badgeVariant: "destructive"
  }
};

/**
 * 轮询间隔：3 秒。
 * 业务取舍：
 * - 更短会增加后端压力；
 * - 更长会降低管理端“状态感知实时性”。
 */
const POLLING_INTERVAL_MS = 3_000;

/**
 * 把后端原始状态收敛为 UI 白名单状态。
 *
 * @param status 后端返回状态字符串
 * @returns UI 状态；未知值回退 `PENDING`
 */
function toUiStatus(status: string): UiBookStatus {
  if (status === "PROCESSING" || status === "COMPLETED" || status === "ERROR") {
    return status;
  }
  // 防御性默认值：防止后端新增状态导致前端展示异常。
  return "PENDING";
}

/**
 * 进度值归一化。
 *
 * 设计目的：
 * - 防御后端异常值（NaN/Infinity/负数/>100）；
 * - 保证进度条宽度始终在 0~100 区间。
 */
function clampProgress(progress: number, status: UiBookStatus): number {
  if (!Number.isFinite(progress)) {
    // 若后端未返回有效进度，完成态默认 100，其它状态默认 0。
    return status === "COMPLETED" ? 100 : 0;
  }

  const rounded = Math.round(progress);
  if (rounded < 0) return 0;
  if (rounded > 100) return 100;
  return rounded;
}

/**
 * 在无 snapshot 时，按状态给默认进度。
 *
 * @param status 当前 UI 状态
 * @returns 默认进度百分比
 */
function getDefaultProgress(status: UiBookStatus): number {
  if (status === "COMPLETED") return 100;
  return 0;
}

/**
 * 生成状态下方的阶段文本。
 *
 * 优先级说明：
 * 1) 若接口返回 `stage`，优先展示（信息最具体）；
 * 2) 错误态且有 `errorLog` 时展示错误摘要；
 * 3) 否则按状态给默认文案。
 */
function getStageText(status: UiBookStatus, snapshot: BookStatusSnapshot | null): string {
  if (snapshot?.stage) {
    return snapshot.stage;
  }

  if (status === "ERROR" && snapshot?.errorLog) {
    return snapshot.errorLog;
  }

  if (status === "PROCESSING") {
    return "解析中";
  }

  if (status === "COMPLETED") {
    return "完成";
  }

  if (status === "ERROR") {
    return "解析失败";
  }

  return "待解析";
}

/**
 * 书籍状态单元格。
 */
export function BookStatusCell({ bookId, initialStatus }: BookStatusCellProps) {
  /**
   * 最新状态快照。
   * `null` 表示尚未拿到最新接口结果，此时回退到 `initialStatus` 渲染。
   */
  const [snapshot, setSnapshot] = useState<BookStatusSnapshot | null>(null);

  /**
   * 是否正在请求中。
   * 仅用于展示“轻量旋转图标”，不阻塞界面交互。
   */
  const [isFetching, setIsFetching] = useState(false);

  // 当前展示状态：优先接口快照，否则使用服务端首屏状态。
  const uiStatus = useMemo(() => toUiStatus(snapshot?.status ?? initialStatus), [initialStatus, snapshot?.status]);

  // 当前展示进度：优先接口进度，缺失时按状态给默认值，并做安全归一化。
  const progress = useMemo(
    () => clampProgress(snapshot?.progress ?? getDefaultProgress(uiStatus), uiStatus),
    [snapshot?.progress, uiStatus]
  );

  // 当前展示阶段文本。
  const stageText = useMemo(() => getStageText(uiStatus, snapshot), [snapshot, uiStatus]);

  /**
   * 拉取最新状态。
   *
   * 注意：
   * - 采用静默 catch，避免接口偶发失败导致列表噪音提示；
   * - finally 一定恢复 `isFetching`，防止 loading 图标卡住。
   */
  const refreshStatus = useCallback(async () => {
    try {
      setIsFetching(true);
      const latest = await fetchBookStatus(bookId);
      setSnapshot(latest);
    } catch {
      // 保持静默失败：不打断页面操作，下一次轮询继续尝试。
    } finally {
      setIsFetching(false);
    }
  }, [bookId]);

  /**
   * 首次挂载时主动刷新一次。
   * 目的：避免依赖服务端首屏快照过久，尽快对齐实时状态。
   */
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  /**
   * 仅在 PROCESSING 态开启轮询。
   *
   * 分支原因：
   * - 非 processing 状态（待处理/完成/失败）通常不需要高频刷新；
   * - 降低无意义请求，减少后端压力。
   */
  useEffect(() => {
    if (uiStatus !== "PROCESSING") {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshStatus();
    }, POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshStatus, uiStatus]);

  return (
    <div className="book-status-cell flex min-w-44 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Badge variant={STATUS_META_MAP[uiStatus].badgeVariant}>
          {STATUS_META_MAP[uiStatus].label}
        </Badge>
        {/*
          仅在“解析中 + 正在请求”时显示旋转图标：
          让用户感知后台仍在推进，减少“卡住”误判。
        */}
        {uiStatus === "PROCESSING" && isFetching && (
          <Loader2 size={14} className="text-muted-foreground animate-spin" />
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="max-w-32 truncate">{stageText}</span>
        <span>{progress}%</span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full transition-[width] duration-300",
            uiStatus === "ERROR"
              ? "bg-destructive"
              : uiStatus === "COMPLETED"
                ? "bg-success"
                : "bg-(--color-warning)"
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
