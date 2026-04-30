"use client";

import { ChevronLeft, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { BookPersonaListItem } from "@/lib/services/books";

import {
  ROLE_FILTERS,
  ROLE_SORT_MODES,
  sourceLabel,
  type PendingCounts,
  type RoleListFilter,
  type RoleSortMode
} from "./role-review-utils";

interface RoleReviewSidebarProps {
  query            : string;
  roleFilter       : RoleListFilter;
  sortMode         : RoleSortMode;
  loading          : boolean;
  visibleRoles     : BookPersonaListItem[];
  selectedPersonaId: string | null;
  pendingCounts    : Map<string, PendingCounts>;
  onQueryChange    : (query: string) => void;
  onFilterChange   : (filter: RoleListFilter) => void;
  onSortModeChange : (sortMode: RoleSortMode) => void;
  onCollapse       : () => void;
  onSelectRole     : (personaId: string) => void;
}

export function RoleReviewSidebar({
  query,
  roleFilter,
  sortMode,
  loading,
  visibleRoles,
  selectedPersonaId,
  pendingCounts,
  onQueryChange,
  onFilterChange,
  onSortModeChange,
  onCollapse,
  onSelectRole
}: RoleReviewSidebarProps) {
  function handleSortModeChange(value: string) {
    if (value === "appearance" || value === "name" || value === "source") {
      onSortModeChange(value);
    }
  }

  return (
    <aside className="role-review-sidebar flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">角色资料</h3>
          <Button type="button" size="icon" variant="ghost" aria-label="折叠角色列表" onClick={onCollapse}>
            <ChevronLeft className="size-4" />
          </Button>
        </div>
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索角色、别名或标签"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {ROLE_FILTERS.map(filter => (
            <Button
              key={filter.value}
              type="button"
              size="sm"
              variant={roleFilter === filter.value ? "secondary" : "ghost"}
              onClick={() => onFilterChange(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
        <Select value={sortMode} onValueChange={handleSortModeChange}>
          <SelectTrigger size="sm" aria-label="角色排序方式" className="mt-2 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_SORT_MODES.map(mode => (
              <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && visibleRoles.map(persona => {
          const counts = pendingCounts.get(persona.id) ?? { relationships: 0, biographies: 0, aliases: 0 };
          return (
            <button
              key={persona.id}
              type="button"
              onClick={() => onSelectRole(persona.id)}
              className={`mb-2 w-full rounded-md border p-3 text-left transition-colors ${
                selectedPersonaId === persona.id
                  ? "border-primary bg-primary-subtle text-foreground"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{persona.name}</span>
                <Badge variant="outline">{sourceLabel(persona.recordSource)}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1 text-xs">
                <Badge variant="secondary">关系 {counts.relationships}</Badge>
                <Badge variant="secondary">传记 {counts.biographies}</Badge>
                <Badge variant="secondary">别名 {counts.aliases}</Badge>
              </div>
            </button>
          );
        })}
        {!loading && visibleRoles.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">暂无匹配角色</p>
        )}
      </div>
    </aside>
  );
}
