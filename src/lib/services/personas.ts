/**
 * ============================================================================
 * 文件定位：`src/lib/services/personas.ts`
 * ----------------------------------------------------------------------------
 * 这是前端“人物域（persona domain）”的服务层模块，位于客户端可调用的 API 封装层。
 *
 * 在 Next.js 项目中的角色：
 * 1) 不属于路由文件（不是 `page/layout/route`），不会被 Next.js 自动注册为路由；
 * 2) 属于“前端数据访问层”，被 Client Component/交互组件调用；
 * 3) 通过 `clientFetch/clientMutate` 统一访问 `/api/personas/*`，避免组件层散落 fetch 细节。
 *
 * 解决的业务问题：
 * - 图谱页面与人物详情侧栏需要“人物摘要/详情/编辑”能力；
 * - 统一处理后端返回的不确定结构（unknown）与前端强类型之间的转换；
 * - 在“只读查看”和“可编辑操作”之间提供稳定契约。
 *
 * 上下游关系：
 * - 上游输入：组件传入的人物 ID、编辑表单字段；
 * - 下游输出：返回结构化 `PersonaSummary/PersonaDetail`，供 UI 直接渲染；
 * - 下游依赖：`/api/personas/:id`（GET/PATCH）。
 *
 * 维护约束（业务规则，不是技术限制）：
 * - `fetchPersonaSummary` 失败返回 `null` 而非抛错，是为了让侧栏在 Suspense 场景下更平滑降级；
 * - `patchPersona` 只做“差量更新”，调用方不应传整对象覆盖。
 * ============================================================================
 */
import { clientFetch, clientMutate } from "@/lib/client-api";
import type { PersonaDetail } from "@/types/graph";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

/**
 * 人物摘要视图（用于轻量展示与侧栏入口）。
 * 对应后端 `GET /api/personas/:id` 的 `data` 子集，不包含全部明细字段。
 */
export interface PersonaSummary {
  /** 人物主键（UUID），用于详情查询、关系跳转、编辑提交。 */
  id        : string;
  /** 人物标准名（主显示名）。 */
  name      : string;
  /** 人物别名列表，来源于后端结构化字段，供搜索与补充展示。 */
  aliases   : string[];
  /** 性别，可为空；为空表示暂无可靠信息而不是“未知字符串”。 */
  gender    : string | null;
  /** 籍贯，可为空；为空常见于原文未提及或抽取不确定。 */
  hometown  : string | null;
  /** 跨书全局标签，服务于人物画像与筛选。 */
  globalTags: string[];
  /** 按书维度的人物档案摘要，用于“同名人物在不同书内表现”的对照展示。 */
  profiles: {
    /** 档案所属书籍 ID。 */
    bookId    : string;
    /** 档案所属书名（后端冗余返回，减少前端二次查表）。 */
    bookTitle : string;
    /** 该书中的人物简述，可为空。 */
    summary   : string | null;
    /** 该书内讽刺指数，可为空表示暂无该维度数据。 */
    ironyIndex: number | null;
    /** 该书内局部标签。 */
    tags      : string[];
  }[];
  /** 关系数量（聚合计数），用于快速呈现人物“关系复杂度”。 */
  relationshipCount: number;
  /** 时间轴事件数量（聚合计数），用于快速呈现人物“剧情活跃度”。 */
  timelineCount    : number;
}

/**
 * 编辑人物请求体（PATCH payload）。
 * 所有字段可选，业务上要求“只传变更项”，避免无意覆盖后端已有值。
 */
export interface PatchPersonaBody {
  /** 新人物名。 */
  name?         : string;
  /** 新别名数组。 */
  aliases?      : string[];
  gender?       : string | null;
  /** 新籍贯；传 `null` 表示显式清空。 */
  hometown?     : string | null;
  nameType?     : string;
  globalTags?   : string[];
  /** 置信度原始值，范围通常为 0~1（不是百分比）。 */
  confidence?   : number;
  /** 审核确认状态；当前用于把 AI 人物确认为有效人物。 */
  status?       : "VERIFIED";
  /** 当前书籍 ID；提供后可同步更新书内档案字段。 */
  bookId?       : string;
  localName?    : string;
  localSummary? : string | null;
  officialTitle?: string | null;
  localTags?    : string[];
  ironyIndex?   : number;
}

