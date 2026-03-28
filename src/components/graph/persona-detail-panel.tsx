"use client";

import { use, useState } from "react";
import {
  X,
  MapPin,
  Calendar,
  Users,
  Tag,
  BookOpen,
  ChevronRight,
  Edit3
} from "lucide-react";

import type { PersonaDetail, ProcessingStatus } from "@/types/graph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface PersonaDetailPanelProps {
  personaPromise  : Promise<PersonaDetail>;
  bookId          : string;
  onClose         : () => void;
  onEvidenceClick?: (chapterId: string, paraIndex?: number) => void;
  onEditClick?    : (personaId: string) => void;
}

/* ------------------------------------------------
   Status badge
   ------------------------------------------------ */
function StatusBadge({ status }: { status: ProcessingStatus }) {
  if (status === "VERIFIED") {
    return <Badge className="bg-success text-white">已审核</Badge>;
  }
  if (status === "REJECTED") {
    return <Badge variant="destructive">已拒绝</Badge>;
  }
  return <Badge variant="outline" className="border-dashed">草稿</Badge>;
}

/* ------------------------------------------------
   Bio category labels
   ------------------------------------------------ */
const BIO_CATEGORY_LABELS: Record<string, string> = {
  BIRTH : "出生",
  EXAM  : "科举",
  CAREER: "仕途",
  TRAVEL: "行旅",
  SOCIAL: "社交",
  DEATH : "逝世",
  EVENT : "事件"
};

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function PersonaDetailPanel({
  personaPromise,
  bookId,
  onClose,
  onEvidenceClick,
  onEditClick
}: PersonaDetailPanelProps) {
  const persona = use(personaPromise);
  const [activeRelTypeFilter, setActiveRelTypeFilter] = useState<string | null>(null);

  // Filter relationships to this book, apply type filter
  const bookRelationships = persona?.relationships
    .filter(r => r.bookId === bookId)
    .filter(r => !activeRelTypeFilter || r.type === activeRelTypeFilter) ?? [];

  const bookTimeline = persona?.timeline
    .filter(t => t.bookId === bookId) ?? [];

  const bookProfile = persona?.profiles.find(p => p.bookId === bookId);

  const relTypes = [...new Set(persona?.relationships.filter(r => r.bookId === bookId).map(r => r.type) ?? [])];

  return (
    <aside className="persona-detail-panel glass absolute right-0 top-0 z-20 flex h-full w-96 flex-col border-l border-border shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">人物详情</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="关闭面板"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
        <div className="flex flex-col gap-5">
            {/* Name & status */}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground">
                  {persona.name}
                </h2>
                <StatusBadge status={persona.status} />
              </div>
              {bookProfile?.officialTitle && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {bookProfile.officialTitle}
                </p>
              )}
              {persona.gender && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {persona.gender}
                </p>
              )}
            </div>

            {/* Basic info */}
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              {persona.aliases.length > 0 && (
                <div className="flex items-center gap-1">
                  <Tag size={14} />
                  <span>{persona.aliases.join("、")}</span>
                </div>
              )}
              {persona.hometown && (
                <div className="flex items-center gap-1">
                  <MapPin size={14} />
                  <span>{persona.hometown}</span>
                </div>
              )}
            </div>

            {/* Summary */}
            {bookProfile?.localSummary && (
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  人物小传
                </h3>
                <p className="text-sm leading-relaxed text-foreground">
                  {bookProfile.localSummary}
                </p>
              </div>
            )}

            {/* Tags */}
            {bookProfile && bookProfile.localTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {bookProfile.localTags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Irony index */}
            {bookProfile && bookProfile.ironyIndex > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  讽刺指数
                </h3>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-(--color-warning) transition-all"
                      style={{ width: `${bookProfile.ironyIndex * 10}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {bookProfile.ironyIndex}/10
                  </span>
                </div>
              </div>
            )}

            {/* Timeline */}
            {bookTimeline.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Calendar size={12} className="mr-1 inline" />
                  生平时间轴
                </h3>
                <div className="relative ml-2 border-l-2 border-border pl-4">
                  {bookTimeline.map(evt => (
                    <div key={evt.id} className="relative mb-3 pb-1">
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-primary">
                              第{evt.chapterNo}回
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {BIO_CATEGORY_LABELS[evt.category] ?? evt.category}
                            </span>
                          </div>
                          {evt.title && (
                            <p className="text-sm font-medium text-foreground">{evt.title}</p>
                          )}
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {evt.event}
                          </p>
                          {evt.location && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin size={10} /> {evt.location}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onEvidenceClick?.(evt.chapterId)}
                          className="ml-1 shrink-0 rounded p-1 text-muted-foreground hover:text-primary"
                          aria-label="查看原文"
                          title="查看原文"
                        >
                          <BookOpen size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Relationships */}
            {persona.relationships.filter(r => r.bookId === bookId).length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Users size={12} className="mr-1 inline" />
                  直接关系 ({bookRelationships.length})
                </h3>
                {relTypes.length > 1 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setActiveRelTypeFilter(null)}
                      className={`rounded-sm px-2 py-0.5 text-xs ${!activeRelTypeFilter ? "bg-primary-subtle text-primary" : "text-muted-foreground"}`}
                    >
                      全部
                    </button>
                    {relTypes.map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setActiveRelTypeFilter(t)}
                        className={`rounded-sm px-2 py-0.5 text-xs ${activeRelTypeFilter === t ? "bg-primary-subtle text-primary" : "text-muted-foreground"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  {bookRelationships.map(rel => (
                    <div
                      key={rel.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                    >
                      <span className="flex-1 text-foreground">
                        {rel.counterpartName}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {rel.type}
                      </Badge>
                      <ChevronRight size={14} className="text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      </div>

      {/* Footer: edit button */}
      {onEditClick && (
        <div className="border-t border-border px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onEditClick(persona.id)}
          >
            <Edit3 size={14} className="mr-1" />
            校对此人物
          </Button>
        </div>
      )}
    </aside>
  );
}
