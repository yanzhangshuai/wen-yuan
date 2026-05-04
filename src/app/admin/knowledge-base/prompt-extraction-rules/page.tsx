"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";

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
import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import {
  batchPromptExtractionRuleAction,
  deletePromptExtractionRule,
  fetchPromptExtractionRules,
  previewCombinedPromptRules,
  reorderPromptExtractionRules,
  type CombinedPromptRulesPreview,
  type PromptExtractionRuleItem,
  type PromptRuleType
} from "@/lib/services/prompt-extraction-rules";
import { PromptExtractionRuleForm } from "./_components/prompt-extraction-rule-form";

const ALL_BOOK_TYPES_VALUE = "__ALL_BOOK_TYPES__";

const RULE_TYPE_OPTIONS: Array<{ value: PromptRuleType; label: string }> = [
  { value: "ENTITY",       label: "实体规则" },
  { value: "RELATIONSHIP", label: "关系规则" }
];

function getRuleTypeLabel(ruleType: PromptRuleType) {
  return RULE_TYPE_OPTIONS.find((option) => option.value === ruleType)?.label ?? ruleType;
}

function parsePromptRuleType(value: string): PromptRuleType {
  return RULE_TYPE_OPTIONS.find((option) => option.value === value)?.value ?? "ENTITY";
}

function getBookTypeLabel(bookTypes: BookTypeItem[], bookTypeId: string | null) {
  if (!bookTypeId) return "通用";
  return bookTypes.find((bookType) => bookType.id === bookTypeId)?.name ?? bookTypeId;
}

