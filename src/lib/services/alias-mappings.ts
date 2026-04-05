/**
 * @module alias-mappings
 * @description 别名映射客户端服务层
 *
 * 封装别名映射审核所需的所有 HTTP 请求，对应后端路由 `/api/books/[id]/alias-mappings/*`。
 *
 * 在分层架构中的定位：
 * - 属于前端“服务访问层”（service layer），不承载 UI 渲染；
 * - 负责把组件层的业务意图翻译成稳定的 HTTP 调用；
 * - 统一返回类型，降低调用方对接口细节的认知成本。
 *
 * 维护原则：
 * - 这里只做请求拼装与返回解包，不做复杂业务判断；
 * - 业务状态流转（如可否确认/拒绝）由后端规则兜底。
 *
 * 运行环境说明：
 * - 该文件由客户端组件调用（浏览器侧执行）；
 * - 因此不能在这里读取服务端私密信息（如数据库、密钥）。
 */
import { clientFetch, clientMutate } from "@/lib/client-api";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

export interface AliasMappingItem {
  /** 别名映射记录主键。 */
  id          : string;
  /** 所属书籍 ID。 */
  bookId      : string;
  /** 被识别出的别名文本（原始称呼）。 */
  alias       : string;
  /** 解析后的真实人物名；为空表示尚未确定。 */
  resolvedName: string | null;
  /** 别名类型（TITLE/KINSHIP/NICKNAME 等）。 */
  aliasType   : string;
  /** 关联人物 ID；未绑定时为空。 */
  personaId   : string | null;
  /** 该映射建议置信度（0~1）。 */
  confidence  : number;
  /** 支撑该映射的证据文本，可空。 */
  evidence    : string | null;
  /** 当前审核状态（PENDING/CONFIRMED/REJECTED）。 */
  status      : string;
  /** 证据覆盖起始章节，可空。 */
  chapterStart: number | null;
  /** 证据覆盖结束章节，可空。 */
  chapterEnd  : number | null;
  /** 记录创建时间（ISO 字符串）。 */
  createdAt   : string;
}

/* ------------------------------------------------
   Fetch
   ------------------------------------------------ */

/** 获取指定书籍的别名映射列表，可按状态筛选。 */
export async function fetchAliasMappings(
  bookId: string,
  status?: string
): Promise<AliasMappingItem[]> {
  /**
   * URLSearchParams 的使用原因：
   * - 避免手写 query 字符串产生转义错误；
   * - 当 `status` 为空时自动省略参数，保持请求语义干净。
   */
  const params = new URLSearchParams();
  // `status` 可选：不传时表示查询全部审核状态。
  if (status) params.set("status", status);
  const qs = params.toString();
  return clientFetch<AliasMappingItem[]>(
    `/api/books/${bookId}/alias-mappings${qs ? `?${qs}` : ""}`
  );
}

/* ------------------------------------------------
   Mutations
   ------------------------------------------------ */

/** 确认一条别名映射。 */
export async function confirmAliasMapping(bookId: string, mappingId: string): Promise<void> {
  // PATCH 语义：只更新状态字段，不改动其他业务字段。
  return clientMutate(`/api/books/${bookId}/alias-mappings/${mappingId}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ status: "CONFIRMED" })
  });
}

/** 拒绝一条别名映射。 */
export async function rejectAliasMapping(bookId: string, mappingId: string): Promise<void> {
  // 与 confirm 对称：仅将状态置为 REJECTED。
  return clientMutate(`/api/books/${bookId}/alias-mappings/${mappingId}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ status: "REJECTED" })
  });
}

/** 手动创建一条别名映射。 */
export async function createAliasMapping(bookId: string, body: {
  /** 别名原文。 */
  alias       : string;
  /** 对应真名。 */
  resolvedName: string;
  /** 别名类型。 */
  aliasType   : string;
  /** 可选：直接绑定已存在人物 ID。 */
  personaId?  : string;
}): Promise<void> {
  // POST 语义：新增一条人工确认映射，常用于修正模型遗漏。
  // 注意：字段合法性和冲突处理由后端校验，这里不重复实现规则，避免前后端漂移。
  return clientMutate(`/api/books/${bookId}/alias-mappings`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}
