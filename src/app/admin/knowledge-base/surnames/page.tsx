"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Search, Sparkles, Trash2, Upload, WandSparkles, X } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { BatchActionControls } from "@/app/admin/knowledge-base/batch-action-controls";
import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import {
  batchSurnameAction,
  deleteSurname,
  fetchSurnames,
  importSurnames,
  testSurnameExtraction,
  type SurnameItem,
  type SurnameTestResult
} from "@/lib/services/surnames";
import { SurnameForm } from "./_components/surname-form";

type CompoundFilter = "all" | "single" | "compound";

function surnameMatchTypeLabel(matchType: string): string {
  switch (matchType) {
    case "compound" :
      return "复姓命中";
    case "single"   :
      return "单姓命中";
    case "not_found":
      return "未命中";
    default         :
      return matchType;
  }
}

export default function SurnamesPage() {
  const [items, setItems]                   = useState<SurnameItem[]>([]);
  const [bookTypes, setBookTypes]           = useState<BookTypeItem[]>([]);
  const [loading, setLoading]               = useState(true);
  const [query, setQuery]                   = useState("");
  const [compoundFilter, setCompoundFilter] = useState<CompoundFilter>("all");
  const [selected, setSelected]             = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget]     = useState<SurnameItem | null>(null);
  const [deletePending, setDeletePending]   = useState(false);
  const [importOpen, setImportOpen]         = useState(false);
  const [importText, setImportText]         = useState("");
  const [testName, setTestName]             = useState("");
  const [testResult, setTestResult]         = useState<SurnameTestResult | null>(null);
  const [creating, setCreating]             = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [surnameItems, bookTypeItems] = await Promise.all([
        fetchSurnames({
          q       : query || undefined,
          compound: compoundFilter === "all" ? undefined : compoundFilter === "compound"
        }),
        fetchBookTypes({ active: true })
      ]);
      setItems(surnameItems);
      setBookTypes(bookTypeItems);
    } catch (error) {
      toast({ title: "加载失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [compoundFilter, query, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelected((previous) => new Set(items.filter((item) => previous.has(item.id)).map((item) => item.id)));
  }, [items]);

  const compoundSummary = useMemo(() => {
    const compoundCount = items.filter((item) => item.isCompound).length;
    return {
      total   : items.length,
      compound: compoundCount,
      single  : items.length - compoundCount
    };
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
    action: Parameters<typeof batchSurnameAction>[0],
    successTitle: string
  ) {
    try {
      const result = await batchSurnameAction(action);
      toast({
        title      : successTitle,
        description: `已处理 ${result.count} 条姓氏。`
      });
      setSelected(new Set());
      await load();
    } catch (error) {
      toast({ title: "批量操作失败", description: String(error), variant: "destructive" });
      throw error;
    }
  }

  async function handleDeleteConfirmed(item: SurnameItem) {
    setDeletePending(true);
    try {
      await deleteSurname(item.id);
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

  async function handleImport() {
    if (!importText.trim()) return;
    try {
      const result = await importSurnames(importText);
      toast({
        title      : "导入完成",
        description: `共解析 ${result.total} 条，新增 ${result.created} 条，跳过 ${result.skipped} 条。`
      });
      setImportOpen(false);
      setImportText("");
      await load();
    } catch (error) {
      toast({ title: "导入失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleTest() {
    if (!testName.trim()) return;
    try {
      const result = await testSurnameExtraction(testName.trim());
      setTestResult(result);
    } catch (error) {
      toast({ title: "测试失败", description: String(error), variant: "destructive" });
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="姓氏词库"
        description="维护运行时姓氏识别词表，优先覆盖复姓与特定书籍类型下的高频姓氏。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库",   href: "/admin/knowledge-base" },
          { label: "姓氏词库" }
        ]}
      >
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/admin/knowledge-base/surnames/generate">
              <Sparkles className="mr-1 h-4 w-4" />
              模型生成
            </Link>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen((value) => !value)}>
            <Upload className="mr-1 h-4 w-4" />
            批量导入
          </Button>
          <Button type="button" size="sm" onClick={() => setCreating(true)} disabled={creating}>
            <Plus className="mr-1 h-4 w-4" />
            新增姓氏
          </Button>
        </div>
      </PageHeader>

      {creating ? (
        <PageSection>
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">新增姓氏</h3>
                <div className="mt-1 text-xs text-muted-foreground">录入新的姓氏词条。</div>
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
            <SurnameForm
              initial={null}
              bookTypes={bookTypes}
              redirectTo="/admin/knowledge-base/surnames"
              onSuccess={() => { setCreating(false); void load(); }}
              onCancel={() => setCreating(false)}
            />
          </div>
        </PageSection>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <PageSection>
          {importOpen ? (
            <div className="mb-4 space-y-3 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">批量导入姓氏</div>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="关闭导入" onClick={() => { setImportOpen(false); setImportText(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                <Label>输入内容</Label>
                <Textarea
                  rows={6}
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder="支持用换行、空格、中文逗号或顿号分隔，例如：欧阳、司马、范、贾"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => { setImportOpen(false); setImportText(""); }}>取消</Button>
                <Button type="button" onClick={() => void handleImport()} disabled={!importText.trim()}>开始导入</Button>
              </div>
            </div>
          ) : null}

          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓氏" />
            </div>
            <Select value={compoundFilter} onValueChange={(value) => setCompoundFilter(value as CompoundFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="single">仅单姓</SelectItem>
                <SelectItem value="compound">仅复姓</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={() => void load()}>刷新</Button>
          </div>

          <div className="mb-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>总计 {compoundSummary.total} 条</span>
            <span>复姓 {compoundSummary.compound} 条</span>
            <span>单姓 {compoundSummary.single} 条</span>
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
              "已更新书籍类型"
            )}
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
                        aria-label="全选姓氏"
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-28">姓氏</TableHead>
                    <TableHead className="w-24">类型</TableHead>
                    <TableHead className="w-20">优先级</TableHead>
                    <TableHead>适用题材</TableHead>
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
                          aria-label={`选择姓氏 ${item.surname}`}
                          onCheckedChange={() => toggleSelect(item.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{item.surname}</TableCell>
                      <TableCell>
                        <Badge variant={item.isCompound ? "default" : "secondary"}>
                          {item.isCompound ? "复姓" : "单姓"}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.priority}</TableCell>
                      <TableCell>{item.bookType?.name ?? "通用"}</TableCell>
                      <TableCell className="max-w-70 truncate">{item.description ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={item.isActive ? "success" : "secondary"}>
                          {item.isActive ? "启用" : "停用"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`编辑姓氏 ${item.surname}`} asChild>
                            <Link href={`/admin/knowledge-base/surnames/${item.id}/edit`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`删除姓氏 ${item.surname}`}
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

        <PageSection title="识别测试">
          <div className="space-y-4 rounded-md border p-4">
            <div className="space-y-2">
              <Label>姓名样本</Label>
              <Input value={testName} onChange={(event) => setTestName(event.target.value)} placeholder="例如：诸葛亮 / 马二先生" />
            </div>
            <Button type="button" className="w-full" onClick={() => void handleTest()}>
              <WandSparkles className="mr-1 h-4 w-4" />
              运行测试
            </Button>
            {testResult ? (
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div>输入：{testResult.input}</div>
                <div>提取姓氏：{testResult.extractedSurname ?? "未命中"}</div>
                <div>匹配类型：{surnameMatchTypeLabel(testResult.matchType)}</div>
                <div>优先级：{testResult.priority}</div>
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
            <AlertDialogTitle>确认删除姓氏</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除姓氏「{deleteTarget?.surname ?? ""}」吗？此操作不可恢复。
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
