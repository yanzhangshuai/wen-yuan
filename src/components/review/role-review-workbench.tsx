"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AliasMappingItem } from "@/lib/services/alias-mappings";
import type { DraftsData } from "@/lib/services/role-workbench";

import { RoleReviewSidebar } from "./role-review-sidebar";
import {
  RoleAliasesSection,
  RoleBasicsSection,
  RoleBiographiesSection,
  RoleRelationshipsSection
} from "./role-review-sections";
import {
  WORKSPACE_TABS,
  collectRoleFirstAppearanceChapters,
  roleMatchesFilter,
  roleMatchesQuery,
  sortRoles,
  sourceLabel,
  type PendingCounts,
  type RoleEntityItem,
  type RoleListFilter,
  type RoleSortMode,
  type WorkspaceTab
} from "./role-review-utils";

/**
 * =============================================================================
 * 文件定位（角色资料工作台主 Tab：只读实体档案视图）
 * -----------------------------------------------------------------------------
 * v5 适配说明：
 * - v4 版依赖 `/api/books/:id/personas`、`/api/personas|biography|relationships`
 *   等已删除路由做人物列表加载与手工增删改；
 * - v5 roleWorkbench 是“审核草稿/合并建议”视角，不再手工建人物；
 * - 因此本组件收敛为**只读实体档案视图**：实体列表取自 `drafts.personas`
 *   （EntityProfile + Entity），关系/传记/别名取自草稿与别名映射，去掉了
 *   新增/编辑/删除/表单/弹窗等全部写操作入口。
 * =============================================================================
 */

interface RoleReviewWorkbenchProps {
  /** 服务端/父层预取的草稿数据（实体 + 关系 + 传记）。 */
  drafts       : DraftsData;
  /** 别名映射列表（当前仅展示，数据由后端别名域提供）。 */
  aliasMappings: AliasMappingItem[];
}

export function RoleReviewWorkbench({
  drafts,
  aliasMappings
}: RoleReviewWorkbenchProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleListFilter>("all");
  const [sortMode, setSortMode] = useState<RoleSortMode>("appearance");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("basics");

  // 实体列表直接映射自草稿数据（drafts.personas 的行是 EntityProfile+Entity 联合）。
  const entities = useMemo<RoleEntityItem[]>(() => {
    return drafts.personas.map(item => ({
      id          : item.personaId,
      name        : item.name,
      aliases     : item.aliases,
      nameType    : item.nameType,
      recordSource: item.recordSource,
      confidence  : item.confidence,
      hometown    : item.hometown
    }));
  }, [drafts.personas]);

  // 各实体的待确认计数（关系/传记/别名），供侧栏角标展示。
  const pendingCounts = useMemo(() => {
    const counts = new Map<string, PendingCounts>();
    for (const entity of entities) {
      counts.set(entity.id, { relationships: 0, biographies: 0, aliases: 0 });
    }
    for (const relationship of drafts.relationships) {
      const source = counts.get(relationship.sourcePersonaId);
      if (source) source.relationships += 1;
      const target = counts.get(relationship.targetPersonaId);
      if (target && relationship.targetPersonaId !== relationship.sourcePersonaId) target.relationships += 1;
    }
    for (const biography of drafts.biographyRecords) {
      const count = counts.get(biography.personaId);
      if (count) count.biographies += 1;
    }
    for (const mapping of aliasMappings) {
      if (mapping.status !== "PENDING" || !mapping.entityId) continue;
      const count = counts.get(mapping.entityId);
      if (count) count.aliases += 1;
    }
    return counts;
  }, [entities, drafts.relationships, drafts.biographyRecords, aliasMappings]);

  const firstAppearanceChapters = useMemo(() => {
    return collectRoleFirstAppearanceChapters(drafts, aliasMappings);
  }, [drafts, aliasMappings]);

  const visibleEntities = useMemo(() => {
    return sortRoles(
      entities.filter(entity => roleMatchesFilter(entity, roleFilter) && roleMatchesQuery(entity, query)),
      sortMode,
      firstAppearanceChapters
    );
  }, [entities, roleFilter, query, sortMode, firstAppearanceChapters]);

  const selectedEntity =
    entities.find(entity => entity.id === selectedId) ?? visibleEntities[0] ?? entities[0] ?? null;

  const selectedRelationships = useMemo(() => {
    if (!selectedEntity) return [];
    return drafts.relationships.filter(relationship =>
      relationship.sourcePersonaId === selectedEntity.id || relationship.targetPersonaId === selectedEntity.id
    );
  }, [drafts.relationships, selectedEntity]);

  const selectedBiographies = useMemo(() => {
    if (!selectedEntity) return [];
    return drafts.biographyRecords
      .filter(biography => biography.personaId === selectedEntity.id)
      .sort((left, right) => left.chapterNo - right.chapterNo);
  }, [drafts.biographyRecords, selectedEntity]);

  const selectedAliases = useMemo(() => {
    if (!selectedEntity) return [];
    return aliasMappings.filter(mapping => mapping.entityId === selectedEntity.id);
  }, [aliasMappings, selectedEntity]);

  return (
    <div className="role-review-workbench grid h-full min-h-0 grid-rows-[minmax(0,240px)_minmax(0,1fr)] gap-3 overflow-hidden lg:grid-cols-[minmax(260px,320px)_1fr] lg:grid-rows-1">
      {!sidebarCollapsed && (
        <RoleReviewSidebar
          query={query}
          roleFilter={roleFilter}
          sortMode={sortMode}
          loading={false}
          visibleRoles={visibleEntities}
          selectedPersonaId={selectedEntity?.id ?? null}
          pendingCounts={pendingCounts}
          onQueryChange={setQuery}
          onFilterChange={setRoleFilter}
          onSortModeChange={setSortMode}
          onCollapse={() => setSidebarCollapsed(true)}
          onSelectRole={setSelectedId}
        />
      )}

      <main className="role-review-workspace flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border bg-background">
        {sidebarCollapsed && (
          <Button type="button" size="sm" variant="ghost" className="m-3" onClick={() => setSidebarCollapsed(false)}>
            <ChevronRight className="size-4" />
            展开角色列表
          </Button>
        )}
        {!selectedEntity && (
          <div className="p-8 text-center text-sm text-muted-foreground">暂无可展示的实体档案。</div>
        )}
        {selectedEntity && (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="shrink-0 border-b border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">{selectedEntity.name}</h3>
                <Badge variant="outline">{sourceLabel(selectedEntity.recordSource)}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                别名：{selectedEntity.aliases.length > 0 ? selectedEntity.aliases.join("、") : "无"} · 置信度 {Math.round(selectedEntity.confidence * 100)}%
              </p>
              <div className="mt-3 flex flex-wrap gap-1 rounded-md bg-muted p-1">
                {WORKSPACE_TABS.map(tab => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setActiveTab(tab.value)}
                    className={`rounded px-3 py-1.5 text-sm ${activeTab === tab.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {activeTab === "basics" && (
                <RoleBasicsSection entity={selectedEntity} />
              )}
              {activeTab === "relationships" && (
                <RoleRelationshipsSection entity={selectedEntity} relationships={selectedRelationships} />
              )}
              {activeTab === "biographies" && (
                <RoleBiographiesSection biographies={selectedBiographies} />
              )}
              {activeTab === "aliases" && (
                <RoleAliasesSection aliases={selectedAliases} />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
