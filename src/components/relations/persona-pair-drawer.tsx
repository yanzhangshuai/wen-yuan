"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { fetchPersonaPair } from "@/lib/services/persona-pairs";
import type {
  PersonaPairEvent,
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
  onCreateEvent?       : (relationshipId: string) => void;
  onEditEvent?         : (eventId: string) => void;
  onDeleteEvent?       : (eventId: string) => void;
}

interface TagSummary {
  key  : string;
  label: string;
  count: number;
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

function chapterRangeText(relationship: PersonaPairRelationship): string {
  if (relationship.firstChapterNo === null && relationship.lastChapterNo === null) {
    return "章节未定";
  }
  if (relationship.firstChapterNo === relationship.lastChapterNo) {
    return `第 ${relationship.firstChapterNo} 回`;
  }
  return `第 ${relationship.firstChapterNo ?? "?"}-${relationship.lastChapterNo ?? "?"} 回`;
}

function buildTagSummary(relationships: PersonaPairRelationship[]): TagSummary[] {
  const byKey = new Map<string, TagSummary>();

  for (const relationship of relationships) {
    for (const event of relationship.events) {
      for (const tag of event.attitudeTags) {
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
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.label.localeCompare(b.label, "zh-Hans-CN");
  });
}

function sortedEvents(events: PersonaPairEvent[]): PersonaPairEvent[] {
  return [...events].sort((a, b) => {
    if (a.chapterNo !== b.chapterNo) return a.chapterNo - b.chapterNo;
    return (a.paraIndex ?? Number.MAX_SAFE_INTEGER) - (b.paraIndex ?? Number.MAX_SAFE_INTEGER);
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
  onCreateRelationship,
  onCreateEvent,
  onEditEvent,
  onDeleteEvent
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-[720px] lg:max-w-[50vw]">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{leftName} 与 {rightName} 的关系</SheetTitle>
          <SheetDescription>结构关系、事件时间线与态度标签聚合</SheetDescription>
        </SheetHeader>

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
                  {data.relationships.map((relationship) => {
                    const isExpanded = openRelationshipIds.has(relationship.id);
                    const events = sortedEvents(relationship.events);

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
                              <span>{relationship.eventCount} 事件</span>
                              <span>{chapterRangeText(relationship)}</span>
                            </span>
                          </button>

                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Badge variant={sourceBadgeVariant(relationship.recordSource)}>
                              {relationship.recordSource}
                            </Badge>
                            <Badge variant={statusBadgeVariant(relationship.status)}>
                              {relationship.status}
                            </Badge>
                            {events.length === 0 && <Badge variant="warning">待补充事件</Badge>}
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
                            {events.length === 0 ? (
                              <p className="text-sm text-muted-foreground">暂无关系事件</p>
                            ) : events.map(event => (
                              <div key={event.id} className="rounded-md bg-muted/40 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="font-medium">
                                    <span className="text-muted-foreground">第 {event.chapterNo} 回 · </span>
                                    <span>{event.summary}</span>
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    <Badge variant={sourceBadgeVariant(event.recordSource)}>{event.recordSource}</Badge>
                                    <Badge variant={statusBadgeVariant(event.status)}>{event.status}</Badge>
                                  </div>
                                </div>
                                {event.evidence && (
                                  <p className="mt-2 text-sm text-muted-foreground">{event.evidence}</p>
                                )}
                                {event.attitudeTags.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {event.attitudeTags.map((tag, index) => (
                                      <Badge key={`${event.id}-${tag}-${index}`} variant="outline">
                                        {tag.trim()}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                                {isAdmin && (
                                  <div className="mt-3 flex gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => onEditEvent?.(event.id)}
                                    >
                                      编辑事件
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => onDeleteEvent?.(event.id)}
                                    >
                                      删除事件
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}

                            {isAdmin && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => onCreateEvent?.(relationship.id)}
                              >
                                + 录入新事件
                              </Button>
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
          <SheetFooter className="border-t">
            <Button type="button" onClick={() => onCreateRelationship?.()}>
              + 新增结构关系
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
