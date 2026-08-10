"use client";

/**
 * ============================================================================
 * 文件定位：`src/app/admin/skills/page.tsx`
 * ----------------------------------------------------------------------------
 * 技能管理页（路由 `/admin/skills`）：主从布局。
 * 左侧为技能名称菜单栏（可搜索过滤），右侧为当前技能详情面板
 * （可编辑 MD 文档 / 基本信息 / AI 生成）。
 *
 * 选中态通过 URL 查询参数 `?id=` 同步，支持深链与刷新恢复。
 * ============================================================================
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader
} from "@/components/layout/page-header";
import { fetchSkills, type AdminSkillListItem } from "@/lib/services/skills";

import { AiGenerateDialog } from "./_components/ai-generate-dialog";
import { SkillDetailPanel } from "./_components/skill-detail-panel";
import { SkillsSidebar } from "./_components/skills-sidebar";

/** 从当前 URL 读取初始选中的技能 id。 */
function readInitialSkillId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("id");
}

export default function AdminSkillsPage() {
  const router    = useRouter();
  const [skills,  setSkills]  = useState<AdminSkillListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search,  setSearch]  = useState("");
  const [generateOpen, setGenerateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSkills();
      setSkills(data);
      setError(null);
      return data;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "技能列表加载失败");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /** 选中技能并同步 URL。 */
  const selectSkill = useCallback((id: string, updateUrl = true) => {
    setSelectedId(id);
    if (updateUrl) {
      router.replace(`/admin/skills?id=${id}`, { scroll: false });
    }
  }, [router]);

  // 首次挂载：加载列表并解析初始选中（URL id 优先，否则第一项）。
  useEffect(() => {
    const initialId = readInitialSkillId();
    void load().then((data) => {
      if (data && data.length > 0) {
        const valid = initialId && data.some((skill) => skill.id === initialId);
        selectSkill(valid ? initialId : data[0].id, valid ? true : false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSkills = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return skills;
    }
    return skills.filter((skill) =>
      skill.name.toLowerCase().includes(keyword)
      || (skill.description ?? "").toLowerCase().includes(keyword)
      || skill.slug.toLowerCase().includes(keyword)
    );
  }, [skills, search]);

  async function handleCreated(skillId: string) {
    const data = await load();
    if (data) {
      selectSkill(skillId);
    }
  }

  return (
    <PageContainer fullWidth className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <PageHeader
        title="技能管理"
        description="维护 skill 集合：左侧选择技能，右侧编辑 MD 文档 / 基本信息；支持 AI 生成新技能。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "技能" }
        ]}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => { void load(); }}
          disabled={loading}
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          刷新
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => setGenerateOpen(true)}
        >
          <Sparkles className="h-4 w-4" />
          AI 生成
        </Button>
      </PageHeader>

      {error ? (
        <div className="rounded-md border border-destructive/40 p-6 text-center text-sm text-destructive">
          {error}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border bg-background">
          <SkillsSidebar
            skills={filteredSkills}
            selectedId={selectedId}
            loading={loading}
            search={search}
            onSearchChange={setSearch}
            onSelect={selectSkill}
          />
          <div className="min-w-0 flex-1">
            {selectedId ? (
              // key 保证切换技能时详情面板重挂载（编辑态/变更说明/Tab 不残留到下一个技能）。
              <SkillDetailPanel key={selectedId} skillId={selectedId} onChanged={() => void load()} />
            ) : (
              <div className="flex h-full items-center justify-center">
                {loading ? (
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载技能列表...
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm">暂无技能，点击右上角「AI 生成」创建</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <AiGenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onCreated={(skillId) => { void handleCreated(skillId); }}
      />
    </PageContainer>
  );
}
