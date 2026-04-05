/**
 * =============================================================================
 * 文件定位（关系模块客户端服务层）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/lib/services/relationships.ts`
 *
 * 在 Next.js 项目中的角色：
 * - 属于前端数据访问层（service）；
 * - 被 `RelationshipEditForm` 等 Client Component 调用；
 * - 通过 `/api/relationships/:id` Route Handler 与服务端交互。
 *
 * 核心业务职责：
 * - 提供“关系草稿人工修订”能力，让审核员在确认前先修正关系字段。
 *
 * 设计边界：
 * - 本文件只负责“发请求 + 传输数据契约”，不承担业务校验真值；
 * - 权限、字段合法性、最终落库规则由服务端统一校验，这是业务安全边界。
 *
 * 输入（上游）：
 * - 审核 UI 传入的关系 ID 与差量修改字段。
 *
 * 输出（下游）：
 * - 调用成功返回 `void`（表示更新已提交）；
 * - 调用失败抛出 Error（由上层组件决定如何提示用户）。
 *
 * 维护注意：
 * - `PatchRelationshipBody` 字段名与后端 DTO 必须保持一致，不能随意重命名；
 * - 该接口语义是“差量更新”，不要传入无关字段，避免覆盖后端默认处理逻辑。
 * =============================================================================
 */
import { clientMutate } from "@/lib/client-api";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

/**
 * 编辑关系的请求体（PATCH 差量模式）。
 *
 * 这是业务规则，不是技术限制：
 * - 审核员通常只会修正个别字段（例如只改 type），
 *   因此请求体全部可选，避免“回传整条记录”带来误覆盖风险。
 *
 * 字段语义说明：
 * - `type`：关系类型（如师生/亲属/同僚等），属于业务标签字段；
 * - `weight`：关系强度，通常用于图谱展示权重或排序；
 * - `evidence`：证据文本片段，`null` 表示主动清空证据；
 * - `confidence`：抽取置信度（0~1），用于辅助审核决策。
 */
export interface PatchRelationshipBody {
  /** 关系类型标签。可选：不传表示保持原值。 */
  type?      : string;
  /** 关系强度。可选：不传表示不改；传值时应为正数。 */
  weight?    : number;
  /** 证据文本。可选；`null` 表示业务上“明确置空证据”。 */
  evidence?  : string | null;
  /** 置信度（0~1）。可选：用于人工修订模型输出质量。 */
  confidence?: number;
}

/* ------------------------------------------------
   Service functions
   ------------------------------------------------ */

/**
 * 更新关系字段（差量 PATCH）。
 * 对应接口：`PATCH /api/relationships/:id`
 *
 * 业务流程位置：
 * - 该函数通常由审核台“关系编辑表单提交”触发；
 * - 提交成功后，上游会刷新草稿列表并退出编辑态。
 *
 * 参数语义：
 * @param id
 * 关系记录主键（UUID），用于精确定位被修改的关系。
 * @param body
 * 差量字段集合；只提交用户本次改动，未包含字段维持服务端当前值。
 *
 * 返回语义：
 * @returns Promise<void>
 * 仅表示请求成功完成，不返回实体详情；调用方若需新值应主动重新拉取。
 *
 * 防御设计：
 * - 固定附带 `Content-Type: application/json`，避免服务端对 body 解析歧义；
 * - 失败异常向上抛出，确保上层可统一处理错误提示和恢复策略。
 */
export async function patchRelationship(id: string, body: PatchRelationshipBody): Promise<void> {
  await clientMutate(`/api/relationships/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}
