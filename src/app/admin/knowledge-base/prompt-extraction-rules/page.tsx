"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Trash2 } from "lucide-react";

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
import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import {
  createPromptExtractionRule,
  deletePromptExtractionRule,
  fetchPromptExtractionRules,
  previewCombinedPromptRules,
  reorderPromptExtractionRules,
  updatePromptExtractionRule,
  type CombinedPromptRulesPreview,
  type PromptExtractionRuleItem,
  type PromptRuleType
} from "@/lib/services/prompt-extraction-rules";

const ALL_BOOK_TYPES_VALUE = "__ALL_BOOK_TYPES__";
const GLOBAL_BOOK_TYPE_VALUE = "__GLOBAL_BOOK_TYPE__";

const RULE_TYPE_OPTIONS: Array<{ value: PromptRuleType; label: string }> = [
  { value: "ENTITY", label: "实体规则" },
  { value: "RELATIONSHIP", label: "关系规则" }
];

function getRuleTypeLabel(ruleType: PromptRuleType) {
  return RULE_TYPE_OPTIONS.find((option) => option.value === ruleType)?.label ?? ruleType;
}

function parsePromptRuleType(value: string): PromptRuleType {
  return RULE_TYPE_OPTIONS.find((option) => option.value === value)?.value ?? "ENTITY";
}

function getBookTypeLabel(bookTypes: BookTypeItem[], bookTypeId: string | null) {
  if (!bookTypeId) {
    return "通用";
  }

  return bookTypes.find((bookType) => bookType.id === bookTypeId)?.name ?? bookTypeId;
}

export default function PromptExtractionRulesPage() {
  const [items, setItems] = useState<PromptExtractionRuleItem[]>([]);
  const [bookTypes, setBookTypes] = useState<BookTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ruleType, setRuleType] = useState<PromptRuleType>("ENTITY");
  const [bookTypeFilter, setBookTypeFilter] = useState(ALL_BOOK_TYPES_VALUE);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<CombinedPromptRulesPreview | null>(null);
  const [editing, setEditing] = useState<PromptExtractionRuleItem | null>(null);
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

  const orderedIds = useMemo(() => items.map((item) => item.id), [items]);

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
      setPreviewOpen(true);
    } catch (error) {
      toast({ title: "预览失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleDelete(item: PromptExtractionRuleItem) {
    if (!confirm("确定删除该 Prompt 规则吗？")) return;

    try {
      await deletePromptExtractionRule(item.id);
      toast({ title: "删除成功" });
      await load();
    } catch (error) {
      toast({ title: "删除失败", description: String(error), variant: "destructive" });
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Prompt 提取规则"
        description="维护实体和关系抽取时拼接进 Prompt 的规则列表。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "Prompt 提取规则" }
        ]}
      >
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void handlePreview()}>
            <Eye className="mr-1 h-4 w-4" />
            组合预览
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void persistOrder()} disabled={items.length === 0}>
            保存排序
          </Button>
          <Button type="button" size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" />
            新增规则
          </Button>
        </div>
      </PageHeader>

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

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
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
                      <div className="flex items-center gap-1">
                        <span>{item.sortOrder}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="上移规则"
                          onClick={() => moveItem(index, -1)}
                          disabled={index === 0}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="下移规则"
                          onClick={() => moveItem(index, 1)}
                          disabled={index === items.length - 1}
                        >
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="编辑规则"
                          onClick={() => { setEditing(item); setDialogOpen(true); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="删除规则"
                          onClick={() => void handleDelete(item)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">暂无规则</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </PageSection>

      <PromptRuleDialog
        open={dialogOpen}
        editing={editing}
        ruleType={ruleType}
        bookTypes={bookTypes}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>规则组合预览</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              当前共 {previewData?.count ?? 0} 条规则，类型：{previewData?.ruleType ? getRuleTypeLabel(previewData.ruleType) : ""}
            </div>
            <pre className="max-h-[460px] overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
              {previewData?.combined ?? ""}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function PromptRuleDialog({
  open,
  editing,
  ruleType,
  bookTypes,
  onOpenChange,
  onSaved
}: {
  open        : boolean;
  editing     : PromptExtractionRuleItem | null;
  ruleType    : PromptRuleType;
  bookTypes   : BookTypeItem[];
  onOpenChange: (open: boolean) => void;
  onSaved     : () => Promise<void>;
}) {
  const [localRuleType, setLocalRuleType] = useState<PromptRuleType>(ruleType);
  const [content, setContent] = useState("");
  const [bookTypeId, setBookTypeId] = useState(GLOBAL_BOOK_TYPE_VALUE);
  const [sortOrder, setSortOrder] = useState(1);
  const [changeNote, setChangeNote] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;

    setLocalRuleType(editing?.ruleType ?? ruleType);
    setContent(editing?.content ?? "");
    setBookTypeId(editing?.bookTypeId ?? GLOBAL_BOOK_TYPE_VALUE);
    setSortOrder(editing?.sortOrder ?? 1);
    setChangeNote(editing?.changeNote ?? "");
    setIsActive(editing?.isActive ?? true);
  }, [editing, open, ruleType]);

  async function handleSubmit() {
    setSaving(true);
    try {
      if (editing) {
        await updatePromptExtractionRule(editing.id, {
          content,
          bookTypeId: bookTypeId !== GLOBAL_BOOK_TYPE_VALUE ? bookTypeId : null,
          sortOrder,
          changeNote: changeNote || undefined,
          isActive
        });
      } else {
        await createPromptExtractionRule({
          ruleType  : localRuleType,
          content,
          bookTypeId: bookTypeId !== GLOBAL_BOOK_TYPE_VALUE ? bookTypeId : undefined,
          sortOrder,
          changeNote: changeNote || undefined
        });
      }
      toast({ title: editing ? "更新成功" : "创建成功" });
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast({ title: "保存失败", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "编辑 Prompt 规则" : "新增 Prompt 规则"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>规则类型</Label>
            <Select value={localRuleType} onValueChange={(value) => setLocalRuleType(parsePromptRuleType(value))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>规则内容</Label>
            <Textarea rows={6} value={content} onChange={(event) => setContent(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>书籍类型</Label>
              <Select value={bookTypeId} onValueChange={setBookTypeId}>
                <SelectTrigger><SelectValue placeholder="选择书籍类型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={GLOBAL_BOOK_TYPE_VALUE}>通用规则</SelectItem>
                  {bookTypes.map((bookType) => (
                    <SelectItem key={bookType.id} value={bookType.id}>{bookType.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>排序</Label>
              <Input type="number" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>变更说明</Label>
            <Input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} />
          </div>
          {editing ? (
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>启用</Label>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving || !content.trim()}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
