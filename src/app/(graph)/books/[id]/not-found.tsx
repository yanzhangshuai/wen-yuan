import Link from "next/link";
import { Library, BookX } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * =============================================================================
 * 文件定位（书籍子路由 not-found）
 * -----------------------------------------------------------------------------
 * 这是 `app/(viewer)/books/[id]/not-found.tsx`，用于“书籍维度”404。
 *
 * 与上层 `(viewer)/not-found.tsx` 的区别：
 * - 上层是通用页面不存在；
 * - 本文件聚焦“指定书籍不存在/不可访问”的场景，提示更具业务语义。
 *
 * 触发方式：
 * - `books/[id]` 下页面调用 `notFound()` 时，Next.js 就近匹配到本文件渲染。
 * =============================================================================
 */
export default function BookNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="mb-6 p-4 rounded-full bg-(--color-warning)/10">
        <BookX className="w-10 h-10 text-(--color-warning)" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">
        书籍未找到
      </h2>
      <p className="text-muted-foreground max-w-md mb-6">
        您查找的书籍不存在，可能已被移除或地址有误。
      </p>
      {/* 书籍缺失时统一回到书库列表，避免停留在无效深链。 */}
      <Button asChild className="gap-2">
        <Link href="/">
          <Library size={16} />
          返回书库
        </Link>
      </Button>
    </div>
  );
}
