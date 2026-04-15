"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ExternalLink, LibraryBig, Link2, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getKnowledgePackScopeLabel } from "@/lib/knowledge-presentation";
import type { KnowledgePackItem } from "@/lib/services/knowledge";
import { fetchKnowledgePacks } from "@/lib/services/knowledge";
import {
  fetchBookKnowledgePacks,
  mountBookKnowledgePack,
  unmountBookKnowledgePack,
  updateMountedBookKnowledgePackPriority,
  type BookKnowledgePackListResult,
  type BookKnowledgePackSummary,
  type MountedBookKnowledgePackItem
} from "@/lib/services/book-knowledge-packs";

interface BookKnowledgePanelProps {
  bookId: string;
}

function getStatusCount(statusCounts: Record<string, number>, key: string) {
  return statusCounts[key] ?? 0;
}

function scopeBadge(scope: string) {
  return scope === "BOOK"
    ? <Badge variant="outline">{getKnowledgePackScopeLabel(scope)}</Badge>
    : <Badge variant="secondary">{getKnowledgePackScopeLabel(scope)}</Badge>;
}

function formatPackStatusText(pack: Pick<BookKnowledgePackSummary, "statusCounts">) {
  return `${getStatusCount(pack.statusCounts, "VERIFIED")} 条已验证 / ${getStatusCount(pack.statusCounts, "PENDING")} 条待审核`;
}

function parsePriorityInput(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.trunc(parsed));
}

