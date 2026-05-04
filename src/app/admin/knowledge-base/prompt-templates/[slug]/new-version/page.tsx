"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { PageContainer, PageHeader, PageSection } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getPromptTemplateMetadata } from "@/lib/prompt-template-metadata";
import { createPromptVersion } from "@/lib/services/prompt-templates";

/**
 * `/admin/knowledge-base/prompt-templates/[slug]/new-version`
 * 替代原 `<Dialog>` 新建版本弹窗的全页表单。
 */
export default function NewPromptVersionPage() {
  const params   = useParams<{ slug: string }>();
  const router   = useRouter();
  const slug     = params?.slug ?? "";
  const metadata = useMemo(() => (slug ? getPromptTemplateMetadata(slug) : null), [slug]);
  const { toast } = useToast();

  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt,   setUserPrompt]   = useState("");
  const [genreKey,     setGenreKey]     = useState("");
  const [changeNote,   setChangeNote]   = useState("");
  const [isBaseline,   setIsBaseline]   = useState(false);
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    setSystemPrompt("");
    setUserPrompt("");
    setGenreKey("");
    setChangeNote("");
    setIsBaseline(false);
  }, [slug]);

  async function handleSubmit() {
    if (!slug) return;
    if (!systemPrompt.trim() || !userPrompt.trim()) {
      toast({ title: "请填写系统/用户提示词", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createPromptVersion(slug, {
        systemPrompt,
        userPrompt,
        genreKey  : genreKey.trim() || undefined,
        changeNote: changeNote || undefined,
        isBaseline
      });
      toast({ title: "版本创建成功" });
      router.push(`/admin/knowledge-base/prompt-templates?slug=${encodeURIComponent(slug)}`);
    } catch (error) {
      toast({ title: "创建失败", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="新建模板版本"
        description={`为模板 ${slug} 创建新版本，保存后可在列表页激活并预览。`}
        breadcrumbs={[
          { label: "管理后台",   href: "/admin" },
          { label: "知识库",     href: "/admin/knowledge-base" },
          { label: "提示词模板", href: "/admin/knowledge-base/prompt-templates" },
          { label: "新建版本" }
        ]}
      >
        <Button asChild variant="outline">
          <Link href="/admin/knowledge-base/prompt-templates">返回</Link>
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={saving || !systemPrompt.trim() || !userPrompt.trim()}>
          {saving ? "保存中..." : "保存版本"}
        </Button>
      </PageHeader>

      <PageSection>
        <div className="grid gap-4">
          {metadata ? (
            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">可用占位符</div>
              <div className="flex flex-wrap gap-2">
                {metadata.placeholders.map((placeholder) => (
                  <Badge key={placeholder.key} variant="outline">{`{${placeholder.key}}`}</Badge>
                ))}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                使用上面的占位符保持模板可复用。保存后可在列表页点击预览查看实际渲染结果。
              </div>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label>书籍类型覆盖（可选）</Label>
            <Input value={genreKey} onChange={(event) => setGenreKey(event.target.value)} placeholder="例如：历史演义" />
          </div>
          <div className="grid gap-2">
            <Label>系统提示词</Label>
            <Textarea rows={10} value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>用户提示词</Label>
            <Textarea rows={12} value={userPrompt} onChange={(event) => setUserPrompt(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>变更说明</Label>
            <Input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isBaseline} onCheckedChange={setIsBaseline} />
            <Label>标记为基线版本</Label>
          </div>
        </div>
      </PageSection>
    </PageContainer>
  );
}
