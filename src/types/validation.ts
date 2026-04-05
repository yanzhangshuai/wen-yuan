/**
 * 文件定位（跨层业务类型契约）：
 * - 文件路径：`src/types/validation.ts`
 * - 所属层次：公共类型层（前端视图层、API 层、服务端模块共享）。
 *
 * 核心职责：
 * - 定义“书籍解析校验报告”相关的数据结构；
 * - 统一问题类型、严重级别、建议动作与摘要口径，保证跨模块字段语义一致。
 *
 * 上下游关系：
 * - 上游：服务端校验流程产出问题列表与建议；
 * - 下游：管理端审核页面、报告列表、批量修复工具按这些类型渲染与决策。
 *
 * 维护注意：
 * - 这里是跨层契约，字段名和枚举值变更会影响接口兼容性；
 * - 新增枚举值时需同步前端展示映射与服务端规则引擎。
 */

/**
 * 校验问题类型。
 *
 * 说明：这些值是“业务问题分类编码”，不是技术限制。
 * 前后端通过该枚举协同决定：
 * - 如何展示问题标签；
 * - 是否可自动修复；
 * - 走哪条审核流程。
 */
export type ValidationIssueType =
  /** 别名被错误识别为新人物。 */
  | "ALIAS_AS_NEW_PERSONA"
  /** 本应保留的人物被错误合并。 */
  | "WRONG_MERGE"
  /** 缺失名称映射（原文称谓无法关联到人物）。 */
  | "MISSING_NAME_MAPPING"
  /** 关系三元组不合法或关系类型不符合规则。 */
  | "INVALID_RELATIONSHIP"
  /** 同名但非同一人，存在消歧失败风险。 */
  | "SAME_NAME_DIFFERENT_PERSON"
  /** 重复人物（同一实体被多次创建）。 */
  | "DUPLICATE_PERSONA"
  /** 实体识别置信度过低，需要人工复核。 */
  | "LOW_CONFIDENCE_ENTITY"
  /** 孤立提及：文本提到人物但未能关联到有效实体。 */
  | "ORPHAN_MENTION";

/**
 * 校验问题严重程度。
 *
 * 业务语义：
 * - `ERROR`：通常阻断发布或需要优先处理；
 * - `WARNING`：建议处理，不一定阻断主流程；
 * - `INFO`：提示性信息，用于辅助审阅。
 */
export type ValidationSeverity = "ERROR" | "WARNING" | "INFO";

/**
 * 对问题的建议处理动作。
 *
 * 说明：
 * - 这是“建议动作集合”，具体是否自动执行由业务策略决定；
 * - 同一问题可能需要人工确认后再执行建议。
 */
export type ValidationSuggestionAction =
  /** 将两个实体合并。 */
  | "MERGE"
  /** 将错误合并后的实体拆分。 */
  | "SPLIT"
  /** 更新标准名。 */
  | "UPDATE_NAME"
  /** 新增别名映射。 */
  | "ADD_ALIAS"
  /** 删除无效实体/关系。 */
  | "DELETE"
  /** 新增原文称谓到人物的映射。 */
  | "ADD_MAPPING"
  /** 标记为人工审核处理。 */
  | "MANUAL_REVIEW";

/**
 * 单条问题的建议修复方案。
 */
export interface ValidationSuggestion {
  /**
   * 建议动作类型。
   * - 决定前端按钮文案和后端执行路径。
   */
  action          : ValidationSuggestionAction;
  /**
   * 目标人物 ID（可选）。
   * - 常用于 MERGE/UPDATE_NAME 等动作中的“保留实体”。
   */
  targetPersonaId?: string;
  /**
   * 来源人物 ID（可选）。
   * - 常用于 MERGE/SPLIT 场景，表示需要被处理的原实体。
   */
  sourcePersonaId?: string;
  /**
   * 建议的新名称（可选）。
   * - 仅在 UPDATE_NAME 类动作中有意义。
   */
  newName?        : string;
  /**
   * 建议新增的别名（可选）。
   * - 仅在 ADD_ALIAS 类动作中有意义。
   */
  newAlias?       : string;
  /**
   * 建议依据说明。
   * - 用于向审核人员解释“为什么建议这样处理”。
   */
  reason          : string;
}

/**
 * 单条校验问题明细。
 */
export interface ValidationIssue {
  /** 问题唯一标识。 */
  id                 : string;
  /** 问题分类编码。 */
  type               : ValidationIssueType;
  /** 严重程度，用于排序与优先级控制。 */
  severity           : ValidationSeverity;
  /**
   * 置信度（通常 0~1）。
   * - 数值越低，代表模型判断越不确定；
   * - 下游可据此决定是否优先人工复核。
   */
  confidence         : number;
  /** 问题简述，用于列表快速浏览。 */
  description        : string;
  /** 证据文本（片段、规则命中信息等），用于复核。 */
  evidence           : string;
  /** 受影响人物 ID 列表。 */
  affectedPersonaIds : string[];
  /**
   * 受影响章节 ID 列表（可选）。
   * - 为空表示问题可能是全局级别，不局限于某一章节。
   */
  affectedChapterIds?: string[];
  /** 针对该问题的建议方案。 */
  suggestion         : ValidationSuggestion;
}

/**
 * 校验报告摘要。
 *
 * 业务语义：
 * - 用于仪表盘统计、列表卡片角标、流程门禁判定（如是否允许发布）。
 */
export interface ValidationSummary {
  /** 问题总数。 */
  totalIssues : number;
  /** 严重问题数（ERROR）。 */
  errorCount  : number;
  /** 警告问题数（WARNING）。 */
  warningCount: number;
  /** 信息提示数（INFO）。 */
  infoCount   : number;
  /** 可自动修复的问题数量。 */
  autoFixable : number;
  /** 需要人工审核的问题数量。 */
  needsReview : number;
}

/**
 * 完整校验报告数据结构。
 */
export interface ValidationReportData {
  /** 报告 ID。 */
  id     : string;
  /** 问题明细列表。 */
  issues : ValidationIssue[];
  /** 聚合摘要。 */
  summary: ValidationSummary;
}
