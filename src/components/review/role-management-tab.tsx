"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, Loader2, Plus, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import {
  createBookPersona,
  fetchBookPersonas,
  type BookPersonaListItem,
  type CreateBookPersonaBody
} from "@/lib/services/books";
import {
  deletePersona,
  fetchPersonaDeletePreview,
  patchPersona,
  type PersonaDeletePreview
} from "@/lib/services/personas";

interface RoleManagementTabProps {
  bookId: string;
}

type RoleListFilter = "all" | "ai" | "manual";
type RoleSortMode = "name" | "source";

const ROLE_FILTERS: { value: RoleListFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "ai", label: "AI生成" },
  { value: "manual", label: "手动创建" }
];

const ROLE_SORT_MODES: { value: RoleSortMode; label: string }[] = [
  { value: "name", label: "按角色名排序" },
  { value: "source", label: "按来源排序" }
];

interface PersonaFormState {
  name         : string;
  aliases      : string;
  gender       : string;
  hometown     : string;
  nameType     : string;
  globalTags   : string;
  localName    : string;
  localSummary : string;
  officialTitle: string;
  localTags    : string;
  ironyIndex   : string;
  confidence   : string;
}

const emptyForm: PersonaFormState = {
  name         : "",
  aliases      : "",
  gender       : "",
  hometown     : "",
  nameType     : "NAMED",
  globalTags   : "",
  localName    : "",
  localSummary : "",
  officialTitle: "",
  localTags    : "",
  ironyIndex   : "0",
  confidence   : "100"
};

function joinItems(items: string[]): string {
  return items.join("、");
}

function splitItems(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value.split(/[、,，]/)) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function formFromPersona(persona: BookPersonaListItem): PersonaFormState {
  return {
    name         : persona.name,
    aliases      : joinItems(persona.aliases),
    gender       : persona.gender ?? "",
    hometown     : persona.hometown ?? "",
    nameType     : persona.nameType,
    globalTags   : joinItems(persona.globalTags),
    localName    : persona.localName,
    localSummary : persona.localSummary ?? "",
    officialTitle: persona.officialTitle ?? "",
    localTags    : joinItems(persona.localTags),
    ironyIndex   : String(persona.ironyIndex),
    confidence   : String(Math.round(persona.confidence * 100))
  };
}

function sourceLabel(source: string): string {
  return source === "AI" ? "AI生成" : "手动创建";
}

function rowMatchesFilter(row: BookPersonaListItem, filter: RoleListFilter): boolean {
  if (filter === "all") return true;
  if (filter === "ai") return row.recordSource === "AI";
  return row.recordSource !== "AI";
}

function rowMatchesQuery(row: BookPersonaListItem, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;

  const searchable = [
    row.name,
    row.localName,
    row.hometown ?? "",
    row.officialTitle ?? "",
    row.localSummary ?? "",
    row.nameType,
    ...row.aliases,
    ...row.globalTags,
    ...row.localTags
  ].join(" ").toLowerCase();

  return searchable.includes(trimmed);
}

function sortRows(rows: BookPersonaListItem[], sortMode: RoleSortMode): BookPersonaListItem[] {
  const collator = new Intl.Collator("zh-Hans-CN");
  return [...rows].sort((left, right) => {
    if (sortMode === "source" && left.recordSource !== right.recordSource) {
      return collator.compare(sourceLabel(left.recordSource), sourceLabel(right.recordSource));
    }
    return collator.compare(left.name, right.name);
  });
}

function setKnownSortMode(value: string, setter: (mode: RoleSortMode) => void) {
  const mode = ROLE_SORT_MODES.find(item => item.value === value);
  if (mode) setter(mode.value);
}

function toCreateBody(form: PersonaFormState): CreateBookPersonaBody {
  return {
    name         : form.name.trim(),
    aliases      : splitItems(form.aliases),
    gender       : form.gender.trim() || null,
    hometown     : form.hometown.trim() || null,
    nameType     : form.nameType,
    globalTags   : splitItems(form.globalTags),
    localName    : form.localName.trim() || form.name.trim(),
    localSummary : form.localSummary.trim() || null,
    officialTitle: form.officialTitle.trim() || null,
    localTags    : splitItems(form.localTags),
    ironyIndex   : Number(form.ironyIndex) || 0,
    confidence   : Math.min(100, Math.max(0, Number(form.confidence) || 0)) / 100
  };
}