function PackSummaryRow({
  pack,
  action,
  actionLabel,
  actionDisabled,
  actionPending,
  extra
}: {
  pack           : BookKnowledgePackSummary;
  action?        : () => void;
  actionLabel?   : string;
  actionDisabled?: boolean;
  actionPending? : boolean;
  extra?         : React.ReactNode;
}) {
  return (
    <div className="book-knowledge-panel-row flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-medium text-foreground">{pack.name}</div>
          {scopeBadge(pack.scope)}
          {!pack.isActive ? <Badge variant="destructive">已停用</Badge> : null}
        </div>

        <div className="text-sm text-muted-foreground">
          {pack.bookType ? `${pack.bookType.name} · ` : ""}
          v{pack.version} · {formatPackStatusText(pack)} · 共 {pack._count.entries} 条
        </div>

        {pack.description ? (
          <div className="text-sm text-muted-foreground">{pack.description}</div>
        ) : null}

        {extra}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/knowledge-base/alias-packs">
            <ExternalLink className="mr-1 h-4 w-4" />
            查看
          </Link>
        </Button>
        {action && actionLabel ? (
          <Button variant="outline" size="sm" onClick={action} disabled={actionDisabled || actionPending}>
            {actionPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function BookKnowledgePanel({ bookId }: BookKnowledgePanelProps) {
  const [knowledgePacks, setKnowledgePacks] = useState<BookKnowledgePackListResult | null>(null);
  const [allPacks, setAllPacks] = useState<KnowledgePackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mountPriority, setMountPriority] = useState("10");
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [packs, candidates] = await Promise.all([
        fetchBookKnowledgePacks(bookId),
        fetchKnowledgePacks()
      ]);
      setKnowledgePacks(packs);
      setAllPacks(candidates);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "知识包加载失败");
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    void load();
  }, [load]);

  const effectivePackIds = useMemo(() => {
    if (!knowledgePacks) {
      return new Set<string>();
    }

    return new Set([
      ...knowledgePacks.mounted.map((item) => item.packId),
      ...knowledgePacks.inherited.map((item) => item.id)
    ]);
  }, [knowledgePacks]);

  const availablePacks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return allPacks
      .filter((pack) => pack.isActive)
      .filter((pack) => !effectivePackIds.has(pack.id))
      .filter((pack) => {
        if (!normalizedQuery) {
          return true;
        }

        const haystack = [
          pack.name,
          pack.description ?? "",
          pack.scope,
          pack.bookType?.name ?? "",
          pack.bookType?.key ?? ""
        ].join(" ").toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) => {
        if (left.scope !== right.scope) {
          return left.scope === "BOOK" ? -1 : 1;
        }
        return left.name.localeCompare(right.name, "zh-CN");
      });
  }, [allPacks, effectivePackIds, searchQuery]);

  async function handleMount(packId: string) {
    const priority = parsePriorityInput(mountPriority);
    if (priority === null) {
      toast.error("请输入合法的优先级整数");
      return;
    }

    setPendingActionKey(`mount:${packId}`);
    try {
      await mountBookKnowledgePack(bookId, { packId, priority });
      toast.success("知识包已挂载");
      setDialogOpen(false);
      setSearchQuery("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "知识包挂载失败");
    } finally {
      setPendingActionKey(null);
    }
  }

  async function handlePriorityChange(item: MountedBookKnowledgePackItem, delta: number) {
    const nextPriority = Math.max(0, item.priority + delta);
    if (nextPriority === item.priority) {
      return;
    }

    setPendingActionKey(`priority:${item.packId}`);
    try {
      await updateMountedBookKnowledgePackPriority(bookId, item.packId, nextPriority);
      toast.success("知识包优先级已更新");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "知识包优先级更新失败");
    } finally {
      setPendingActionKey(null);
    }
  }

  async function handleUnmount(item: MountedBookKnowledgePackItem) {
    setPendingActionKey(`unmount:${item.packId}`);
    try {
      await unmountBookKnowledgePack(bookId, item.packId);
      toast.success("知识包已移除");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "知识包移除失败");
    } finally {
      setPendingActionKey(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载知识包中...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="book-knowledge-panel space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <LibraryBig className="h-4 w-4" />
              书籍知识库
            </CardTitle>
            <div className="mt-1 text-sm text-muted-foreground">
              解析时会合并自动继承包与手动挂载包，手动挂载优先级更高。
            </div>
          </div>

          <Button type="button" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            挂载知识包
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-3">
            <div className="text-sm font-medium text-foreground">自动继承（书籍类型）</div>
            {knowledgePacks && knowledgePacks.inherited.length > 0 ? (
              <div className="space-y-3">
                {knowledgePacks.inherited.map((pack) => (
                  <PackSummaryRow key={`inherited:${pack.id}`} pack={pack} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                当前没有自动继承的书籍类型知识包。
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="text-sm font-medium text-foreground">手动挂载</div>
            {knowledgePacks && knowledgePacks.mounted.length > 0 ? (
              <div className="space-y-3">
                {knowledgePacks.mounted.map((item) => (
                  <PackSummaryRow
                    key={`mounted:${item.packId}`}
                    pack={item.pack}
                    action={() => void handleUnmount(item)}
                    actionLabel="移除"
                    actionPending={pendingActionKey === `unmount:${item.packId}`}
                    extra={
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span>priority: {item.priority}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => void handlePriorityChange(item, 1)}
                            disabled={pendingActionKey === `priority:${item.packId}`}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => void handlePriorityChange(item, -1)}
                            disabled={item.priority <= 0 || pendingActionKey === `priority:${item.packId}`}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          {pendingActionKey === `priority:${item.packId}` ? (
                            <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                          ) : null}
                        </div>
                        {!item.pack.isActive ? (
                          <span className="text-destructive">该包已停用，当前不会参与解析。</span>
                        ) : null}
                      </div>
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                当前未手动挂载知识包。
              </div>
            )}
          </section>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              挂载知识包
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_140px]">
              <div className="space-y-2">
                <Label htmlFor="knowledge-pack-search">搜索知识包</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="knowledge-pack-search"
                    className="pl-9"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="按名称、类型、scope 搜索"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="knowledge-pack-priority">挂载 priority</Label>
                <Input
                  id="knowledge-pack-priority"
                  type="number"
                  value={mountPriority}
                  onChange={(event) => setMountPriority(event.target.value)}
                />
              </div>
            </div>

            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {availablePacks.length > 0 ? (
                availablePacks.map((pack) => (
                  <PackSummaryRow
                    key={`available:${pack.id}`}
                    pack={{
                      id          : pack.id,
                      name        : pack.name,
                      description : pack.description,
                      version     : pack.version,
                      isActive    : pack.isActive,
                      scope       : pack.scope,
                      bookType    : pack.bookType,
                      _count      : pack._count,
                      statusCounts: pack.statusCounts
                    }}
                    action={() => void handleMount(pack.id)}
                    actionLabel="挂载"
                    actionPending={pendingActionKey === `mount:${pack.id}`}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  没有可挂载的知识包；如果你刚创建了新包，请先确保它已启用。
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
