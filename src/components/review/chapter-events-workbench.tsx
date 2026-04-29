"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Tags,
  Trash2,
  X
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectEmptyItem,
  SelectItem,
  SelectTrigger,
  SelectValue,
  isSelectEmptyValue
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { fetchBookPersonas, fetchChapterContent, type BookPersonaListItem, type ChapterContent } from "@/lib/services/books";
import { cn } from "@/lib/utils";
import {
  createChapterEvent,
  deleteChapterEvent,
  fetchChapterEventChapters,
  fetchChapterEvents,
  markChapterEventsVerified,
  updateChapterEvent,
  type ChapterEventChapterData,
  type ChapterEventItem,
  type ChapterEventMutationBody
} from "@/lib/services/reviews";

interface ChapterEventsWorkbenchProps {
  bookId     : string;
  onOpenRoles: () => void;
}

interface EventFormState {
  personaId   : string;
  chapterId   : string;
  category    : string;
  title       : string;
  location    : string;
  virtualYear : string;
  tags        : string[];
  mainCategory: MainCategoryValue;
  event       : string;
  ironyNote   : string;
}

type ViewMode = "grouped" | "source";

type MainCategoryValue =
  | "LIFE_NODE"
  | "IDENTITY_MERIT"
  | "MOVEMENT"
  | "RELATIONSHIP"
  | "LIVELIHOOD"
  | "PLOT";

const MAIN_CATEGORY_OPTIONS: { value: MainCategoryValue; label: string; category: string; hint: string }[] = [
  { value: "LIFE_NODE", label: "生平节点", category: "BIRTH", hint: "出生、逝世、重大节点" },
  { value: "IDENTITY_MERIT", label: "身份功名", category: "CAREER", hint: "科举、任职、身份变化" },
  { value: "MOVEMENT", label: "行踪迁移", category: "TRAVEL", hint: "进京、返乡、逃亡、迁居" },
  { value: "RELATIONSHIP", label: "人际关系", category: "SOCIAL", hint: "拜访、结盟、婚姻、冲突" },
  { value: "LIVELIHOOD", label: "生计财产", category: "EVENT", hint: "谋生、经营、贫富变化" },
  { value: "PLOT", label: "情节事迹", category: "EVENT", hint: "学艺、受骗、诉讼等情节" }
];

const MAIN_CATEGORY_BY_VALUE = new Map(MAIN_CATEGORY_OPTIONS.map(option => [option.value, option]));

const BIO_CATEGORY_LEGACY_LABELS: Record<string, string> = {
  BIRTH : "出生",
  EXAM  : "科举",
  CAREER: "仕途",
  TRAVEL: "行旅",
  SOCIAL: "社交",
  DEATH : "逝世",
  EVENT : "事件"
};

const TAG_PRESETS = [
  "生计财产",
  "放牧",
  "谋生",
  "贫寒生活",
  "学艺",
  "绘画",
  "才艺成长",
  "逃亡",
  "避难",
  "迁居",
  "任职",
  "拜访",
  "冲突",
  "婚姻",
  "疾病",
  "诉讼",
  "受骗",
  "宴饮"
];

const STATUS_LABELS: Record<string, string> = {
  DRAFT   : "待审核",
  VERIFIED: "已确认",
  REJECTED: "已拒绝"
};

function emptyForm(chapterId: string): EventFormState {
  return {
    personaId   : "",
    chapterId,
    category    : "EVENT",
    title       : "",
    location    : "",
    virtualYear : "",
    tags        : [],
    mainCategory: "PLOT",
    event       : "",
    ironyNote   : ""
  };
}

function inferMainCategory(category: string, tags: string[] = []): MainCategoryValue {
  if (category === "BIRTH" || category === "DEATH") return "LIFE_NODE";
  if (category === "EXAM" || category === "CAREER") return "IDENTITY_MERIT";
  if (category === "TRAVEL") return "MOVEMENT";
  if (category === "SOCIAL") return "RELATIONSHIP";
  if (tags.some(tag => ["生计财产", "放牧", "谋生", "贫寒生活", "经营", "财产"].includes(tag))) return "LIVELIHOOD";
  return "PLOT";
}

