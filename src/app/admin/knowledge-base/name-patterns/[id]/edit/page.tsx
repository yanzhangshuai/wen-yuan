"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { PageContainer, PageHeader, PageSection } from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import { fetchNamePatterns, type NamePatternRuleItem } from "@/lib/services/name-patterns";

import { NamePatternForm } from "../../_components/name-pattern-form";

/**
 * 编辑名字模式规则——服务端无单条查询接口，
 * 这里复用 `fetchNamePatterns` 列表后按 id 过滤（数据量在百级，无性能压力）。
 */
export default function EditNamePatternPage() {
  const params    = useParams<{ id: string }>();
  const { toast } = useToast();
  const [item,    setItem]    = useState<NamePatternRuleItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    setLoading(true);
    fetchNamePatterns({ pageSize: 500 })
      .then((list) => {
        if (cancelled) return;
        const found = list.find((it) => it.id === params.id) ?? null;
        setItem(found);
        if (!found) setError("未找到该规则");
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
        title="编辑名字模式规则"
        description={item ? `正在编辑「${item.pattern}」` : "加载中..."}
        breadcrumbs={[
          { label: "管理后台",     href: "/admin" },
          { label: "知识库",       href: "/admin/knowledge-base" },
          { label: "名字模式规则", href: "/admin/knowledge-base/name-patterns" },
          { label: item?.pattern ?? "编辑" }
        ]}
      />
      <PageSection>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : error ? (
          <div className="py-12 text-center text-destructive">{error}</div>
        ) : item ? (
          <NamePatternForm initial={item} />
        ) : (
          <div className="py-12 text-center text-muted-foreground">未找到该规则</div>
        )}
      </PageSection>
    </PageContainer>
  );
}
