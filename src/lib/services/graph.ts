/**
 * @module graph
 * @description 人物图谱（Graph）客户端服务层
 *
 * 封装图谱查询相关请求，对应后端路由：
 * - `GET /api/books/:id/graph`
 * - `POST /api/graph/path`
 */
import { clientFetch } from "@/lib/client-api";
import type { GraphSnapshot, PathResult } from "@/types/graph";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

/**
 * 图谱最短路径查询请求体。
 */
export interface SearchPersonaPathBody {
  bookId         : string;
  sourcePersonaId: string;
  targetPersonaId: string;
}

/* ------------------------------------------------
   Service functions
   ------------------------------------------------ */

/**
 * 获取指定书籍在某章节截止时的图谱快照。
 */
export async function fetchBookGraph(bookId: string, chapter: number): Promise<GraphSnapshot> {
  return clientFetch<GraphSnapshot>(`/api/books/${bookId}/graph?chapter=${chapter}`);
}

/**
 * 查询同书图谱内两个人物之间的最短关系路径。
 */
export async function searchPersonaPath(body: SearchPersonaPathBody): Promise<PathResult> {
  return clientFetch<PathResult>("/api/graph/path", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}
