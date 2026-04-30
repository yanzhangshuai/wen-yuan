import type {
  BookPersonaListItem,
  CreateBookPersonaBody
} from "@/lib/services/books";
import type { AliasMappingItem } from "@/lib/services/alias-mappings";
import type { DraftsData } from "@/lib/services/role-workbench";
import type { PersonaRelation, TimelineEvent } from "@/types/graph";

export type RoleListFilter = "all" | "ai" | "manual";
export type RoleSortMode = "appearance" | "name" | "source";
export type WorkspaceTab = "basics" | "relationships" | "biographies" | "aliases";
export type SheetMode = "persona-create" | "persona-edit" | "relationship-create" | "relationship-edit" | "biography-create" | "biography-edit" | "alias-create";

export interface PendingCounts {
  relationships: number;
  biographies  : number;
  aliases      : number;
}

export interface PersonaFormState {
  name                    : string;
  aliases                 : string;
  gender                  : string;
  hometown                : string;
  nameType                : string;
  globalTags              : string;
  localName               : string;
  localSummary            : string;
  officialTitle           : string;
  firstAppearanceChapterId: string;
  localTags               : string;
  ironyIndex              : string;
  confidence              : string;
}

export interface RelationshipFormState {
  targetId  : string;
  type      : string;
  weight    : string;
  evidence  : string;
  confidence: string;
  chapterId : string;
}

export interface BiographyFormState {
  chapterId: string;
  category : string;
  title    : string;
  location : string;
  event    : string;
}

export interface AliasFormState {
  alias       : string;
  resolvedName: string;
  aliasType   : string;
}

export interface ChapterOption {
  id   : string;
  no   : number;
  title: string | null;
}

export interface RoleRelationshipItem {
  id             : string;
  bookId         : string;
  bookTitle      : string;
  chapterId      : string;
  chapterNo      : number;
  sourcePersonaId: string;
  sourceName     : string;
  targetPersonaId: string;
  targetName     : string;
  type           : string;
  weight         : number;
  confidence     : number | null;
  evidence       : string | null;
  recordSource   : string;
  status         : string;
}

export interface RoleBiographyItem {
  id          : string;
  bookId      : string;
  bookTitle   : string;
  chapterId   : string;
  chapterNo   : number;
  personaId   : string;
  personaName : string;
  category    : string;
  title       : string | null;
  location    : string | null;
  event       : string;
  recordSource: string;
  status      : string;
}

export const ROLE_FILTERS: { value: RoleListFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "ai", label: "AI 预填" },
  { value: "manual", label: "人工补全" }
];

export const ROLE_SORT_MODES: { value: RoleSortMode; label: string }[] = [
  { value: "appearance", label: "按出场章节" },
  { value: "name", label: "按名称" },
  { value: "source", label: "按来源" }
];

export const WORKSPACE_TABS: { value: WorkspaceTab; label: string }[] = [
  { value: "basics", label: "基础资料" },
  { value: "relationships", label: "关系" },
  { value: "biographies", label: "传记事件" },
  { value: "aliases", label: "别名" }
];

export const emptyPersonaForm: PersonaFormState = {
  name                    : "",
  aliases                 : "",
  gender                  : "",
  hometown                : "",
  nameType                : "NAMED",
  globalTags              : "",
  localName               : "",
  localSummary            : "",
  officialTitle           : "",
  firstAppearanceChapterId: "",
  localTags               : "",
  ironyIndex              : "0",
  confidence              : "100"
};

export const emptyBiographyForm: BiographyFormState = {
  chapterId: "",
  category : "EVENT",
  title    : "",
  location : "",
  event    : ""
};

export const emptyAliasForm: AliasFormState = {
  alias       : "",
  resolvedName: "",
  aliasType   : "TITLE"
};

export const BIO_CATEGORY_LABELS: Record<string, string> = {
  BIRTH : "出生",
  EXAM  : "科举",
  CAREER: "仕途",
  TRAVEL: "行旅",
  SOCIAL: "社交",
  DEATH : "逝世",
  EVENT : "事件"
};

export function sourceLabel(source: string): string {
  return source === "AI" ? "AI 预填" : "人工补全";
}

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

export function personaFormFromRow(persona: BookPersonaListItem): PersonaFormState {
  return {
    name                    : persona.name,
    aliases                 : joinItems(persona.aliases),
    gender                  : persona.gender ?? "",
    hometown                : persona.hometown ?? "",
    nameType                : persona.nameType,
    globalTags              : joinItems(persona.globalTags),
    localName               : persona.localName,
    localSummary            : persona.localSummary ?? "",
    officialTitle           : persona.officialTitle ?? "",
    firstAppearanceChapterId: persona.firstAppearanceChapterId ?? "",
    localTags               : joinItems(persona.localTags),
    ironyIndex              : String(persona.ironyIndex),
    confidence              : String(Math.round(persona.confidence * 100))
  };
}

export function toPersonaBody(form: PersonaFormState): CreateBookPersonaBody {
  return {
    name                    : form.name.trim(),
    aliases                 : splitItems(form.aliases),
    gender                  : form.gender.trim() || null,
    hometown                : form.hometown.trim() || null,
    nameType                : form.nameType,
    globalTags              : splitItems(form.globalTags),
    localName               : form.localName.trim() || form.name.trim(),
    localSummary            : form.localSummary.trim() || null,
    officialTitle           : form.officialTitle.trim() || null,
    firstAppearanceChapterId: form.firstAppearanceChapterId || null,
    localTags               : splitItems(form.localTags),
    ironyIndex              : Number(form.ironyIndex) || 0,
    confidence              : Math.min(100, Math.max(0, Number(form.confidence) || 0)) / 100
  };
}