export default function PromptExtractionRulesPage() {
  const [items, setItems]                     = useState<PromptExtractionRuleItem[]>([]);
  const [bookTypes, setBookTypes]             = useState<BookTypeItem[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [ruleType, setRuleType]               = useState<PromptRuleType>("ENTITY");
  const [bookTypeFilter, setBookTypeFilter]   = useState(ALL_BOOK_TYPES_VALUE);
  const [previewData, setPreviewData]         = useState<CombinedPromptRulesPreview | null>(null);
  const [selected, setSelected]               = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget]       = useState<PromptExtractionRuleItem | null>(null);
  const [deletePending, setDeletePending]     = useState(false);
  const [creating, setCreating]               = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [ruleItems, bookTypeItems] = await Promise.all([
        fetchPromptExtractionRules({
          ruleType,
          bookTypeId: bookTypeFilter !== ALL_BOOK_TYPES_VALUE ? bookTypeFilter : undefined
        }),
        fetchBookTypes({ active: true })
      ]);
      setItems(ruleItems.sort((left, right) => left.sortOrder - right.sortOrder));
      setBookTypes(bookTypeItems);
    } catch (error) {
      toast({ title: "加载失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [bookTypeFilter, ruleType, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelected((previous) => new Set(items.filter((item) => previous.has(item.id)).map((item) => item.id)));
  }, [items]);

  const orderedIds = useMemo(() => items.map((item) => item.id), [items]);
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allSelected = items.length > 0 && selected.size === items.length;
  const partiallySelected = selected.size > 0 && !allSelected;

  function moveItem(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const nextItems = [...items];
    const [movedItem] = nextItems.splice(index, 1);
    nextItems.splice(targetIndex, 0, movedItem);
    setItems(nextItems.map((item, itemIndex) => ({ ...item, sortOrder: itemIndex + 1 })));
  }

  async function persistOrder() {
    try {
      await reorderPromptExtractionRules(orderedIds);
      toast({ title: "排序已保存" });
      await load();
    } catch (error) {
      toast({ title: "排序保存失败", description: String(error), variant: "destructive" });
    }
  }

  async function handlePreview() {
    try {
      const data = await previewCombinedPromptRules(
        ruleType,
        bookTypeFilter !== ALL_BOOK_TYPES_VALUE ? bookTypeFilter : undefined
      );
      setPreviewData(data);
    } catch (error) {
      toast({ title: "预览失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleDelete(item: PromptExtractionRuleItem) {
    setDeletePending(true);
    try {
      await deletePromptExtractionRule(item.id);
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
    action: Parameters<typeof batchPromptExtractionRuleAction>[0],
    successTitle: string
  ) {
    try {
      const result = await batchPromptExtractionRuleAction(action);
      toast({ title: successTitle, description: `已处理 ${result.count} 条 Prompt 规则。` });
      setSelected(new Set());
      await load();
    } catch (error) {
      toast({ title: "批量操作失败", description: String(error), variant: "destructive" });
      throw error;
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Prompt 提取规则"
        description="维护实体和关系抽取时拼接进 Prompt 的规则列表。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库",   href: "/admin/knowledge-base" },
          { label: "Prompt 提取规则" }
        ]}
      >
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/admin/knowledge-base/prompt-extraction-rules/generate">
              <Sparkles className="mr-1 h-4 w-4" />
              模型生成
            </Link>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void handlePreview()}>
            <Eye className="mr-1 h-4 w-4" />
            组合预览
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void persistOrder()} disabled={items.length === 0}>
            保存排序
          </Button>
          <Button type="button" size="sm" onClick={() => setCreating(true)} disabled={creating}>
            <Plus className="mr-1 h-4 w-4" />
            新增规则
          </Button>
        </div>
      </PageHeader>

      {creating ? (
        <PageSection>
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">新增 Prompt 提取规则</h3>
                <div className="mt-1 text-xs text-muted-foreground">当前类型：{getRuleTypeLabel(ruleType)}</div>
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
            <PromptExtractionRuleForm
              initial={null}
              defaultRuleType={ruleType}
              bookTypes={bookTypes}
              redirectTo={`/admin/knowledge-base/prompt-extraction-rules?ruleType=${ruleType}`}
              onSuccess={() => { setCreating(false); void load(); }}
              onCancel={() => setCreating(false)}
            />
          </div>
        </PageSection>
      ) : null}

      <PageSection>
        <div className="mb-4 grid gap-3 md:grid-cols-[180px_240px_auto]">
          <Select value={ruleType} onValueChange={(value) => setRuleType(parsePromptRuleType(value))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RULE_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={bookTypeFilter} onValueChange={setBookTypeFilter}>
            <SelectTrigger><SelectValue placeholder="全部书籍类型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BOOK_TYPES_VALUE}>全部书籍类型</SelectItem>
              {bookTypes.map((bookType) => (
                <SelectItem key={bookType.id} value={bookType.id}>{bookType.name}</SelectItem>
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
            "已更新书籍类型"
          )}
        />

        {previewData ? (
          <div className="mb-4 space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">规则组合预览</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  当前共 {previewData.count} 条规则，类型：{getRuleTypeLabel(previewData.ruleType)}
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setPreviewData(null)} aria-label="关闭预览">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <pre className="max-h-[460px] overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
              {previewData.combined ?? ""}
            </pre>
          </div>
        ) : null}

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
                      aria-label="全选 Prompt 提取规则"
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-24">排序</TableHead>
                  <TableHead className="w-32">规则类型</TableHead>
                  <TableHead>规则内容</TableHead>
                  <TableHead className="w-36">书籍类型</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead className="w-28">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(item.id)}
                        aria-label={`选择规则 ${item.content}`}
                        onCheckedChange={() => toggleSelect(item.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span>{item.sortOrder}</span>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="上移规则" onClick={() => moveItem(index, -1)} disabled={index === 0}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="下移规则" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>{getRuleTypeLabel(item.ruleType)}</TableCell>
                    <TableCell className="whitespace-pre-wrap">{item.content}</TableCell>
                    <TableCell className="text-muted-foreground">{getBookTypeLabel(bookTypes, item.bookTypeId)}</TableCell>
                    <TableCell>
                      <Badge variant={item.isActive ? "success" : "secondary"}>{item.isActive ? "启用" : "停用"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="编辑规则" asChild>
                          <Link href={`/admin/knowledge-base/prompt-extraction-rules/${item.id}/edit`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="删除规则" onClick={() => setDeleteTarget(item)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">暂无规则</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </PageSection>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open && !deletePending) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除 Prompt 规则</AlertDialogTitle>
            <AlertDialogDescription>确定删除该 Prompt 规则吗？此操作不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={deletePending} onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletePending || !deleteTarget}
              onClick={() => { if (deleteTarget) void handleDelete(deleteTarget); }}
            >
              {deletePending ? "删除中..." : "删除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
