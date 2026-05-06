"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  Database,
  PauseCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X
} from "lucide-react";

import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { fetchActiveBookTypes, type BookTypeOption } from "@/lib/services/book-types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  batchRelationshipTypeAction,
  deleteRelationshipType,
  fetchRelationshipTypes,
  initializeCommonRelationshipTypes,
  RELATIONSHIP_DIRECTION_MODES,
  RELATIONSHIP_TYPE_GROUPS,
  RELATIONSHIP_TYPE_STATUSES,
  type RelationshipDirectionMode,
  type RelationshipTypeGroup,
  type RelationshipTypeItem,
  type RelationshipTypeStatus
} from "@/lib/services/relationship-types";
import { RelationshipTypeForm } from "./_components/relationship-type-form";
import { RelationshipTypeGeneratorPanel } from "./_components/relationship-type-generator-panel";

const ALL_VALUE = "__ALL__";
const GLOBAL_BOOK_TYPE_VALUE = "__GLOBAL__";

const directionLabels: Record<RelationshipDirectionMode, string> = {
  SYMMETRIC: "对称",
  INVERSE  : "互逆",
  DIRECTED : "单向"
};

const statusLabels: Record<RelationshipTypeStatus, string> = {
  ACTIVE        : "启用",
  INACTIVE      : "停用",
  PENDING_REVIEW: "待审核"
};

const statusBadgeVariants: Record<RelationshipTypeStatus, "success" | "secondary" | "warning"> = {
  ACTIVE        : "success",
  INACTIVE      : "secondary",
  PENDING_REVIEW: "warning"
};

function previewLabels(item: RelationshipTypeItem) {
  const edgeLabel = item.edgeLabel?.trim() || item.name.trim() || "关系";
  if (item.directionMode === "SYMMETRIC") {
    return { aToB: edgeLabel, bToA: edgeLabel, edge: edgeLabel };
  }
  return {
    aToB: item.targetRoleLabel?.trim() || edgeLabel,
    bToA: item.sourceRoleLabel?.trim() || item.reverseEdgeLabel?.trim() || edgeLabel,
    edge: edgeLabel
  };
}

