"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { PageContainer, PageHeader, PageSection } from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import {
  fetchHistoricalFigures,
  type HistoricalFigureItem
} from "@/lib/services/historical-figures";

import { HistoricalFigureForm } from "../../_components/historical-figure-form";

export default function EditHistoricalFigurePage() {
  const params    = useParams<{ id: string }>();
  const { toast } = useToast();
  const [item,    setItem]    = useState<HistoricalFigureItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    setLoading(true);
    // 后端无单条查询接口；走列表 + 客户端过滤（数据量百级）
    fetchHistoricalFigures({ pageSize: 1000 })
      .then((list) => {
        if (cancelled) return;
        const found = list.find((it) => it.id === params.id) ?? null;
        setItem(found);
        if (!found) setError("未找到该历史人物");
        else setError(null);
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
        title="编辑历史人物"
        description={item ? `正在编辑「${item.name}」` : "加载中..."}
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库",   href: "/admin/knowledge-base" },
          { label: "历史人物", href: "/admin/knowledge-base/historical-figures" },
          { label: item?.name ?? "编辑" }
        ]}
      />
      <PageSection>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : error ? (
          <div className="py-12 text-center text-destructive">{error}</div>
        ) : item ? (
          <HistoricalFigureForm initial={item} />
        ) : (
          <div className="py-12 text-center text-muted-foreground">未找到该历史人物</div>
        )}
      </PageSection>
    </PageContainer>
  );
}
