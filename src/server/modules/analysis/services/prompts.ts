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
    ? input.profiles.map(p => `- ID: ${p.personaId}; StandardName: ${p.canonicalName}; Aliases: ${p.aliases.join(", ")}`).join("\n")
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
          traitNote  : "对此事件在该章节背景下的简短解析（如: 动机、性格闪光点、或叙事功能）"
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
          description: "建立或改变关系的文本证据"
        }
      ]
    }, null, 2),
    "",
    "## Source Text",
    input.content
  ].join("\n");
}
// export function buildChapterAnalysisPrompt(input: BuildPromptInput): string {
//   // 将人物上下文压缩为可读列表，帮助模型做实体对齐（别名 -> 标准名）。
//   const profileLines = input.profiles
//     .map((profile) => {
//       const aliases = profile.aliases.length > 0 ? profile.aliases.join("、") : "无";
//       const summary = profile.localSummary?.trim() || "无";

//       return `- canonicalName=${profile.canonicalName}; aliases=${aliases}; summary=${summary}`;
//     })
//     .join("\n");

//   return [
//     // 角色定位
//     "你是中国古典文学专家，擅长《儒林外史》式讽刺叙事分析。",
//     // 任务目标
//     "任务：从章节中提取人物生平轨迹、原文提及与动态关系，重点关注讽刺手法、人物仕途变迁、地理移动。",
//     "",
//     // 约束规则：防止自由发挥导致结构失控或幻觉扩散
//     "必须遵循：",
//     "1) 仅输出 JSON，不要输出 markdown。",
//     "2) JSON 顶层字段只能是 biographies / mentions / relationships。",
//     "3) biography.category 只能取：BIRTH, EXAM, CAREER, TRAVEL, SOCIAL, DEATH, EVENT。",
//     "4) 若人物名不确定，优先使用给定人物上下文中的 canonicalName 或 aliases。",
//     "5) rawText 必须是原文真实片段，不可编造。",
//     "6) ironyNote 只记录章内可证据化的讽刺手法，避免空泛评语。",
//     "",
//     // 分段信息让模型知道这是整章中的第几片段，减少跨段混淆
//     `书名：${input.bookTitle}`,
//     `章节：第${input.chapterNo}回《${input.chapterTitle}》`,
//     `分段：${input.chunkIndex + 1}/${input.chunkCount}`,
//     "",
//     // 显式注入可用人物上下文
//     "已有人物上下文（用于对齐）：",
//     profileLines || "- 无",
//     "",
//     // 提供输出样例，进一步约束字段命名
//     "输出 JSON 模板：",
//     JSON.stringify(
//       {
//         biographies: [
//           {
//             personaName: "范进",
//             category: "CAREER",
//             event: "中举后被地方官邀请入幕，仕途起步",
//             title: "举人",
//             location: "广东",
//             virtualYear: "万历年间",
//             ironyNote: "通过众人态度突变凸显功名崇拜"
//           }
//         ],
//         mentions: [
//           {
//             personaName: "范进",
//             rawText: "...原文片段...",
//             summary: "范进入场并被众人奉承",
//             paraIndex: 3
//           }
//         ],
//         relationships: [
//           {
//             sourceName: "胡屠户",
//             targetName: "范进",
//             type: "姻亲",
//             weight: 0.72,
//             description: "胡屠户态度随范进中举发生明显转变"
//           }
//         ]
//       },
//       null,
//       2
//     ),
//     "",
//     // 待分析原文正文
//     "待分析原文：",
//     input.content
//   ].join("\n");
// }