export interface PersonaDeletePreview {
  persona: { id: string; name: string };
  counts: {
    relationshipCount: number;
    biographyCount   : number;
    mentionCount     : number;
    profileCount     : number;
  };
  biographies  : Array<{ id: string; title: string | null; event: string; chapter: string }>;
  relationships: Array<{ id: string; type: string; sourceName: string; targetName: string; description: string | null; chapter: string }>;
  mentions     : Array<{ id: string; rawText: string; summary: string | null; chapter: string }>;
  profiles     : Array<{ id: string; bookId: string; localName: string }>;
}

/**
 * 手动合并人物请求体。
 */
export interface MergePersonasBody {
  /** 被并入的人物 ID。 */
  sourceId: string;
  /** 保留的人物 ID。 */
  targetId: string;
}

/**
 * 手动拆分人物请求体。
 */
export interface SplitPersonaBody {
  /** 原人物 ID。 */
  sourceId  : string;
  /** 所属书籍 ID。 */
  bookId    : string;
  /** 需要迁移的章节号列表。 */
  chapterNos: number[];
  /** 新人物名称。 */
  name      : string;
  /** 可选别名。 */
  aliases?  : string[];
}

/* ------------------------------------------------
   Parsers
   内部使用，将 API unknown 响应安全转换为强类型。
   ------------------------------------------------ */
/**
 * 运行时类型守卫：判断 unknown 是否为“可按键访问的普通对象”。
 * 设计目的：后端返回结构在运行时仍可能不符合声明，先做防御性收窄再读字段。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 把 unknown 安全读取为字符串数组。
 * 防御意义：如果接口脏数据混入非字符串项，不抛错，直接过滤掉异常项。
 */
function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * 读取可选字符串。
 * 业务约定：非字符串一律视为“缺失”，统一返回 null，避免 UI 处理 `undefined/number/object` 混乱分支。
 */
function readOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * 读取可选数值。
 * 业务约定：仅接受 number；其他类型（例如字符串数字）不做隐式转换，避免误读。
 */
function readOptionalNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/**
 * 解析跨书档案数组。
 * 判空/跳过策略说明：
 * - 不是数组：返回空数组，表示“暂无档案数据”；
 * - 缺少 bookId/bookTitle：该项直接丢弃，避免生成不可定位的脏记录。
 */
function readPersonaProfiles(value: unknown): PersonaSummary["profiles"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item) || typeof item.bookId !== "string" || typeof item.bookTitle !== "string") {
      return [];
    }
    return [{
      bookId    : item.bookId,
      bookTitle : item.bookTitle,
      summary   : readOptionalString(item.summary),
      ironyIndex: readOptionalNumber(item.ironyIndex),
      tags      : readStringArray(item.tags)
    }];
  });
}

/**
 * 把后端 `data`（unknown）转换为 `PersonaSummary`。
 *
 * 为什么“失败返回 null 而不是 throw”：
 * - 该函数常用于 UI 读取路径，返回 null 可由调用层统一走空态；
 * - 避免把“单条数据脏字段”升级为整页崩溃。
 *
 * @param data 后端成功响应中的 data 字段（运行时未知结构）
 * @returns 结构合法时返回 PersonaSummary；关键字段缺失时返回 null
 */
export function parsePersonaSummary(data: unknown): PersonaSummary | null {
  if (!isRecord(data) || typeof data.id !== "string" || typeof data.name !== "string") {
    return null;
  }
  return {
    id               : data.id,
    name             : data.name,
    aliases          : readStringArray(data.aliases),
    gender           : readOptionalString(data.gender),
    hometown         : readOptionalString(data.hometown),
    globalTags       : readStringArray(data.globalTags),
    profiles         : readPersonaProfiles(data.profiles),
    relationshipCount: Array.isArray(data.relationships) ? data.relationships.length : 0,
    timelineCount    : Array.isArray(data.timeline) ? data.timeline.length : 0
  };
}

