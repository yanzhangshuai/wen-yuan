"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, PageSection } from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import { fetchChangeLog, type KnowledgeChangeLogItem } from "@/lib/services/change-logs";

/**
 * `/admin/knowledge-base/change-logs/[id]`
 * 变更日志详情页（替代原 `<Dialog>` 详情弹窗）。
 */
export default function ChangeLogDetailPage() {
  const params    = useParams<{ id: string }>();
  const router    = useRouter();
  const { toast } = useToast();
  const [item,    setItem]    = useState<KnowledgeChangeLogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    setLoading(true);
    fetchChangeLog(params.id)
      .then((data) => {
        if (cancelled) return;
        setItem(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        toast({ title: "详情加载失败", description: message, variant: "destructive" });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params?.id, toast]);

  return (
    <PageContainer>
      <PageHeader
        title={item?.objectName ?? "日志详情"}
        description={item ? `${item.action} · ${item.objectType}` : "加载中..."}
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库",   href: "/admin/knowledge-base" },
          { label: "变更日志", href: "/admin/knowledge-base/change-logs" },
          { label: item?.objectName ?? "详情" }
        ]}
      >
        <Button type="button" variant="outline" onClick={() => router.back()}>返回</Button>
      </PageHeader>
      <PageSection>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : error ? (
          <div className="py-12 text-center text-destructive">{error}</div>
        ) : item ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-medium">变更前</div>
              <pre className="max-h-[640px] overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                {JSON.stringify(item.before ?? null, null, 2)}
              </pre>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">变更后</div>
              <pre className="max-h-[640px] overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                {JSON.stringify(item.after ?? null, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-muted-foreground">未找到该日志</div>
        )}
      </PageSection>
    </PageContainer>
  );
}
