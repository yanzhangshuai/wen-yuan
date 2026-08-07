import { clientFetch, clientMutate } from "@/lib/client-api";
import type { RelationshipCode } from "@/server/modules/skills/content-schema";

/**
 * 技能管理前端服务层。
 * 对接 `/api/admin/skills` 与 `/api/admin/skills/:id` 路由族。
 * v5（阶段 5）：管理端维护每个 skill 的独立启停开关，并只读查看关系码/虚指契约。
 */

/** 技能包列表项（管理端列表展示）。 */
export interface AdminSkillListItem {
  id         : string;
  slug       : string;
  name       : string;
  description: string | null;
  category   : string;
  scope      : string;
  status     : string;
  source     : string;
  sortOrder  : number;
  isBuiltin  : boolean;
  isEnabled  : boolean;
  versionNo  : number | null;
  createdAt  : string;
  updatedAt  : string;
}

/** 技能包激活版 frontmatter 契约（管理端只读展示）。 */
export interface AdminSkillContract {
  versionNo        : number | null;
  relationshipCodes: RelationshipCode[];
  deicticJunk      : string[];
}

/** 技能包详情（含契约，供详情页展示）。 */
export interface AdminSkillDetail
  extends Omit<AdminSkillListItem, "versionNo" | "createdAt" | "updatedAt"> {
  /** 由书生成的 skill 会记录来源书（书型间接层已删，仅保留生成溯源）。 */
  generatedFromBookId: string | null;
  versions: Array<{
    id        : string;
    versionNo : number;
    content   : string;
    isActive  : boolean;
    isBaseline: boolean;
    changeNote: string | null;
    createdAt : string;
  }>;
  contract: AdminSkillContract;
}

/** 获取技能包列表。 */
export async function fetchSkills(): Promise<AdminSkillListItem[]> {
  return clientFetch<AdminSkillListItem[]>("/api/admin/skills", {
    cache: "no-store"
  });
}

/** 获取技能包详情（含关系码/虚指契约）。 */
export async function fetchSkill(id: string): Promise<AdminSkillDetail> {
  return clientFetch<AdminSkillDetail>(`/api/admin/skills/${id}`, {
    cache: "no-store"
  });
}

/** 切换技能包独立启停开关；isEnabled=false = 全局不可用。 */
export async function updateSkillEnabled(id: string, isEnabled: boolean): Promise<void> {
  await clientMutate(`/api/admin/skills/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ isEnabled })
  });
}
