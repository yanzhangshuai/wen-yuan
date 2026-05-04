"use client";

import { use, useEffect, useState } from "react";

import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import { fetchKnowledgePack, type KnowledgePackItem } from "@/lib/services/knowledge";

import { PackForm } from "../../_components/pack-form";

export default function EditKnowledgePackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const [pack, setPack]           = useState<KnowledgePackItem | null>(null);
  const [bookTypes, setBookTypes] = useState<BookTypeItem[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([fetchKnowledgePack(id), fetchBookTypes()])
      .then(([packDetail, types]) => {
        setPack(packDetail);
        setBookTypes(types);
      })
      .catch((error) => toast({ title: "加载失败", description: String(error), variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id, toast]);

  return (
    <PageContainer>
      <PageHeader
        title="编辑知识包"
        description={pack ? `编辑知识包「${pack.name}」` : "编辑知识包基本信息"}
        breadcrumbs={[
          { label: "管理后台",     href: "/admin" },
          { label: "知识库",       href: "/admin/knowledge-base" },
          { label: "别名知识包",   href: "/admin/knowledge-base/alias-packs" },
          { label: "编辑知识包" }
        ]}
      />
      <PageSection>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : pack ? (
          <PackForm initial={pack} bookTypes={bookTypes} redirectTo="/admin/knowledge-base/alias-packs" />
        ) : (
          <div className="py-12 text-center text-muted-foreground">知识包不存在或已被删除。</div>
        )}
      </PageSection>
    </PageContainer>
  );
}
