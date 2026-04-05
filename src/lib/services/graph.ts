/**
 * @module graph
 * =============================================================================
 * 文件定位（图谱客户端服务层）
 * -----------------------------------------------------------------------------
 * 所属层次：前端数据访问层（Client Service）。
 *
 * 业务职责：
 * - 封装图谱相关 HTTP 请求；
 * - 为页面/组件提供稳定的函数调用接口，屏蔽 URL 拼接与请求细节。
 *
 * 对应后端路由：
 * - `GET /api/books/:id/graph`：获取书籍图谱快照；
 * - `POST /api/graph/path`：查询两人物最短路径。
 *
 * 设计约束：
 * - 本模块只负责请求与类型约束，不承载 UI 状态管理；
 * - 请求失败策略由调用方决定（抛错/兜底）。
 * =============================================================================
 */
import { clientFetch } from "@/lib/client-api";
import type { GraphSnapshot, PathResult } from "@/types/graph";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

/**
 * 最短路径查询请求体。
 * 对应后端 `findPersonaPath` 入参，字段均为必填。
 */
export interface SearchPersonaPathBody {
  /** 书籍 ID（UUID），限定路径搜索范围在单书图谱内。 */
  bookId         : string;
  /** 起点人物 ID（UUID）。 */
  sourcePersonaId: string;
  /** 终点人物 ID（UUID）。 */
  targetPersonaId: string;
}

/* ------------------------------------------------
   Service functions
   ------------------------------------------------ */

/**
 * 获取指定书籍在某章节截止时的图谱快照。
 *
 * 业务语义：
 * - `chapter` 用于“时间切片”，例如只查看前 N 回已出现的人物关系；
 * - 返回值会直接驱动图谱节点/边渲染。
 *
 * @param bookId 书籍 ID。
 * @param chapter 截止章节号（正整数）。
 * @returns 图谱快照（节点+边）。
 */
export async function fetchBookGraph(bookId: string, chapter: number): Promise<GraphSnapshot> {
  return clientFetch<GraphSnapshot>(`/api/books/${bookId}/graph?chapter=${chapter}`);
}

/**
 * 查询同书图谱内两个人物之间的最短关系路径。
 *
 * 业务语义：
 * - 成功返回 `found=true` 时，前端会据此高亮路径节点/边；
 * - `found=false` 表示两人当前图谱不可达，不属于接口异常。
 *
 * @param body 路径查询请求体。
 * @returns 路径查询结果（含是否可达、路径节点、路径边）。
 */
export async function searchPersonaPath(body: SearchPersonaPathBody): Promise<PathResult> {
  return clientFetch<PathResult>("/api/graph/path", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}
