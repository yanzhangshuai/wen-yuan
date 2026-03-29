"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";

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

type LoadingAction = "retry" | "delete" | null;

interface BookRowActionsProps {
  bookId   : string;
  bookTitle: string;
}

export function BookRowActions({ bookId, bookTitle }: BookRowActionsProps) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  async function handleRetry() {
    setLoadingAction("retry");

    try {
      await restartAnalysis(bookId);
      toast.success(`已重新发起《${bookTitle}》解析`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重新解析失败");
    } finally {
      setLoadingAction(null);
    }
  }

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
