import { listBooks } from "@/server/modules/books/listBooks";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  PageContainer,
  PageHeader
} from "@/components/layout/page-header";
import { BookListClient } from "./_components/book-list-client";

/* Server Component for Page */
export default async function AdminBooksPage() {
  const books = await listBooks();

  return (
    <PageContainer>
      <PageHeader
        title="书籍管理"
        description="管理书库中的所有典籍，包括导入、编辑和发布"
      >
        <Link href="/admin/books/import">
          <Button className="gap-2">
            <Plus size={16} />
            导入书籍
          </Button>
        </Link>
      </PageHeader>

      <BookListClient books={books} />
    </PageContainer>
  );
}
