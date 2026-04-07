"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 文件定位（Next.js App Router 分段错误文件）：
 * - 位于 `app/admin/books/[id]/` 路由段下，为书籍详情页提供独立错误边界。
 * - 单本书详情加载异常时在本段内恢复，不影响书籍列表。
 */
interface BookDetailErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function BookDetailError({ error, reset }: BookDetailErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center">
      <div className="mb-6 p-4 rounded-full bg-destructive/10">
        <AlertCircle className="w-10 h-10 text-destructive" />
      </div>
      <h2 className="text-2xl font-bold mb-2">书籍详情出错</h2>
      <p className="text-muted-foreground max-w-md mb-6">
        {error.message || "加载书籍详情时发生错误，请稍后重试。"}
      </p>
      <Button onClick={reset} className="gap-2">
        <RefreshCw size={16} />
        重试
      </Button>
    </div>
  );
}
