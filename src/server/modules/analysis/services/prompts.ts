import type { AnalysisProfileContext } from "@/types/analysis";

/**
 * 功能：定义生成分段 Prompt 所需参数。
 * 输入：无。
 * 输出：类型约束 BuildPromptInput。
 * 异常：无。
 * 副作用：无。
 */
export interface BuildPromptInput {
  bookTitle   : string;
  chapterNo   : number;
  chapterTitle: string;
  content     : string;
  profiles    : AnalysisProfileContext[];
  chunkIndex  : number;
  chunkCount  : number;
}

/**
 * 功能：生成“章节分段分析”高约束 Prompt。
 * 输入：input - 当前书籍、章节、分段内容与人物上下文。
 * 输出：可直接发送给模型的字符串 Prompt。
 * 异常：无。
 * 副作用：无。
 */
export function buildChapterAnalysisPrompt(input: BuildPromptInput): string {
  // 1. 动态生成实体上下文（通用实体对齐）
  const entityContext = input.profiles.length > 0
    ? input.profiles.map((p) => `- ID: ${p.personaId}; StandardName: ${p.canonicalName}; Aliases: ${p.aliases.join(", ")}`).join("\n")
    : "No existing entities found in this book yet.";

  return [
    "## Role",
    "你是一个通用的叙事文学结构化提取专家，能够精准识别复杂文本中的实体轨迹与社交网络。",
    "",
    "## Task",
    `分析书籍《${input.bookTitle}》第${input.chapterNo}章/回（${input.chapterTitle}）的文本片段（第 ${input.chunkIndex + 1}/${input.chunkCount} 段）。`,
    "将非结构化叙事转换为结构化 JSON 数据，涵盖：生平/关键事件 (biographies)、实体提及 (mentions)、实体间动态关系 (relationships)。",
    "",
    "## Strict Rules",
    "1. OUTPUT: Return raw JSON only. Do not use markdown code blocks (```json).",
    "2. ENTITY RESOLUTION: 必须优先匹配[Known Entities]。若文中出现的别名在 Aliases 中，必须统一映射回 StandardName。仅当发现全新人物时才创建新 StandardName。",
    "3. CATEGORY: biography.category 必须严格限制在 [BIRTH, EXAM, CAREER, TRAVEL, SOCIAL, DEATH, EVENT] 范围内。",
    "4. VERACITY: rawText 必须是原文的精准截取。event 描述需客观，避免主观抒情。",
    "5. FRAGMENTATION: 若当前片段不包含特定数据类型，对应数组返回 []。不要跨段推测。",
    "6. RELATION: relationship.description 只写结构化关系结论；relationship.evidence 单独填写原文证据短句（<=120字）。",
    "7. IRONY: ironyNote 为可选字段，仅在本段存在可直接引用的讽刺证据时填写；禁止泛化评价（如“批判社会”）。",
    "8. UNCERTAINTY: 不确定的人物或关系不要猜测，直接忽略。",
    "",
    "## Known Entities (Context)",
    entityContext,
    "",
    "## JSON Output Format",
    JSON.stringify({
      biographies: [
        {
          personaName: "实体标准名",
          category   : "枚举值",
          event      : "简述发生的关键行为或状态变更",
          title      : "当时的头衔/身份/职业",
          location   : "发生的具体地理位置",
          virtualYear: "文中提到的时间点（如: 万历三十年, 2077年, 秋天）",
          ironyNote  : "仅填写本段可证据化的讽刺点；若无则省略"
        }
      ],
      mentions: [
        {
          personaName: "实体标准名",
          rawText    : "原文片段",
          summary    : "此段落中实体的状态描述",
          paraIndex  : 0
        }
      ],
      relationships: [
        {
          sourceName : "发起者名",
          targetName : "接收者名",
          type       : "关系类型（如: 师生, 敌对, 盟友, 家属）",
          weight     : 0.5, // 0-1 之间的权重，代表互动强度
          description: "结构化关系结论（不要复制原文）",
          evidence   : "支持该关系结论的原文短句"
        }
      ]
    }, null, 2),
    "",
    "## Source Text",
    input.content
  ].join("\n");
}
