"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  GitMerge,
  Link2,
  RefreshCw,
  XCircle
} from "lucide-react";

import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  fetchRelationshipTypes,
  RELATIONSHIP_TYPE_GROUPS,
  type RelationshipTypeGroup,
  type RelationshipTypeItem,
  type RelationshipTypePayload
} from "@/lib/services/relationship-types";
import {
  approveUnknownRelationshipTypeDraft,
  fetchUnknownRelationshipTypeDrafts,
  mergeUnknownRelationshipTypeDraft,
  rejectUnknownRelationshipTypeDraft,
  UNKNOWN_RELATIONSHIP_TYPE_DRAFT_STATUSES,
  type UnknownRelationshipTypeDraftItem,
  type UnknownRelationshipTypeDraftStatus
} from "@/lib/services/unknown-relationship-types";

const ALL_VALUE = "__ALL__";
const NONE_VALUE = "__NONE__";

const statusLabels: Record<UnknownRelationshipTypeDraftStatus, string> = {
  PENDING : "待审核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
  MERGED  : "已合并"
};

const statusBadgeVariants: Record<UnknownRelationshipTypeDraftStatus, "success" | "secondary" | "warning" | "destructive"> = {
  PENDING : "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  MERGED  : "secondary"
};

const directionLabels: Record<RelationshipTypePayload["directionMode"], string> = {
  SYMMETRIC: "对称",
  INVERSE  : "互逆",
  DIRECTED : "单向"
};

function normalizeGroup(value: string): RelationshipTypeGroup {
  return RELATIONSHIP_TYPE_GROUPS.includes(value as RelationshipTypeGroup)
    ? value as RelationshipTypeGroup
    : "其他";
}

function buildCreatePayload(draft: UnknownRelationshipTypeDraftItem): RelationshipTypePayload {
  return {
    bookTypeId      : draft.book.bookTypeId,
    name            : draft.proposedName,
    group           : normalizeGroup(draft.proposedGroup),
    directionMode   : draft.proposedDirectionMode,
    sourceRoleLabel : draft.proposedSourceRoleLabel,
    targetRoleLabel : draft.proposedTargetRoleLabel,
    edgeLabel       : draft.proposedName,
    reverseEdgeLabel: null,
    aliases         : [],
    description     : `由《${draft.book.title}》解析中的未知关系类型审核生成。`,
    usageNotes      : null,
    examples        : draft.occurrences.map((item) => item.evidence).filter((item): item is string => Boolean(item)).slice(0, 5),
    color           : null,
    sortOrder       : 0,
    status          : "ACTIVE"
  };
}

