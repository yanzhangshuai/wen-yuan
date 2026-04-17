"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, Upload } from "lucide-react";

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
  HISTORICAL_FIGURE_CATEGORIES,
  createHistoricalFigure,
  deleteHistoricalFigure,
  fetchHistoricalFigures,
  getHistoricalFigureCategoryLabel,
  importHistoricalFigures,
  updateHistoricalFigure,
  type HistoricalFigureCategory,
  type HistoricalFigureItem
} from "@/lib/services/historical-figures";

const NO_CATEGORY_FILTER = "all";

export default function HistoricalFiguresPage() {
  const [items, setItems] = useState<HistoricalFigureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(NO_CATEGORY_FILTER);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HistoricalFigureItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<HistoricalFigureItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const { toast } = useToast();

  // 编辑表单字段
  const [name, setName] = useState("");
  const [aliasesText, setAliasesText] = useState("");
  const [dynasty, setDynasty] = useState("");
  const [category, setCategory] = useState<HistoricalFigureCategory>("SAGE");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetchHistoricalFigures({
        q       : query || undefined,
        category: categoryFilter === NO_CATEGORY_FILTER
          ? undefined
          : (categoryFilter as HistoricalFigureCategory),
        pageSize: 200
      });
      setItems(result);
    } catch (error) {
      toast({ title: "加载失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [query, categoryFilter, toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setSelected((prev) => new Set(items.filter((i) => prev.has(i.id)).map((i) => i.id)));
  }, [items]);

  const allSelected = items.length > 0 && selected.size === items.length;
  const partiallySelected = selected.size > 0 && !allSelected;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      items.length === 0 || prev.size === items.length
        ? new Set()
        : new Set(items.map((i) => i.id))
    );
  }

  function openCreate() {
    setEditing(null);
    setName("");
    setAliasesText("");
    setDynasty("");
    setCategory("SAGE");
    setDescription("");
    setIsActive(true);
    setDialogOpen(true);
  }

  function openEdit(item: HistoricalFigureItem) {
    setEditing(item);
    setName(item.name);
    setAliasesText(item.aliases.join("、"));
    setDynasty(item.dynasty ?? "");
    setCategory(item.category);
    setDescription(item.description ?? "");
    setIsActive(item.isActive);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast({ title: "请填写名称", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const aliases = aliasesText
        .split(/[,，、\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (editing) {
        await updateHistoricalFigure(editing.id, {
          name       : name.trim(),
          aliases,
          dynasty    : dynasty.trim() || null,
          category,
          description: description.trim() || null,
          isActive
        });
        toast({ title: "更新成功" });
      } else {
        await createHistoricalFigure({
          name       : name.trim(),
          aliases,
          dynasty    : dynasty.trim() || undefined,
          category,
          description: description.trim() || undefined,
          isActive
        });
        toast({ title: "创建成功" });
      }
      setDialogOpen(false);
      await load();
    } catch (error) {
      toast({ title: "保存失败", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirmed(item: HistoricalFigureItem) {
    setDeletePending(true);
    try {
      await deleteHistoricalFigure(item.id);
      toast({ title: "删除成功" });
      setDeleteTarget(null);
      setSelected((prev) => {
        const next = new Set(prev);
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

  async function handleBatchDelete() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    try {
      await Promise.allSettled(ids.map((id) => deleteHistoricalFigure(id)));
      toast({ title: "批量删除完成", description: `已删除 ${ids.length} 条历史人物。` });
      setSelected(new Set());
      await load();
    } catch (error) {
      toast({ title: "批量删除失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleBatchToggleActive(isActive: boolean) {
    const ids = Array.from(selected);
    try {
      await Promise.allSettled(ids.map((id) => updateHistoricalFigure(id, { isActive })));
      toast({ title: isActive ? "批量启用成功" : "批量停用成功" });
      setSelected(new Set());
      await load();
    } catch (error) {
      toast({ title: "批量操作失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleImport() {
    const lines = importText.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return;

    const entries = lines.map((line) => {
      const parts = line.split(/\t|,|，/);
      return {
        name    : (parts[0] ?? "").trim(),
        category: "SAGE" as HistoricalFigureCategory,
        aliases : parts.slice(1).map((s) => s.trim()).filter(Boolean)
      };
    }).filter((e) => e.name);

    if (entries.length === 0) {
      toast({ title: "无有效数据", variant: "destructive" });
      return;
    }

    try {
      const result = await importHistoricalFigures(entries);
      toast({
        title      : "导入完成",
        description: `共 ${result.total} 条，成功导入 ${result.imported} 条。`
      });
      setImportOpen(false);
      setImportText("");
      await load();
    } catch (error) {
      toast({ title: "导入失败", description: String(error), variant: "destructive" });
    }
  }

  const categorySummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
    }
    return map;
  }, [items]);

  return (
    <PageContainer>
      <PageHeader
        title="历史人物"
        description="维护历史人物词库，用于 AI 分析时识别并排除历史典故引用。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "历史人物" }
        ]}
      />

      <PageSection>
        {/* 工具栏 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索人名…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40" aria-label="类别筛选">
              <SelectValue placeholder="所有类别" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY_FILTER}>所有类别</SelectItem>
              {HISTORICAL_FIGURE_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                  {categorySummary.has(c.value) ? `（${categorySummary.get(c.value)}）` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" />
            导入
          </Button>
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            新增历史人物
          </Button>
        </div>

        {/* 批量操作栏 */}
        {selected.size > 0 && (
          <div className="historical-figures-batch-controls mb-4 flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3">
            <span className="text-sm font-medium text-foreground">已选 {selected.size} 项</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleBatchToggleActive(true)}>
              批量启用
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleBatchToggleActive(false)}>
              批量停用
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleBatchDelete()}>
              批量删除
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              清空选择
            </Button>
          </div>
        )}

        {/* 数据统计 */}
        <div className="mb-3 text-sm text-muted-foreground">
          共 {items.length} 条历史人物，启用 {items.filter((i) => i.isActive).length} 条
        </div>

        {/* 列表 */}
        {loading
          ? <div className="py-12 text-center text-muted-foreground text-sm">加载中…</div>
          : items.length === 0
            ? <div className="py-12 text-center text-muted-foreground text-sm">暂无历史人物数据</div>
            : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected ? true : partiallySelected ? "indeterminate" : false}
                          onCheckedChange={toggleSelectAll}
                          aria-label="全选"
                        />
                      </TableHead>
                      <TableHead>名称</TableHead>
                      <TableHead>别名</TableHead>
                      <TableHead>朝代</TableHead>
                      <TableHead>类别</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} data-state={selected.has(item.id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(item.id)}
                            onCheckedChange={() => toggleSelect(item.id)}
                            aria-label={`选择 ${item.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.aliases.length > 0
                            ? item.aliases.slice(0, 3).join("、") + (item.aliases.length > 3 ? "…" : "")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{item.dynasty ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {getHistoricalFigureCategoryLabel(item.category)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.isActive ? "default" : "outline"}>
                            {item.isActive ? "启用" : "停用"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEdit(item)}
                              aria-label="编辑"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(item)}
                              aria-label="删除"
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
            )
        }
      </PageSection>

      {/* 新增/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑历史人物" : "新增历史人物"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="hf-name">名称 *</Label>
              <Input
                id="hf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：孔子"
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hf-aliases">别名（逗号/顿号分隔）</Label>
              <Input
                id="hf-aliases"
                value={aliasesText}
                onChange={(e) => setAliasesText(e.target.value)}
                placeholder="如：仲尼、至圣先师"
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hf-dynasty">朝代</Label>
                <Input
                  id="hf-dynasty"
                  value={dynasty}
                  onChange={(e) => setDynasty(e.target.value)}
                  placeholder="如：春秋"
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hf-category">类别 *</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as HistoricalFigureCategory)}
                  disabled={saving}
                >
                  <SelectTrigger id="hf-category" aria-label="类别">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HISTORICAL_FIGURE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hf-description">说明</Label>
              <Textarea
                id="hf-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="可选，简短描述用于辅助 AI 判断"
                rows={2}
                disabled={saving}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="hf-active" checked={isActive} onCheckedChange={setIsActive} disabled={saving} />
              <Label htmlFor="hf-active">启用</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>取消</Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deletePending) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除历史人物「{deleteTarget?.name}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deletePending}>取消</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletePending}
              onClick={() => deleteTarget && void handleDeleteConfirmed(deleteTarget)}
            >
              {deletePending ? "删除中…" : "确认删除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量导入弹窗 */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>批量导入历史人物</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              每行一条，格式：名称（TAB 或逗号分隔可附别名）。类别默认为&ldquo;圣贤&rdquo;，导入后可逐条编辑调整。
            </p>
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"孔子\t仲尼、至圣先师\n老子\t李耳、太上老君\n庄子"}
              rows={8}
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>取消</Button>
            <Button type="button" onClick={() => void handleImport()} disabled={!importText.trim()}>
              确认导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
