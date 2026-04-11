"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Trash2 } from "lucide-react";

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
import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import {
  createExtractionRule,
  deleteExtractionRule,
  fetchExtractionRules,
  previewCombinedRules,
  reorderExtractionRules,
  type CombinedRulesPreview,
  type ExtractionRuleItem,
  updateExtractionRule
} from "@/lib/services/ner-rules";

type RuleType = "ENTITY" | "RELATIONSHIP";

export default function NerRulesPage() {
  const [items, setItems] = useState<ExtractionRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ruleType, setRuleType] = useState<RuleType>("ENTITY");
  const [genreKey, setGenreKey] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<CombinedRulesPreview | null>(null);
  const [editing, setEditing] = useState<ExtractionRuleItem | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchExtractionRules({
        ruleType,
        genreKey: genreKey.trim() || undefined
      });
      setItems(data.sort((left, right) => left.sortOrder - right.sortOrder));
    } catch (error) {
      toast({ title: "加载失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [genreKey, ruleType, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const orderedIds = useMemo(() => items.map((item) => item.id), [items]);

  function moveItem(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    setItems(next.map((item, itemIndex) => ({ ...item, sortOrder: itemIndex + 1 })));
  }

  async function persistOrder() {
    try {
      await reorderExtractionRules(ruleType, orderedIds);
      toast({ title: "排序已保存" });
      await load();
    } catch (error) {
      toast({ title: "排序保存失败", description: String(error), variant: "destructive" });
    }
  }

  async function handlePreview() {
    try {
      const data = await previewCombinedRules(ruleType, genreKey.trim() || undefined);
      setPreviewData(data);
      setPreviewOpen(true);
    } catch (error) {
      toast({ title: "预览失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleDelete(item: ExtractionRuleItem) {
    if (!confirm("确定删除该规则吗？")) return;
    try {
      await deleteExtractionRule(item.id);
      toast({ title: "删除成功" });
      await load();
    } catch (error) {
      toast({ title: "删除失败", description: String(error), variant: "destructive" });
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="提取规则"
        description="维护实体和关系抽取时拼接进 Prompt 的规则列表。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "提取规则" }
        ]}
      >
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void handlePreview()}>
            <Eye className="mr-1 h-4 w-4" />
            组合预览
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" />
            新增规则
          </Button>
        </div>
      </PageHeader>

      <PageSection>
        <div className="mb-4 grid gap-3 md:grid-cols-[180px_220px_auto_auto]">
          <Select value={ruleType} onValueChange={(value) => setRuleType(value as RuleType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ENTITY">实体规则</SelectItem>
              <SelectItem value="RELATIONSHIP">关系规则</SelectItem>
            </SelectContent>
          </Select>
          <Input value={genreKey} onChange={(event) => setGenreKey(event.target.value)} placeholder="书籍类型键（可选）" />
          <Button variant="outline" onClick={() => void load()}>刷新</Button>
          <Button variant="outline" onClick={() => void persistOrder()} disabled={items.length === 0}>保存排序</Button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">排序</TableHead>
                  <TableHead>规则内容</TableHead>
                  <TableHead className="w-32">书籍类型</TableHead>
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
                        <Button variant="ghost" size="sm" onClick={() => moveItem(index, -1)} disabled={index === 0}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-pre-wrap">{item.content}</TableCell>
                    <TableCell>{item.genreKey ?? "通用"}</TableCell>
                    <TableCell>
                      <Badge variant={item.isActive ? "success" : "secondary"}>{item.isActive ? "启用" : "停用"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setEditing(item); setDialogOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void handleDelete(item)}>
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

      <RuleDialog
        open={dialogOpen}
        editing={editing}
        ruleType={ruleType}
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
              当前共 {previewData?.count ?? 0} 条规则，书籍类型：{previewData?.genreKey ?? "通用"}
            </div>
            <pre className="max-h-[460px] overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{previewData?.combined ?? ""}</pre>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function RuleDialog({
  open,
  editing,
  ruleType,
  onOpenChange,
  onSaved
}: {
  open        : boolean;
  editing     : ExtractionRuleItem | null;
  ruleType    : RuleType;
  onOpenChange: (open: boolean) => void;
  onSaved     : () => Promise<void>;
}) {
  const [localRuleType, setLocalRuleType] = useState<RuleType>(ruleType);
  const [content, setContent] = useState("");
  const [genreKey, setGenreKey] = useState("");
  const [sortOrder, setSortOrder] = useState(1);
  const [changeNote, setChangeNote] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setLocalRuleType(editing?.ruleType ?? ruleType);
    setContent(editing?.content ?? "");
    setGenreKey(editing?.genreKey ?? "");
    setSortOrder(editing?.sortOrder ?? 1);
    setChangeNote(editing?.changeNote ?? "");
    setIsActive(editing?.isActive ?? true);
  }, [editing, open, ruleType]);

  async function handleSubmit() {
    setSaving(true);
    try {
      if (editing) {
        await updateExtractionRule(editing.id, {
          content,
          genreKey  : genreKey.trim() || null,
          sortOrder,
          changeNote: changeNote || undefined,
          isActive
        });
      } else {
        await createExtractionRule({
          ruleType  : localRuleType,
          content,
          genreKey  : genreKey.trim() || undefined,
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
          <DialogTitle>{editing ? "编辑规则" : "新增规则"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>规则类型</Label>
            <Select value={localRuleType} onValueChange={(value) => setLocalRuleType(value as RuleType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ENTITY">ENTITY</SelectItem>
                <SelectItem value="RELATIONSHIP">RELATIONSHIP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>规则内容</Label>
            <Textarea rows={6} value={content} onChange={(event) => setContent(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>书籍类型键</Label>
              <Input value={genreKey} onChange={(event) => setGenreKey(event.target.value)} placeholder="通用可留空" />
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || !content.trim()}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
