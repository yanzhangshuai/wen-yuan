/**
 * ============================================================================
 * 文件定位：`src/app/admin/books/[id]/not-found.tsx`
 * ----------------------------------------------------------------------------
 * 这是书籍详情路由段的 404 UI。
 *
 * Next.js 语义：
 * - 在 App Router 下，同级 `not-found.tsx` 会在调用 `notFound()` 时自动渲染；
 * - 作用域仅覆盖当前路由段（这里是 `/admin/books/[id]`），不会影响全站 404 页面。
 *
 * 业务职责：
 * - 当管理员访问了不存在/已删除的书籍时，给出明确反馈；
 * - 提供返回书库列表的恢复路径，避免用户陷入死路。
 * ============================================================================
 */

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 详情页 404 组件（展示型组件）。
 */
export default function BookDetailNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      {/* 图标区：帮助用户快速识别当前是“书籍相关”异常，而非系统崩溃。 */}
      <div className="mb-6 p-4 rounded-full bg-muted">
        <BookOpen className="w-10 h-10 text-muted-foreground" />
      </div>

      <h2 className="text-2xl font-bold text-foreground mb-2">书籍不存在</h2>
      <p className="text-muted-foreground max-w-md mb-6">
        您访问的书籍不存在或已被删除。
      </p>

      {/* 明确回退路径：返回书库管理主列表。 */}
      <Button asChild variant="outline" className="gap-2">
        <Link href="/admin/books">
          <BookOpen size={16} />
          返回书库管理
        </Link>
      </Button>
    </div>
  );
}
