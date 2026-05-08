"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchPersonaPair } from "@/lib/services/persona-pairs";
import type {
  PersonaPairRelationship,
  PersonaPairResponse
} from "@/types/persona-pair";

export interface PersonaPairDrawerProps {
  open                 : boolean;
  onOpenChange         : (open: boolean) => void;
  bookId               : string;
  aId                  : string;
  bId                  : string;
  role                 : "admin" | "viewer";
  onEditRelationship?  : (relationshipId: string) => void;
  onCreateRelationship?: () => void;
}

function statusBadgeVariant(status: PersonaPairRelationship["status"]  ) {
  if (status === "VERIFIED") return "success";
  if (status === "DRAFT") return "warning";
  return "secondary";
}

function sourceBadgeVariant(source: PersonaPairRelationship["recordSource"]  ) {
  if (source === "MANUAL") return "success";
  if (source === "DRAFT_AI") return "warning";
  return "secondary";
}

function buildTagSummary(relationships: PersonaPairRelationship[]): { key: string; label: string; count: number }[] {
  const byKey = new Map<string, { key: string; label: string; count: number }>();

  for (const relationship of relationships) {
    for (const tag of relationship.attitudeTags) {
      const label = tag.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      byKey.set(key, { key, label, count: 1 });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.label.localeCompare(b.label, "zh-Hans-CN");
  });
}

function sortedRelationships(relationships: PersonaPairRelationship[]): PersonaPairRelationship[] {
  return [...relationships].sort((a, b) => {
    const aNo = a.chapterNo ?? Number.MAX_SAFE_INTEGER;
    const bNo = b.chapterNo ?? Number.MAX_SAFE_INTEGER;
    return aNo - bNo;
  });
}

function personaName(data: PersonaPairResponse | null, id: string): string {
  return data?.personas.find(persona => persona.id === id)?.name ?? id;
}

export function PersonaPairDrawer({
  open,
  onOpenChange,
  bookId,
  aId,
  bId,
  role,
  onEditRelationship,
  onCreateRelationship
}: PersonaPairDrawerProps) {
  const [data, setData] = useState<PersonaPairResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openRelationshipIds, setOpenRelationshipIds] = useState<Set<string>>(new Set());
  const isAdmin = role === "admin";

  useEffect(() => {
    if (!open) return;

    let ignore = false;
    setIsLoading(true);
    setError(null);

    fetchPersonaPair(bookId, aId, bId)
      .then((nextData) => {
        if (ignore) return;
        setData(nextData);
        setOpenRelationshipIds(
          nextData.relationships.length === 1
            ? new Set([nextData.relationships[0].id])
            : new Set()
        );
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "人物关系加载失败");
        setData(null);
        setOpenRelationshipIds(new Set());
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [open, bookId, aId, bId]);

  const tagSummary = useMemo(() => buildTagSummary(data?.relationships ?? []), [data]);
  const leftName = personaName(data, aId);
  const rightName = personaName(data, bId);

  function toggleRelationship(id: string) {
    setOpenRelationshipIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (!open) return null;

  return (
    <div className="persona-pair-panel rounded-md border bg-card">
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div>
          <div className="text-sm font-semibold">{leftName} 与 {rightName} 的关系</div>
          <div className="mt-1 text-xs text-muted-foreground">结构关系与态度标签聚合</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="关闭"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

        <div className="flex flex-1 flex-col gap-4 p-4">
          {isLoading && <p className="text-sm text-muted-foreground">正在加载人物关系...</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {!isLoading && !error && data && (
            <>
              <section className="flex flex-wrap gap-2" aria-label="态度标签聚合">
                {tagSummary.length > 0
                  ? tagSummary.map(tag => (
                    <Badge key={tag.key} variant="outline">{tag.label} ×{tag.count}</Badge>
                  ))
                  : <span className="text-sm text-muted-foreground">暂无态度标签</span>}
              </section>

              {data.relationships.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  暂无结构关系
                </div>
              ) : (
                <section className="space-y-3" aria-label="结构关系列表">
                  {sortedRelationships(data.relationships).map((relationship) => {
                    const isExpanded = openRelationshipIds.has(relationship.id);
                    const chapterLabel = relationship.chapterNo ? `第 ${relationship.chapterNo} 回` : "章节未定";

                    return (
                      <article key={relationship.id} className="rounded-md border bg-card">
                        <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            aria-expanded={isExpanded}
                            onClick={() => toggleRelationship(relationship.id)}
                          >
                            <span className="block font-medium">{relationship.relationshipType.name}</span>
                            <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span>{chapterLabel}</span>
                            </span>
                          </button>

                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Badge variant={sourceBadgeVariant(relationship.recordSource)}>
                              {relationship.recordSource}
                            </Badge>
                            <Badge variant={statusBadgeVariant(relationship.status)}>
                              {relationship.status}
                            </Badge>
                            {!relationship.summary && <Badge variant="warning">待补充摘要</Badge>}
                            {isAdmin && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => onEditRelationship?.(relationship.id)}
                              >
                                编辑关系
                              </Button>
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="space-y-3 border-t px-4 py-3">
                            {relationship.summary && (
                              <p className="font-medium">
                                <span className="text-muted-foreground">第 {relationship.chapterNo ?? "?"} 回 · </span>
                                <span>{relationship.summary}</span>
                              </p>
                            )}
                            {relationship.evidence && (
                              <p className="text-sm text-muted-foreground">{relationship.evidence}</p>
                            )}
                            {relationship.attitudeTags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {relationship.attitudeTags.map((tag, index) => (
                                  <Badge key={`${relationship.id}-${tag}-${index}`} variant="outline">
                                    {tag.trim()}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {!relationship.summary && !relationship.evidence && relationship.attitudeTags.length === 0 && (
                              <p className="text-sm text-muted-foreground">暂无详细信息</p>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </section>
              )}
            </>
          )}
        </div>

        {isAdmin && (
          <div className="border-t p-4">
            <Button type="button" onClick={() => onCreateRelationship?.()}>
              + 新增结构关系
            </Button>
          </div>
        )}
      </div>
  );
}
