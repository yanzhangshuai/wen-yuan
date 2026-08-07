/**
 * review 域配置常量（Pass4 例外审核流）。
 *
 * 原则（架构 doc §7.3）：棘轮阈值初始保守（默认多审），随实测放宽。
 * 集中配置避免多处硬编码"改一半"风险。
 */

/** 自动接受栈：实体登记表必须达到的置信档位（HIGH 才可自动接受）。 */
export const AUTO_ACCEPT_MIN_CONFIDENCE_TIER = "HIGH" as const;

/** 自动接受栈：实体提及数下限（单次提及且证据单薄不自动接受）。 */
export const AUTO_ACCEPT_MIN_MENTIONS = 2;

/**
 * 棘轮校准：自动接受准确率阈值（0-1）。
 * - 抽样回查准确率 >= 此值 → 放宽自动接受
 * - 低于此值 → 收紧（更多类型进人审）
 */
export const RATCHET_ACCURACY_TARGET = 0.95;

/**
 * 棘轮校准：每批自动接受后的抽样回查比例（0-1）。
 * 初始保守（多审），随系统被验证可靠而递减。
 */
export const RATCHET_SAMPLE_RATE = 0.1;

/**
 * 关系级幻觉定向抽样：证据单薄的关系边 evidence 字符数上限
 * （低于此值视为证据单薄，进跨模型复核/人审）。
 */
export const HALLUCINATION_THIN_EVIDENCE_CHARS = 60;

/**
 * 关系级幻觉定向抽样：新实体率上限阈值（分片新实体占比 >= 此值
 * 视为"新实体率高"，定向抽样进复核）。
 */
export const HALLUCINATION_HIGH_NEW_ENTITY_RATE = 0.4;
