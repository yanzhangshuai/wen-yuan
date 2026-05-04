"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Search, Sparkles, Trash2, WandSparkles, X } from "lucide-react";

import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { BatchActionControls } from "@/app/admin/knowledge-base/batch-action-controls";
import {
  GENERIC_TITLE_TIER_OPTIONS,
  getGenericTitleTierLabel
} from "@/lib/knowledge-presentation";
import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import {
  batchGenericTitleAction,
  deleteGenericTitle,
  fetchGenericTitles,
  testGenericTitle,
  type GenericTitleItem,
  type GenericTitleTestResult
} from "@/lib/services/title-filters";
import { GenericTitleForm } from "./_components/generic-title-form";
import { GenericTitleGeneratorPanel } from "./_components/generic-title-generator-panel";

type TierFilter = "all" | "SAFETY" | "DEFAULT" | "RELATIONAL";

function genericTitleTestResultLabel(result: string): string {
  switch (result) {
    case "generic"  :
      return "按泛称处理";
    case "exempt"   :
      return "已豁免";
    case "not_found":
      return "未命中";
    default         :
      return result;
  }
}

export default function TitleFiltersPage() {
  const [items, setItems]                 = useState<GenericTitleItem[]>([]);
  const [bookTypes, setBookTypes]         = useState<BookTypeItem[]>([]);
  const [loading, setLoading]             = useState(true);
  const [query, setQuery]                 = useState("");
  const [tier, setTier]                   = useState<TierFilter>("all");
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget]   = useState<GenericTitleItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [testTitle, setTestTitle]         = useState("");
  const [testGenre, setTestGenre]         = useState("");
  const [testResult, setTestResult]       = useState<GenericTitleTestResult | null>(null);
  const [creating, setCreating]           = useState(false);
  const [generating, setGenerating]       = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [genericTitleItems, bookTypeItems] = await Promise.all([
        fetchGenericTitles({
          tier: tier === "all" ? undefined : tier,
          q   : query || undefined
        }),
        fetchBookTypes({ active: true })
      ]);
      setItems(genericTitleItems);
      setBookTypes(bookTypeItems);
    } catch (error) {
      toast({ title: "加载失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [query, tier, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelected((previous) => new Set(items.filter((item) => previous.has(item.id)).map((item) => item.id)));
  }, [items]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allSelected = items.length > 0 && selected.size === items.length;
  const partiallySelected = selected.size > 0 && !allSelected;

  function toggleSelect(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((previous) => {
      if (items.length === 0 || previous.size === items.length) return new Set();
      return new Set(items.map((item) => item.id));
    });
  }

  async function runBatchAction(
    action: Parameters<typeof batchGenericTitleAction>[0],
    successTitle: string
  ) {
    try {
      const result = await batchGenericTitleAction(action);
      toast({
        title      : successTitle,
        description: `已处理 ${result.count} 条称谓。`
      });
      setSelected(new Set());
      await load();
    } catch (error) {
      toast({ title: "批量操作失败", description: String(error), variant: "destructive" });
      throw error;
    }
  }

  async function handleDeleteConfirmed(item: GenericTitleItem) {
    setDeletePending(true);
    try {
      await deleteGenericTitle(item.id);
      toast({ title: "删除成功" });
      setDeleteTarget(null);
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(item.id);
        return next;
      });
      await load();
    } catch (error) {
      toast({ title: "删除失败", description: String(error), variant: "destructive" });
    } finally {
      setDeletePending(false);
    }
  }

  async function handleTest() {
    if (!testTitle.trim()) return;
    try {
      const result = await testGenericTitle(testTitle.trim(), testGenre.trim() || undefined);
      setTestResult(result);
    } catch (error) {
      toast({ title: "测试失败", description: String(error), variant: "destructive" });
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="泛化称谓"
        description="维护安全泛称、默认泛称词表，并按书籍类型配置豁免规则。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库",   href: "/admin/knowledge-base" },
          { label: "泛化称谓" }
        ]}
      >
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setGenerating(true)} disabled={generating}>
            <Sparkles className="mr-1 h-4 w-4" />
            模型生成
          </Button>
          <Button type="button" size="sm" onClick={() => setCreating(true)} disabled={creating}>
            <Plus className="mr-1 h-4 w-4" />
            新增称谓
          </Button>
        </div>
      </PageHeader>

      {creating ? (
        <PageSection>
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">新增泛化称谓</h3>
                <div className="mt-1 text-xs text-muted-foreground">录入新的泛化称谓词条。</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="关闭"
                onClick={() => setCreating(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <GenericTitleForm
              initial={null}
              redirectTo="/admin/knowledge-base/title-filters"
              onSuccess={() => { setCreating(false); void load(); }}
              onCancel={() => setCreating(false)}
            />
          </div>
        </PageSection>
      ) : null}

      {generating ? (
        <PageSection>
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">模型生成泛化称谓候选</h3>
                <div className="mt-1 text-xs text-muted-foreground">调用大模型生成候选称谓，预审通过后再写入词库。</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="关闭"
                onClick={() => setGenerating(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <GenericTitleGeneratorPanel
              onClose={() => setGenerating(false)}
              onSaved={() => { setGenerating(false); void load(); }}
            />
          </div>
        </PageSection>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <PageSection>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索称谓" />
            </div>
            <Select value={tier} onValueChange={(value) => setTier(value as TierFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部层级</SelectItem>
                {GENERIC_TITLE_TIER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={() => void load()}>刷新</Button>
          </div>

          <BatchActionControls
            selectedCount={selected.size}
            bookTypes={bookTypes.map((bookType) => ({ id: bookType.id, name: bookType.name }))}
            onEnable={() => runBatchAction({ action: "enable", ids: selectedIds }, "已批量启用")}
            onDisable={() => runBatchAction({ action: "disable", ids: selectedIds }, "已批量停用")}
            onDelete={() => runBatchAction({ action: "delete", ids: selectedIds }, "已批量删除")}
            onClear={() => setSelected(new Set())}
            onChangeBookType={(bookTypeId) => runBatchAction(
              { action: "changeBookType", ids: selectedIds, bookTypeId },
              "已更新豁免书籍类型"
            )}
            changeActionLabel="批量设置豁免书籍类型"
            changeDialogTitle="批量设置豁免书籍类型"
            bookTypeFieldLabel="豁免书籍类型"
            globalBookTypeLabel="无豁免"
          />

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">加载中...</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected ? true : partiallySelected ? "indeterminate" : false}
                        aria-label="全选泛化称谓"
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-32">称谓</TableHead>
                    <TableHead className="w-32">层级</TableHead>
                    <TableHead>书籍类型豁免</TableHead>
                    <TableHead>说明</TableHead>
                    <TableHead className="w-20">状态</TableHead>
                    <TableHead className="w-28">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(item.id)}
                          aria-label={`选择称谓 ${item.title}`}
                          onCheckedChange={() => toggleSelect(item.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell>
                        <Badge variant={item.tier === "SAFETY" ? "destructive" : item.tier === "RELATIONAL" ? "outline" : "secondary"}>
                          {getGenericTitleTierLabel(item.tier)}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.exemptInGenres?.length ? item.exemptInGenres.join("、") : "-"}</TableCell>
                      <TableCell className="max-w-65 truncate">{item.description ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={item.isActive ? "success" : "secondary"}>{item.isActive ? "启用" : "停用"}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`编辑称谓 ${item.title}`} asChild>
                            <Link href={`/admin/knowledge-base/title-filters/${item.id}/edit`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`删除称谓 ${item.title}`}
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </PageSection>

        <PageSection title="匹配测试">
          <div className="space-y-4 rounded-md border p-4">
            <div className="space-y-2">
              <Label>称谓</Label>
              <Input value={testTitle} onChange={(event) => setTestTitle(event.target.value)} placeholder="例如：丞相 / 老爷" />
            </div>
            <div className="space-y-2">
              <Label>书籍类型键（可选）</Label>
              <Input value={testGenre} onChange={(event) => setTestGenre(event.target.value)} placeholder="例如：历史演义" />
            </div>
            <Button type="button" className="w-full" onClick={() => void handleTest()}>
              <WandSparkles className="mr-1 h-4 w-4" />
              执行测试
            </Button>
            {testResult ? (
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div>结果：{genericTitleTestResultLabel(testResult.result)}</div>
                <div>层级：{testResult.tier ? getGenericTitleTierLabel(testResult.tier) : "-"}</div>
                <div>原因：{testResult.reason}</div>
              </div>
            ) : null}
          </div>
        </PageSection>
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open && !deletePending) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除称谓</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除称谓「{deleteTarget?.title ?? ""}」吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={deletePending} onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletePending || !deleteTarget}
              onClick={() => { if (deleteTarget) void handleDeleteConfirmed(deleteTarget); }}
            >
              {deletePending ? "删除中..." : "删除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
