/**
 * 文件定位（Stage A · 硬提取服务 · 类型契约）：
 * - 三阶段架构 Stage A 的对外类型声明。
 * - 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md`
 *   §0-FINAL / §0-5 / §0-8 / §0-1 REV-1。
 *
 * 设计约束：
 * - 纯类型文件，零运行时依赖；不引入 Prisma / AI SDK。
 * - `StageAMention` 与 Prisma 模型 `PersonaMention` 字段对齐（但不直接耦合）：
 *   Stage A 规则层只负责结构化产出，持久化由 `StageAExtractor` 内部完成。
 */

import type { AliasType, IdentityClaim } from "@/generated/prisma/enums";
import type { RegionType } from "@/server/modules/analysis/preprocessor/types";

/**
 * LLM 原始返回的单条 mention（解析后尚未做 region override）。
 * - `aliasType` 允许 UNSURE（兜底值），且允许 LLM 输出枚举外字符串（由 parse 层过滤）。
 * - `narrativeRegionType` 取自 LLM 自评，会被 `enforceRegionOverride` 用规则层校正。
 */
export interface StageARawMention {
  surfaceForm        : string;
  aliasType          : AliasType;
  identityClaim      : IdentityClaim;
  narrativeRegionType: RegionType;
  suspectedResolvesTo: string | null;
  evidenceRawSpan    : string;
  actionVerb         : string | null;
  confidence         : number;
}

/**
 * 经 `enforceRegionOverride` 校准后的 mention。
 * - `regionOverrideApplied` 审计字段：记录触发的规则名，未触发时为 undefined。
 * - `spanStart` / `spanEnd` 由 Extractor 在原文中 best-effort 定位，未命中为 null。
 */
export interface StageAMention extends StageARawMention {
  spanStart            : number | null;
  spanEnd              : number | null;
  regionOverrideApplied: string | null;
}

/**
 * 区段命中统计：审计用，记录各 RegionType 下的 mention 数。
 */
export interface RegionBreakdown {
  NARRATIVE : number;
  POEM      : number;
  DIALOGUE  : number;
  COMMENTARY: number;
}

/**
 * Stage A 对一章处理完的最终产物。
 */
export interface StageAResult {
  /** 写入 persona_mentions 的条数（= 经 override 校准后的 mentions 长度）。 */
  mentionCount          : number;
  /** 区段分布。 */
  regionBreakdown       : RegionBreakdown;
  /** Stage 0 预处理器的覆盖率信心，透传供下游审计。 */
  preprocessorConfidence: "HIGH" | "LOW";
  /** override 触发统计：按规则名计数；未触发不出现在对象中。 */
  overrideHits          : Record<string, number>;
  /** 校准后的 mention 列表（便于测试断言与下游消费）。 */
  mentions              : StageAMention[];
}
