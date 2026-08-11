"use client";

import {
  Calendar,
  ChevronRight,
  Edit3,
  MapPin,
  Tag,
  Users,
  X
} from "lucide-react";

import type { PersonaDetail, ProcessingStatus } from "@/types/graph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * =============================================================================
 * 文件定位（人物详情侧栏）
 * -----------------------------------------------------------------------------
 * 组件类型：Client Component。
 *
 * 核心职责：
 * - 图谱页面右侧人物详情面板，承接主画布节点点击后的详情呈现；
 * - 展示主档（别名/籍贯/小传）、书级档案（称谓/官职/讽刺指数/标签）、
 *   生平时间轴、直接关系列表；
 * - 数据由上游 `GraphView` 按 `PersonaDetail` 契约注入（已按当前书语境聚合）。
 *
 * 上下游关系：
 * - 上游：`GraphView`（负责按 bookId + personaId 拉取详情并传入）；
 * - 下游：无（纯展示，编辑动作通过回调委托上层）。
 *
 * 维护约束：
 * - 面板只做“当前书语境”展示，跨书数据不应在此混合；
 * - 空字段一律不渲染，避免无信息噪声。
 * =============================================================================
 */

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface PersonaDetailPanelProps {
  /** 人物详情聚合数据（已按当前书语境聚合）。 */
  detail : PersonaDetail;
  /** 关闭面板回调。 */
  onClose: () => void;
  /**
   * 编辑回调（可选）：跳转角色资料工作台等。
   * 仅透出 `personaId`，权限/路由由上层决定。
   */
  onEdit?: (personaId: string) => void;
}

/* ------------------------------------------------
   Helpers
   ------------------------------------------------ */
/** 时间轴分类码到中文标签映射（前端展示层做人类可读转换）。 */
const BIO_CATEGORY_LABELS: Record<string, string> = {
  BIRTH : "出生",
  EXAM  : "科举",
  CAREER: "仕途",
  TRAVEL: "行旅",
  SOCIAL: "社交",
  DEATH : "逝世",
  EVENT : "事件"
};

/**
 * 状态徽标。
 * 业务语义：VERIFIED 人工确认通过；REJECTED 已驳回；其余默认草稿。
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
   Section heading
   ------------------------------------------------ */
/** 面板分区标题（统一视觉，降低样式漂移）。 */
function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {icon}
      {children}
    </h3>
  );
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function PersonaDetailPanel({
  detail,
  onClose,
  onEdit
}: PersonaDetailPanelProps) {
  const profile = detail.profile;

  return (
    <aside className="persona-detail-panel absolute right-0 top-0 z-20 flex h-full w-96 flex-col border-l border-border/60 bg-card/80 shadow-xl backdrop-blur-md">
      {/* 顶部栏：面板标题 + 关闭按钮。 */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
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
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-5">
          {/* 姓名区：主名称 + 状态 + 官职/性别。 */}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-foreground">{detail.name}</h2>
              <StatusBadge status={detail.status} />
            </div>
            {profile?.officialTitle && (
              <p className="mt-0.5 text-sm text-muted-foreground">{profile.officialTitle}</p>
            )}
            {detail.gender && (
              <p className="mt-0.5 text-xs text-muted-foreground">{detail.gender}</p>
            )}
          </div>

          {/* 基础信息：别名和籍贯只在有值时展示，避免空字段噪声。 */}
          {(detail.aliases.length > 0 || detail.hometown) && (
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              {detail.aliases.length > 0 && (
                <div className="flex items-center gap-1">
                  <Tag size={14} />
                  <span>{detail.aliases.join("、")}</span>
                </div>
              )}
              {detail.hometown && (
                <div className="flex items-center gap-1">
                  <MapPin size={14} />
                  <span>{detail.hometown}</span>
                </div>
              )}
            </div>
          )}

          {/* 全局小传（跨书概述，仅在存在时展示）。 */}
          {detail.summary && (
            <div>
              <SectionTitle icon={<Tag size={12} className="mr-1 inline" />}>
                人物小传
              </SectionTitle>
              <p className="text-sm leading-relaxed text-foreground">{detail.summary}</p>
            </div>
          )}

          {/* 书内标签。 */}
          {profile && profile.localTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {profile.localTags.map(tag => (
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
          {profile && profile.ironyIndex > 0 && (
            <div>
              <SectionTitle icon={<Tag size={12} className="mr-1 inline" />}>
                讽刺指数
              </SectionTitle>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-(--color-warning) transition-all"
                    style={{ width: `${Math.min(profile.ironyIndex * 10, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {profile.ironyIndex}/10
                </span>
              </div>
            </div>
          )}

          {/*
            生平时间轴：按章节顺序展示事件，每条事件可点击查看原文证据。
          */}
          {detail.timeline.length > 0 && (
            <div>
              <SectionTitle icon={<Calendar size={12} className="mr-1 inline" />}>
                生平时间轴
              </SectionTitle>
              <div className="relative ml-2 border-l-2 border-border pl-4">
                {detail.timeline.map(evt => (
                  <div key={evt.id} className="relative mb-3 pb-1">
                    <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <div className="flex items-start gap-1.5">
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
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/*
            直接关系列表：展示与他/她关系的所有对象与关系类型。
          */}
          {detail.relationships.length > 0 && (
            <section aria-label="与他/她的关系">
              <SectionTitle icon={<Users size={12} className="mr-1 inline" />}>
                与他/她的关系
              </SectionTitle>
              <div className="flex flex-col gap-1">
                {detail.relationships.map(rel => (
                  <div
                    key={rel.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {rel.counterpartName}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {rel.type}
                    </Badge>
                    {rel.factCount > 1 && (
                      <Badge variant="secondary" className="text-xs">
                        {rel.factCount} 事件
                      </Badge>
                    )}
                    <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 出场统计：提及次数 + 首次出场章节。 */}
          {detail.appearanceCount > 0 && (
            <div className="text-xs text-muted-foreground">
              全书出场 {detail.appearanceCount} 次
              {detail.firstAppearanceChapterNo ? `，首次出现于第 ${detail.firstAppearanceChapterNo} 回` : ""}
            </div>
          )}
        </div>
      </div>

      {/* 底部操作区：仅当上游传入 onEdit 时展示，避免无权限场景误导用户。 */}
      {onEdit && (
        <div className="shrink-0 border-t border-border px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onEdit(detail.id)}
          >
            <Edit3 size={14} className="mr-1" />
            校对此人物
          </Button>
        </div>
      )}
    </aside>
  );
}
