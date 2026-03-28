"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center">
      <div className="mb-6 p-4 rounded-full bg-red-500/10">
        <AlertCircle className="w-10 h-10 text-red-500" />
      </div>
      <h2 className="text-2xl font-bold mb-2">
        管理页面出错
      </h2>
      <p className="text-muted-foreground max-w-md mb-6">
        {error.message || "发生了一个意外错误，请稍后重试。"}
      </p>
      <Button onClick={reset} className="gap-2">
        <RefreshCw size={16} />
        重试
      </Button>
    </div>
  );
}
