import Link from "next/link";
import { Library } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * =============================================================================
 * 文件定位（viewer 路由组 not-found）
 * -----------------------------------------------------------------------------
 * 这是 `app/(viewer)/not-found.tsx`，属于 Next.js 路由级 404 页面。
 *
 * 框架行为：
 * - 当 `(viewer)` 路由组下页面调用 `notFound()`，或动态路由未命中时会渲染本组件。
 *
 * 业务职责：
 * - 给用户明确“页面不存在”的反馈；
 * - 提供返回书库入口，避免用户流程中断。
 * =============================================================================
 */
export default function ViewerNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="mb-6 p-4 rounded-full bg-primary-subtle">
        <Library className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">
        页面未找到
      </h2>
      <p className="text-muted-foreground max-w-md mb-6">
        您访问的页面不存在，可能已被移除或地址有误。
      </p>
      {/* 404 场景默认引导回首页书库，符合 viewer 用户主路径。 */}
      <Button asChild className="gap-2">
        <Link href="/">
          <Library size={16} />
          返回书库
        </Link>
      </Button>
    </div>
  );
}
