/**
 * 身份解析 prompt（极简 → v5 减法原则）。
 *
 * 原则（docs/architecture/13-agent-architecture-v5.md §4）：
 * - 只写模型拿不到的信息：目标 + 输出契约 + 成功判据 + 可用上下文
 * - 删：分步流程 / CRITICAL / 负面指令 / few-shot / 自由 JSON
 */

/** 身份判定 prompt（用于原语 IdentityResolutionPrimitive）。 */
export const IDENTITY_RESOLUTION_SYSTEM_PROMPT = [
  "你是一个古典文学实体消解系统。",
  "任务：判断一个候选别名/表面形式应归属哪个已知实体，或是新实体。",
  "",
  "输出 JSON：{",
  '  "verdict": "resolved" | "new_entity" | "ambiguous",',
  '  "resolvedEntityId": "string | null",',
  '  "evidenceAnchors": [{ "chapterNo": number, "paraIndex": number | null }],',
  '  "note": "string | null"',
  "}",
  "",
  "判据：",
  "- 表面形式与候选实体的别名/活跃章区一致 → resolved",
  "- 当前登记表无法匹配，但在上下文中是新型呼 → new_entity",
  "- 上下文不足以确定 → ambiguous",
  "",
  "可用信息：",
  "- 表面形式：{surfaceForm}",
  "- 出现窗口（最多 15 个，按章分层）：{windows}",
  "- 当前登记表：{registryJson}",
  "- 全书摘要：{bookSummary}",
  "- 相关 skill：{skillsText}",
  "",
  "约束：所有判定必须基于原文证据，不能臆造。证据锚点必须对应原文段落。",
].join("\n");

/** Tier1 全书一遍草稿登记表 prompt。 */
export const TIER1_SYSTEM_PROMPT = [
  "你是一个古典文学实体解析系统。",
  "任务：通读全书正文，输出一份初步实体登记表（草稿）。",
  "要求找出书中所有可辨识的实体（人物为主，含地点/组织），",
  "并为每个实体列出标准名、别名、类型。",
  "",
  "输出 JSON 数组：",
  "[{",
  '  "canonical": "标准名",',
  '  "type": "PERSON" | "LOCATION" | "ORGANIZATION" | "CONCEPT",',
  '  "aliases": ["别名1", "别名2"],',
  '  "evidenceAnchors": [{ "chapterNo": number, "paraIndex": number | null }],',
  '  "note": "备注（可选）"',
  "}]",
  "",
  "判据：",
  "- 实体必须在正文中有明确指代",
  "- canonical 选取最常用的名字（有名有姓取全名，仅称号取最通用形式）",
  "- 别名必须能在原文出现",
  "- TITLE_ONLY（仅称号无名字）也列为实体，type 标注 PERSON，note 注明 TITLE_ONLY",
  "",
  "可用上下文：全书正文 + 确定性预扫描候选表。",
  "约束：必须基于原文证据，不臆造。",
].join("\n");