export function RoleManagementTab({ bookId }: RoleManagementTabProps) {
  const [personas, setPersonas] = useState<BookPersonaListItem[]>([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleListFilter>("all");
  const [sortMode, setSortMode] = useState<RoleSortMode>("name");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<BookPersonaListItem | null>(null);
  const [form, setForm] = useState<PersonaFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<BookPersonaListItem | null>(null);
  const [deletePreview, setDeletePreview] = useState<PersonaDeletePreview | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const visibleRows = useMemo(() => {
    return sortRows(
      personas.filter(row => rowMatchesFilter(row, roleFilter) && rowMatchesQuery(row, query)),
      sortMode
    );
  }, [personas, query, roleFilter, sortMode]);

  const loadPersonas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPersonas(await fetchBookPersonas(bookId));
    } catch {
      setError("角色列表加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    void loadPersonas();
  }, [loadPersonas]);

  useEffect(() => {
    if (!deletePreview) return;
    if (deletePreview.biographies.length > 0) {
      setExpanded("biographies");
      return;
    }
    if (deletePreview.relationships.length > 0) {
      setExpanded("relationships");
      return;
    }
    if (deletePreview.mentions.length > 0) {
      setExpanded("mentions");
      return;
    }
    setExpanded(null);
  }, [deletePreview]);

  function openCreate() {
    setEditingPersona(null);
    setForm(emptyForm);
    setSheetOpen(true);
  }

  function openEdit(persona: BookPersonaListItem) {
    setEditingPersona(persona);
    setForm(formFromPersona(persona));
    setSheetOpen(true);
  }

  async function savePersona() {
    if (!form.name.trim()) {
      setError("请填写角色姓名。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = toCreateBody(form);
      if (editingPersona) {
        await patchPersona(editingPersona.id, {
          ...body,
          bookId,
          localName: body.localName ?? body.name
        });
      } else {
        await createBookPersona(bookId, body);
      }
      setSheetOpen(false);
      await loadPersonas();
    } catch {
      setError("角色保存失败，请检查输入后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function openDelete(persona: BookPersonaListItem) {
    setDeleteTarget(persona);
    setDeletePreview(null);
    setExpanded(null);
    setDeleteLoading(true);
    setError(null);
    try {
      setDeletePreview(await fetchPersonaDeletePreview(persona.id, bookId));
    } catch {
      setError("删除影响预览加载失败，请稍后重试。");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deletePersona(deleteTarget.id, bookId);
      setDeleteTarget(null);
      setDeletePreview(null);
      await loadPersonas();
    } catch {
      setError("删除角色失败，请稍后重试。");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="role-management-tab flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-sm"
          placeholder="搜索角色名、别名或标签"
        />
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          <span className="ml-1">新增角色</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {ROLE_FILTERS.map(filter => (
            <Button
              key={filter.value}
              type="button"
              variant={roleFilter === filter.value ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setRoleFilter(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>排序</span>
          <Select value={sortMode} onValueChange={(value) => setKnownSortMode(value, setSortMode)}>
            <SelectTrigger size="sm" aria-label="角色排序方式" className="min-w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_SORT_MODES.map(mode => (
                <SelectItem key={mode.value} value={mode.value}>
                  {mode.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex min-h-48 items-center justify-center rounded-md border border-border">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && visibleRows.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          暂无匹配角色
        </div>
      )}

      {!loading && visibleRows.map(persona => (
        <article key={persona.id} className="rounded-md border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-foreground">{persona.name}</h3>
                {persona.localName !== persona.name && <Badge variant="outline">{persona.localName}</Badge>}
                <Badge variant="outline">{sourceLabel(persona.recordSource)}</Badge>
              </div>
              <div className="mt-2 grid gap-1 text-sm text-muted-foreground md:grid-cols-2">
                <p>别名：{persona.aliases.length > 0 ? persona.aliases.join("、") : "无"}</p>
                <p>籍贯：{persona.hometown ?? "未填写"}</p>
                <p>官职/头衔：{persona.officialTitle ?? "未填写"}</p>
                <p>置信度：{Math.round(persona.confidence * 100)}%</p>
              </div>
              {persona.localSummary && (
                <p className="mt-2 text-sm leading-6 text-foreground">{persona.localSummary}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" className="rounded p-1.5 text-muted-foreground hover:bg-muted" onClick={() => openEdit(persona)} aria-label="编辑角色">
                <Edit3 className="size-4" />
              </button>
              <button type="button" className="rounded p-1.5 text-destructive hover:bg-destructive/10" onClick={() => { void openDelete(persona); }} aria-label="删除角色">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        </article>
      ))}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{editingPersona ? "编辑角色" : "新增角色"}</SheetTitle>
            <SheetDescription>角色基础信息与当前书籍档案会一起保存。</SheetDescription>
          </SheetHeader>
          <div className="grid gap-3 px-4 sm:grid-cols-2">
            <FormInput label="姓名" value={form.name} onChange={(value) => setForm(prev => ({ ...prev, name: value }))} />
            <FormInput label="书中称谓" value={form.localName} onChange={(value) => setForm(prev => ({ ...prev, localName: value }))} />
            <FormInput label="别名（顿号分隔）" value={form.aliases} onChange={(value) => setForm(prev => ({ ...prev, aliases: value }))} />
            <FormInput label="性别" value={form.gender} onChange={(value) => setForm(prev => ({ ...prev, gender: value }))} />
            <FormInput label="籍贯" value={form.hometown} onChange={(value) => setForm(prev => ({ ...prev, hometown: value }))} />
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">姓名类型</span>
              <Select value={form.nameType} onValueChange={(value) => setForm(prev => ({ ...prev, nameType: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NAMED">正式姓名</SelectItem>
                  <SelectItem value="TITLE_ONLY">称谓</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <FormInput label="全局标签（顿号分隔）" value={form.globalTags} onChange={(value) => setForm(prev => ({ ...prev, globalTags: value }))} />
            <FormInput label="本书标签（顿号分隔）" value={form.localTags} onChange={(value) => setForm(prev => ({ ...prev, localTags: value }))} />
            <FormInput label="官职/头衔" value={form.officialTitle} onChange={(value) => setForm(prev => ({ ...prev, officialTitle: value }))} />
            <FormInput label="讽刺指数" type="number" value={form.ironyIndex} onChange={(value) => setForm(prev => ({ ...prev, ironyIndex: value }))} />
            <FormInput label="置信度 (%)" type="number" value={form.confidence} onChange={(value) => setForm(prev => ({ ...prev, confidence: value }))} />
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-muted-foreground">书内小传</span>
              <textarea
                value={form.localSummary}
                onChange={(event) => setForm(prev => ({ ...prev, localSummary: event.target.value }))}
                className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
          <SheetFooter>
            <Button onClick={() => { void savePersona(); }} disabled={saving}>
              {saving && <Loader2 className="mr-1 size-4 animate-spin" />}
              保存
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => {
        if (!open) setDeleteTarget(null);
      }}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除角色</AlertDialogTitle>
            <AlertDialogDescription>
              删除前请核对级联影响。确认后，该角色及当前书籍内关联数据会被软删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteLoading && !deletePreview && (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {deletePreview && (
            <div className="max-h-[520px] overflow-y-auto text-sm">
              <div className="grid gap-2 sm:grid-cols-4">
                <ImpactCount label="事迹" value={deletePreview.counts.biographyCount} />
                <ImpactCount label="关系" value={deletePreview.counts.relationshipCount} />
                <ImpactCount label="提及" value={deletePreview.counts.mentionCount} />
                <ImpactCount label="档案" value={deletePreview.counts.profileCount} />
              </div>
              <ImpactDetails
                title="受影响事迹"
                open={expanded === "biographies"}
                onToggle={() => setExpanded(expanded === "biographies" ? null : "biographies")}
                rows={deletePreview.biographies.map(item => `${item.chapter}：${item.title ? `${item.title} - ` : ""}${item.event}`)}
              />
              <ImpactDetails
                title="受影响关系"
                open={expanded === "relationships"}
                onToggle={() => setExpanded(expanded === "relationships" ? null : "relationships")}
                rows={deletePreview.relationships.map(item => `${item.chapter}：${item.sourceName} -> ${item.targetName}（${item.type}）${item.description ? ` - ${item.description}` : ""}`)}
              />
              <ImpactDetails
                title="受影响提及"
                open={expanded === "mentions"}
                onToggle={() => setExpanded(expanded === "mentions" ? null : "mentions")}
                rows={deletePreview.mentions.map(item => `${item.chapter}：${item.rawText}${item.summary ? ` - ${item.summary}` : ""}`)}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => {
              event.preventDefault();
              void confirmDelete();
            }} disabled={deleteLoading || !deletePreview}>
              {deleteLoading ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = "text"
}: {
  label   : string;
  value   : string;
  onChange: (value: string) => void;
  type?   : string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ImpactCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ImpactDetails({
  title,
  rows,
  open,
  onToggle
}: {
  title   : string;
  rows    : string[];
  open    : boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mt-3 rounded-md border border-border">
      <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left font-medium" onClick={onToggle}>
        <span>{title}</span>
        <span className="text-xs text-muted-foreground">{rows.length} 条</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-3 text-muted-foreground">
          {rows.length === 0 && <p>无</p>}
          {rows.map((row, index) => (
            <p key={`${row}-${index}`} className="leading-6">{row}</p>
          ))}
        </div>
      )}
    </div>
  );
}