/* ------------------------------------------------
   Service functions
   ------------------------------------------------ */

/**
 * 获取单个人物摘要。
 * 对应接口：`GET /api/personas/:id`。
 *
 * 设计意图：
 * - 返回 `PersonaSummary | null`，使调用方可用统一空态处理“网络失败/数据异常/不存在”；
 * - 该策略对图谱交互更友好：侧栏失败不影响主图继续操作。
 *
 * @param id 人物 UUID（来自路由节点点击、搜索命中或上下文菜单）
 * @returns 解析成功返回摘要；任意异常返回 null
 */
export async function fetchPersonaSummary(id: string): Promise<PersonaSummary | null> {
  try {
    const data = await clientFetch(`/api/personas/${id}`);
    return parsePersonaSummary(data);
  } catch {
    return null;
  }
}

/**
 * 获取单个人物详情快照（主档 + 关系 + 时间轴完整数据）。
 * 对应接口：`GET /api/personas/:id`。
 *
 * 与 `fetchPersonaSummary` 的差异：
 * - 该函数用于详情面板主流程，异常会抛出给上层 `AsyncErrorBoundary`；
 * - 这样可以把“详情加载失败”明确展示为错误态，而不是静默吞掉。
 *
 * @param id 人物 UUID
 * @returns PersonaDetail，字段定义见 `src/types/graph.ts`
 */
export async function fetchPersonaDetail(id: string): Promise<PersonaDetail> {
  return clientFetch<PersonaDetail>(`/api/personas/${id}`);
}

/**
 * 更新人物基础信息（差量 PATCH）。
 * 对应接口：`PATCH /api/personas/:id`。
 *
 * 为什么使用 PATCH 而非 PUT：
 * - 业务上支持“局部编辑”，避免未展示字段被覆盖；
 * - 与后端 `updatePersonaBodySchema` 的“至少一个字段”约束对齐。
 *
 * @param id 人物 UUID
 * @param body 仅包含用户实际修改的字段
 * @returns Promise<void>，成功即代表写入完成
 */
export async function patchPersona(id: string, body: PatchPersonaBody): Promise<void> {
  await clientMutate(`/api/personas/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

/**
 * 手动执行人物合并。
 * 对应接口：`POST /api/personas/merge`。
 */
export async function mergePersonas(body: MergePersonasBody): Promise<void> {
  await clientMutate("/api/personas/merge", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

/**
 * 手动执行人物拆分（按章节迁移）。
 * 对应接口：`POST /api/personas/split`。
 */
export async function splitPersona(body: SplitPersonaBody): Promise<void> {
  await clientMutate("/api/personas/split", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

/**
 * 删除人物（FG-05）。
 * 对应接口：`DELETE /api/personas/:id`。
 * 需要管理员权限，非管理员调用会得到 403 错误。
 */
export async function fetchPersonaDeletePreview(id: string, bookId?: string): Promise<PersonaDeletePreview> {
  const params = new URLSearchParams();
  if (bookId) params.set("bookId", bookId);
  const query = params.toString();
  return clientFetch<PersonaDeletePreview>(`/api/personas/${id}/delete-preview${query ? `?${query}` : ""}`);
}

export async function deletePersona(id: string, bookId?: string): Promise<void> {
  const params = new URLSearchParams();
  if (bookId) params.set("bookId", bookId);
  const query = params.toString();
  await clientMutate(`/api/personas/${id}${query ? `?${query}` : ""}`, { method: "DELETE" });
}

/**
 * 更新人物审核状态（FG-05 状态流转）。
 * 对应接口：`PATCH /api/personas/:id`，传入 status 字段。
 */
export async function updatePersonaStatus(id: string, status: "VERIFIED"): Promise<void> {
  await clientMutate(`/api/personas/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ status })
  });
}
