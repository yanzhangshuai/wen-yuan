"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { PageContainer, PageHeader, PageSection } from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";

import { BookTypeForm } from "../../_components/book-type-form";
import { type BookTypeItem, fetchBookType } from "@/lib/services/book-types";

/**
 * `/admin/knowledge-base/book-types/[id]/edit`
 * 编辑书籍类型——路由级整页表单（替代原 Dialog）。
 */
export default function EditBookTypePage() {
  const params      = useParams<{ id: string }>();
  const { toast }   = useToast();
  const [item,    setItem]    = useState<BookTypeItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    setLoading(true);
    fetchBookType(params.id)
      .then((data) => {
        if (cancelled) return;
        setItem(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        toast({ title: "加载失败", description: message, variant: "destructive" });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params?.id, toast]);

  return (
    <PageContainer>
      <PageHeader
        title="编辑书籍类型"
        description={item ? `正在编辑「${item.name}」` : "加载中..."}
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库",   href: "/admin/knowledge-base" },
          { label: "书籍类型", href: "/admin/knowledge-base/book-types" },
          { label: item?.name ?? "编辑" }
        ]}
      />
      <PageSection>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : error ? (
          <div className="py-12 text-center text-destructive">{error}</div>
        ) : item ? (
          <BookTypeForm initial={item} />
        ) : (
          <div className="py-12 text-center text-muted-foreground">未找到该书籍类型</div>
        )}
      </PageSection>
    </PageContainer>
  );
}