export default function UnknownRelationshipTypesPage() {
  const [drafts, setDrafts] = useState<UnknownRelationshipTypeDraftItem[]>([]);
  const [relationshipTypes, setRelationshipTypes] = useState<RelationshipTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("PENDING");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bindCodes, setBindCodes] = useState<Record<string, string>>({});
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingDrafts = useMemo(() => drafts.filter((item) => item.status === "PENDING"), [drafts]);

  async function load() {
    setLoading(true);
    try {
      const [draftData, relationshipTypeData] = await Promise.all([
        fetchUnknownRelationshipTypeDrafts({ status: status === ALL_VALUE ? undefined : status as UnknownRelationshipTypeDraftStatus }),
        fetchRelationshipTypes({ status: "ACTIVE" })
      ]);
      setDrafts(draftData);
      setRelationshipTypes(relationshipTypeData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "未知关系类型列表获取失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleExpanded(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runAction(id: string, action: () => Promise<unknown>, successMessage: string) {
    setBusyId(id);
    try {
      await action();
      toast.success(successMessage);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  async function handleApproveExisting(draft: UnknownRelationshipTypeDraftItem) {
    const relationshipTypeCode = bindCodes[draft.id];
    if (!relationshipTypeCode || relationshipTypeCode === NONE_VALUE) {
      toast.error("请选择要绑定的关系类型");
      return;
    }
    await runAction(
      draft.id,
      () => approveUnknownRelationshipTypeDraft(draft.id, { mode: "BIND_EXISTING", relationshipTypeCode }),
      "已绑定到现有关系类型"
    );
  }

  async function handleCreateNew(draft: UnknownRelationshipTypeDraftItem) {
    await runAction(
      draft.id,
      () => approveUnknownRelationshipTypeDraft(draft.id, { mode: "CREATE_NEW", input: buildCreatePayload(draft) }),
      "已创建并绑定新关系类型"
    );
  }

  async function handleReject(draft: UnknownRelationshipTypeDraftItem) {
    await runAction(
      draft.id,
      () => rejectUnknownRelationshipTypeDraft(draft.id, rejectReasons[draft.id]),
      "已驳回未知关系类型"
    );
  }

  async function handleMerge(draft: UnknownRelationshipTypeDraftItem) {
    const targetDraftId = mergeTargets[draft.id];
    if (!targetDraftId || targetDraftId === NONE_VALUE) {
      toast.error("请选择合并目标");
      return;
    }
    await runAction(
      draft.id,
      () => mergeUnknownRelationshipTypeDraft(draft.id, targetDraftId),
      "已合并未知关系类型"
    );
  }

  return (
    <PageContainer fullWidth>
      <PageHeader
        title="未知关系类型审核"
        description="处理解析过程中发现但不在关系类型知识库中的候选类型，审核后再进入正式字典。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库",   href: "/admin/knowledge-base" },
          { label: "未知关系类型" }
        ]}
      >
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
      </PageHeader>

      <PageSection>
        <div className="mb-4 flex max-w-xs flex-col gap-2">
          <Label>审核状态</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
              {UNKNOWN_RELATIONSHIP_TYPE_DRAFT_STATUSES.map((item) => (
                <SelectItem key={item} value={item}>{statusLabels[item]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          查询
        </Button>
      </PageSection>

      <PageSection>
        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead className="min-w-56">候选类型</TableHead>
                <TableHead className="min-w-56">来源书籍</TableHead>
                <TableHead className="w-36">方向</TableHead>
                <TableHead className="w-24">次数</TableHead>
                <TableHead className="w-28">状态</TableHead>
                <TableHead className="min-w-[420px]">审核操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={7}>加载中...</TableCell></TableRow>
              ) : drafts.length === 0 ? (
                <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={7}>暂无未知关系类型</TableCell></TableRow>
              ) : drafts.map((draft) => {
                const isExpanded = expanded.has(draft.id);
                const busy = busyId === draft.id;
                return [
                  <TableRow key={draft.id}>
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={isExpanded ? "收起出现记录" : "展开出现记录"} onClick={() => toggleExpanded(draft.id)}>
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{draft.proposedName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{draft.proposedGroup}</div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">{draft.signature}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{draft.book.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{draft.book.bookType?.name ?? "通用"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">首次：第 {draft.firstChapter.no} 回 {draft.firstChapter.title}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{directionLabels[draft.proposedDirectionMode]}</Badge>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {draft.proposedSourceRoleLabel ?? "source"} → {draft.proposedTargetRoleLabel ?? "target"}
                      </div>
                    </TableCell>
                    <TableCell>{draft.occurrenceCount}</TableCell>
                    <TableCell><Badge variant={statusBadgeVariants[draft.status]}>{statusLabels[draft.status]}</Badge></TableCell>
                    <TableCell>
                      {draft.status === "PENDING" ? (
                        <div className="grid gap-2">
                          <div className="grid gap-2 md:grid-cols-[minmax(160px,1fr)_auto_auto]">
                            <Select value={bindCodes[draft.id] ?? NONE_VALUE} onValueChange={(value) => setBindCodes((previous) => ({ ...previous, [draft.id]: value }))}>
                              <SelectTrigger><SelectValue placeholder="绑定现有类型" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE_VALUE}>选择现有类型</SelectItem>
                                {relationshipTypes.map((item) => (
                                  <SelectItem key={item.code} value={item.code}>{item.name} · {item.code}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void handleApproveExisting(draft)}>
                              <Link2 className="h-4 w-4" />绑定
                            </Button>
                            <Button type="button" size="sm" disabled={busy} onClick={() => void handleCreateNew(draft)}>
                              <Check className="h-4 w-4" />创建
                            </Button>
                          </div>
                          <div className="grid gap-2 md:grid-cols-[minmax(160px,1fr)_auto]">
                            <Select value={mergeTargets[draft.id] ?? NONE_VALUE} onValueChange={(value) => setMergeTargets((previous) => ({ ...previous, [draft.id]: value }))}>
                              <SelectTrigger><SelectValue placeholder="合并到草稿" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE_VALUE}>选择合并目标</SelectItem>
                                {pendingDrafts.filter((item) => item.id !== draft.id).map((item) => (
                                  <SelectItem key={item.id} value={item.id}>{item.proposedName} · {item.occurrenceCount} 次</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void handleMerge(draft)}>
                              <GitMerge className="h-4 w-4" />合并
                            </Button>
                          </div>
                          <div className="grid gap-2 md:grid-cols-[minmax(160px,1fr)_auto]">
                            <Input value={rejectReasons[draft.id] ?? ""} onChange={(event) => setRejectReasons((previous) => ({ ...previous, [draft.id]: event.target.value }))} placeholder="驳回原因" />
                            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void handleReject(draft)}>
                              <XCircle className="h-4 w-4" />驳回
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          {draft.approvedTypeCode ? `已绑定：${draft.approvedTypeCode}` : draft.rejectionReason ?? draft.mergedIntoDraft?.proposedName ?? "已处理"}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>,
                  isExpanded ? (
                    <TableRow key={`${draft.id}-occurrences`}>
                      <TableCell />
                      <TableCell colSpan={6}>
                        <div className="grid gap-2 py-2">
                          {draft.occurrences.length === 0 ? (
                            <div className="text-sm text-muted-foreground">暂无出现记录</div>
                          ) : draft.occurrences.map((occurrence) => (
                            <div key={occurrence.id} className="rounded-md border bg-muted/30 p-3 text-sm">
                              <div className="font-medium">
                                第 {occurrence.chapter.no} 回 {occurrence.chapter.title}：{occurrence.sourceName} → {occurrence.targetName}
                              </div>
                              {occurrence.evidence ? <div className="mt-1 text-muted-foreground">{occurrence.evidence}</div> : null}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null
                ];
              })}
            </TableBody>
          </Table>
        </div>
      </PageSection>
    </PageContainer>
  );
}
