/**
 * =============================================================================
 * 文件定位（服务端分析模块 - BookType 阈值映射）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/analysis/config/thresholdsByBookType.ts`
 *
 * 本文件在配置目录中的定位：
 * ┌─ config/
 * │  ├─ pipeline.ts                ← 全局流水线阈值（所有书共享的默认值）
 * │  ├─ lexicon.ts                 ← NER 词典规则
 * │  └─ thresholdsByBookType.ts    ← 本文件：按 BookTypeCode 分类的阈值覆盖
 *
 * 核心职责：
 * - 为三阶段解析管线提供“按书籍体裁自适应”的阈值片段；
 * - 由 Stage B/C Resolver 按 `book.typeCode` 取值，与 pipeline.ts 默认值合并使用；
 * - CLASSICAL_NOVEL（古典世情/讽刺小说，如儒林外史）基于 spec §0-7 基准实测校准。
 *
 * 契约源：
 * - `docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-F.1
 * - 对 CLASSICAL_NOVEL 使用 confirmedMentionCount=2 / confirmedChapterCount=2 /
 *   mergeConfidenceFloor=0.85；其他 BookTypeCode 暂用保守默认（TODO 待 T04/T05 实测后精调）。
 *
 * 维护边界（重要）：
 * - 这些阈值直接影响人物确认率、合并质量与成本，属于业务规则，不是技术参数；
 * - 修改前需要结合离线评估与线上回归，避免识别质量回退；
 * - GENERIC 是兜底分支，必须永远保留且非空。
 * =============================================================================
 */

import { type BookTypeCode } from "@/generated/prisma/enums";

/**
 * 按 BookType 分类的解析阈值片段（Per-type overlay on top of pipeline defaults）。
 *
 * 字段语义：
 * - `confirmedMinChapters`：persona 进入 CONFIRMED 状态所需的最小出场章节数；
 * - `confirmedMinMentions`：persona 进入 CONFIRMED 状态所需的最小提及次数；
 * - `mergeConfidenceFloor`：Stage B 合并建议的置信度下限（低于该值不自动合并）。
 *
 * 设计原则：
 * - 所有字段均为非负数，且 `mergeConfidenceFloor ∈ [0, 1]`；
 * - 无需区分"未设置"与"设为 0"：调用方使用 merge 语义，未覆盖字段取 pipeline 默认值。
 */
export interface BookTypeThresholds {
  /** persona 确认所需最小章节数（召回/精度权衡）。 */
  confirmedMinChapters: number;
  /** persona 确认所需最小提及次数（召回/精度权衡）。 */
  confirmedMinMentions: number;
  /** 合并建议自动通过的最小置信度（0-1 之间）。 */
  mergeConfidenceFloor: number;
}

/**
 * BookTypeCode → 阈值片段映射。
 *
 * 当前实测基准（CLASSICAL_NOVEL 来自《儒林外史》基准评估）：
 * - 讽刺/世情小说人物密度高、多次短提及，故 mention≥2 / chapter≥2 能稳定召回核心人物；
 * - 0.85 合并下限与全局 Stage B 合并契约保持一致，不放大假阳性。
 *
 * 其他 BookType 暂采用 CLASSICAL_NOVEL 基线（标注 TODO）：
 * - HEROIC_NOVEL（英雄侠义）：后续需要抬高 mention 要求以抑制"过路小卒"；
 * - HISTORICAL_NOVEL（历史演义）：同姓族谱密集，需要配合 `sameSurnameDefaultSplit`（未在本片段）；
 * - MYTHOLOGICAL_NOVEL（神魔小说）：化名/法相变体多，合并下限可能需抬高；
 * - GENERIC：兜底分支，永远不得移除。
 */
const THRESHOLDS: Record<BookTypeCode, BookTypeThresholds> = {
  // 实测基准（spec §0-F.1 / §0-7）
  CLASSICAL_NOVEL: {
    confirmedMinChapters: 2,
    confirmedMinMentions: 2,
    mergeConfidenceFloor: 0.85
  },
  // TODO(T04/T05): 待《水浒传》基准评估后校准
  HEROIC_NOVEL: {
    confirmedMinChapters: 2,
    confirmedMinMentions: 3,
    mergeConfidenceFloor: 0.85
  },
  // TODO(T04/T05): 待《三国演义》基准评估后校准
  HISTORICAL_NOVEL: {
    confirmedMinChapters: 3,
    confirmedMinMentions: 3,
    mergeConfidenceFloor: 0.85
  },
  // TODO(T04/T05): 待《西游记》基准评估后校准
  MYTHOLOGICAL_NOVEL: {
    confirmedMinChapters: 2,
    confirmedMinMentions: 2,
    mergeConfidenceFloor: 0.88
  },
  // 兜底：与 CLASSICAL_NOVEL 一致的保守默认
  GENERIC: {
    confirmedMinChapters: 2,
    confirmedMinMentions: 2,
    mergeConfidenceFloor: 0.85
  }
};

/**
 * 功能：按 BookTypeCode 获取阈值片段。
 * 输入：`typeCode: BookTypeCode`（从 `Book.typeCode` 读取）。
 * 输出：`BookTypeThresholds`（非空；永远不会为 undefined）。
 * 异常：无（未知枚举值在 TypeScript 层即拦截；运行时由 GENERIC 兜底）。
 * 副作用：无。
 *
 * @example
 * ```ts
 * const { mergeConfidenceFloor } = getThresholds(book.typeCode);
 * if (suggestion.confidence < mergeConfidenceFloor) {
 *   // 跳过自动合并，进入人工队列
 * }
 * ```
 */
export function getThresholds(typeCode: BookTypeCode): BookTypeThresholds {
  // 运行时防御：即便 DB 脏值落入枚举外，也回退 GENERIC（保持管线不崩）。
  return THRESHOLDS[typeCode] ?? THRESHOLDS.GENERIC;
}

/**
 * 供测试/调试导出的完整映射快照（只读）。
 * 业务代码请使用 `getThresholds`，避免直接依赖内部结构。
 */
export const THRESHOLDS_BY_BOOK_TYPE: Readonly<Record<BookTypeCode, BookTypeThresholds>> = THRESHOLDS;
