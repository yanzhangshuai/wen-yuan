import type { AliasMappingItem } from "@/lib/services/alias-mappings";
import type { DraftsData } from "@/lib/services/role-workbench";

/**
 * =============================================================================
 * 文件定位（角色资料工作台工具函数与共享类型）
 * -----------------------------------------------------------------------------
 * v5 适配说明：
 * - v4 版基于 `BookPersonaListItem`（来自已删除的 `/api/books/:id/personas`）；
 * - v5 角色资料工作台为“审核草稿”视角，实体列表直接取自 `/api/admin/drafts`
 *   的 `personas`（EntityProfile + Entity 联合映射），因此统一收敛到 `RoleEntityItem`；
 * - 表单相关类型与函数（sheet 编辑、关系/传记/别名表单）随手工编辑能力移除而删除。
 * =============================================================================
 */

/** 角色列表筛选条件：全部 / AI 预填 / 人工补全。 */
export type RoleListFilter = "all" | "ai" | "manual";
/** 角色排序模式：按出场章节 / 名称 / 来源。 */
export type RoleSortMode = "appearance" | "name" | "source";
/** 只读档案视图的工作区页签。 */
export type WorkspaceTab = "basics" | "relationships" | "biographies" | "aliases";

/** 侧栏每条角色的待确认计数（源自草稿数据）。 */
export interface PendingCounts {
  relationships: number;
  biographies  : number;
  aliases      : number;
}

/**
 * 只读角色档案条目。
 * 数据来源：`drafts.personas`（后端 `/api/admin/drafts` 返回的 EntityProfile+Entity 行）。
 * 这里的 `id` 是 `Entity.id`，与关系/传记/别名引用保持一致，便于跨列表联查。
 */
export interface RoleEntityItem {
  /** 实体主键（Entity.id）。 */
  id          : string;
  /** 实体标准名。 */
  name        : string;
  /** 别名列表。 */
  aliases     : string[];
  /** 姓名类型：NAMED / TITLE_ONLY。 */
  nameType    : string;
  /** 数据来源：AI / MANUAL。 */
  recordSource: string;
  /** AI 置信度（0~1）。 */
  confidence  : number;
  /** 籍贯（可空）。 */
  hometown    : string | null;
}

/** 关系草稿展示行（与后端 drafts.relationships 契约一致）。 */
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
  evidence       : string | null;
  recordSource   : string;
  status         : string;
}

/** 传记事件草稿展示行（与后端 drafts.biographyRecords 契约一致）。 */
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

/** 传记事件类别的中文文案映射（用于列表展示）。 */
export const BIO_CATEGORY_LABELS: Record<string, string> = {
  BIRTH : "出生",
  EXAM  : "科举",
  CAREER: "仕途",
  TRAVEL: "行旅",
  SOCIAL: "社交",
  DEATH : "逝世",
  EVENT : "事件"
};

/** 数据来源（AI / MANUAL）的中文文案。 */
export function sourceLabel(source: string): string {
  return source === "AI" ? "AI 预填" : "人工补全";
}

/** 按来源筛选实体：all 返回全部，ai/manual 只看对应来源。 */
export function roleMatchesFilter(entity: RoleEntityItem, filter: RoleListFilter): boolean {
  if (filter === "all") return true;
  if (filter === "ai") return entity.recordSource === "AI";
  return entity.recordSource !== "AI";
}

/** 按关键词过滤实体：匹配标准名、别名、籍贯。 */
export function roleMatchesQuery(entity: RoleEntityItem, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  const searchable = [
    entity.name,
    entity.hometown ?? "",
    ...entity.aliases
  ].join(" ").toLowerCase();
  return searchable.includes(trimmed);
}

function rememberEarlierChapter(
  chapters: Map<string, number>,
  entityId: string | null | undefined,
  chapterNo: number | null | undefined
) {
  if (!entityId || typeof chapterNo !== "number") return;
  const current = chapters.get(entityId);
  if (current === undefined || chapterNo < current) {
    chapters.set(entityId, chapterNo);
  }
}

/**
 * 收集每个实体的“首次出场章节号”。
 * 数据源：关系草稿（source/target）、传记事件草稿、别名映射章节区间。
 * 用于“按出场章节”排序时无显式 firstAppearanceChapterNo 的兜底。
 */
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
    rememberEarlierChapter(chapters, mapping.entityId, mapping.chapterStart);
  }

  return chapters;
}

/** 按指定模式对实体列表排序；出场章节缺失时回退到首次出场章节收集表。 */
export function sortRoles(
  rows: RoleEntityItem[],
  sortMode: RoleSortMode,
  firstAppearanceChapters: Map<string, number> = new Map()
): RoleEntityItem[] {
  const collator = new Intl.Collator("zh-Hans-CN");
  return [...rows].sort((left, right) => {
    if (sortMode === "appearance") {
      const leftChapter = firstAppearanceChapters.get(left.id) ?? Number.POSITIVE_INFINITY;
      const rightChapter = firstAppearanceChapters.get(right.id) ?? Number.POSITIVE_INFINITY;
      if (leftChapter !== rightChapter) return leftChapter - rightChapter;
    }
    if (sortMode === "source" && left.recordSource !== right.recordSource) {
      return collator.compare(sourceLabel(left.recordSource), sourceLabel(right.recordSource));
    }
    return collator.compare(left.name, right.name);
  });
}
