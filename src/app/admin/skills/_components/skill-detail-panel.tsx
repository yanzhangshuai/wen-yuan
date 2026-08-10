"use client";

/**
 * 技能管理：右侧技能详情面板。
 * - 头部：名称/slug/状态徽章/作用范围；
 * - 「内容文档」Tab：MD 编辑器（编辑/预览），保存即覆盖当前内容；
 * - 「基本信息」Tab：name/description/scope/status 表单。
 */
import { useCallback, useEffect, useState } from "react";
import { Info, Loader2, PencilLine, Save, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAdminModels } from "@/hooks/use-admin-models";
import {
  fetchSkill,
  regenerateSkillContent,
  updateSkillContent,
  updateSkillInfo,
  type AdminSkillDetail
} from "@/lib/services/skills";

import { SCOPE_OPTIONS, scopeLabel, statusLabel, STATUS_OPTIONS } from "./constants";
import { MarkdownEditor } from "./markdown-editor";

interface SkillDetailPanelProps {
  skillId  : string;
  /** 任一变更提交后刷新父级列表（侧栏）。 */
  onChanged: () => void;
}

export function SkillDetailPanel({ skillId, onChanged }: SkillDetailPanelProps) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<AdminSkillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 基本信息表单态
  const [info, setInfo] = useState<{ name: string; description: string; scope: string; status: string }>({
    name: "", description: "", scope: "GLOBAL", status: "ENABLED"
  });
  const [savingInfo, setSavingInfo] = useState(false);

  // 内容编辑态
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState("");
  const [savingContent, setSavingContent] = useState(false);
  /** 编辑器当前模式（受控：父组件据此决定是否展示保存栏）。 */
  const [mdMode, setMdMode] = useState<"edit" | "preview">("edit");

  /** 受控 Tab：加载刷新期间组件卸载重挂载也不会丢失用户所在 Tab。 */
  const [activeTab, setActiveTab] = useState("content");

  // AI 重新生成弹框态
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [regeneratePurpose, setRegeneratePurpose] = useState("");
  const [regenerateName, setRegenerateName] = useState("");
  const [regenerateScope, setRegenerateScope] = useState("GLOBAL");
  const [regenerating, setRegenerating] = useState(false);
  const { models, loading: modelsLoading } = useAdminModels({ onlyEnabled: true });
  const hasUsableModel = !modelsLoading && models.length > 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSkill(skillId);
      setDetail(data);
      setContent(data.content);
      setInfo({
        name       : data.name,
        description: data.description ?? "",
        scope      : data.scope,
        status     : data.status
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "技能详情加载失败");
    } finally {
      setLoading(false);
    }
  }, [skillId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSaveInfo() {
    if (!detail) return;
    if (!info.name.trim()) {
      toast({ title: "名称不能为空", variant: "destructive" });
      return;
    }
    setSavingInfo(true);
    try {
      await updateSkillInfo(detail.id, {
        name       : info.name.trim(),
        description: info.description.trim() || null,
        scope      : info.scope,
        status     : info.status
      });
      toast({ title: "基本信息已保存" });
      await load();
      onChanged();
    } catch (saveError) {
      toast({ title: "保存失败", description: saveError instanceof Error ? saveError.message : "请稍后重试", variant: "destructive" });
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleSaveContent() {
    if (!detail) return;
    setSavingContent(true);
    try {
      // 保存即覆盖当前内容（无版本历史）。
      await updateSkillContent(detail.id, { content });
      toast({ title: "已保存", description: "技能内容已更新" });
      setEditing(false);
      await load();
      onChanged();
    } catch (saveError) {
      toast({ title: "保存失败", description: saveError instanceof Error ? saveError.message : "请检查 frontmatter 格式", variant: "destructive" });
    } finally {
      setSavingContent(false);
    }
  }

  function openRegenerateDialog() {
    if (!detail) return;
    setRegeneratePurpose(detail.description ?? detail.name);
    setRegenerateName(detail.name);
    setRegenerateScope(detail.scope);
    setRegenerateOpen(true);
  }

  async function handleRegenerate() {
    if (!detail) return;
    setRegenerating(true);
    try {
      const result = await regenerateSkillContent(detail.id, {
        purpose: regeneratePurpose.trim(),
        ...(regenerateName.trim() ? { name: regenerateName.trim() } : {}),
        ...(regenerateScope ? { scope: regenerateScope } : {})
      });
      setContent(result.content);
      setEditing(true);
      setMdMode("edit");
      setActiveTab("content");
      setRegenerateOpen(false);
      toast({ title: "已生成", description: "AI 已重新生成内容（未保存），请预览确认后点「保存」" });
    } catch (regenerateError) {
      toast({ title: "生成失败", description: regenerateError instanceof Error ? regenerateError.message : "请检查模型配置后重试", variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        加载技能详情...
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex h-full items-center justify-center text-destructive">
        {error ?? "技能不存在"}
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* 头部 */}
      <div className="border-b px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold">{detail.name}</h2>
              <Badge variant={detail.status === "ENABLED" ? "default" : "outline"}>
                {statusLabel(detail.status)}
              </Badge>
            </div>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
              <code className="font-mono">{detail.slug}</code>
              <span>{scopeLabel(detail.scope)}</span>
              <span>更新于 {new Date(detail.updatedAt).toLocaleString("zh-CN")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 主体 */}
      <div className="flex-1 overflow-y-auto p-5">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="content" className="gap-1.5"><PencilLine className="h-3.5 w-3.5" />内容文档</TabsTrigger>
            <TabsTrigger value="info" className="gap-1.5"><Info className="h-3.5 w-3.5" />基本信息</TabsTrigger>
          </TabsList>

          {/* 内容文档 */}
          <TabsContent value="content" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-muted-foreground text-sm">
                {editing
                  ? "编辑中，保存即覆盖当前内容"
                  : "MD 文档（YAML frontmatter + 正文），点击「编辑」进入编辑，保存即覆盖"}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openRegenerateDialog}
                disabled={!hasUsableModel}
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI 重新生成
              </Button>
            </div>

            <MarkdownEditor
              value={content}
              onChange={setContent}
              mode={mdMode}
              onModeChange={setMdMode}
              readOnly={!editing}
              onEditRequest={() => { setEditing(true); setMdMode("edit"); }}
              minHeight="26rem"
            />

            {editing && mdMode === "edit" && (
              <div className="flex justify-end gap-2 rounded-md border p-3">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); void load(); }} disabled={savingContent}>
                  取消
                </Button>
                <Button type="button" size="sm" onClick={() => void handleSaveContent()} disabled={savingContent}>
                  {savingContent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  保存
                </Button>
              </div>
            )}
          </TabsContent>

          {/* 基本信息 */}
          <TabsContent value="info" className="space-y-4">
            <div className="grid gap-4 rounded-md border p-4">
              <div className="grid gap-1.5">
                <Label htmlFor="info-name">名称</Label>
                <Input id="info-name" value={info.name} onChange={(event) => setInfo({ ...info, name: event.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="info-desc">描述</Label>
                <Textarea
                  id="info-desc"
                  value={info.description}
                  onChange={(event) => setInfo({ ...info, description: event.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label>作用范围</Label>
                  <Select value={info.scope} onValueChange={(value) => setInfo({ ...info, scope: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SCOPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>状态</Label>
                  <Select value={info.status} onValueChange={(value) => setInfo({ ...info, status: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={() => void handleSaveInfo()} disabled={savingInfo}>
                  {savingInfo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  保存信息
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* AI 重新生成弹框 */}
      <Dialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="text-primary h-4 w-4" />
              AI 重新生成
            </DialogTitle>
            <DialogDescription>
              基于用途描述重新生成技能 MD（不直接覆盖），生成后可预览确认，满意再点「保存」。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="regenerate-purpose">用途描述</Label>
              <Textarea
                id="regenerate-purpose"
                value={regeneratePurpose}
                onChange={(event) => setRegeneratePurpose(event.target.value)}
                rows={4}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="regenerate-name">名称</Label>
              <Input
                id="regenerate-name"
                value={regenerateName}
                onChange={(event) => setRegenerateName(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>作用范围</Label>
              <Select value={regenerateScope} onValueChange={setRegenerateScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!hasUsableModel && !modelsLoading && (
              <p className="text-destructive text-xs">
                当前没有可用的默认模型，请先在「模型管理」配置并启用一个模型。
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRegenerateOpen(false)} disabled={regenerating}>
              取消
            </Button>
            <Button type="button" onClick={() => void handleRegenerate()} disabled={regenerating || !hasUsableModel}>
              {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {regenerating ? "生成中..." : "生成"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
