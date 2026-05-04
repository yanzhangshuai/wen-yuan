"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { PageContainer, PageHeader, PageSection } from "@/components/layout/page-header";
import { toast } from "@/components/ui/sonner";
import { fetchRelationshipTypes, type RelationshipTypeItem } from "@/lib/services/relationship-types";
import { RelationshipTypeForm } from "../../_components/relationship-type-form";

export default function EditRelationshipTypePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem]       = useState<RelationshipTypeItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchRelationshipTypes();
        if (cancelled) return;
        const found = list.find((it) => it.id === params.id);
        if (!found) {
          toast.error("关系类型不存在");
          router.replace("/admin/knowledge-base/relationship-types");
          return;
        }
        setItem(found);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params.id, router]);

  return (
    <PageContainer>
      <PageHeader
        title={item ? `编辑：${item.name}` : "编辑关系类型"}
        description="维护标准名称、方向规则、归一化别名与审核状态。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库",   href: "/admin/knowledge-base" },
          { label: "关系类型", href: "/admin/knowledge-base/relationship-types" },
          { label: "编辑" }
        ]}
      />
      <PageSection>
        {loading ? (
          <div className="text-muted-foreground">加载中...</div>
        ) : item ? (
          <RelationshipTypeForm initial={item} redirectTo="/admin/knowledge-base/relationship-types" />
        ) : null}
      </PageSection>
    </PageContainer>
  );
}
