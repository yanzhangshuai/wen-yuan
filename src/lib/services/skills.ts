import { clientFetch, clientMutate } from "@/lib/client-api";
import type { RelationshipCode } from "@/server/modules/skills/content-schema";

/**
 * 技能管理前端服务层。
 * 对接 `/api/admin/skills` 与 `/api/admin/skills/:id` 路由族。
 * skill = MD 文档（content 直存），status 承载启停。
 */

/** 技能包列表项（管理端列表展示）。 */
export interface AdminSkillListItem {
  id         : string;
  slug       : string;
  name       : string;
  description: string | null;
  scope      : string;
  status     : string;
  createdAt  : string;
  updatedAt  : string;
}

/** 技能包 frontmatter 契约（管理端展示用）。 */
export interface AdminSkillContract {
  relationshipCodes: RelationshipCode[];
}

/** 技能包详情（含完整 MD 内容与契约）。 */
export interface AdminSkillDetail {
  id         : string;
  slug       : string;
  name       : string;
  description: string | null;
  scope      : string;
  status     : string;
  content    : string;
  createdAt  : string;
  updatedAt  : string;
  contract   : AdminSkillContract;
}

/** 获取技能包列表。 */
export async function fetchSkills(): Promise<AdminSkillListItem[]> {
  return clientFetch<AdminSkillListItem[]>("/api/admin/skills", {
    cache: "no-store"
  });
}

/** 获取技能包详情（含完整 MD 内容与契约）。 */
export async function fetchSkill(id: string): Promise<AdminSkillDetail> {
  return clientFetch<AdminSkillDetail>(`/api/admin/skills/${id}`, {
    cache: "no-store"
  });
}

/** 更新技能基本信息（仅更新传入字段；status 承载启停）。 */
export interface UpdateSkillInfoInput {
  name?       : string;
  description?: string | null;
  scope?      : string;
  status?     : string;
}

/** 更新技能基本信息。 */
export async function updateSkillInfo(id: string, fields: UpdateSkillInfoInput): Promise<void> {
  await clientMutate(`/api/admin/skills/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(fields)
  });
}

/** 保存技能 MD 内容（保存即覆盖当前内容）。 */
export async function updateSkillContent(
  id    : string,
  input : { content: string }
): Promise<{ updatedAt: string }> {
  return clientFetch<{ updatedAt: string }>(`/api/admin/skills/${id}/content`, {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(input)
  });
}

/** AI 生成技能的请求与返回。 */
export interface GenerateSkillByAiInput {
  purpose: string;
  name?  : string;
  scope? : string;
}

/** 调用 AI 生成技能（默认启用）。 */
export async function generateSkillByAi(
  input: GenerateSkillByAiInput
): Promise<{ skillId: string; slug: string; status: string }> {
  return clientFetch<{ skillId: string; slug: string; status: string }>("/api/admin/skills/generate", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(input)
  });
}

/** AI 重新生成技能的请求（字段可选，缺省沿用现有 skill 信息）。 */
export interface RegenerateSkillInput {
  purpose?: string;
  name?   : string;
  scope?  : string;
}

/** 用 AI 重新生成当前技能内容（不落库，返回新 MD 供预览确认）。 */
export async function regenerateSkillContent(
  id    : string,
  input : RegenerateSkillInput
): Promise<{ id: string; content: string }> {
  return clientFetch<{ id: string; content: string }>(`/api/admin/skills/${id}/regenerate`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(input)
  });
}
