"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { PersonaCard } from "./persona-card";
import {
  computePersonaProgress,
  filterPersonaListItems,
  findNextPendingPersonaId,
  sortPersonaListItems,
  type PersonaListItem,
  type PersonaSortKey,
  type PersonaStatusFilter
} from "./persona-list-summary";

interface PersonaSidebarProps {
  items            : PersonaListItem[];
  selectedPersonaId: string | null;
  onSelect         : (personaId: string | null) => void
}

const STATUS_OPTIONS: { value: PersonaStatusFilter; label: string }[] = [
  { value: "pending",  label: "待审核" },
  { value: "conflict", label: "冲突" },
  { value: "done",     label: "已完成" }
];

export function PersonaSidebar({ items, selectedPersonaId, onSelect }: PersonaSidebarProps) {
  const [keyword,       setKeyword]       = useState("");
  const [sortKey,       setSortKey]       = useState<PersonaSortKey>("first-chapter");
  const [statusFilters, setStatusFilters] = useState<PersonaStatusFilter[]>([]);

  const visible = useMemo(() => {
    const filtered = filterPersonaListItems(items, keyword, statusFilters);
    return sortPersonaListItems(filtered, sortKey);
  }, [items, keyword, sortKey, statusFilters]);

  const progress      = useMemo(() => computePersonaProgress(items), [items]);
  const nextPendingId = useMemo(
    () => findNextPendingPersonaId(items, selectedPersonaId),
    [items, selectedPersonaId]
  );

  const toggleStatus = (s: PersonaStatusFilter) => {
    setStatusFilters((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  return (
    <aside className="sticky top-20 flex max-h-[calc(100vh-6rem)] w-72 shrink-0 flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>已审 {progress.reviewed} / 总 {progress.total}</span>
          <span>{Math.round(progress.ratio * 100)}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary/60" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
        </div>
        <Button
          size     ="sm"
          variant  ="outline"
          className="w-full"
          disabled ={nextPendingId === null}
          onClick  ={() => nextPendingId && onSelect(nextPendingId)}
        >
          {nextPendingId === null ? "全部已审 ✓" : "下一个待审 →"}
        </Button>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="搜索角色或别名"
          value      ={keyword}
          onChange   ={(e) => setKeyword(e.target.value)}
          className  ="h-8 pl-7 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as PersonaSortKey)}>
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="first-chapter">叙事顺序</SelectItem>
            <SelectItem value="pending-desc">待审优先</SelectItem>
            <SelectItem value="event-desc">事迹最多</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-1">
        {STATUS_OPTIONS.map((opt) => (
          <Toggle
            key            ={opt.value}
            size           ="sm"
            pressed        ={statusFilters.includes(opt.value)}
            onPressedChange={() => toggleStatus(opt.value)}
            className      ="h-6 px-2 text-xs"
          >
            {opt.label}
          </Toggle>
        ))}
      </div>
      <div role="listbox" aria-label="角色列表" className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">未匹配到角色</div>
        ) : (
          visible.map((item) => (
            <PersonaCard
              key       ={item.personaId}
              item      ={item}
              isSelected={item.personaId === selectedPersonaId}
              onSelect  ={onSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
}
