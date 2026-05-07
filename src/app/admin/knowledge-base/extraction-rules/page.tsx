"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";

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
  batchExtractionRuleAction,
  createExtractionRule,
  deleteExtractionRule,
  fetchExtractionRules,
  type ExtractionRuleItem
} from "@/lib/services/extraction-rules";

const RULE_TYPE_OPTIONS = [
  { value: "all", label: "全部类型" },
  { value: "HARD_BLOCK_SUFFIX", label: "HARD_BLOCK_SUFFIX" },
  { value: "SOFT_BLOCK_SUFFIX", label: "SOFT_BLOCK_SUFFIX" },
  { value: "TITLE_STEM", label: "TITLE_STEM" },
  { value: "POSITION_STEM", label: "POSITION_STEM" },
  { value: "ENTITY", label: "ENTITY" },
  { value: "RELATIONSHIP", label: "RELATIONSHIP" }
] as const;

function ruleTypeBadgeVariant(ruleType: string): "default" | "secondary" | "outline" {
  if (ruleType === "ENTITY" || ruleType === "RELATIONSHIP") return "secondary";
  return "outline";
}

export default function ExtractionRulesPage() {
  const [items, setItems] = useState<ExtractionRuleItem[]>([]);
  const [bookTypes, setBookTypes] = useState<BookTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [ruleTypeFilter, setRuleTypeFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ExtractionRuleItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formRuleType, setFormRuleType] = useState("ENTITY");
  const [formContent, setFormContent] = useState("");
  const [formBookTypeId, setFormBookTypeId] = useState("");
  const [formNote, setFormNote] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [ruleItems, bookTypeItems] = await Promise.all([
        fetchExtractionRules({
          ruleType: ruleTypeFilter === "all" ? undefined : ruleTypeFilter,
          active  : undefined
        }),
        fetchBookTypes({ active: true })
      ]);
      setItems(ruleItems);
      setBookTypes(bookTypeItems);
    } catch (error) {
      toast({ title: "加载失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [ruleTypeFilter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    if (!query) return items;
    const lower = query.toLowerCase();
    return items.filter((item) => item.content.toLowerCase().includes(lower));
  }, [items, query]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allSelected = filteredItems.length > 0 && selected.size === filteredItems.length;
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
      if (filteredItems.length === 0 || previous.size === filteredItems.length) return new Set();
      return new Set(filteredItems.map((item) => item.id));
    });
  }

  async function runBatchAction(
    action: Parameters<typeof batchExtractionRuleAction>[0],
    successTitle: string
  ) {
    try {
      const result = await batchExtractionRuleAction(action);
      toast({ title: successTitle, description: `已处理 ${result.count} 条规则。` });
      setSelected(new Set());
      await load();
    } catch (error) {
      toast({ title: "批量操作失败", description: String(error), variant: "destructive" });
      throw error;
    }
  }

  async function handleCreate() {
    if (!formContent.trim()) return;
    try {
      await createExtractionRule({
        ruleType  : formRuleType,
        content   : formContent.trim(),
        bookTypeId: formBookTypeId || undefined,
        changeNote: formNote || undefined
      });
      toast({ title: "创建成功" });
      setCreating(false);
      setFormContent("");
      setFormNote("");
      await load();
    } catch (error) {
      toast({ title: "创建失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleDeleteConfirmed(item: ExtractionRuleItem) {
    setDeletePending(true);
    try {
      await deleteExtractionRule(item.id);
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

  return (
    <PageContainer>
      <PageHeader
        title="提取规则"
        description="统一管理 NER 词典规则（后缀阻断、词干）与实体/关系 Prompt 提取规则。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "提取规则" }
        ]}
      >
        <Button type="button" size="sm" onClick={() => setCreating(true)} disabled={creating}>
          <Plus className="mr-1 h-4 w-4" />
          新增规则
        </Button>
      </PageHeader>

      {creating ? (
        <PageSection>
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">新增提取规则</h3>
                <div className="mt-1 text-xs text-muted-foreground">录入新的提取规则词条。</div>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="关闭" onClick={() => setCreating(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>规则类型</Label>
                  <Select value={formRuleType} onValueChange={setFormRuleType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RULE_TYPE_OPTIONS.filter((opt) => opt.value !== "all").map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>适用书籍类型</Label>
                  <Select value={formBookTypeId} onValueChange={setFormBookTypeId}>
                    <SelectTrigger><SelectValue placeholder="通用（不限）" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">通用（不限）</SelectItem>
                      {bookTypes.map((bt) => (
                        <SelectItem key={bt.id} value={bt.id}>{bt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>规则内容</Label>
                <Textarea rows={3} value={formContent} onChange={(event) => setFormContent(event.target.value)} placeholder="输入规则内容" />
              </div>
              <div className="space-y-2">
                <Label>变更说明</Label>
                <Input value={formNote} onChange={(event) => setFormNote(event.target.value)} placeholder="可选" />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setCreating(false)}>取消</Button>
                <Button type="button" onClick={() => void handleCreate()} disabled={!formContent.trim()}>创建</Button>
              </div>
            </div>
          </div>
        </PageSection>
      ) : null}

      <div className="grid gap-6">
        <PageSection>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_200px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索规则内容" />
            </div>
            <Select value={ruleTypeFilter} onValueChange={(value) => setRuleTypeFilter(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={() => void load()}>刷新</Button>
          </div>

          <div className="mb-4 text-sm text-muted-foreground">
            共 {filteredItems.length} 条规则
          </div>

          <BatchActionControls
            selectedCount={selected.size}
            bookTypes={bookTypes.map((bt) => ({ id: bt.id, name: bt.name }))}
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
                        aria-label="全选规则"
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-44">规则类型</TableHead>
                    <TableHead>规则内容</TableHead>
                    <TableHead className="w-28">适用题材</TableHead>
                    <TableHead className="w-16">排序</TableHead>
                    <TableHead className="w-16">状态</TableHead>
                    <TableHead className="w-20">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(item.id)}
                          aria-label={`选择规则 ${item.id}`}
                          onCheckedChange={() => toggleSelect(item.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={ruleTypeBadgeVariant(item.ruleType)}>{item.ruleType}</Badge>
                      </TableCell>
                      <TableCell className="max-w-96 truncate">{item.content}</TableCell>
                      <TableCell>{item.bookType?.name ?? "通用"}</TableCell>
                      <TableCell>{item.sortOrder}</TableCell>
                      <TableCell>
                        <Badge variant={item.isActive ? "success" : "secondary"}>
                          {item.isActive ? "启用" : "停用"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="编辑规则" asChild>
                            {/* TODO: link to edit page */}
                            <span><Pencil className="h-3.5 w-3.5" /></span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="删除规则"
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
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open && !deletePending) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除提取规则</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除规则「{deleteTarget?.content?.slice(0, 50) ?? ""}」吗？此操作不可恢复。
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
