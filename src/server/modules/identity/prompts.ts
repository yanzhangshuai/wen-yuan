/**
 * 身份解析 prompt（减法原则 → docs/architecture/13-agent-architecture-v5.md §4）
 *
 * 分层：
 * - system prompt：只写"任务契约"——目标 + 输出 schema + 成功判据 + 约束（≤150 token）
 * - 领域知识：走 skill（书型级），由调用方经 primitive 的 `skills` 注入用户消息
 *
 * 删（减法）：
 * - 角色渲染（"你是实体消解系统"）——模型知道自己在做什么
 * - 流程判据（"如果表面形式与别名一致 → resolved"）——把判断交给模型，
 *   只给验收（证据锚定）。穷举式规则会缩小搜索空间。
 *
 * 领域知识 → skill（见 IDENTITY_KNOWLEDGE_SKILL_SLUGS）：
 * - 明清官场称谓（座师/同年/门生、"X老爷"尊称）、中文命名模式（字/号/绰号/官职代称）、历史人物溯源
 * 这些是模型从正文/训练拿不到的 L3 知识，不是 prompt 的职责。
 */

/**
 * 身份/提取领域知识对应的 skill slug（书型级，供管线装载注入）。
 * skill 元数据常驻(~100 token)，全文按需注入用户消息。
 */
export const IDENTITY_KNOWLEDGE_SKILL_SLUGS = [
  "chinese-name-pattern", // 中文命名模式（字/号/绰号/官职代称）
  "classical-generic-titles", // 古典泛称（老爷/先生/夫人…）
  "classical-relationship-types" // 古典关系类型（含书型专属：座师/同年…）
] as const;

/** 身份判定 prompt（原语）。system = 任务契约；领域知识经 skills 注入 user。 */
export const IDENTITY_RESOLUTION_SYSTEM_PROMPT = [
  "完成文学文本的实体消解：判断候选别名归属哪个已知实体，或判为新实体/不确定。",
  "",
  "输出 JSON：",
  '{ "verdict": "resolved" | "new_entity" | "ambiguous",',
  '  "resolvedEntityId": "string | null",',
  '  "evidenceAnchors": [{ "chapterNo": number, "paraIndex": number | null }],',
  '  "note": "string | null" }',
  "",
  "成功判据：",
  "- verdict 必须由提供的原文窗口证据支撑",
  "- evidenceAnchors 必须能定位到窗口内原文",
  "- 登记表有匹配实体且证据一致 → resolved；原文有明确指代但登记表无 → new_entity；无法确定 → ambiguous",
  "- 禁止臆造：原文未出现的信息不得作为判定依据"
].join("\n");

/** Tier1 全书一遍草稿登记表 prompt。保留"什么算一个实体"的验收判据。
 * 输出刻意精简为 canonical/type/aliases 三元组：登记表只关心"有哪些实体 + 别名"，
 * 证据锚点属 Pass1 提取职责。若带上证据锚点，推理模型会为每个实体枚举数百条段落锚点，
 * 瞬间耗尽输出预算（实测：单分卷 PERSON 输出 > 44K 字符仍截断）。 */
export const TIER1_SYSTEM_PROMPT = [
  "识别正文中的所有可辨识实体，输出草稿登记表。",
  "",
  "输出精简 JSON 数组，每条只含三个字段：",
  '[{ "canonical": "标准名", "type": "PERSON" | "LOCATION" | "ORGANIZATION" | "CONCEPT", "aliases": ["别名1", "别名2"] }]',
  "",
  "成功判据（什么算一个正确实体）：",
  "- 实体必须在正文中有明确指代",
  "- canonical 取最常用名（有名有姓取全名；仅称号取最通用形式）",
  "- 别名必须能在原文出现",
  "- 同名同人只输出一条，不要按出现次数重复列举",
  "- 禁止臆造：必须基于原文"
].join("\n");
