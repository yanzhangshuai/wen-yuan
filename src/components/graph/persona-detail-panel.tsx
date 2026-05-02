"use client";

import { use, useMemo, useState } from "react";
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

import type { PersonaDetail, PersonaRelation, ProcessingStatus } from "@/types/graph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * =============================================================================
 * 文件定位（人物详情侧栏）
 * -----------------------------------------------------------------------------
 * 组件角色：图谱页面右侧人物详情面板。
 * 组件类型：Client Component。
 *
 * 核心职责：
 * - 展示人物主档信息、书内档案、时间轴事件、直接关系；
 * - 提供“查看证据原文”“进入编辑”入口；
 * - 在单人物维度承接图谱主画布点击后的详情呈现。
 *
 * React 特性说明：
 * - 该组件通过 `use(personaPromise)` 直接消费 Promise；
 * - 需要由父组件用 `Suspense` 包裹，加载/错误态由外层边界接管。
 *
 * 上下游关系：
 * - 上游：`GraphView` 传入 `personaPromise` 与当前 `bookId`；
 * - 下游：`TextReaderPanel` 由 `onEvidenceClick` 链路触发（不在本组件直接渲染）。
 *
 * 维护约束：
 * - 该面板按“当前书籍维度”过滤关系与时间轴，这是业务规则，不是技术限制；
 * - 不要把跨书混合数据直接展示到单书图谱上下文。
 * =============================================================================
 */

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface PersonaDetailPanelProps {
  /**
   * 人物详情 Promise（由上层创建）。
   * 设计原因：延迟按需加载详情，减少初始图谱页面负担。
   */
  personaPromise  : Promise<PersonaDetail>;
  /** 当前图谱所属书籍 ID，用于“单书视角”过滤详情数据。 */
  bookId          : string;
  /** 关闭面板回调。 */
  onClose         : () => void;
  /**
   * 点击证据回调（FG-06 增强）。
   * - chapterId / paraIndex：当前被点击的证据定位；
   * - allEvidence：该人物所有可用证据列表（可选），用于前后导航；
   * - clickedIndex：当前点击证据在 allEvidence 中的下标（可选）。
   */
  onEvidenceClick?: (
    chapterId   : string,
    paraIndex?  : number,
    allEvidence?: Array<{ chapterId: string; paraIndex?: number }>,
    clickedIndex?: number
  ) => void;
  /**
   * 点击编辑回调（可选，某些只读场景可能不开放编辑）。
   * 仅暴露 `personaId`，由上层决定跳转路由/权限校验，避免详情面板耦合业务流程。
   */
  onEditClick?: (personaId: string) => void;
  /** 点击人物 Pair 汇总入口，通常由上层打开 Pair 抽屉。 */
  onPairClick?: (aId: string, bId: string) => void;
}

interface PersonaPairSummary {
  counterpartId  : string;
  counterpartName: string;
  typeCount      : number;
  totalEvents    : number;
  relationshipIds: string[];
}

/* ------------------------------------------------
   Status badge
   ------------------------------------------------ */
/**
 * 状态徽标。
 * 业务语义：
 * - VERIFIED：人工确认通过；
 * - REJECTED：人工驳回；
 * - 其余默认草稿（待校对）。
 */
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
/**
 * 时间轴分类码到中文标签映射。
 * 说明：后端可返回标准枚举码，前端在此做人类可读转换。
 */
const BIO_CATEGORY_LABELS: Record<string, string> = {
  BIRTH : "出生",
  EXAM  : "科举",
  CAREER: "仕途",
  TRAVEL: "行旅",
  SOCIAL: "社交",
  DEATH : "逝世",
  EVENT : "事件"
};