export default function RelationshipTypesPage() {
  const [items, setItems]                       = useState<RelationshipTypeItem[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [q, setQ]                               = useState("");
  const [group, setGroup]                       = useState(ALL_VALUE);
  const [bookTypeId, setBookTypeId]             = useState(ALL_VALUE);
  const [directionMode, setDirectionMode]       = useState(ALL_VALUE);
  const [status, setStatus]                     = useState(ALL_VALUE);
  const [bookTypes, setBookTypes]               = useState<BookTypeOption[]>([]);
  const [initializeCommonOpen, setInitializeCommonOpen] = useState(false);
  const [initializingCommon, setInitializingCommon]     = useState(false);
  const [deleteTarget, setDeleteTarget]                 = useState<RelationshipTypeItem | null>(null);
  const [deleting, setDeleting]                         = useState(false);
  const [selected, setSelected]                         = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting]               = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen]           = useState(false);
  const [batchGroupPanelOpen, setBatchGroupPanelOpen]   = useState(false);
  const [batchGroup, setBatchGroup]                     = useState<RelationshipTypeGroup>("血缘");
  const [batchPending, setBatchPending]                 = useState(false);
  const [creating, setCreating]                         = useState(false);
  const [generating, setGenerating]                     = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchRelationshipTypes({
        q            : q.trim() || undefined,
        group        : group === ALL_VALUE ? undefined : group,
        bookTypeId   : bookTypeId === ALL_VALUE ? undefined : bookTypeId === GLOBAL_BOOK_TYPE_VALUE ? null : bookTypeId,
        directionMode: directionMode === ALL_VALUE ? undefined : directionMode,
        status       : status === ALL_VALUE ? undefined : status
      });
      setItems(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "关系类型列表获取失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void (async () => {
      try {
        setBookTypes(await fetchActiveBookTypes());
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "书籍类型加载失败");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelected((previous) => new Set(items.filter((item) => previous.has(item.id)).map((item) => item.id)));
  }, [items]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allSelected = items.length > 0 && selected.size === items.length;
  const partiallySelected = selected.size > 0 && !allSelected;

  async function handleDelete(item: RelationshipTypeItem) {
    setDeleting(true);
    try {
      await deleteRelationshipType(item.id);
      toast.success("关系类型已删除");
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(item.id);
        return next;
      });
      await load();
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeleting(false);
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
    body: Parameters<typeof batchRelationshipTypeAction>[0],
    successMessage: string
  ): Promise<boolean> {
    setBatchPending(true);
    try {
      const result = await batchRelationshipTypeAction(body);
      toast.success(`${successMessage}，已处理 ${result.count} 条`);
      setSelected(new Set());
      await load();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量操作失败");
      return false;
    } finally {
      setBatchPending(false);
    }
  }

  async function handleBatchDelete() {
    setBatchDeleting(true);
    try {
      const ok = await runBatchAction({ action: "delete", ids: selectedIds }, "已批量删除");
      if (ok) setBatchDeleteOpen(false);
    } finally {
      setBatchDeleting(false);
    }
  }

  async function handleBatchChangeGroup() {
    const ok = await runBatchAction({ action: "changeGroup", ids: selectedIds, group: batchGroup }, "已修改分组");
    if (ok) setBatchGroupPanelOpen(false);
  }

  async function handleInitializeCommon() {
    setInitializingCommon(true);
    try {
      const result = await initializeCommonRelationshipTypes();
      toast.success(`初始化完成：新增 ${result.created} 条，跳过 ${result.skipped} 条`);
      await load();
      setInitializeCommonOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "常用关系类型初始化失败");
    } finally {
      setInitializingCommon(false);
    }
  }

  function handleConfirmInitializeCommon(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!initializingCommon) void handleInitializeCommon();
  }

  function handleConfirmDelete(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (deleteTarget && !deleting) void handleDelete(deleteTarget);
  }

  return (
    <PageContainer fullWidth className="relationship-types-page">
      <PageHeader
        title="关系类型知识库"
        description="管理父子、岳婿、师生、主仆等稳定结构关系；行为和态度进入关系档案事件。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库",   href: "/admin/knowledge-base" },
          { label: "关系类型" }
        ]}
      >
        <AlertDialog open={initializeCommonOpen} onOpenChange={(open) => { if (!initializingCommon) setInitializeCommonOpen(open); }}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={initializingCommon}>
              <Database className="h-4 w-4" />
              {initializingCommon ? "初始化中..." : "初始化常用"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认初始化常用关系类型？</AlertDialogTitle>
              <AlertDialogDescription>系统会跳过已有同名或别名冲突的数据，不会覆盖现有关系类型。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={initializingCommon}>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmInitializeCommon} disabled={initializingCommon}>
                {initializingCommon ? "初始化中..." : "确认初始化"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button type="button" variant="outline" size="sm" onClick={() => setGenerating(true)} disabled={generating}>
          <Sparkles className="h-4 w-4" />
          模型生成
        </Button>
        <Button type="button" size="sm" onClick={() => setCreating(true)} disabled={creating}>
          <Plus className="h-4 w-4" />
          新建关系类型
        </Button>
      </PageHeader>

      {creating ? (
        <PageSection>
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">新建关系类型</h3>
                <div className="mt-1 text-xs text-muted-foreground">定义一个新的人物关系类型。</div>
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
            <RelationshipTypeForm
              initial={null}
              redirectTo="/admin/knowledge-base/relationship-types"
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
                <h3 className="text-sm font-semibold">模型生成关系类型候选</h3>
                <div className="mt-1 text-xs text-muted-foreground">生成结果只作为候选预审，保存后进入待审核状态。</div>
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
            <RelationshipTypeGeneratorPanel
              onClose={() => setGenerating(false)}
              onSaved={() => { setGenerating(false); void load(); }}
            />
          </div>
        </PageSection>
      ) : null}

      <PageSection>
        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(260px,1fr)_170px_170px_170px_170px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={q} onChange={(event) => setQ(event.target.value)} placeholder="搜索名称、code、别名、说明" />
          </div>
          <FilterSelect label="分组" value={group} values={[ALL_VALUE, ...RELATIONSHIP_TYPE_GROUPS]} getLabel={(value) => value === ALL_VALUE ? "全部分组" : value} onValueChange={setGroup} />
          <FilterSelect
            label="书籍类型"
            value={bookTypeId}
            values={[ALL_VALUE, GLOBAL_BOOK_TYPE_VALUE, ...bookTypes.map((item) => item.id)]}
            getLabel={(value) => {
              if (value === ALL_VALUE) return "全部类型";
              if (value === GLOBAL_BOOK_TYPE_VALUE) return "通用";
              return bookTypes.find((item) => item.id === value)?.name ?? value;
            }}
            onValueChange={setBookTypeId}
          />
          <FilterSelect label="方向" value={directionMode} values={[ALL_VALUE, ...RELATIONSHIP_DIRECTION_MODES]} getLabel={(value) => value === ALL_VALUE ? "全部方向" : directionLabels[value as RelationshipDirectionMode]} onValueChange={setDirectionMode} />
          <FilterSelect label="状态" value={status} values={[ALL_VALUE, ...RELATIONSHIP_TYPE_STATUSES]} getLabel={(value) => value === ALL_VALUE ? "全部状态" : statusLabels[value as RelationshipTypeStatus]} onValueChange={setStatus} />
          <Button type="button" variant="outline" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            查询
          </Button>
        </div>

        <BatchToolbar
          selectedCount={selected.size}
          disabled={batchPending || batchDeleting}
          onEnable={() => void runBatchAction({ action: "enable", ids: selectedIds }, "已批量启用")}
          onDisable={() => void runBatchAction({ action: "disable", ids: selectedIds }, "已批量停用")}
          onMarkPendingReview={() => void runBatchAction({ action: "markPendingReview", ids: selectedIds }, "已设为待审核")}
          onChangeGroup={() => setBatchGroupPanelOpen(true)}
          onDelete={() => setBatchDeleteOpen(true)}
          onClear={() => setSelected(new Set())}
        />

        {batchGroupPanelOpen ? (
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border bg-muted/40 p-3">
            <div className="flex-1 min-w-[220px]">
              <Label className="mb-2 block">目标分组</Label>
              <Select value={batchGroup} onValueChange={(value) => setBatchGroup(value as RelationshipTypeGroup)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_TYPE_GROUPS.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={() => void handleBatchChangeGroup()} disabled={batchPending || selectedIds.length === 0}>
              {batchPending ? "修改中..." : "确认修改"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setBatchGroupPanelOpen(false)} disabled={batchPending}>取消</Button>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected ? true : partiallySelected ? "indeterminate" : false} aria-label="全选关系类型" onCheckedChange={toggleSelectAll} />
                </TableHead>
                <TableHead className="min-w-64">关系类型</TableHead>
                <TableHead className="w-48">分组 / 方向</TableHead>
                <TableHead className="w-36">适用类型</TableHead>
                <TableHead className="min-w-64">称谓与边</TableHead>
                <TableHead className="w-24">引用</TableHead>
                <TableHead className="w-28">状态</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={8}>加载中...</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={8}>暂无关系类型</TableCell></TableRow>
              ) : items.map((item) => {
                const labels = previewLabels(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Checkbox checked={selected.has(item.id)} aria-label={`选择关系类型 ${item.name}`} onCheckedChange={() => toggleSelect(item.id)} />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground">{item.code}</div>
                      {item.aliases.length > 0 ? (
                        <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.aliases.join("、")}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline">{item.group}</Badge>
                        <Badge variant="secondary">{directionLabels[item.directionMode]}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.bookType ? "outline" : "secondary"}>{item.bookType?.name ?? "通用"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div>A 对 B：{labels.aToB}</div>
                      <div>B 对 A：{labels.bToA}</div>
                      <div>图谱边：{labels.edge}</div>
                    </TableCell>
                    <TableCell>{item._count?.relationships ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariants[item.status]}>{statusLabels[item.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`编辑关系类型 ${item.name}`} asChild>
                          <Link href={`/admin/knowledge-base/relationship-types/${item.id}/edit`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`删除关系类型 ${item.name}`} onClick={() => setDeleteTarget(item)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </PageSection>

      <AlertDialog open={batchDeleteOpen} onOpenChange={(open) => { if (!batchDeleting) setBatchDeleteOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除所选关系类型？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除当前选中的 {selectedIds.length} 个关系类型。已被引用的类型会被后端拒绝删除，可改为批量停用。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={batchDeleting || selectedIds.length === 0}
              onClick={(event) => { event.preventDefault(); void handleBatchDelete(); }}
            >
              {batchDeleting ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除“{deleteTarget?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>已被引用的类型会被后端拒绝删除，可先停用以保留历史关系引用。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={handleConfirmDelete}
            >
              {deleting ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

interface BatchToolbarProps {
  selectedCount      : number;
  disabled           : boolean;
  onEnable           : () => void;
  onDisable          : () => void;
  onMarkPendingReview: () => void;
  onChangeGroup      : () => void;
  onDelete           : () => void;
  onClear            : () => void;
}

function BatchToolbar({
  selectedCount,
  disabled,
  onEnable,
  onDisable,
  onMarkPendingReview,
  onChangeGroup,
  onDelete,
  onClear
}: BatchToolbarProps) {
  if (selectedCount === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
      <div className="text-sm font-medium">已选择 {selectedCount} 个关系类型</div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onEnable}>
          <CheckCircle2 className="h-4 w-4" />启用
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onDisable}>
          <PauseCircle className="h-4 w-4" />停用
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onMarkPendingReview}>
          <Clock3 className="h-4 w-4" />设为待审核
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onChangeGroup}>修改分组</Button>
        <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={onDelete}>
          <Trash2 className="h-4 w-4" />删除
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onClear}>
          <X className="h-4 w-4" />清空选择
        </Button>
      </div>
    </div>
  );
}

interface FilterSelectProps {
  label        : string;
  value        : string;
  values       : string[];
  getLabel     : (value: string) => string;
  onValueChange: (value: string) => void;
}

function FilterSelect({ label, value, values, getLabel, onValueChange }: FilterSelectProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {values.map((item) => (
            <SelectItem key={item} value={item}>{getLabel(item)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
