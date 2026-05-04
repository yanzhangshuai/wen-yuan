"use client";

import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

export const GLOBAL_BOOK_TYPE_VALUE = "__GLOBAL_BOOK_TYPE__";

export interface BatchActionBookTypeOption {
  id  : string;
  name: string;
}

export interface BatchActionControlsProps {
  selectedCount       : number;
  bookTypes           : BatchActionBookTypeOption[];
  onEnable            : () => Promise<void>;
  onDisable           : () => Promise<void>;
  onDelete            : () => Promise<void>;
  onClear             : () => void;
  onChangeBookType    : (bookTypeId: string | null) => Promise<void>;
  changeActionLabel  ?: string;
  changeDialogTitle  ?: string;
  bookTypeFieldLabel ?: string;
  globalBookTypeLabel?: string;
  changeConfirmLabel ?: string;
  deleteActionLabel  ?: string;
  deleteDialogTitle  ?: string;
}

type PendingAction = "enable" | "disable" | "changeBookType" | "delete" | null;

/**
 * 批量操作工具栏统一封装“多选 + 异步确认弹窗”交互，避免每个词库页面各写一套状态机。
 */
export function BatchActionControls({
  selectedCount,
  bookTypes,
  onEnable,
  onDisable,
  onDelete,
  onClear,
  onChangeBookType,
  changeActionLabel = "批量设置书籍类型",
  changeDialogTitle = "批量设置书籍类型",
  bookTypeFieldLabel = "书籍类型",
  globalBookTypeLabel = "通用",
  changeConfirmLabel = "确认设置",
  deleteActionLabel = "批量删除",
  deleteDialogTitle = "确认批量删除"
}: BatchActionControlsProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bookTypeId, setBookTypeId] = useState(GLOBAL_BOOK_TYPE_VALUE);

  useEffect(() => {
    if (!changeDialogOpen) {
      setBookTypeId(GLOBAL_BOOK_TYPE_VALUE);
    }
  }, [changeDialogOpen]);

  if (selectedCount <= 0) {
    return null;
  }

  const isPending = pendingAction !== null;
  const isChangePending = pendingAction === "changeBookType";
  const isDeletePending = pendingAction === "delete";

  async function runAction(action: Exclude<PendingAction, null>, callback: () => Promise<void>) {
    setPendingAction(action);
    try {
      await callback();
      return true;
    } catch {
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  async function handleChangeBookTypeConfirm() {
    const nextBookTypeId = bookTypeId === GLOBAL_BOOK_TYPE_VALUE ? null : bookTypeId;
    const success = await runAction("changeBookType", () => onChangeBookType(nextBookTypeId));
    if (success) {
      setChangeDialogOpen(false);
    }
  }

  async function handleDeleteConfirm() {
    const success = await runAction("delete", onDelete);
    if (success) {
      setDeleteDialogOpen(false);
    }
  }

  return (
    <>
      <div className="knowledge-base-batch-action-controls mb-4 flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3">
        <span className="text-sm font-medium text-foreground">已选 {selectedCount} 项</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => void runAction("enable", onEnable)}
        >
          批量启用
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => void runAction("disable", onDisable)}
        >
          批量停用
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => setChangeDialogOpen(true)}
        >
          {changeActionLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => setDeleteDialogOpen(true)}
        >
          {deleteActionLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={onClear}
        >
          清空选择
        </Button>
      </div>

      {changeDialogOpen ? (
        <div className="knowledge-base-batch-book-type-panel mb-4 rounded-md border bg-muted/30 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{changeDialogTitle}</h3>
              <div className="mt-1 text-xs text-muted-foreground">
                为当前选中的 {selectedCount} 项统一更新 {bookTypeFieldLabel}。
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="关闭"
              disabled={isChangePending}
              onClick={() => setChangeDialogOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="knowledge-base-batch-book-type">{bookTypeFieldLabel}</Label>
              <Select value={bookTypeId} onValueChange={setBookTypeId}>
                <SelectTrigger
                  id="knowledge-base-batch-book-type"
                  aria-label={bookTypeFieldLabel}
                  disabled={isChangePending}
                >
                  <SelectValue placeholder={`选择${bookTypeFieldLabel}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GLOBAL_BOOK_TYPE_VALUE}>{globalBookTypeLabel}</SelectItem>
                  {bookTypes.map((bookType) => (
                    <SelectItem key={bookType.id} value={bookType.id}>
                      {bookType.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={isChangePending}
              onClick={() => setChangeDialogOpen(false)}
            >
              取消
            </Button>
            <Button type="button" disabled={isChangePending} onClick={() => void handleChangeBookTypeConfirm()}>
              {isChangePending ? "设置中..." : changeConfirmLabel}
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!isDeletePending) {
            setDeleteDialogOpen(nextOpen);
          }
        }}
      >
        <AlertDialogContent className="knowledge-base-batch-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除选中的 {selectedCount} 项吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeletePending}
              onClick={() => setDeleteDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeletePending}
              onClick={() => void handleDeleteConfirm()}
            >
              {isDeletePending ? "删除中..." : "确认删除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
