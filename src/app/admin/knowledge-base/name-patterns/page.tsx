"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  NAME_PATTERN_ACTIONS,
  NAME_PATTERN_RULE_TYPES,
  deleteNamePattern,
  fetchNamePatterns,
  getNamePatternActionLabel,
  getNamePatternRuleTypeLabel,
  testNamePattern,
  updateNamePattern,
  type NamePatternAction,
  type NamePatternRuleItem,
  type NamePatternRuleType
} from "@/lib/services/name-patterns";
import { NamePatternForm } from "./_components/name-pattern-form";

const NO_RULE_TYPE_FILTER = "all";
const NO_ACTION_FILTER = "all";

export default function NamePatternsPage() {
  const [items, setItems] = useState<NamePatternRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ruleTypeFilter, setRuleTypeFilter] = useState<string>(NO_RULE_TYPE_FILTER);
  const [actionFilter, setActionFilter] = useState<string>(NO_ACTION_FILTER);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<NamePatternRuleItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [creating, setCreating] = useState(false);

  // 测试面板
  const [testName, setTestName] = useState("");
  const [testResult, setTestResult] = useState<Awaited<ReturnType<typeof testNamePattern>> | null>(null);

  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetchNamePatterns({
        ruleType: ruleTypeFilter === NO_RULE_TYPE_FILTER
          ? undefined
          : (ruleTypeFilter as NamePatternRuleType),
        action: actionFilter === NO_ACTION_FILTER
          ? undefined
          : (actionFilter as NamePatternAction),
        pageSize: 200
      });
      setItems(result);
    } catch (error) {
      toast({ title: "加载失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [ruleTypeFilter, actionFilter, toast]);

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

  async function handleDeleteConfirmed(item: NamePatternRuleItem) {
    setDeletePending(true);
    try {
      await deleteNamePattern(item.id);
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
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      await Promise.allSettled(ids.map((id) => deleteNamePattern(id)));
      toast({ title: "批量删除完成", description: `已删除 ${ids.length} 条规则。` });
      setSelected(new Set());
      await load();
    } catch (error) {
      toast({ title: "批量删除失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleBatchToggleActive(active: boolean) {
    const ids = Array.from(selected);
    try {
      await Promise.allSettled(ids.map((id) => updateNamePattern(id, { isActive: active })));
      toast({ title: active ? "批量启用成功" : "批量停用成功" });
      setSelected(new Set());
      await load();
    } catch (error) {
      toast({ title: "批量操作失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleTest() {
    if (!testName.trim()) return;
    try {
      const result = await testNamePattern({ name: testName.trim() });
      setTestResult(result);
    } catch (error) {
      toast({ title: "测试失败", description: String(error), variant: "destructive" });
    }
  }

  const ruleTypeSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(item.ruleType, (map.get(item.ruleType) ?? 0) + 1);
    }
    return map;
  }, [items]);

  return (
    <PageContainer>
      <PageHeader
        title="名字模式规则"
        description="维护正则模式规则，阻断家族后缀、描述性短语等被错误识别为人名。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "名字模式规则" }
        ]}
      />

      <PageSection>
        {/* 测试面板 */}
        <div className="mb-4 rounded-md border bg-muted/20 p-3">
          <p className="mb-2 text-sm font-medium">规则测试</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="输入名字测试是否匹配规则…"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleTest(); }}
                className="pl-9"
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleTest()}>
              测试
            </Button>
          </div>
          {testResult && (
            <div className="mt-2 text-sm">
              <span className="font-medium">「{testResult.name}」</span>
              {" — "}
              {testResult.matched
                ? (
                  <>
                    <span className="text-destructive font-medium">
                      匹配 {testResult.matchedRules.length} 条规则
                    </span>
                    {" · 最终动作："}
                    <Badge variant={testResult.finalAction === "BLOCK" ? "destructive" : "secondary"} className="ml-1">
                      {testResult.finalAction === "BLOCK" ? "阻断" : testResult.finalAction === "WARN" ? "警告" : "放行"}
                    </Badge>
                  </>
                )
                : <span className="text-muted-foreground">未匹配任何规则（放行）</span>
              }
            </div>
          )}
        </div>

        {/* 工具栏 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select value={ruleTypeFilter} onValueChange={setRuleTypeFilter}>
            <SelectTrigger className="w-44" aria-label="规则类型筛选">
              <SelectValue placeholder="所有类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_RULE_TYPE_FILTER}>所有类型</SelectItem>
              {NAME_PATTERN_RULE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                  {ruleTypeSummary.has(t.value) ? `（${ruleTypeSummary.get(t.value)}）` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-36" aria-label="动作筛选">
              <SelectValue placeholder="所有动作" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ACTION_FILTER}>所有动作</SelectItem>
              {NAME_PATTERN_ACTIONS.map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button type="button" size="sm" onClick={() => setCreating(true)} disabled={creating}>
            <Plus className="mr-1.5 h-4 w-4" />
            新增规则
          </Button>
        </div>

        {creating ? (
          <div className="mb-4 rounded-md border bg-muted/30 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">新增名字模式规则</h3>
                <div className="mt-1 text-xs text-muted-foreground">新增正则模式规则，防止名字误识别。</div>
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
            <NamePatternForm
              onSuccess={() => { setCreating(false); void load(); }}
              onCancel={() => setCreating(false)}
            />
          </div>
        ) : null}

        {/* 批量操作栏 */}
        {selected.size > 0 && (
          <div className="name-patterns-batch-controls mb-4 flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3">
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

        <div className="mb-3 text-sm text-muted-foreground">
          共 {items.length} 条规则，启用 {items.filter((i) => i.isActive).length} 条
        </div>

        {loading
          ? <div className="py-12 text-center text-muted-foreground text-sm">加载中…</div>
          : items.length === 0
            ? <div className="py-12 text-center text-muted-foreground text-sm">暂无名字模式规则</div>
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
                      <TableHead>正则模式</TableHead>
                      <TableHead>规则类型</TableHead>
                      <TableHead>动作</TableHead>
                      <TableHead>说明</TableHead>
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
                            aria-label={`选择规则 ${item.pattern}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm max-w-48 truncate" title={item.pattern}>
                          {item.pattern}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getNamePatternRuleTypeLabel(item.ruleType)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.action === "BLOCK" ? "destructive" : "secondary"}>
                            {getNamePatternActionLabel(item.action)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-48 truncate" title={item.description ?? ""}>
                          {item.description ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.isActive ? "default" : "outline"}>
                            {item.isActive ? "启用" : "停用"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              asChild
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="编辑"
                            >
                              <Link href={`/admin/knowledge-base/name-patterns/${item.id}/edit`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Link>
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

      {/* 删除确认弹窗 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deletePending) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除正则规则「{deleteTarget?.pattern}」吗？此操作不可撤销。
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
    </PageContainer>
  );
}
