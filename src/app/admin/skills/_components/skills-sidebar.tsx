"use client";

/**
 * 技能管理：左侧技能名称菜单栏。
 * 支持按名称/描述搜索过滤；展示名称 + 启用状态 + 描述。
 */
import { Loader2, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { AdminSkillListItem } from "@/lib/services/skills";

import { scopeLabel, statusLabel } from "./constants";

interface SkillsSidebarProps {
  skills        : AdminSkillListItem[];
  selectedId    : string | null;
  loading       : boolean;
  search        : string;
  onSearchChange: (value: string) => void;
  onSelect      : (id: string) => void;
}

export function SkillsSidebar({
  skills,
  selectedId,
  loading,
  search,
  onSearchChange,
  onSelect
}: SkillsSidebarProps) {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r">
      <div className="border-b p-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索技能名称/描述..."
            className="pl-8 text-sm"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载技能列表...
          </div>
        ) : skills.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {search ? "未找到匹配的技能" : "暂无技能，可点击右上角「AI 生成」创建"}
          </div>
        ) : (
          <ul className="divide-y">
            {skills.map((skill) => (
              <li key={skill.id}>
                <button
                  type="button"
                  onClick={() => onSelect(skill.id)}
                  className={cn(
                    "hover:bg-accent/50 flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors",
                    selectedId === skill.id && "bg-accent text-accent-foreground"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{skill.name}</span>
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        skill.status === "ENABLED" ? "bg-emerald-500" : "bg-muted-foreground/40"
                      )}
                      title={skill.status === "ENABLED" ? "已启用" : "已停用"}
                    />
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {skill.description ?? ""}
                  </div>
                  <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
                    <span>{statusLabel(skill.status)}</span>
                    <span>{scopeLabel(skill.scope)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </aside>
  );
}
