"use client";

import { use, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  fetchKnowledgePack,
  importEntries as importKnowledgeEntries,
  type KnowledgePackItem
} from "@/lib/services/knowledge";

import { parseImportPreview, type ImportFormat } from "../../_components/import-utils";

export default function ImportEntriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();

  const [pack, setPack]                 = useState<KnowledgePackItem | null>(null);
  const [packLoading, setPackLoading]   = useState(true);
  const [format, setFormat]             = useState<ImportFormat>("JSON");
  const [rawContent, setRawContent]     = useState("");
  const [fileName, setFileName]         = useState("");
  const [reviewStatus, setReviewStatus] = useState("PENDING");
  const [importing, setImporting]       = useState(false);

  useEffect(() => {
    fetchKnowledgePack(id)
      .then(setPack)
      .catch((error) => toast({ title: "加载知识包失败", description: String(error), variant: "destructive" }))
      .finally(() => setPackLoading(false));
  }, [id, toast]);

  const parsedPreview = useMemo(() => parseImportPreview(format, rawContent), [format, rawContent]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setFileName(file.name);
    setRawContent(await file.text());
    setFormat(file.name.toLowerCase().endsWith(".csv") ? "CSV" : "JSON");
  }

  async function handleSubmit() {
    if (!pack) {
      return;
    }
    setImporting(true);
    try {
      const result = await importKnowledgeEntries(pack.id, {
        entries    : parsedPreview.entries,
        reviewStatus,
        source     : "IMPORTED",
        auditAction: "IMPORT"
      });
      toast({ title: "导入成功", description: `已写入 ${result.count} 条。` });
      router.push(`/admin/knowledge-base/alias-packs?packId=${pack.id}`);
      router.refresh();
    } catch (error) {
      toast({ title: "导入失败", description: String(error), variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="导入知识条目"
        description={pack ? `向知识包「${pack.name}」批量导入条目。` : "向知识包批量导入条目。"}
        breadcrumbs={[
          { label: "管理后台",   href: "/admin" },
          { label: "知识库",     href: "/admin/knowledge-base" },
          { label: "别名知识包", href: "/admin/knowledge-base/alias-packs" },
          { label: pack?.name ?? "知识包", href: `/admin/knowledge-base/alias-packs?packId=${id}` },
          { label: "导入条目" }
        ]}
      />
      <PageSection>
        {packLoading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : !pack ? (
          <div className="py-12 text-center text-muted-foreground">知识包不存在或已被删除。</div>
        ) : (
          <div className="grid gap-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              目标知识包：{pack.name}
              {fileName ? ` · 当前文件：${fileName}` : ""}
            </div>

            <div className="grid gap-2">
              <Label>导入格式</Label>
              <RadioGroup className="flex gap-6" value={format} onValueChange={(value) => setFormat(value as ImportFormat)}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="JSON" id="alias-import-json" />
                  <Label htmlFor="alias-import-json">JSON</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="CSV" id="alias-import-csv" />
                  <Label htmlFor="alias-import-csv">CSV</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid gap-2">
              <Label>上传文件或粘贴内容</Label>
              <Input type="file" accept=".json,.csv,text/csv,application/json" onChange={(event) => void handleFileChange(event)} />
              <Textarea
                rows={12}
                value={rawContent}
                onChange={(event) => setRawContent(event.target.value)}
                placeholder={format === "JSON"
                  ? '{"entries":[{"canonicalName":"关羽","aliases":["关云长","云长"]}]}'
                  : 'canonicalName,aliases,entryType,notes\n关羽,"关云长|云长",CHARACTER,"蜀汉五虎将"'}
              />
            </div>

            <div className="grid gap-2 rounded-md border p-3">
              <div className="text-sm font-medium">解析预览</div>
              <div className="text-sm text-muted-foreground">
                成功解析 {parsedPreview.entries.length} 条
                {parsedPreview.errors.length > 0 ? `，${parsedPreview.errors.length} 条错误` : ""}
              </div>
              {parsedPreview.entries.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {parsedPreview.entries.slice(0, 8).map((entry) => (
                    <Badge key={entry.canonicalName} variant="secondary">{entry.canonicalName}</Badge>
                  ))}
                  {parsedPreview.entries.length > 8 ? <Badge variant="outline">+{parsedPreview.entries.length - 8}</Badge> : null}
                </div>
              ) : null}
              {parsedPreview.errors.length > 0 ? (
                <div className="space-y-1 text-xs text-destructive">
                  {parsedPreview.errors.slice(0, 6).map((error) => (
                    <div key={error} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label>导入后状态</Label>
              <RadioGroup className="grid gap-2" value={reviewStatus} onValueChange={setReviewStatus}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="PENDING" id="alias-import-pending" />
                  <Label htmlFor="alias-import-pending">待审核</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="VERIFIED" id="alias-import-verified" />
                  <Label htmlFor="alias-import-verified">直接设为已验证</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => router.push(`/admin/knowledge-base/alias-packs?packId=${pack.id}`)}>
                取消
              </Button>
              <Button type="button" onClick={() => void handleSubmit()} disabled={importing || parsedPreview.entries.length === 0}>
                {importing ? "导入中..." : `确认导入 ${parsedPreview.entries.length} 条`}
              </Button>
            </div>
          </div>
        )}
      </PageSection>
    </PageContainer>
  );
}