function getMainCategoryLabel(event: ChapterEventItem): string {
  return MAIN_CATEGORY_BY_VALUE.get(inferMainCategory(event.category, event.tags))?.label ?? "情节事迹";
}

function getEventStateLabel(event: ChapterEventItem): string {
  if (event.recordSource === "MANUAL") return "手动创建";
  return STATUS_LABELS[event.status] ?? event.status;
}

function formFromEvent(event: ChapterEventItem): EventFormState {
  return {
    personaId   : event.personaId,
    chapterId   : event.chapterId,
    category    : event.category,
    title       : event.title ?? "",
    location    : event.location ?? "",
    virtualYear : event.virtualYear ?? "",
    tags        : event.tags,
    mainCategory: inferMainCategory(event.category, event.tags),
    event       : event.event,
    ironyNote   : event.ironyNote ?? ""
  };
}

function preserveMainCategoryTags(form: EventFormState): string[] {
  if (form.mainCategory !== "LIVELIHOOD" || form.tags.includes("生计财产")) {
    return form.tags;
  }
  return [...form.tags, "生计财产"];
}

function toMutationBody(form: EventFormState): ChapterEventMutationBody {
  return {
    personaId  : form.personaId,
    chapterId  : form.chapterId,
    category   : form.category,
    title      : form.title.trim() || null,
    location   : form.location.trim() || null,
    event      : form.event.trim(),
    virtualYear: form.virtualYear.trim() || null,
    tags       : preserveMainCategoryTags(form),
    ironyNote  : form.ironyNote.trim() || null
  };
}

