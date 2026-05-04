"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, GitCompareArrows, Plus, RotateCcw, X } from "lucide-react";

import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  getPromptTemplateMetadata
} from "@/lib/prompt-template-metadata";
import {
  activatePromptVersion,
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
  const searchParams = useSearchParams();
  const initialSlug  = searchParams?.get("slug") ?? "";

  const [templates,    setTemplates]    = useState<PromptTemplateListItem[]>([]);
  const [selectedSlug, setSelectedSlug] = useState(initialSlug);
  const [detail,       setDetail]       = useState<PromptTemplateItem | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [previewData,  setPreviewData]  = useState<PromptPreviewResult | null>(null);
  const [diffData,     setDiffData]     = useState<PromptDiffResult | null>(null);
  const [compareA,     setCompareA]     = useState("");
  const [compareB,     setCompareB]     = useState("");
  const { toast } = useToast();

  const templateMetadata = useMemo(() => {
    if (!selectedSlug) return null;
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
        setPreviewData(null);
        setDiffData(null);
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
          { label: "知识库",   href: "/admin/knowledge-base" },
          { label: "提示词模板" }
        ]}
      >
        <Button asChild size="sm" disabled={!selectedSlug}>
          <Link href={selectedSlug ? `/admin/knowledge-base/prompt-templates/${encodeURIComponent(selectedSlug)}/new-version` : "#"}>
            <Plus className="mr-1 h-4 w-4" />
            新建版本
          </Link>
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

              {previewData ? (
                <div className="rounded-md border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-medium">提示词预览</div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewData(null)} aria-label="关闭预览">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div>
                      <div className="mb-2 text-sm font-medium">系统提示词</div>
                      <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{previewData.systemPrompt}</pre>
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-medium">用户提示词</div>
                      <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{previewData.userPrompt}</pre>
                    </div>
                  </div>
                </div>
              ) : null}

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
                            <Button variant="ghost" size="sm" onClick={() => void handlePreview(version.id)} aria-label="预览">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => void handleActivate(version.id)} disabled={activeVersionId === version.id} aria-label="激活">
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
    </PageContainer>
  );
}
