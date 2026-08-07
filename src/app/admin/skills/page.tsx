"use client";

/**
 * ============================================================================
 * 文件定位：`src/app/admin/skills/page.tsx`
 * ----------------------------------------------------------------------------
 * 技能包管理列表页（路由 `/admin/skills`）。
 *
 * skill 独立启停由管理端维护。列表展示
 * slug/name/description/category/scope + isEnabled 开关，点击行进入详情页
 * 只读查看关系码/虚指契约。
 * ============================================================================
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Loader2 } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import {
  fetchSkills,
  updateSkillEnabled,
  type AdminSkillListItem
} from "@/lib/services/skills";

/** 分类徽章文案映射（覆盖常见枚举；未知值原样展示）。 */
const CATEGORY_LABELS: Record<string, string> = {
  CHARACTER   : "人物",
  RELATIONSHIP: "关系",
  PLOT        : "情节",
  GENRE       : "题材",
  HYBRID      : "综合",
  OTHER       : "其他"
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/**
 * 技能包管理列表页组件。
 */
export default function AdminSkillsPage() {
  const { toast } = useToast();
  const [skills, setSkills] = useState<AdminSkillListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 当前正在切换启停的 skill id（防重复提交）。 */
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSkills();
      setSkills(data);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "技能列表加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggle(item: AdminSkillListItem, nextEnabled: boolean) {
    setTogglingId(item.id);
    // 乐观更新：先翻转 UI，请求失败再回滚（切换期间 Switch 由 togglingId 禁用，回滚目标唯一）。
    setSkills((current) => current
      ? current.map((skill) => skill.id === item.id ? { ...skill, isEnabled: nextEnabled } : skill)
      : current);
    try {
      await updateSkillEnabled(item.id, nextEnabled);
      toast({ title: nextEnabled ? "技能已启用" : "技能已停用", description: `「${item.name}」${nextEnabled ? "可被 AI 选择与装载" : "全局不可用（目录/选择/装载均跳过）"}` });
    } catch (toggleError) {
      setSkills((current) => current
        ? current.map((skill) => skill.id === item.id ? { ...skill, isEnabled: !nextEnabled } : skill)
        : current);
      toast({ title: "切换失败", description: toggleError instanceof Error ? toggleError.message : "请稍后重试", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="技能管理"
        description="维护 skill 目录：独立启停开关；关系码与虚指契约在详情页只读查看。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "技能" }
        ]}
      />

      <PageSection>
        {loading ? (
          <div className="flex items-center gap-2 py-12 text-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载技能列表...
          </div>
        ) : error ? (
          <div className="py-12 text-center text-destructive">{error}</div>
        ) : skills && skills.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">名称</TableHead>
                  <TableHead className="w-32">slug</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead className="w-24">分类</TableHead>
                  <TableHead className="w-20">范围</TableHead>
                  <TableHead className="w-20">版本</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead className="w-24">启用</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skills.map((skill) => (
                  <TableRow key={skill.id}>
                    <TableCell className="font-medium">{skill.name}</TableCell>
                    <TableCell className="font-mono text-xs">{skill.slug}</TableCell>
                    <TableCell className="max-w-80 truncate text-muted-foreground">
                      {skill.description ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{categoryLabel(skill.category)}</Badge>
                    </TableCell>
                    <TableCell>{skill.scope}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {skill.versionNo ? `v${skill.versionNo}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={skill.status === "ACTIVE" ? "default" : "outline"}>
                        {skill.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        aria-label={`${skill.isEnabled ? "停用" : "启用"} ${skill.name}`}
                        checked={skill.isEnabled}
                        disabled={togglingId === skill.id}
                        onCheckedChange={(checked) => { void handleToggle(skill, checked); }}
                      />
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm" aria-label={`查看 ${skill.name} 详情`}>
                        <Link href={`/admin/skills/${skill.id}`}>
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
            暂无技能包，请先通过 seed（scripts/seed-skill-baselines.ts）导入基线。
          </div>
        )}
      </PageSection>
    </PageContainer>
  );
}
