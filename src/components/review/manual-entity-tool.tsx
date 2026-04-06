"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Filter, GitMerge, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { fetchBookPersonas, type BookPersonaListItem } from "@/lib/services/books";
import { mergePersonas, splitPersona } from "@/lib/services/personas";
import { cn } from "@/lib/utils";

export interface ManualEntityToolProps {
  /** 当前审核上下文的书籍 ID。 */
  bookId: string;
  /** 人工合并/拆分成功后通知父层刷新。 */
  onDone: () => void;
}

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase();
}

function parseAliases(raw: string): string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const part of raw.split(/[、,，]/)) {
    const normalized = part.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    aliases.push(normalized);
  }
  return aliases;
}

function parseChapterNos(raw: string): number[] {
  const chapterSet = new Set<number>();
  for (const part of raw.split(/[、,，\s]+/)) {
    const normalized = part.trim();
    if (!normalized) {
      continue;
    }
    const value = Number(normalized);
    if (Number.isInteger(value) && value > 0) {
      chapterSet.add(value);
    }
  }
  return [...chapterSet].sort((a, b) => a - b);
}

function matchesPersona(persona: BookPersonaListItem, keyword: string): boolean {
  if (!keyword) {
    return true;
  }
  if (persona.name.toLowerCase().includes(keyword)) {
    return true;
  }
  if (persona.localName.toLowerCase().includes(keyword)) {
    return true;
  }
  return persona.aliases.some(alias => alias.toLowerCase().includes(keyword));
}

function formatPersonaOption(persona: BookPersonaListItem): string {
  if (persona.localName && persona.localName !== persona.name) {
    return `${persona.name}（书中称谓：${persona.localName}）`;
  }
  return persona.name;
}

function buildPersonaSearchValue(persona: BookPersonaListItem): string {
  return [
    persona.id,
    persona.name,
    persona.localName,
    ...persona.aliases
  ].join(" ").toLowerCase();
}

interface PersonaSearchSelectProps {
  value            : string;
  onChange         : (nextValue: string) => void;
  options          : BookPersonaListItem[];
  placeholder      : string;
  searchPlaceholder: string;
  emptyText        : string;
  excludedIds?     : Set<string>;
}

function PersonaSearchSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  excludedIds
}: PersonaSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedPersona = useMemo(
    () => options.find(persona => persona.id === value) ?? null,
    [options, value]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between px-2 text-sm font-normal"
        >
          <span className={cn("truncate text-left", !selectedPersona && "text-muted-foreground")}>
            {selectedPersona ? formatPersonaOption(selectedPersona) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {value && (
              <CommandItem
                value="__clear_selection__"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                清空选择
              </CommandItem>
            )}
            {options.map(persona => {
              const disabled = excludedIds?.has(persona.id) ?? false;
              const selected = persona.id === value;
              return (
                <CommandItem
                  key={persona.id}
                  value={buildPersonaSearchValue(persona)}
                  onSelect={() => {
                    if (disabled) {
                      return;
                    }
                    onChange(persona.id);
                    setOpen(false);
                  }}
                  className={cn(disabled && "pointer-events-none opacity-50")}
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0 text-primary transition-opacity",
                      selected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{formatPersonaOption(persona)}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ManualEntityTool({ bookId, onDone }: ManualEntityToolProps) {
  const [personas, setPersonas] = useState<BookPersonaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState("");

  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");

  const [splitSourceId, setSplitSourceId] = useState("");
  const [splitName, setSplitName] = useState("");
  const [splitAliases, setSplitAliases] = useState("");
  const [splitChapterNos, setSplitChapterNos] = useState("");

  const [actionLoading, setActionLoading] = useState<"merge" | "split" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    fetchBookPersonas(bookId)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setPersonas(data);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "人物列表加载失败");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const filteredPersonas = useMemo(() => {
    const keyword = normalizeKeyword(searchKeyword);
    return personas.filter(persona => matchesPersona(persona, keyword));
  }, [personas, searchKeyword]);

  const options = filteredPersonas.length > 0 ? filteredPersonas : personas;

  async function handleMerge(): Promise<void> {
    if (!mergeSourceId || !mergeTargetId) {
      setErrorMessage("请选择要合并的来源人物与目标人物");
      return;
    }
    if (mergeSourceId === mergeTargetId) {
      setErrorMessage("来源人物与目标人物不能相同");
      return;
    }

    setActionLoading("merge");
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await mergePersonas({
        sourceId: mergeSourceId,
        targetId: mergeTargetId
      });
      setSuccessMessage("人物合并成功");
      setMergeSourceId("");
      setMergeTargetId("");
      onDone();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "人物合并失败");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSplit(): Promise<void> {
    if (!splitSourceId) {
      setErrorMessage("请选择要拆分的人物");
      return;
    }

    const chapterNos = parseChapterNos(splitChapterNos);
    if (chapterNos.length === 0) {
      setErrorMessage("请填写需要迁移的章节号，例如 12,13,14");
      return;
    }

    const normalizedName = splitName.trim();
    if (!normalizedName) {
      setErrorMessage("请填写新人物名称");
      return;
    }

    setActionLoading("split");
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await splitPersona({
        sourceId: splitSourceId,
        bookId,
        chapterNos,
        name    : normalizedName,
        aliases : parseAliases(splitAliases)
      });
      setSuccessMessage("人物拆分成功");
      setSplitSourceId("");
      setSplitName("");
      setSplitAliases("");
      setSplitChapterNos("");
      onDone();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "人物拆分失败");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">人工人物修正</p>
          <p className="text-xs text-muted-foreground">支持人物搜索后执行手动合并或章节拆分</p>
        </div>
        <Badge variant="outline" className="text-xs">
          候选 {filteredPersonas.length}/{personas.length}
        </Badge>
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
        <Filter size={14} className="text-muted-foreground" />
        <Input
          value={searchKeyword}
          onChange={event => setSearchKeyword(event.target.value)}
          placeholder="按姓名 / 书中称谓 / 别名搜索人物"
          className="h-7 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
          aria-label="人物搜索"
        />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          正在加载人物池...
        </div>
      )}

      {!loading && personas.length === 0 && (
        <p className="text-sm text-muted-foreground">当前书籍暂无可操作人物。</p>
      )}

      {!loading && personas.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-md border border-border bg-muted/20 p-3">
            <p className="mb-2 flex items-center gap-1 text-sm font-medium text-foreground">
              <GitMerge size={14} />
              手动合并
            </p>
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">来源人物（将被并入）</span>
                <PersonaSearchSelect
                  value={mergeSourceId}
                  onChange={setMergeSourceId}
                  options={options}
                  placeholder="请选择来源人物"
                  searchPlaceholder="搜索来源人物"
                  emptyText="无匹配来源人物"
                  excludedIds={mergeTargetId ? new Set([mergeTargetId]) : undefined}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">目标人物（将被保留）</span>
                <PersonaSearchSelect
                  value={mergeTargetId}
                  onChange={setMergeTargetId}
                  options={options}
                  placeholder="请选择目标人物"
                  searchPlaceholder="搜索目标人物"
                  emptyText="无匹配目标人物"
                  excludedIds={mergeSourceId ? new Set([mergeSourceId]) : undefined}
                />
              </label>

              <Button
                size="sm"
                onClick={() => { void handleMerge(); }}
                disabled={actionLoading !== null}
              >
                {actionLoading === "merge" ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />}
                <span className="ml-1">执行合并</span>
              </Button>
            </div>
          </section>

          <section className="rounded-md border border-border bg-muted/20 p-3">
            <p className="mb-2 text-sm font-medium text-foreground">章节拆分</p>
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">来源人物</span>
                <PersonaSearchSelect
                  value={splitSourceId}
                  onChange={setSplitSourceId}
                  options={options}
                  placeholder="请选择来源人物"
                  searchPlaceholder="搜索来源人物"
                  emptyText="无匹配来源人物"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">新人物名称</span>
                <Input
                  value={splitName}
                  onChange={event => setSplitName(event.target.value)}
                  placeholder="例如：马二先生"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">迁移章节号</span>
                <Input
                  value={splitChapterNos}
                  onChange={event => setSplitChapterNos(event.target.value)}
                  placeholder="例如：12,13,14"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">新人物别名（可选）</span>
                <Input
                  value={splitAliases}
                  onChange={event => setSplitAliases(event.target.value)}
                  placeholder="例如：马二、马二爷"
                />
              </label>

              <Button
                size="sm"
                variant="outline"
                onClick={() => { void handleSplit(); }}
                disabled={actionLoading !== null}
              >
                {actionLoading === "split" ? <Loader2 size={14} className="animate-spin" /> : null}
                <span className={actionLoading === "split" ? "ml-1" : ""}>执行拆分</span>
              </Button>
            </div>
          </section>
        </div>
      )}

      {errorMessage && (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {errorMessage}
        </p>
      )}

      {successMessage && (
        <p className="mt-3 rounded-md border border-success/30 bg-success/10 px-2 py-1 text-xs text-success">
          {successMessage}
        </p>
      )}
    </div>
  );
}
