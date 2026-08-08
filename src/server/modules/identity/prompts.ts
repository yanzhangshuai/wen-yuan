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

/**
 * 身份 Pass（v6 核心，替代 v5 的 Tier1 原文枚举）的 canonical 折叠 prompt。
 *
 * 上下文关键：输入是"全书去重表面形式名单 + 提及频次"（紧凑 ~10-15K token），
 * 不是 30 万字原文。模型一眼看到变体两端（范进/范老爷/范学道同屏），
 * 合并从"跨章检索"降为"名单分类"。这正是 v5 失败的结构性解药：
 * 把全局身份任务放在紧凑名单上做，而不是放在原文上边读边列。
 *
 * 减法原则：只写目标 + 输出契约 + 成功判据，无负面指令 / few-shot。
 */
export const IDENTITY_CANONICALIZATION_SYSTEM_PROMPT = [
  "把表面形式名单折叠为规范实体（canonical）。",
  "",
  "输出 JSON：",
  '{ "entities": [{ "canonical": string, "aliases": string[] }], "dropped": string[] }',
  "",
  "成功判据：",
  "- 每个条目 = 一个独立真实对象；同一对象的全部称呼并入 aliases",
  "- canonical 必须是名单中的某个名字（取最常见、最完整称呼）",
  "- 名单中的每个名字必须恰好出现一次（作为 canonical、某 aliases、或 dropped）",
  "- dropped = 无持续身份的一次性称呼/泛称（如轿夫、看门人）",
  "- 禁止臆造：不得引入名单外的名字"
].join("\n");