function groupEventsByPersona(events: ChapterEventItem[]) {
  const groups = new Map<string, ChapterEventItem[]>();
  for (const event of events) {
    const key = `${event.personaId}:${event.personaName}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return Array.from(groups.entries()).map(([key, groupedEvents]) => ({
    key,
    personaName: groupedEvents[0]?.personaName ?? "未知角色",
    events     : groupedEvents
  }));
}

export function ChapterEventsWorkbench({ bookId, onOpenRoles }: ChapterEventsWorkbenchProps) {
  const [chapterData, setChapterData] = useState<ChapterEventChapterData | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [events, setEvents] = useState<ChapterEventItem[]>([]);
  const [personas, setPersonas] = useState<BookPersonaListItem[]>([]);
  const [source, setSource] = useState<ChapterContent | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ChapterEventItem | null>(null);
  const [form, setForm] = useState<EventFormState>(emptyForm(""));
  const [personaQuery, setPersonaQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");
  const [customTagInput, setCustomTagInput] = useState("");
  const [chapterProgressCollapsed, setChapterProgressCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const activeChapter = useMemo(
    () => chapterData?.chapters.find(chapter => chapter.id === activeChapterId) ?? null,
    [activeChapterId, chapterData]
  );

  const filteredPersonas = useMemo(() => {
    const query = personaQuery.trim().toLowerCase();
    if (!query) return personas.slice(0, 8);
    return personas.filter(persona => {
      const aliases = persona.aliases.join(" ").toLowerCase();
      return persona.name.toLowerCase().includes(query)
        || persona.localName.toLowerCase().includes(query)
        || aliases.includes(query);
    }).slice(0, 8);
  }, [personaQuery, personas]);

  const groupedEvents = useMemo(() => groupEventsByPersona(events), [events]);

  function toggleGroup(groupKey: string) {
    setCollapsedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  }

  const loadChapters = useCallback(async () => {
    const data = await fetchChapterEventChapters(bookId);
    setChapterData(data);
    setActiveChapterId(prev => prev ?? data.chapters[0]?.id ?? null);
  }, [bookId]);

  const loadEvents = useCallback(async (chapterId: string) => {
    setEventsLoading(true);
    setVerifyError(null);
    try {
      const [nextEvents, nextSource] = await Promise.all([
        fetchChapterEvents(bookId, chapterId, { status: statusFilter, source: sourceFilter }),
        fetchChapterContent(bookId, chapterId)
      ]);
      setEvents(nextEvents);
      setSource(nextSource);
    } catch {
      setError("章节事迹加载失败，请稍后重试。");
    } finally {
      setEventsLoading(false);
    }
  }, [bookId, sourceFilter, statusFilter]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    Promise.all([loadChapters(), fetchBookPersonas(bookId)])
      .then(([, nextPersonas]) => {
        if (!ignore) setPersonas(nextPersonas);
      })
      .catch(() => {
        if (!ignore) setError("章节事迹工作台初始化失败，请稍后重试。");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => { ignore = true; };
  }, [bookId, loadChapters]);

  useEffect(() => {
    if (!activeChapterId) return;
    void loadEvents(activeChapterId);
  }, [activeChapterId, loadEvents]);

  function openCreate() {
    const chapterId = activeChapterId ?? chapterData?.chapters[0]?.id ?? "";
    setEditingEvent(null);
    setForm(emptyForm(chapterId));
    setPersonaQuery("");
    setCustomTagInput("");
    setSheetOpen(true);
  }

  function openEdit(event: ChapterEventItem) {
    setEditingEvent(event);
    setForm(formFromEvent(event));
    setPersonaQuery(event.personaName);
    setCustomTagInput("");
    setSheetOpen(true);
  }

  function setMainCategory(value: MainCategoryValue) {
    const option = MAIN_CATEGORY_BY_VALUE.get(value);
    if (!option) return;
    setForm(prev => ({
      ...prev,
      mainCategory: value,
      category    : option.category,
      tags        : value === "LIVELIHOOD" && !prev.tags.includes("生计财产")
        ? [...prev.tags, "生计财产"]
        : prev.tags
    }));
  }

  function toggleTag(tag: string) {
    setForm(prev => {
      if (prev.tags.includes(tag)) {
        return { ...prev, tags: prev.tags.filter(item => item !== tag) };
      }
      if (prev.tags.length >= 12) return prev;
      return { ...prev, tags: [...prev.tags, tag] };
    });
  }

  function removeTag(tag: string) {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(item => item !== tag) }));
  }

  function addCustomTag() {
    const tag = customTagInput.trim();
    if (!tag) return;
    setForm(prev => {
      if (prev.tags.includes(tag) || prev.tags.length >= 12) return prev;
      return { ...prev, tags: [...prev.tags, tag] };
    });
    setCustomTagInput("");
  }

  async function refreshAfterMutation(nextChapterId = activeChapterId) {
    await loadChapters();
    if (nextChapterId) {
      setActiveChapterId(nextChapterId);
      await loadEvents(nextChapterId);
    }
  }

  async function saveEvent() {
    if (!form.personaId || !form.chapterId || !form.event.trim()) {
      setVerifyError("请选择角色、章节，并填写事迹正文。");
      return;
    }
    setSaving(true);
    try {
      if (editingEvent) {
        await updateChapterEvent(bookId, editingEvent.id, toMutationBody(form));
      } else {
        await createChapterEvent(bookId, {
          personaId: form.personaId,
          chapterId: form.chapterId,
          event    : form.event,
          ...toMutationBody(form)
        });
      }
      setSheetOpen(false);
      await refreshAfterMutation(form.chapterId);
    } catch {
      setVerifyError("保存角色事迹失败，请检查输入后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(eventId: string, status: "VERIFIED" | "REJECTED") {
    await updateChapterEvent(bookId, eventId, { status });
    await refreshAfterMutation(activeChapterId);
  }

  async function removeEvent(eventId: string) {
    await deleteChapterEvent(bookId, eventId);
    await refreshAfterMutation(activeChapterId);
  }

  async function verifyChapter() {
    if (!activeChapterId) return;
    setVerifyError(null);
    try {
      await markChapterEventsVerified(bookId, activeChapterId);
      await refreshAfterMutation(activeChapterId);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "当前章节仍有待审核角色事迹。");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-80 items-center justify-center rounded-md border border-border">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div
        className={cn(
          "chapter-events-workbench grid min-h-0 gap-3 xl:h-[calc(100vh-136px)] xl:grid-cols-[240px_minmax(0,1fr)]",
          chapterProgressCollapsed && "xl:grid-cols-[52px_minmax(0,1fr)]"
        )}
      >
        <aside className="flex min-h-0 flex-col rounded-md border border-border bg-card xl:h-full">
          <div className={cn("border-b border-border p-3", chapterProgressCollapsed && "px-2")}>
            <div className={cn(
              "flex items-center justify-between gap-2",
              chapterProgressCollapsed && "justify-center"
            )}>
              {!chapterProgressCollapsed && (
                <div>
                  <div className="text-sm font-medium text-foreground">章节进度</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {chapterData?.summary.verifiedChapters ?? 0}/{chapterData?.summary.totalChapters ?? 0} 已校验
                  </div>
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => setChapterProgressCollapsed(prev => !prev)}
                aria-label={chapterProgressCollapsed ? "展开章节进度" : "收起章节进度"}
                title={chapterProgressCollapsed ? "展开章节进度" : "收起章节进度"}
              >
                {chapterProgressCollapsed
                  ? <PanelLeftOpen className="size-4" />
                  : <PanelLeftClose className="size-4" />}
              </Button>
            </div>
          </div>
          <div className={cn("min-h-0 flex-1 overflow-y-auto p-2", chapterProgressCollapsed && "px-1")}>
            {chapterData?.chapters.map(chapter => (
              <button
                key={chapter.id}
                type="button"
                onClick={() => setActiveChapterId(chapter.id)}
                aria-label={`${chapter.noText ?? `第${chapter.no}回`} ${chapter.title}`}
                title={`${chapter.noText ?? `第${chapter.no}回`} ${chapter.title}`}
                className={cn(
                  "mb-1 w-full rounded-md border text-left transition-colors",
                  chapterProgressCollapsed ? "px-1.5 py-2" : "px-3 py-2",
                  chapter.id === activeChapterId
                    ? "border-primary bg-primary-subtle text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-muted"
                )}
              >
                {chapterProgressCollapsed ? (
                  <div className="flex flex-col items-center gap-1 text-xs">
                    <span className="font-medium tabular-nums">{chapter.no}</span>
                    {chapter.pendingCount > 0 && (
                      <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] leading-none text-destructive-foreground">
                        {chapter.pendingCount}
                      </span>
                    )}
                    {chapter.isVerified && <Check className="size-3 text-success" />}
                  </div>
                ) : (
                  <>
                    <div className="line-clamp-2 text-sm font-medium">{chapter.noText ?? `第${chapter.no}回`} {chapter.title}</div>
                    <div className="mt-1 flex flex-wrap gap-1 text-xs">
                      <Badge variant="outline">{chapter.eventCount} 条</Badge>
                      <Badge variant={chapter.pendingCount > 0 ? "destructive" : "outline"}>{chapter.pendingCount} 待审</Badge>
                      {chapter.isVerified && <Badge variant="outline">已校验</Badge>}
                    </div>
                  </>
                )}
              </button>
            ))}
          </div>
        </aside>

        <section className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)] xl:h-full">
          <div className="flex min-h-[420px] flex-col rounded-md border border-border bg-card xl:h-full xl:min-h-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">{activeChapter?.title ?? "未选择章节"}</div>
                <div className="text-xs text-muted-foreground">{activeChapter?.noText ?? (activeChapter ? `第${activeChapter.no}回` : "")}</div>
              </div>
              <BookOpen className="size-4 text-muted-foreground" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-7 text-foreground">
              {source?.paragraphs.map((paragraph, index) => (
                <p key={index} className="mb-3">{paragraph}</p>
              ))}
            </div>
          </div>

          <div className="flex min-h-[420px] flex-col rounded-md border border-border bg-card xl:h-full xl:min-h-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">角色事迹</div>
                <div className="text-xs text-muted-foreground">{events.length} 条当前筛选结果</div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => { void verifyChapter(); }}>
                  <Check className="size-4" />
                  <span className="ml-1">标记已校验</span>
                </Button>
                <Button type="button" size="sm" onClick={openCreate}>
                  <Plus className="size-4" />
                  <span className="ml-1">新增事迹</span>
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex rounded-md border border-border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("grouped")}
                  className={cn(
                    "h-8 rounded px-3 text-xs transition-colors",
                    viewMode === "grouped"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  按角色分组
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("source")}
                  className={cn(
                    "h-8 rounded px-3 text-xs transition-colors",
                    viewMode === "source"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  按原文顺序
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={statusFilter ?? ""}
                  onValueChange={(value) => setStatusFilter(isSelectEmptyValue(value) ? null : value)}
                >
                  <SelectTrigger className="h-8 w-28">
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectEmptyItem>全部状态</SelectEmptyItem>
                    <SelectItem value="DRAFT">待审核</SelectItem>
                    <SelectItem value="VERIFIED">已确认</SelectItem>
                    <SelectItem value="REJECTED">已拒绝</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={sourceFilter ?? ""}
                  onValueChange={(value) => setSourceFilter(isSelectEmptyValue(value) ? null : value)}
                >
                  <SelectTrigger className="h-8 w-28">
                    <SelectValue placeholder="全部来源" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectEmptyItem>全部来源</SelectEmptyItem>
                    <SelectItem value="AI">AI 生成</SelectItem>
                    <SelectItem value="MANUAL">手动创建</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {verifyError && (
              <div className="mx-4 mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {verifyError}
              </div>
            )}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {eventsLoading && <div className="text-sm text-muted-foreground">加载中...</div>}
              {!eventsLoading && events.length === 0 && (
                <div className="rounded-md border border-dashed border-border p-8 text-center">
                  <p className="text-sm text-muted-foreground">本章节暂无角色事迹</p>
                  <Button type="button" className="mt-3" size="sm" onClick={openCreate}>
                    <Plus className="size-4" />
                    <span className="ml-1">补录事迹</span>
                  </Button>
                </div>
              )}
              {!eventsLoading && events.length > 0 && viewMode === "grouped" && groupedEvents.map(group => (
                <section key={group.key} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="flex w-full items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted"
                    aria-label={`${collapsedGroups[group.key] ? "展开" : "收起"}${group.personaName}的角色事迹`}
                    aria-expanded={!collapsedGroups[group.key]}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {collapsedGroups[group.key]
                        ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        : <ChevronDown className="size-4 shrink-0 text-muted-foreground" />}
                      <span className="truncate text-sm font-medium text-foreground">{group.personaName}</span>
                    </span>
                    <Badge variant="outline">{group.events.length} 条事迹</Badge>
                  </button>
                  {!collapsedGroups[group.key] && group.events.map(event => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onEdit={openEdit}
                      onRemove={removeEvent}
                      onUpdateStatus={updateStatus}
                    />
                  ))}
                </section>
              ))}
              {!eventsLoading && events.length > 0 && viewMode === "source" && events.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  onEdit={openEdit}
                  onRemove={removeEvent}
                  onUpdateStatus={updateStatus}
                />
              ))}
            </div>
          </div>
        </section>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editingEvent ? "编辑角色事迹" : "新增角色事迹"}</SheetTitle>
            <SheetDescription>保存后会刷新当前章节事迹列表。</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">角色</span>
              <Input
                value={personaQuery}
                onChange={(event) => {
                  setPersonaQuery(event.target.value);
                  setForm(prev => ({ ...prev, personaId: "" }));
                }}
                placeholder="搜索角色名或别名"
              />
            </label>
            <div className="rounded-md border border-border">
              {filteredPersonas.map(persona => (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => {
                    setForm(prev => ({ ...prev, personaId: persona.id }));
                    setPersonaQuery(persona.name);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${
                    form.personaId === persona.id ? "bg-primary-subtle text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <span>{persona.name}</span>
                  <span className="text-xs">{persona.localName}</span>
                </button>
              ))}
              {filteredPersonas.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">
                  未找到角色。
                  <Button type="button" size="sm" variant="link" className="px-1" onClick={() => {
                    setSheetOpen(false);
                    onOpenRoles();
                  }}>
                    去角色管理新建
                  </Button>
                </div>
              )}
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">章节</span>
              <Select value={form.chapterId} onValueChange={(value) => setForm(prev => ({ ...prev, chapterId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="选择章节" />
                </SelectTrigger>
                <SelectContent>
                  {chapterData?.chapters.map(chapter => (
                    <SelectItem key={chapter.id} value={chapter.id}>
                      {chapter.noText ?? `第${chapter.no}回`} {chapter.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">主分类</span>
              <Select value={form.mainCategory} onValueChange={(value) => setMainCategory(value as MainCategoryValue)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAIN_CATEGORY_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} · {option.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="mt-1 block text-xs text-muted-foreground">
                兼容分类：{BIO_CATEGORY_LEGACY_LABELS[form.category] ?? form.category}
              </span>
            </label>
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Tags className="size-4" />
                <span>事迹标签</span>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.tags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-1 text-xs text-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`移除标签 ${tag}`}
                    >
                      {tag}
                      <X className="size-3" />
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {TAG_PRESETS.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      form.tags.includes(tag)
                        ? "border-primary bg-primary-subtle text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={customTagInput}
                  onChange={(event) => setCustomTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomTag();
                    }
                  }}
                  placeholder="输入自定义标签"
                  maxLength={20}
                />
                <Button type="button" variant="outline" onClick={addCustomTag} disabled={form.tags.length >= 12}>
                  添加
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">最多 12 个标签，标签只用于人工审核与编辑。</p>
            </div>
            <TextInput label="标题/身份" value={form.title} onChange={(value) => setForm(prev => ({ ...prev, title: value }))} />
            <TextInput label="地点" value={form.location} onChange={(value) => setForm(prev => ({ ...prev, location: value }))} />
            <TextInput label="虚拟时间" value={form.virtualYear} onChange={(value) => setForm(prev => ({ ...prev, virtualYear: value }))} />
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">事迹正文</span>
              <Textarea
                value={form.event}
                onChange={(event) => setForm(prev => ({ ...prev, event: event.target.value }))}
                className="min-h-28"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">备注</span>
              <Textarea
                value={form.ironyNote}
                onChange={(event) => setForm(prev => ({ ...prev, ironyNote: event.target.value }))}
                className="min-h-20"
              />
            </label>
          </div>
          <SheetFooter>
            <Button type="button" onClick={() => { void saveEvent(); }} disabled={saving}>
              {saving && <Loader2 className="mr-1 size-4 animate-spin" />}
              保存
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface EventCardProps {
  event         : ChapterEventItem;
  onEdit        : (event: ChapterEventItem) => void;
  onRemove      : (eventId: string) => Promise<void>;
  onUpdateStatus: (eventId: string, status: "VERIFIED" | "REJECTED") => Promise<void>;
}

function EventCard({
  event,
  onEdit,
  onRemove,
  onUpdateStatus
}: EventCardProps) {
  return (
    <article className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{event.personaName}</span>
            <Badge variant="outline">{getMainCategoryLabel(event)}</Badge>
            <Badge variant={event.status === "DRAFT" ? "destructive" : "outline"}>
              {getEventStateLabel(event)}
            </Badge>
          </div>
          {event.title && <p className="text-sm text-muted-foreground">{event.title}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          {event.status === "DRAFT" && (
            <>
              <button
                type="button"
                className="rounded p-1.5 text-muted-foreground hover:bg-success/10 hover:text-success"
                onClick={() => { void onUpdateStatus(event.id, "VERIFIED"); }}
                aria-label="确认事迹"
              >
                <Check className="size-4" />
              </button>
              <button
                type="button"
                className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => { void onUpdateStatus(event.id, "REJECTED"); }}
                aria-label="拒绝事迹"
              >
                <X className="size-4" />
              </button>
            </>
          )}
          <button
            type="button"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => onEdit(event)}
            aria-label="编辑事迹"
          >
            <Edit3 className="size-4" />
          </button>
          <button
            type="button"
            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={() => { void onRemove(event.id); }}
            aria-label="删除事迹"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">{event.event}</p>
      {event.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {event.tags.map(tag => (
            <Badge key={tag} variant="secondary">{tag}</Badge>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {event.location && <span>地点：{event.location}</span>}
        {event.virtualYear && <span>时间：{event.virtualYear}</span>}
        {event.ironyNote && <span>备注：{event.ironyNote}</span>}
        <span>来源：{event.recordSource === "MANUAL" ? "手动" : "AI"}</span>
        <span>兼容分类：{BIO_CATEGORY_LEGACY_LABELS[event.category] ?? event.category}</span>
      </div>
    </article>
  );
}

function TextInput({
  label,
  value,
  onChange
}: {
  label   : string;
  value   : string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
