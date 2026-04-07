"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 文件定位（Next.js App Router 分段错误文件）：
 * - 位于 `app/login/` 路由段下，为登录页提供独立错误边界。
 * - 登录页抛错时（如第三方认证服务异常）可在本段内恢复，不影响其他页面。
 */
interface LoginErrorProps {
  /** 当前路由段渲染失败抛出的异常。 */
  error: Error & { digest?: string };
  /** 重试回调：触发后 Next.js 重新渲染该路由段。 */
  reset: () => void;
}

export default function LoginError({ error, reset }: LoginErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center">
      <div className="mb-6 p-4 rounded-full bg-destructive/10">
        <AlertCircle className="w-10 h-10 text-destructive" />
      </div>
      <h2 className="text-2xl font-bold mb-2">登录页面出错</h2>
      <p className="text-muted-foreground max-w-md mb-6">
        {error.message || "获取登录页面时发生错误，请稍后重试。"}
      </p>
      <Button onClick={reset} className="gap-2">
        <RefreshCw size={16} />
        重试
      </Button>
    </div>
  );
}
