import recommendationsRaw from "../../config/model-recommendations.v1.json";
import { BUSINESS_PIPELINE_STAGES, PipelineStage } from "@/types/pipeline";
import { z } from "zod";

/**
 * 文件定位（模型推荐策略解析模块）：
 * - 文件路径：`src/lib/model-recommendations.ts`
 * - 所属层次：前后端可复用的业务策略工具层。
 *
 * 核心职责：
 * - 读取并校验模型推荐配置（JSON）；
 * - 产出“阶段 -> 推荐模型别名”的标准映射；
 * - 提供推荐匹配与推荐模型挑选工具函数，供 UI 和服务层统一使用。
 *
 * 上下游关系：
 * - 上游输入：`config/model-recommendations.v1.json` 配置文件；
 * - 下游消费：模型策略表单、任务创建默认值逻辑、后台提示文案等。
 *
 * 维护注意：
 * - 配置校验失败会在模块加载时抛错，属于“快速失败”策略；
 * - 若新增 pipeline stage，必须同步更新本文件 schema 与空映射，否则会出现遗漏。
 */

/**
 * 参与推荐映射的阶段集合。
 *
 * 业务原因：
 * - 业务主流程阶段来自 `BUSINESS_PIPELINE_STAGES`；
 * - 额外包含 `FALLBACK` 作为兜底推荐，保证任意阶段都能拿到可回退模型建议。
 */
const STAGES_FOR_RECOMMENDATION: PipelineStage[] = [
  ...BUSINESS_PIPELINE_STAGES,
  PipelineStage.FALLBACK
];

/**
 * 阶段别名映射 schema。
 *
 * 约束目的：
 * - 强制每个阶段都必须有非空 alias；
 * - 在配置加载时提前发现漏配问题，而不是运行时静默失败。
 */
const StageAliasesSchema = z.object({
  [PipelineStage.ROSTER_DISCOVERY]      : z.string().trim().min(1),
  [PipelineStage.CHUNK_EXTRACTION]      : z.string().trim().min(1),
  [PipelineStage.CHAPTER_VALIDATION]    : z.string().trim().min(1),
  [PipelineStage.TITLE_RESOLUTION]      : z.string().trim().min(1),
  [PipelineStage.GRAY_ZONE_ARBITRATION] : z.string().trim().min(1),
  [PipelineStage.BOOK_VALIDATION]       : z.string().trim().min(1),
  [PipelineStage.INDEPENDENT_EXTRACTION]: z.string().trim().min(1),
  [PipelineStage.ENTITY_RESOLUTION]     : z.string().trim().min(1),
  [PipelineStage.FALLBACK]              : z.string().trim().min(1)
});

/**
 * 模型推荐配置总 schema（v1）。
 */
const ModelRecommendationsSchema = z.object({
  /** 配置版本号：用于未来平滑升级配置结构。 */
  version     : z.literal("v1"),
  /** 各阶段对应 alias 键。 */
  stageAliases: StageAliasesSchema,
  /** 配置说明：仅供维护者阅读，不参与运行时匹配。 */
  notes       : z.string().optional()
});

/** 解析后的完整推荐配置类型。 */
type ModelRecommendations = z.infer<typeof ModelRecommendationsSchema>;

interface RecommendationModelCandidate {
  /**
   * 候选模型的 alias 键（可选）。
   * - 为空表示该候选无法参与“按 alias 推荐匹配”。
   */
  aliasKey?: string | null;
}

/**
 * 暴露给调用方的“阶段推荐模型”结构。
 */
export interface StageRecommendedModel {
  /** 机器匹配用 alias。 */
  alias: string;
}

/**
 * 创建“阶段推荐映射”空模板。
 *
 * 设计原因：
 * - 明确声明每个阶段都存在键位，避免遗漏时出现 `undefined` 键；
 * - 初始值统一为 `null`，便于后续逐阶段填充。
 */
