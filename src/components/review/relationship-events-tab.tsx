"use client";

import { MessageSquareText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BookPersonaListItem } from "@/lib/services/books";

import type { RoleRelationshipItem } from "./role-review-utils";

interface RelationshipEventsTabProps {
  persona          : BookPersonaListItem;
  relationships    : RoleRelationshipItem[];
  onOpenPersonaPair: (aId: string, bId: string) => void;
}

interface PairSummary {
  counterpartId  : string;
  counterpartName: string;
  typeLabels     : string[];
  relationshipIds: string[];
}

function buildPairSummaries(persona: BookPersonaListItem, relationships: RoleRelationshipItem[]): PairSummary[] {
  const byCounterpart = new Map<string, PairSummary>();

  for (const relationship of relationships) {
    const isOutgoing = relationship.sourcePersonaId === persona.id;
    const counterpartId = isOutgoing ? relationship.targetPersonaId : relationship.sourcePersonaId;
    const counterpartName = isOutgoing ? relationship.targetName : relationship.sourceName;
    const current = byCounterpart.get(counterpartId);

    if (current) {
      current.relationshipIds.push(relationship.id);
      if (!current.typeLabels.includes(relationship.type)) current.typeLabels.push(relationship.type);
      continue;
    }

    byCounterpart.set(counterpartId, {
      counterpartId,
      counterpartName,
      typeLabels     : [relationship.type],
      relationshipIds: [relationship.id]
    });
  }

  return Array.from(byCounterpart.values()).sort((left, right) => {
    if (left.relationshipIds.length !== right.relationshipIds.length) {
      return right.relationshipIds.length - left.relationshipIds.length;
    }
    return left.counterpartName.localeCompare(right.counterpartName, "zh-Hans-CN");
  });
}

export function RelationshipEventsTab({
  persona,
  relationships,
  onOpenPersonaPair
}: RelationshipEventsTabProps) {
  const pairs = buildPairSummaries(persona, relationships);

  return (
    <section aria-label="关系事件" className="relationship-events-tab flex flex-col gap-3">
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <MessageSquareText className="size-4" />
          按人物 Pair 录入/校对关系事件
        </div>
        <p className="mt-1">选择一个对方角色打开 Pair 抽屉，维护结构关系下的事件时间线。</p>
      </div>

      {pairs.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          当前角色暂无结构关系，先在「关系」分页新增关系后再录入事件。
        </div>
      )}

      <div className="grid gap-2">
        {pairs.map(pair => (
          <Button
            key={pair.counterpartId}
            type="button"
            variant="outline"
            className="h-auto justify-between gap-3 px-3 py-3 text-left"
            onClick={() => onOpenPersonaPair(persona.id, pair.counterpartId)}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{pair.counterpartName}</span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {pair.typeLabels.join("、")}
              </span>
            </span>
            <Badge variant="secondary">{pair.typeLabels.length} 类</Badge>
          </Button>
        ))}
      </div>
    </section>
  );
}
