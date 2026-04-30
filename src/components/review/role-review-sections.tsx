"use client";

import { Check, Edit3, Plus, Trash2, X as XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AliasMappingItem } from "@/lib/services/alias-mappings";
import type { BookPersonaListItem } from "@/lib/services/books";

import {
  BIO_CATEGORY_LABELS,
  type RoleBiographyItem,
  type RoleRelationshipItem
} from "./role-review-utils";

interface RoleBasicsSectionProps {
  persona: BookPersonaListItem;
}

export function RoleBasicsSection({ persona }: RoleBasicsSectionProps) {
  const firstAppearance = persona.firstAppearanceChapterNo === null
    ? "未设置"
    : `第${persona.firstAppearanceChapterNo}回${persona.firstAppearanceChapterTitle ? ` · ${persona.firstAppearanceChapterTitle}` : ""}`;

  return (
    <section className="role-basics-section grid gap-3 md:grid-cols-2">
      <InfoRow label="标准名" value={persona.name} />
      <InfoRow label="书内称谓" value={persona.localName} />
      <InfoRow label="出场章节" value={firstAppearance} />
      <InfoRow label="别名" value={persona.aliases.length > 0 ? persona.aliases.join("、") : "无"} />
      <InfoRow label="籍贯" value={persona.hometown ?? "未填写"} />
      <InfoRow label="官职/头衔" value={persona.officialTitle ?? "未填写"} />
      <InfoRow label="标签" value={[...persona.globalTags, ...persona.localTags].join("、") || "无"} />
      <div className="rounded-md border border-border p-3 md:col-span-2">
        <div className="text-xs text-muted-foreground">书内小传</div>
        <p className="mt-1 text-sm leading-6 text-foreground">{persona.localSummary ?? "未填写"}</p>
      </div>
    </section>
  );
}

interface RoleRelationshipsSectionProps {
  persona      : BookPersonaListItem;
  relationships: RoleRelationshipItem[];
  onCreate     : () => void;
  onEdit       : (relationship: RoleRelationshipItem) => void;
  onVerify     : (id: string) => void;
  onReject     : (id: string) => void;
}

