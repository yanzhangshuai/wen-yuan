/**
 * @module personas
 * @description 人物（Persona）客户端服务层
 *
 * 封装所有与人物相关的 HTTP 请求，对应后端路由 `/api/personas/*`。
 * 组件层直接调用此模块的函数，不直接使用 fetch。
 *
 * 包含内容：
 * - PersonaSummary：人物摘要视图类型（对应后端 PersonaDetailSnapshot 子集）
 * - PatchPersonaBody：编辑人物时的请求体类型
 * - parsePersonaSummary：将 API 原始响应解析为 PersonaSummary，解析失败返回 null
 * - fetchPersonaSummary：获取单个人物摘要，失败时静默返回 null（供 use() + Suspense 使用）
 * - patchPersona：更新人物字段（差量 PATCH，只传变更字段）
 */
import { clientFetch, clientMutate } from "@/lib/client-api";
import type { PersonaDetail } from "@/types/graph";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

/**
 * 人物摘要视图
 * 对应后端 GET /api/personas/:id 的响应 data 字段（PersonaDetailSnapshot 子集）。
 * profiles 来自跨书籍的 Profile 列表；relationshipCount / timelineCount 聚合计数。
 */
export interface PersonaSummary {
  id        : string;
  name      : string;
  aliases   : string[];
  gender    : string | null;
  hometown  : string | null;
  globalTags: string[];
  profiles: {
    bookId    : string;
    bookTitle : string;
    summary   : string | null;
    ironyIndex: number | null;
    tags      : string[];
  }[];
  relationshipCount: number;
  timelineCount    : number;
}

/**
 * 编辑人物的请求体
 * 所有字段均为可选，只传需要变更的字段（差量 PATCH）。
 * confidence 为原始小数（0–1），不是百分比。
 */
export interface PatchPersonaBody {
  name?      : string;
  aliases?   : string[];
  hometown?  : string | null;
  confidence?: number;
}

/* ------------------------------------------------
   Parsers
   内部使用，将 API unknown 响应安全转换为强类型。
   ------------------------------------------------ */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

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
 * 将后端原始响应 data 解析为 PersonaSummary。
 * 缺少必要字段（id / name）时返回 null，不抛出异常。
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
 * 对应接口：GET /api/personas/:id
 *
 * 失败时静默返回 null（不抛出），适合配合 React `use()` + Suspense 使用：
 * 父组件传入 Promise，子组件用 use() 消费，null 表示人物不存在或加载失败。
 *
 * @param id 人物 UUID
 * @returns PersonaSummary | null
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
 * 获取单个人物详情快照（主档 + 关系 + 时间轴）。
 * 对应接口：GET /api/personas/:id
 *
 * 失败时抛出 Error，message 为可展示文案。
 *
 * @param id 人物 UUID
 * @returns PersonaDetail
 */
export async function fetchPersonaDetail(id: string): Promise<PersonaDetail> {
  return clientFetch<PersonaDetail>(`/api/personas/${id}`);
}

/**
 * 更新人物基本信息（差量 PATCH）。
 * 对应接口：PATCH /api/personas/:id
 *
 * 调用方只传需要变更的字段，未传字段保持原值。
 * 失败时抛出 Error，message 为可直接展示给用户的文案。
 *
 * @param id   人物 UUID
 * @param body 变更字段
 */
export async function patchPersona(id: string, body: PatchPersonaBody): Promise<void> {
  await clientMutate(`/api/personas/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}
