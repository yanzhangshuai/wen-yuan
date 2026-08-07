"use client";

/**
 * ============================================================================
 * 文件定位：`src/app/admin/skills/[id]/page.tsx`
 * ----------------------------------------------------------------------------
 * 技能包详情页（路由 `/admin/skills/:id`）。
 *
 * 关系码契约（relationshipCodes）与虚指名单（deicticJunk）作为 skill frontmatter
 * 契约承载，本页只读展示激活版契约，不支持在线编辑
 * （skills 以 `scripts/skills/*.md` + seed 为唯一内容源）。
 * ============================================================================
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import { fetchSkill, type AdminSkillDetail } from "@/lib/services/skills";

/**
 * 技能包详情页组件。
 */
export default function AdminSkillDetailPage() {
  const params    = useParams<{ id: string }>();
  const router    = useRouter();
  const { toast } = useToast();
  const [item,    setItem]    = useState<AdminSkillDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    setLoading(true);
    fetchSkill(params.id)
      .then((data) => { if (!cancelled) setItem(data); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        toast({ title: "详情加载失败", description: message, variant: "destructive" });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params?.id, toast]);

  return (
    <PageContainer>
      <PageHeader
        title={item?.name ?? "技能详情"}
        description={item ? `${item.slug} · ${item.scope} · ${item.status}` : "加载中..."}
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "技能管理", href: "/admin/skills" },
          { label: item?.name ?? "详情" }
        ]}
      >
        <Button type="button" variant="outline" onClick={() => router.back()}>返回</Button>
      </PageHeader>

      {loading ? (
        <PageSection>
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        </PageSection>
      ) : item ? (
        <>
          <PageSection title="基本信息">
            <div className="grid gap-4 rounded-md border p-4 text-sm md:grid-cols-2">
              <div><span className="text-muted-foreground">描述：</span>{item.description ?? "—"}</div>
              <div><span className="text-muted-foreground">分类：</span>{item.category}</div>
              <div><span className="text-muted-foreground">范围：</span>{item.scope}</div>
              <div><span className="text-muted-foreground">状态：</span><Badge variant="outline">{item.status}</Badge></div>
              <div><span className="text-muted-foreground">启用：</span>{item.isEnabled ? "已启用" : "已停用（全局不可用）"}</div>
              <div><span className="text-muted-foreground">激活版本：</span>{item.contract?.versionNo ? `v${item.contract.versionNo}` : "无激活版"}</div>
            </div>
          </PageSection>

          <PageSection title="关系码契约" className="mt-6">
            {item.contract?.relationshipCodes && item.contract.relationshipCodes.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-36">码</TableHead>
                      <TableHead className="w-32">方向</TableHead>
                      <TableHead className="w-32">分类</TableHead>
                      <TableHead>别名</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {item.contract.relationshipCodes.map((rc) => (
                      <TableRow key={rc.code}>
                        <TableCell className="font-medium">{rc.code}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{rc.direction}</Badge>
                        </TableCell>
                        <TableCell>{rc.category}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {rc.aliases.length > 0 ? rc.aliases.join("、") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                该 skill 未携带关系码契约。
              </div>
            )}
          </PageSection>

          <PageSection title="虚指名单（deicticJunk）" className="mt-6">
            {item.contract?.deicticJunk && item.contract.deicticJunk.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {item.contract.deicticJunk.map((word) => (
                  <Badge key={word} variant="secondary">{word}</Badge>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                该 skill 未携带虚指名单契约。
              </div>
            )}
          </PageSection>
        </>
      ) : (
        <PageSection>
          <div className="py-12 text-center text-muted-foreground">未找到该技能包</div>
        </PageSection>
      )}
    </PageContainer>
  );
}