export function RoleRelationshipsSection({
  persona,
  relationships,
  onCreate,
  onEdit,
  onVerify,
  onReject
}: RoleRelationshipsSectionProps) {
  return (
    <section className="role-relationships-section flex flex-col gap-3">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={onCreate}>
          <Plus className="size-4" />
          新增关系
        </Button>
      </div>
      {relationships.length === 0 && <EmptyState text="当前角色暂无待审关系" />}
      {relationships.map(relationship => {
        const isOutgoing = relationship.sourcePersonaId === persona.id;
        return (
          <article key={relationship.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
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
                  {relationship.confidence === null ? "" : ` · 置信度 ${Math.round(relationship.confidence * 100)}%`}
                </p>
                {relationship.evidence && <p className="mt-2 text-sm text-muted-foreground">{relationship.evidence}</p>}
              </div>
              <InlineActions
                onVerify={() => onVerify(relationship.id)}
                onReject={() => onReject(relationship.id)}
                onEdit={() => onEdit(relationship)}
              />
            </div>
          </article>
        );
      })}
    </section>
  );
}

interface RoleBiographiesSectionProps {
  biographies: RoleBiographyItem[];
  onCreate   : () => void;
  onEdit     : (biography: RoleBiographyItem) => void;
  onVerify   : (id: string) => void;
  onReject   : (id: string) => void;
  onDelete   : (id: string) => void;
}

export function RoleBiographiesSection({
  biographies,
  onCreate,
  onEdit,
  onVerify,
  onReject,
  onDelete
}: RoleBiographiesSectionProps) {
  return (
    <section className="role-biographies-section flex flex-col gap-3">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={onCreate}>
          <Plus className="size-4" />
          新增传记
        </Button>
      </div>
      {biographies.length === 0 && <EmptyState text="当前角色暂无待审传记事件" />}
      {biographies.map(biography => (
        <article key={biography.id} className="rounded-md border border-border bg-card p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{BIO_CATEGORY_LABELS[biography.category] ?? biography.category}</Badge>
                <span className="text-xs text-muted-foreground">第{biography.chapterNo}回</span>
              </div>
              {biography.title && <p className="mt-1 font-medium text-foreground">{biography.title}</p>}
              <p className="mt-1 text-sm leading-6 text-foreground">{biography.event}</p>
              {biography.location && <p className="text-xs text-muted-foreground">地点：{biography.location}</p>}
            </div>
            <div className="flex shrink-0 gap-1">
              <InlineActions onVerify={() => onVerify(biography.id)} onReject={() => onReject(biography.id)} onEdit={() => onEdit(biography)} />
              <button type="button" className="rounded p-1.5 text-destructive hover:bg-destructive/10" onClick={() => onDelete(biography.id)} aria-label="删除传记">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

interface RoleAliasesSectionProps {
  aliases : AliasMappingItem[];
  onCreate: () => void;
  onVerify: (id: string) => void;
  onReject: (id: string) => void;
}

export function RoleAliasesSection({ aliases, onCreate, onVerify, onReject }: RoleAliasesSectionProps) {
  return (
    <section className="role-aliases-section flex flex-col gap-3">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={onCreate}>
          <Plus className="size-4" />
          新增别名
        </Button>
      </div>
      {aliases.length === 0 && <EmptyState text="当前角色暂无别名映射" />}
      {aliases.map(mapping => (
        <article key={mapping.id} className="rounded-md border border-border bg-card p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{mapping.alias}</span>
                <Badge variant="outline">{mapping.aliasType}</Badge>
                <Badge variant={mapping.status === "PENDING" ? "secondary" : "outline"}>{mapping.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                指向：{mapping.resolvedName ?? "未确定"} · 置信度 {Math.round(mapping.confidence * 100)}%
              </p>
              {mapping.evidence && <p className="mt-1 text-sm text-muted-foreground">{mapping.evidence}</p>}
            </div>
            {mapping.status === "PENDING" && (
              <div className="flex shrink-0 gap-1">
                <button type="button" className="rounded p-1.5 text-success hover:bg-success/10" onClick={() => onVerify(mapping.id)} aria-label="确认别名">
                  <Check className="size-4" />
                </button>
                <button type="button" className="rounded p-1.5 text-destructive hover:bg-destructive/10" onClick={() => onReject(mapping.id)} aria-label="拒绝别名">
                  <XIcon className="size-4" />
                </button>
              </div>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

interface InlineActionsProps {
  onVerify: () => void;
  onReject: () => void;
  onEdit  : () => void;
}

function InlineActions({
  onVerify,
  onReject,
  onEdit
}: InlineActionsProps) {
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" className="rounded p-1.5 text-success hover:bg-success/10" onClick={onVerify} aria-label="确认">
        <Check className="size-4" />
      </button>
      <button type="button" className="rounded p-1.5 text-destructive hover:bg-destructive/10" onClick={onReject} aria-label="拒绝">
        <XIcon className="size-4" />
      </button>
      <button type="button" className="rounded p-1.5 text-muted-foreground hover:bg-muted" onClick={onEdit} aria-label="编辑">
        <Edit3 className="size-4" />
      </button>
    </div>
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

interface ImpactCountProps {
  label: string;
  value: number;
}

export function ImpactCount({ label, value }: ImpactCountProps) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

interface ImpactDetailsProps {
  title: string;
  rows : string[];
}

export function ImpactDetails({ title, rows }: ImpactDetailsProps) {
  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{rows.length} 条</span>
      </div>
      <div className="space-y-1 text-muted-foreground">
        {rows.length === 0 ? <p>无</p> : rows.map(row => <p key={row}>{row}</p>)}
      </div>
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
