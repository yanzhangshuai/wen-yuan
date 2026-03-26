import Link from "next/link";
import { Library, BookX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BookNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="mb-6 p-4 rounded-full bg-[var(--color-warning)]/10">
        <BookX className="w-10 h-10 text-[var(--color-warning)]" />
      </div>
      <h2 className="text-2xl font-bold text-[var(--color-fg)] mb-2">
        书籍未找到
      </h2>
      <p className="text-[var(--color-muted-fg)] max-w-md mb-6">
        您查找的书籍不存在，可能已被移除或地址有误。
      </p>
      <Link href="/">
        <Button className="gap-2">
          <Library size={16} />
          返回书库
        </Button>
      </Link>
    </div>
  );
}