export function roleMatchesFilter(persona: BookPersonaListItem, filter: RoleListFilter): boolean {
  if (filter === "all") return true;
  if (filter === "ai") return persona.recordSource === "AI";
  return persona.recordSource !== "AI";
}

export function roleMatchesQuery(persona: BookPersonaListItem, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  const searchable = [
    persona.name,
    persona.localName,
    persona.hometown ?? "",
    persona.officialTitle ?? "",
    persona.localSummary ?? "",
    ...persona.aliases,
    ...persona.globalTags,
    ...persona.localTags
  ].join(" ").toLowerCase();
  return searchable.includes(trimmed);
}

function rememberEarlierChapter(chapters: Map<string, number>, personaId: string | null | undefined, chapterNo: number | null | undefined) {
  if (!personaId || typeof chapterNo !== "number") return;
  const current = chapters.get(personaId);
  if (current === undefined || chapterNo < current) {
    chapters.set(personaId, chapterNo);
  }
}

export function collectRoleFirstAppearanceChapters(
  drafts: DraftsData,
  aliasMappings: AliasMappingItem[]
): Map<string, number> {
  const chapters = new Map<string, number>();

  for (const relationship of drafts.relationships) {
    rememberEarlierChapter(chapters, relationship.sourcePersonaId, relationship.chapterNo);
    rememberEarlierChapter(chapters, relationship.targetPersonaId, relationship.chapterNo);
  }
  for (const biography of drafts.biographyRecords) {
    rememberEarlierChapter(chapters, biography.personaId, biography.chapterNo);
  }
  for (const mapping of aliasMappings) {
    rememberEarlierChapter(chapters, mapping.personaId, mapping.chapterStart);
  }

  return chapters;
}

export function sortRoles(
  rows: BookPersonaListItem[],
  sortMode: RoleSortMode,
  firstAppearanceChapters: Map<string, number> = new Map()
): BookPersonaListItem[] {
  const collator = new Intl.Collator("zh-Hans-CN");
  return [...rows].sort((left, right) => {
    if (sortMode === "appearance") {
      const leftChapter = left.firstAppearanceChapterNo ?? firstAppearanceChapters.get(left.id) ?? Number.POSITIVE_INFINITY;
      const rightChapter = right.firstAppearanceChapterNo ?? firstAppearanceChapters.get(right.id) ?? Number.POSITIVE_INFINITY;
      if (leftChapter !== rightChapter) return leftChapter - rightChapter;
    }
    if (sortMode === "source" && left.recordSource !== right.recordSource) {
      return collator.compare(sourceLabel(left.recordSource), sourceLabel(right.recordSource));
    }
    return collator.compare(left.name, right.name);
  });
}

function addChapterOption(options: Map<string, ChapterOption>, option: ChapterOption) {
  if (!option.id) return;
  const existing = options.get(option.id);
  if (existing && existing.title) return;
  options.set(option.id, option);
}

export function collectChapterOptions(
  drafts: DraftsData,
  relationships: RoleRelationshipItem[],
  biographies: RoleBiographyItem[],
  summaries: ChapterOption[]
): ChapterOption[] {
  const options = new Map<string, ChapterOption>();

  for (const summary of summaries) {
    addChapterOption(options, summary);
  }
  for (const relationship of drafts.relationships) {
    addChapterOption(options, {
      id   : relationship.chapterId,
      no   : relationship.chapterNo,
      title: null
    });
  }
  for (const biography of drafts.biographyRecords) {
    addChapterOption(options, {
      id   : biography.chapterId,
      no   : biography.chapterNo,
      title: null
    });
  }
  for (const relationship of relationships) {
    addChapterOption(options, {
      id   : relationship.chapterId,
      no   : relationship.chapterNo,
      title: null
    });
  }
  for (const biography of biographies) {
    addChapterOption(options, {
      id   : biography.chapterId,
      no   : biography.chapterNo,
      title: null
    });
  }

  return [...options.values()].sort((left, right) => {
    if (left.no !== right.no) return left.no - right.no;
    return left.id.localeCompare(right.id);
  });
}

export function getDefaultChapterId(chapters: ChapterOption[]): string {
  return chapters[0]?.id ?? "";
}

export function formatChapterOption(chapter: ChapterOption): string {
  return chapter.title ? `第${chapter.no}回 · ${chapter.title}` : `第${chapter.no}回`;
}

export function relationshipFromDetail(
  relationship: PersonaRelation,
  persona: BookPersonaListItem
): RoleRelationshipItem {
  const isOutgoing = relationship.direction === "outgoing";
  return {
    id             : relationship.id,
    bookId         : relationship.bookId,
    bookTitle      : relationship.bookTitle,
    chapterId      : relationship.chapterId,
    chapterNo      : relationship.chapterNo,
    sourcePersonaId: isOutgoing ? persona.id : relationship.counterpartId,
    sourceName     : isOutgoing ? persona.name : relationship.counterpartName,
    targetPersonaId: isOutgoing ? relationship.counterpartId : persona.id,
    targetName     : isOutgoing ? relationship.counterpartName : persona.name,
    type           : relationship.type,
    weight         : relationship.weight,
    confidence     : null,
    evidence       : relationship.evidence,
    recordSource   : relationship.recordSource,
    status         : relationship.status
  };
}

export function biographyFromTimeline(event: TimelineEvent, persona: BookPersonaListItem): RoleBiographyItem {
  return {
    id          : event.id,
    bookId      : event.bookId,
    bookTitle   : event.bookTitle,
    chapterId   : event.chapterId,
    chapterNo   : event.chapterNo,
    personaId   : persona.id,
    personaName : persona.name,
    category    : event.category,
    title       : event.title,
    location    : event.location,
    event       : event.event,
    recordSource: event.recordSource,
    status      : event.status
  };
}