function buildPairSummaries(relationships: PersonaRelation[]): PersonaPairSummary[] {
  const byCounterpart = new Map<string, {
    counterpartId  : string;
    counterpartName: string;
    typeLabels     : Set<string>;
    totalEvents    : number;
    relationshipIds: string[];
  }>();

  for (const relationship of relationships) {
    const current = byCounterpart.get(relationship.counterpartId);
    if (current) {
      current.typeLabels.add(relationship.type);
      current.totalEvents += relationship.eventCount ?? 0;
      current.relationshipIds.push(relationship.id);
      continue;
    }

    byCounterpart.set(relationship.counterpartId, {
      counterpartId  : relationship.counterpartId,
      counterpartName: relationship.counterpartName,
      typeLabels     : new Set([relationship.type]),
      totalEvents    : relationship.eventCount ?? 0,
      relationshipIds: [relationship.id]
    });
  }

  return Array.from(byCounterpart.values())
    .map(pair => ({
      counterpartId  : pair.counterpartId,
      counterpartName: pair.counterpartName,
      typeCount      : pair.typeLabels.size,
      totalEvents    : pair.totalEvents,
      relationshipIds: pair.relationshipIds
    }))
    .sort((left, right) => {
      if (left.totalEvents !== right.totalEvents) return right.totalEvents - left.totalEvents;
      if (left.typeCount !== right.typeCount) return right.typeCount - left.typeCount;
      return left.counterpartName.localeCompare(right.counterpartName, "zh-Hans-CN");
    });
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function PersonaDetailPanel({
  personaPromise,
  bookId,
  onClose,
  onEvidenceClick,
  onEditClick,
  onPairClick
}: PersonaDetailPanelProps) {
  /**
   * 直接消费 Promise（React 19 `use`）。
   * - pending: 由外层 Suspense fallback 接管；
   * - rejected: 由外层错误边界接管。
   */
  const persona = use(personaPromise);

  /** 当前关系类型筛选（只影响关系列表显示，不改源数据）。 */
  const [activeRelTypeFilter, setActiveRelTypeFilter] = useState<string | null>(null);

  /**
   * 当前书籍范围内的直接关系列表。
   * 业务原因：同一人物可出现在多本书，图谱页只看当前书语境。
   */
  const bookRelationships = persona?.relationships
    .filter(r => r.bookId === bookId)
    .filter(r => !activeRelTypeFilter || r.type === activeRelTypeFilter) ?? [];

  const pairSummaries = useMemo(() => {
    return buildPairSummaries(persona.relationships.filter(r => r.bookId === bookId));
  }, [bookId, persona.relationships]);

  /** 当前书籍范围内的时间轴事件。 */
  const bookTimeline = persona?.timeline
    .filter(t => t.bookId === bookId) ?? [];

  /**
   * 当前书籍所有可阅读证据列表（FG-06）。
   * 每条事件有 chapterId 即可作为证据入口，可选 paraIndex（暂时不传）。
   */
  // 保留时间轴天然顺序，让“上一条/下一条证据”与用户阅读顺序一致。
  const allEvidenceList = bookTimeline
    .filter(t => Boolean(t.chapterId))
    .map(t => ({ chapterId: t.chapterId }));

  /** 当前书籍范围内的人物档案（称谓、简介、标签等）。 */
  const bookProfile = persona?.profiles.find(p => p.bookId === bookId);

  /** 当前书籍内所有关系类型（供筛选按钮渲染）。 */
  // Set 会保持原出现顺序，筛选按钮顺序与用户看到的关系条目语义一致。
  const relTypes = [...new Set(persona?.relationships.filter(r => r.bookId === bookId).map(r => r.type) ?? [])];

  return (
    <aside className="persona-detail-panel absolute right-0 top-0 z-20 flex h-full w-96 flex-col border-l border-border/60 bg-card/80 backdrop-blur-md shadow-xl"
    >
      {/* 顶部栏：面板标题 + 关闭按钮。 */}
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

      {/* 主内容：按“身份信息 -> 档案 -> 时间轴 -> 关系”组织，符合阅读心智顺序。 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
        <div className="flex flex-col gap-5">
          {/* 姓名区：主名称 + 状态 + 当前书称谓 + 性别。 */}
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

          {/* 基础信息：别名和籍贯只在有值时展示，避免空字段噪声。 */}
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

          {/* 书内人物小传（若存在）。 */}
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

          {/* 书内标签。 */}
          {bookProfile && bookProfile.localTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {bookProfile.localTags.map(tag => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/*
            讽刺指数：
            - 仅当 > 0 时展示，避免“0 分”占用视觉注意力；
            - 采用进度条强化等级感知。
          */}
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

          {/*
            生平时间轴：
            - 按章节顺序展示事件；
            - 每条事件都可跳转查看原文证据。
          */}
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
                        onClick={() => {
                          // FG-06: 传入完整证据列表和当前下标，支持前后导航。
                          // 当前按 chapterId 反查下标：在同章多事件场景会落到首个匹配项，
                          // 这是现阶段证据定位协议（chapter 级）下的可接受行为。
                          const clickedIdx = allEvidenceList.findIndex(e => e.chapterId === evt.chapterId);
                          onEvidenceClick?.(evt.chapterId, undefined, allEvidenceList, clickedIdx >= 0 ? clickedIdx : 0);
                        }}
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

          {/*
            直接关系列表：
            - 先按当前书过滤；
            - 可进一步按关系类型筛选；
            - 展示当前筛选后条目数，帮助用户判断过滤结果。
          */}
          {persona.relationships.filter(r => r.bookId === bookId).length > 0 && (
            <section aria-label="与他/她的关系">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Users size={12} className="mr-1 inline" />
                与他/她的关系
              </h3>
              <div className="flex flex-col gap-1">
                {pairSummaries.map(pair => (
                  <button
                    key={pair.counterpartId}
                    type="button"
                    onClick={() => onPairClick?.(persona.id, pair.counterpartId)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{pair.counterpartName}</span>
                    </span>
                    <Badge variant="outline" className="text-xs">{pair.typeCount} 类</Badge>
                    <Badge variant="secondary" className="text-xs">{pair.totalEvents} 事件</Badge>
                    {pair.totalEvents === 0 && <Badge variant="warning" className="text-xs">待补充事件</Badge>}
                    <ChevronRight size={14} className="text-muted-foreground" />
                  </button>
                ))}
              </div>
            </section>
          )}

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

      {/*
        底部操作区：
        - 仅当上游传入 `onEditClick` 时展示，避免无权限场景误导用户。
      */}
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
