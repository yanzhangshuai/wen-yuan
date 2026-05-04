"use client";

import { use, useEffect, useState } from "react";

import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import { fetchGenericTitles, type GenericTitleItem } from "@/lib/services/title-filters";
import { GenericTitleForm } from "../../_components/generic-title-form";

export default function EditTitleFilterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const [item, setItem]       = useState<GenericTitleItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGenericTitles({})
      .then((items) => setItem(items.find((row) => row.id === id) ?? null))
      .catch((error) => toast({ title: "加载失败", description: String(error), variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id, toast]);

  return (
    <PageContainer>
      <PageHeader
        title="编辑泛化称谓"
        description={item ? `编辑称谓「${item.title}」` : "编辑泛化称谓"}
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库",   href: "/admin/knowledge-base" },
          { label: "泛化称谓", href: "/admin/knowledge-base/title-filters" },
          { label: "编辑称谓" }
        ]}
      />
      <PageSection>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : item ? (
          <GenericTitleForm initial={item} redirectTo="/admin/knowledge-base/title-filters" />
        ) : (
          <div className="py-12 text-center text-muted-foreground">称谓不存在或已被删除。</div>
        )}
      </PageSection>
    </PageContainer>
  );
}
