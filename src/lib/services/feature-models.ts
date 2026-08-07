/**
 * ============================================================================
 * 文件定位：`src/lib/services/feature-models.ts`
 * ----------------------------------------------------------------------------
 * 这是“功能点模型”的前端服务层（Client-side Service）。
 * v5 模型策略（阶段 4）：9 阶段矩阵已删除，改为功能点（SKILL_SELECTOR / PIPELINE_MAIN / REVIEW）
 * 全局映射，管理端在模型页“功能点模型”区维护每个功能点指向的模型。
 * ============================================================================
 */
import { clientFetch } from "@/lib/client-api";

/** 功能点模型键（与后端 FeatureKey 保持一致）。 */
export type FeatureModelKey = "SKILL_SELECTOR" | "PIPELINE_MAIN" | "REVIEW";

/** 功能点展示元数据（前端展示用）。 */
export const FEATURE_MODEL_META: Record<FeatureModelKey, { label: string; description: string }> = {
  SKILL_SELECTOR: {
    label      : "Skill 选择器",
    description: "解析前按“书 + skill 目录”动态选 skill，建议配置廉价模型"
  },
  PIPELINE_MAIN: {
    label      : "主流程（身份/提取）",
    description: "身份（Tier1/Tier2）+ 提取主流程，建议配置最强模型"
  },
  REVIEW: {
    label      : "Pass4 审核",
    description: "例外审核流程，建议配置中档模型"
  }
};

export interface FeatureModelAdminItem {
  featureKey  : FeatureModelKey;
  /** 功能点展示名。 */
  featureLabel: string;
  /** 功能点用途说明。 */
  description : string;
  /** 映射的模型 ID；未配置时为 null。 */
  modelId     : string | null;
  /** 模型展示名。 */
  modelName   : string | null;
  /** 模型 provider。 */
  provider    : string | null;
  /** 是否已配置有效映射。 */
  isConfigured: boolean;
  /** 更新时间（ISO 字符串）；未配置时为 null。 */
  updatedAt   : string | null;
}

interface FeatureModelApiItem {
  featureKey  : FeatureModelKey;
  modelId     : string | null;
  modelName   : string | null;
  provider    : string | null;
  isConfigured: boolean;
  updatedAt   : string | null;
}

/** 把 API 返回项装饰为前端展示结构（补充功能点标签）。 */
function decorateFeatureModels(items: FeatureModelApiItem[]): FeatureModelAdminItem[] {
  return items.map((item) => ({
    ...item,
    featureLabel: FEATURE_MODEL_META[item.featureKey]?.label ?? item.featureKey,
    description : FEATURE_MODEL_META[item.featureKey]?.description ?? ""
  }));
}

/**
 * 获取功能点模型映射列表（含未配置项）。
 */
export async function fetchFeatureModels(): Promise<FeatureModelAdminItem[]> {
  const items = await clientFetch<FeatureModelApiItem[]>("/api/admin/feature-models", {
    cache: "no-store"
  });
  return decorateFeatureModels(items);
}

/**
 * 更新某个功能点指向的模型；modelId 传 null 表示清除映射（回退系统默认）。
 *
 * @param featureKey 功能点键。
 * @param modelId 模型 ID；null 清除映射。
 * @returns 更新后的功能点项。
 */
export async function upsertFeatureModel(
  featureKey: FeatureModelKey,
  modelId: string | null
): Promise<FeatureModelAdminItem> {
  const updated = await clientFetch<FeatureModelApiItem>("/api/admin/feature-models", {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ featureKey, modelId })
  });
  return decorateFeatureModels([updated])[0];
}