function createEmptyStageRecommendationMap(): Record<PipelineStage, StageRecommendedModel | null> {
  return {
    [PipelineStage.ROSTER_DISCOVERY]      : null,
    [PipelineStage.CHUNK_EXTRACTION]      : null,
    [PipelineStage.CHAPTER_VALIDATION]    : null,
    [PipelineStage.TITLE_RESOLUTION]      : null,
    [PipelineStage.GRAY_ZONE_ARBITRATION] : null,
    [PipelineStage.BOOK_VALIDATION]       : null,
    [PipelineStage.INDEPENDENT_EXTRACTION]: null,
    [PipelineStage.ENTITY_RESOLUTION]     : null,
    [PipelineStage.FALLBACK]              : null
  };
}

/**
 * 根据配置解析出阶段推荐映射。
 *
 * @param config 已通过 schema 校验的推荐配置
 * @returns 阶段到推荐模型的完整映射
 *
 * 解析语义：
 * - `StageAliasesSchema` 已保证每个阶段都有非空 alias；
 * - alias 是否存在于数据库模型表由管理端启用模型状态决定，不再由配置文件二次登记。
 */
function resolveStageRecommendedModels(config: ModelRecommendations): Record<PipelineStage, StageRecommendedModel | null> {
  const mapping = createEmptyStageRecommendationMap();

  for (const stage of STAGES_FOR_RECOMMENDATION) {
    const alias = config.stageAliases[stage];
    mapping[stage] = { alias };
  }

  return mapping;
}

/**
 * 比较两个 alias 是否等价（忽略大小写与首尾空白）。
 *
 * 设计目的：
 * - 配置与数据库数据可能存在大小写差异；
 * - 统一归一化可降低“视觉相同但匹配失败”的误判。
 */
function isSameAlias(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * 判断候选模型是否命中阶段推荐。
 *
 * @param recommendation 阶段推荐模型（可空）
 * @param candidate 候选模型对象（至少包含 aliasKey）
 * @returns 是否匹配推荐
 */
export function isRecommendedModelMatch(
  recommendation: StageRecommendedModel | null | undefined,
  candidate: RecommendationModelCandidate
): boolean {
  // 无推荐时直接返回 false：调用方可据此决定是否显示“无推荐”提示。
  if (!recommendation) {
    return false;
  }

  // 候选缺少 alias 时无法匹配，属于输入数据不完整场景。
  const candidateAlias = candidate.aliasKey?.trim();
  if (!candidateAlias) {
    return false;
  }

  return isSameAlias(candidateAlias, recommendation.alias);
}

/**
 * 从可用模型中挑选“命中当前阶段推荐”的模型。
 *
 * @param recommendation 当前阶段推荐信息
 * @param availableModels 可用模型列表
 * @returns 命中的首个模型；若无匹配则返回 null
 *
 * 设计说明：
 * - 返回首个匹配项，保持行为确定性；
 * - 返回 `null` 而不是抛错，便于调用方做平滑降级（例如回退到默认模型）。
 */
export function pickRecommendedEnabledModel<T extends RecommendationModelCandidate>(
  recommendation: StageRecommendedModel | null | undefined,
  availableModels: T[]
): T | null {
  if (!recommendation) {
    return null;
  }

  return availableModels.find(model => isRecommendedModelMatch(recommendation, model)) ?? null;
}

/**
 * 模块初始化时即完成配置解析。
 *
 * 好处：
 * - 配置问题尽早暴露（启动或首次 import 时）；
 * - 后续调用无需重复 parse，减少运行时开销。
 */
const parsedRecommendations = ModelRecommendationsSchema.parse(recommendationsRaw);

/**
 * 全局导出的阶段推荐映射常量。
 *
 * 使用约定：
 * - 调用方应把它视为只读配置快照，不应在运行时修改其内容。
 */
export const STAGE_RECOMMENDED_MODELS = resolveStageRecommendedModels(parsedRecommendations);
