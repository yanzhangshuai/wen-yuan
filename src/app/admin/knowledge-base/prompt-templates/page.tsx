"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, GitCompareArrows, Plus, RotateCcw } from "lucide-react";

import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  getPromptTemplateMetadata,
  type PromptTemplateMetadataItem
} from "@/lib/prompt-template-metadata";
import {
  activatePromptVersion,
  createPromptVersion,
  diffPromptVersions,
  fetchPromptTemplate,
  fetchPromptTemplates,
  previewPrompt,
  type PromptDiffResult,
  type PromptPreviewResult,
  type PromptTemplateItem,
  type PromptTemplateListItem
} from "@/lib/services/prompt-templates";

export default function PromptTemplatesPage() {
  const [templates, setTemplates] = useState<PromptTemplateListItem[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [detail, setDetail] = useState<PromptTemplateItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PromptPreviewResult | null>(null);
  const [diffData, setDiffData] = useState<PromptDiffResult | null>(null);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const { toast } = useToast();

  const templateMetadata = useMemo(() => {
    if (!selectedSlug) {
      return null;
    }
    return getPromptTemplateMetadata(selectedSlug);
  }, [selectedSlug]);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const list = await fetchPromptTemplates();
      setTemplates(list);
      const nextSlug = selectedSlug || list[0]?.slug || "";
      setSelectedSlug(nextSlug);
      if (nextSlug) {
        const templateDetail = await fetchPromptTemplate(nextSlug);
        setDetail(templateDetail);
      } else {
        setDetail(null);
      }
    } catch (error) {
      toast({ title: "加载失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [selectedSlug, toast]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (!selectedSlug) return;
    void (async () => {
      try {
        const templateDetail = await fetchPromptTemplate(selectedSlug);
        setDetail(templateDetail);
        const versions = templateDetail.versions ?? [];
        setCompareA(versions[0]?.id ?? "");
        setCompareB(versions[1]?.id ?? versions[0]?.id ?? "");
      } catch (error) {
        toast({ title: "模板详情加载失败", description: String(error), variant: "destructive" });
      }
    })();
  }, [selectedSlug, toast]);

  const activeVersionId = detail?.activeVersionId ?? null;
  const versions = useMemo(() => detail?.versions ?? [], [detail]);

  async function handlePreview(versionId?: string) {
    if (!selectedSlug) return;
    try {
      const data = await previewPrompt(selectedSlug, {
        versionId,
        sampleInput: templateMetadata?.sampleInput
      });
      setPreviewData(data);
      setPreviewDialogOpen(true);
    } catch (error) {
      toast({ title: "预览失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleActivate(versionId: string) {
    if (!selectedSlug) return;
    try {
      await activatePromptVersion(selectedSlug, versionId);
      toast({ title: "版本已激活" });
      await loadTemplates();
    } catch (error) {
      toast({ title: "激活失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleDiff() {
    if (!selectedSlug || !compareA || !compareB) return;
    try {
      const data = await diffPromptVersions(selectedSlug, compareA, compareB);
      setDiffData(data);
    } catch (error) {
      toast({ title: "对比失败", description: String(error), variant: "destructive" });
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="提示词模板"
        description="查看模板版本历史、激活版本，并预览实际渲染的提示词内容。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "提示词模板" }
        ]}
      >
        <Button size="sm" onClick={() => setVersionDialogOpen(true)} disabled={!selectedSlug}>
          <Plus className="mr-1 h-4 w-4" />
          新建版本
        </Button>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        <PageSection title="模板列表">
          <div className="space-y-2">
            {templates.map((template) => (
              <button
                key={template.slug}
                type="button"
                className={`w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/40 ${selectedSlug === template.slug ? "border-primary bg-muted/40" : ""}`}
                onClick={() => setSelectedSlug(template.slug)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{template.name}</span>
                  <Badge variant={template.activeVersionId ? "success" : "secondary"}>
                    {template.activeVersionId ? "已激活" : "未激活"}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{template.slug}</div>
                <div className="mt-2 text-xs text-muted-foreground">{template.codeRef ?? "-"}</div>
              </button>
            ))}
          </div>
        </PageSection>

        <PageSection title={detail?.name ?? "模板详情"}>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">加载中...</div>
          ) : detail ? (
            <div className="space-y-6">
              <div className="rounded-md border p-4">
                <div className="mb-2 text-sm text-muted-foreground">模板标识（内部代码）</div>
                <div className="font-mono text-sm">{detail.slug}</div>
                <div className="mt-3 text-sm text-muted-foreground">代码引用（内部函数）</div>
                <div className="text-sm">{detail.codeRef ?? "-"}</div>
                <div className="mt-3 text-sm text-muted-foreground">描述</div>
                <div className="text-sm">{detail.description ?? "-"}</div>
              </div>

              <div className="rounded-md border p-4">
                <div className="mb-3 text-sm font-medium">运行时占位符</div>
                {templateMetadata ? (
                  <div className="space-y-3">
                    {templateMetadata.placeholders.map((placeholder) => (
                      <div key={placeholder.key} className="rounded-md bg-muted/30 p-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{`{${placeholder.key}}`}</Badge>
                          <span className="text-sm font-medium">{placeholder.label}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{placeholder.description}</div>
                        <pre className="mt-2 max-h-28 overflow-auto rounded-md bg-background p-2 text-xs whitespace-pre-wrap">{placeholder.example}</pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">当前模板未注册占位符说明。</div>
                )}
              </div>

              <div className="rounded-md border p-4">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="text-sm font-medium">版本对比</div>
                  <Select value={compareA} onValueChange={setCompareA}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="选择版本 A" /></SelectTrigger>
                    <SelectContent>
                      {versions.map((version) => (
                        <SelectItem key={version.id} value={version.id}>v{version.versionNo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={compareB} onValueChange={setCompareB}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="选择版本 B" /></SelectTrigger>
                    <SelectContent>
                      {versions.map((version) => (
                        <SelectItem key={version.id} value={version.id}>v{version.versionNo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => void handleDiff()} disabled={!compareA || !compareB}>
                    <GitCompareArrows className="mr-1 h-4 w-4" />
                    对比
                  </Button>
                </div>

                {diffData ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div>
                      <div className="mb-2 text-sm font-medium">v{diffData.v1.versionNo}</div>
                      <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{diffData.v1.systemPrompt}{"\n\n"}{diffData.v1.userPrompt}</pre>
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-medium">v{diffData.v2.versionNo}</div>
                      <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{diffData.v2.systemPrompt}{"\n\n"}{diffData.v2.userPrompt}</pre>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">版本</TableHead>
                      <TableHead className="w-28">书籍类型</TableHead>
                      <TableHead>变更说明</TableHead>
                      <TableHead className="w-24">基线</TableHead>
                      <TableHead className="w-32">状态</TableHead>
                      <TableHead className="w-44">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versions.map((version) => (
                      <TableRow key={version.id}>
                        <TableCell>v{version.versionNo}</TableCell>
                        <TableCell>{version.genreKey ?? "通用"}</TableCell>
                        <TableCell>{version.changeNote ?? "-"}</TableCell>
                        <TableCell>{version.isBaseline ? "是" : "否"}</TableCell>
                        <TableCell>
                          <Badge variant={activeVersionId === version.id ? "success" : "secondary"}>
                            {activeVersionId === version.id ? "生效中" : "历史版本"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => void handlePreview(version.id)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => void handleActivate(version.id)} disabled={activeVersionId === version.id}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">暂无模板</div>
          )}
        </PageSection>
      </div>

      <PromptVersionDialog
        open={versionDialogOpen}
        slug={selectedSlug}
        metadata={templateMetadata}
        onOpenChange={setVersionDialogOpen}
        onSaved={loadTemplates}
      />

      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>提示词预览</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 xl:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-medium">系统提示词</div>
              <pre className="max-h-105 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{previewData?.systemPrompt ?? ""}</pre>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">用户提示词</div>
              <pre className="max-h-105 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{previewData?.userPrompt ?? ""}</pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function PromptVersionDialog({
  open,
  slug,
  metadata,
  onOpenChange,
  onSaved
}: {
  open        : boolean;
  slug        : string;
  metadata    : PromptTemplateMetadataItem | null;
  onOpenChange: (open: boolean) => void;
  onSaved     : () => Promise<void>;
}) {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [genreKey, setGenreKey] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [isBaseline, setIsBaseline] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setSystemPrompt("");
    setUserPrompt("");
    setGenreKey("");
    setChangeNote("");
    setIsBaseline(false);
  }, [open]);

  async function handleSubmit() {
    if (!slug) return;
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
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast({ title: "创建失败", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>新建模板版本</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {metadata ? (
            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">可用占位符</div>
              <div className="flex flex-wrap gap-2">
                {metadata.placeholders.map((placeholder) => (
                  <Badge key={placeholder.key} variant="outline">{`{${placeholder.key}}`}</Badge>
                ))}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                使用上面的占位符保持模板可复用。保存后可点击“预览”查看实际渲染结果。
              </div>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label>书籍类型覆盖（可选）</Label>
            <Input value={genreKey} onChange={(event) => setGenreKey(event.target.value)} placeholder="例如：历史演义" />
          </div>
          <div className="grid gap-2">
            <Label>系统提示词</Label>
            <Textarea rows={8} value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>用户提示词</Label>
            <Textarea rows={10} value={userPrompt} onChange={(event) => setUserPrompt(event.target.value)} />
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || !systemPrompt.trim() || !userPrompt.trim()}>
            {saving ? "保存中..." : "保存版本"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
