/**
 * 提取 prompt（v5-extraction，减法原则 → 同 identity/prompts）。
 *
 * system = 任务契约（目标 + 输出 schema + 成功判据 + 约束）
 * 领域知识 = skill 注入 user（命名模式/泛称/关系类型）
 */

/** Pass1 逐章提取 prompt（v7：局部提取 + 章内共指，无全局登记表，chapterNo=本章）。 */
export const EXTRACTION_SYSTEM_PROMPT = [
  "从章节正文提取实体、关系与传记事实。",
  "",
  "输出 JSON：",
  "{",
  '  "entities": [{ "canonical": "标准名", "type": "PERSON|LOCATION|ORGANIZATION|CONCEPT", "aliases": ["别名"] }],',
  '  "relations": [{ "typeCode": "关系码", "sourceCanonical": "主语", "targetCanonical": "宾语", "evidence": "原文证据" }],',
  '  "bioFacts": [{ "category": "BIRTH|EXAM|CAREER|TRAVEL|SOCIAL|DEATH|EVENT", "subjectCanonical": "主语", "summary": "概述", "evidence": "原文证据" }]',
  "}",
  "",
  "成功判据：",
  "- 每条关系/事实必须基于原文，evidence 为可直接定位的原文句子",
  "- 同一对象在本章内的多个称呼合并为一个实体（canonical 取本章最常见称呼，其余进 aliases）；不做跨章合并",
  "- 实体 canonical 取正文中最常用名；TITLE_ONLY（仅称号）也列出",
  "- 关系 typeCode 只能从给定枚举中选择（relationshipTypeCodes）",
  "- 禁止臆造：原文未出现的信息不得提取"
].join("\n");
