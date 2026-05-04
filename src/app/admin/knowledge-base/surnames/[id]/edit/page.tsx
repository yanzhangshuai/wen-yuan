"use client";

import { use, useEffect, useState } from "react";

import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import { fetchSurnames, type SurnameItem } from "@/lib/services/surnames";
import { SurnameForm } from "../../_components/surname-form";

export default function EditSurnamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const [bookTypes, setBookTypes] = useState<BookTypeItem[]>([]);
  const [item, setItem]           = useState<SurnameItem | null>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([fetchSurnames({}), fetchBookTypes({ active: true })])
      .then(([surnames, types]) => {
        setBookTypes(types);
        setItem(surnames.find((surname) => surname.id === id) ?? null);
      })
      .catch((error) => toast({ title: "加载失败", description: String(error), variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id, toast]);

  return (
    <PageContainer>
      <PageHeader
        title="编辑姓氏"
        description={item ? `编辑姓氏「${item.surname}」` : "编辑姓氏配置"}
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库",   href: "/admin/knowledge-base" },
          { label: "姓氏词库", href: "/admin/knowledge-base/surnames" },
          { label: "编辑姓氏" }
        ]}
      />
      <PageSection>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : item ? (
          <SurnameForm initial={item} bookTypes={bookTypes} redirectTo="/admin/knowledge-base/surnames" />
        ) : (
          <div className="py-12 text-center text-muted-foreground">姓氏不存在或已被删除。</div>
        )}
      </PageSection>
    </PageContainer>
  );
}
