"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { deleteBookById, restartAnalysis } from "@/lib/services/books";

/**
 * =============================================================================
 * 文件定位（书籍行级操作组件）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/admin/books/_components/book-row-actions.tsx`
 * 组件类型：Client Component
 *
 * 业务职责：
 * - 提供书籍列表中每一行的“重新解析”“删除”操作；
 * - 维护行内提交中状态，防止重复点击与并发冲突；
 * - 操作完成后触发 `router.refresh()`，让 Server Component 列表重新取数。
 *
 * 为什么必须客户端执行：
 * - 需要响应用户点击、弹窗开关、Loading 态切换；
 * - 需要调用 toast 提示并即时反馈成功/失败结果。
 *
 * 上下游关系：
 * - 上游：`BookListClient` 传入 `bookId/bookTitle`；
 * - 下游：
 *   - `restartAnalysis` -> `/api/books/:id/analyze`（重启解析）；
 *   - `deleteBookById` -> `/api/books/:id`（删除书籍）；
 *   - `router.refresh` -> 触发当前路由服务端数据重新计算。
 *
 * 维护注意：
 * - `loadingAction` 不只是 UI 字段，它是并发防线，避免同一行重复触发危险操作；
 * - 删除操作必须经过确认弹窗，这是业务防误删规则，不是技术限制。
 * =============================================================================
 */

/**
 * 行操作当前进行中的动作类型。
 *
 * 业务语义：
 * - `retry`：正在重新解析；
 * - `delete`：正在删除；
 * - `null`：空闲，可触发任意按钮。
 */
type LoadingAction = "retry" | "delete" | null;

/**
 * 组件入参。
 */
interface BookRowActionsProps {
  /** 当前行书籍 ID，作为 API 操作主键。 */
  bookId   : string;
  /** 当前行书籍标题，仅用于用户确认文案和 toast 提示。 */
  bookTitle: string;
}

/**
 * 书籍行操作组件。
 *
 * @param props.bookId 当前书籍主键
 * @param props.bookTitle 当前书名
 * @returns 行内操作按钮与删除确认弹窗
 */
export function BookRowActions({ bookId, bookTitle }: BookRowActionsProps) {
  const router = useRouter();

  /**
   * 当前异步操作状态。
   * 设计目的：统一控制按钮禁用与图标 loading，防止重复提交。
   */
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);

  /**
   * 删除确认弹窗开关。
   * 设计目的：把“危险动作确认”显式化，降低误触成本。
   */
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  /**
   * 处理“重新解析”点击。
   *
   * 业务步骤：
   * 1) 标记 `retry` 提交态并禁用按钮；
   * 2) 调用重启解析接口；
   * 3) 成功后提示并刷新页面数据；
   * 4) 失败时给出错误提示；
   * 5) finally 清理 loading。
   */
  async function handleRetry() {
    setLoadingAction("retry");

    try {
      await restartAnalysis(bookId);
      toast.success(`已重新发起《${bookTitle}》解析`);
      // refresh 的业务意义：当前页数据是服务端提供，需要触发新一轮服务端渲染才能看到最新状态。
      router.refresh();
    } catch (error) {
      // 统一错误兜底，确保未知异常也能给用户可读反馈。
      toast.error(error instanceof Error ? error.message : "重新解析失败");
    } finally {
      setLoadingAction(null);
    }
  }

  /**
   * 处理“确认删除”点击。
   *
   * 业务步骤：
   * 1) 标记 `delete` 提交态；
   * 2) 调用删除接口；
   * 3) 成功后关闭弹窗、刷新列表；
   * 4) 失败时保留弹窗，允许用户重试或取消；
   * 5) finally 恢复空闲态。
   */
  async function handleDelete() {
    setLoadingAction("delete");

    try {
      await deleteBookById(bookId);
      toast.success("书籍已删除");
      setDeleteDialogOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="book-row-actions flex items-center justify-end gap-2">
      <Button
        variant="ghost"
        size="icon"
        title="重新解析"
        aria-label="重新解析"
        onClick={() => { void handleRetry(); }}
        // 任意动作进行中都禁用按钮，避免并行请求造成状态不一致。
        disabled={loadingAction !== null}
      >
        {loadingAction === "retry"
          ? <Loader2 size={16} className="animate-spin" />
          : <RefreshCw size={16} />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="text-destructive"
        title="删除"
        aria-label="删除"
        onClick={() => setDeleteDialogOpen(true)}
        disabled={loadingAction !== null}
      >
        <Trash2 size={16} />
      </Button>

      {/*
        删除确认弹窗：
        这是“危险操作确认”层，避免误触造成不可逆损失。
      */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除书籍</DialogTitle>
            <DialogDescription>
              确认删除《{bookTitle}》吗？该操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={loadingAction === "delete"}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => { void handleDelete(); }}
              disabled={loadingAction === "delete"}
            >
              {loadingAction === "delete" && <Loader2 size={16} className="animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
