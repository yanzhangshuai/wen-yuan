"use client";

import { Badge } from "@/components/ui/badge";
import type { AliasMappingItem } from "@/lib/services/alias-mappings";

import {
  BIO_CATEGORY_LABELS,
  sourceLabel,
  type RoleBiographyItem,
  type RoleEntityItem,
  type RoleRelationshipItem
} from "./role-review-utils";

/**
 * =============================================================================
 * 文件定位（角色资料工作台子组件：只读档案分块展示）
 * -----------------------------------------------------------------------------
 * v5 适配说明：
 * - v4 版支持“新增/编辑/确认/拒绝/删除”等手工维护动作；
 * - v5 roleWorkbench 为“审核草稿/合并建议”视角，不再手工建人物，手工编辑走
 *   已删除的 `/api/personas|biography|relationships` 顶层路由；
 * - 因此本文件收敛为纯只读展示，动作按钮与表单入口全部移除。
 * =============================================================================
 */

interface RoleBasicsSectionProps {
  entity: RoleEntityItem;
}

export function RoleBasicsSection({ entity }: RoleBasicsSectionProps) {
  return (
    <section className="role-basics-section grid gap-3 md:grid-cols-2">
      <InfoRow label="标准名" value={entity.name} />
      <InfoRow label="姓名类型" value={entity.nameType === "NAMED" ? "正式姓名" : "称谓"} />
      <InfoRow label="别名" value={entity.aliases.length > 0 ? entity.aliases.join("、") : "无"} />
      <InfoRow label="籍贯" value={entity.hometown ?? "未填写"} />
      <InfoRow label="数据来源" value={sourceLabel(entity.recordSource)} />
      <InfoRow label="置信度" value={`${Math.round(entity.confidence * 100)}%`} />
    </section>
  );
}

interface RoleRelationshipsSectionProps {
  entity       : RoleEntityItem;
  relationships: RoleRelationshipItem[];
}

export function RoleRelationshipsSection({ entity, relationships }: RoleRelationshipsSectionProps) {
  return (
    <section className="role-relationships-section flex flex-col gap-3">
      {relationships.length === 0 && <EmptyState text="当前角色暂无关系" />}
      {relationships.map(relationship => {
        const isOutgoing = relationship.sourcePersonaId === entity.id;
        return (
          <article key={relationship.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isOutgoing ? "default" : "outline"}>
                {isOutgoing ? "当前角色 -> 对方" : "对方 -> 当前角色"}
              </Badge>
              <span className="font-medium text-foreground">
                {relationship.sourceName} -&gt; {relationship.targetName}
              </span>
              <Badge variant="outline">{relationship.type}</Badge>
            </div>
            {!isOutgoing && (
              <p className="mt-1 text-xs text-muted-foreground">这是对端指向当前角色的入向边。</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              第{relationship.chapterNo}回 · 权重 {relationship.weight}
            </p>
            {relationship.evidence && <p className="mt-2 text-sm text-muted-foreground">{relationship.evidence}</p>}
          </article>
        );
      })}
    </section>
  );
}

interface RoleBiographiesSectionProps {
  biographies: RoleBiographyItem[];
}

export function RoleBiographiesSection({ biographies }: RoleBiographiesSectionProps) {
  return (
    <section className="role-biographies-section flex flex-col gap-3">
      {biographies.length === 0 && <EmptyState text="当前角色暂无传记事件" />}
      {biographies.map(biography => (
        <article key={biography.id} className="rounded-md border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{BIO_CATEGORY_LABELS[biography.category] ?? biography.category}</Badge>
            <span className="text-xs text-muted-foreground">第{biography.chapterNo}回</span>
            <Badge variant="outline">{sourceLabel(biography.recordSource)}</Badge>
          </div>
          {biography.title && <p className="mt-1 font-medium text-foreground">{biography.title}</p>}
          <p className="mt-1 text-sm leading-6 text-foreground">{biography.event}</p>
          {biography.location && <p className="text-xs text-muted-foreground">地点：{biography.location}</p>}
        </article>
      ))}
    </section>
  );
}

interface RoleAliasesSectionProps {
  aliases: AliasMappingItem[];
}

export function RoleAliasesSection({ aliases }: RoleAliasesSectionProps) {
  return (
    <section className="role-aliases-section flex flex-col gap-3">
      {aliases.length === 0 && <EmptyState text="当前角色暂无别名映射" />}
      {aliases.map(mapping => (
        <article key={mapping.id} className="rounded-md border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{mapping.alias}</span>
            <Badge variant="outline">{mapping.aliasType}</Badge>
            <Badge variant={mapping.status === "PENDING" ? "secondary" : "outline"}>{mapping.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            指向：{mapping.resolvedName ?? "未确定"} · 置信度 {Math.round(mapping.confidence * 100)}%
          </p>
          {mapping.evidence && <p className="mt-1 text-sm text-muted-foreground">{mapping.evidence}</p>}
        </article>
      ))}
    </section>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
}

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

interface EmptyStateProps {
  text: string;
}

function EmptyState({ text }: EmptyStateProps) {
  return (
    <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
