import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BookDetailNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="mb-6 p-4 rounded-full bg-muted">
        <BookOpen className="w-10 h-10 text-muted-foreground" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">书籍不存在</h2>
      <p className="text-muted-foreground max-w-md mb-6">
        您访问的书籍不存在或已被删除。
      </p>
      <Link href="/admin/books">
        <Button variant="outline" className="gap-2">
          <BookOpen size={16} />
          返回书库管理
        </Button>
      </Link>
    </div>
  );
}
