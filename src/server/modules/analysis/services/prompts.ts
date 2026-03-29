import type { AnalysisProfileContext, TitleResolutionEntry, TitleResolutionInput } from "@/types/analysis";

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
 * 功能：定义生成 Phase 1 人物名册发现 Prompt 所需参数。
 * 输入：无。
 * 输出：类型约束 RosterDiscoveryInput。
 * 异常：无。
 * 副作用：无。
 */
export interface RosterDiscoveryInput {
  bookTitle   : string;
  chapterNo   : number;
  chapterTitle: string;
  content     : string;
  profiles    : AnalysisProfileContext[];
}

/**
 * 功能：将人物档案列表转为 Known Entities 短整型索引文本。
 * 格式：[N] 标准名 | 别名: xxx, yyy | 小传: ...
 * 输入：profiles - 人物档案列表。
 * 输出：多行字符串，每行对应一个人物。
 * 异常：无。
 * 副作用：无。
 */
function buildEntityContextLines(profiles: AnalysisProfileContext[]): string {
  return profiles
    .map((p, idx) => {
      const id = idx + 1;
      const uniqueAliases = p.aliases.filter((a) => a !== p.canonicalName);
      const aliasStr = uniqueAliases.length > 0 ? uniqueAliases.join(", ") : "（无）";
      const summaryStr = p.localSummary ? ` | 小传: ${p.localSummary}` : "";
      return `[${id}] ${p.canonicalName} | 别名: ${aliasStr}${summaryStr}`;
    })
    .join("\n");
}

/**
 * 功能：生成"章节人物名册发现"Phase 1 Prompt。
 * 输入：input - 书名、章节信息、完整正文与已知人物档案。
 * 输出：可直接发送给模型的字符串 Prompt。
 * 异常：无。
 * 副作用：无。
 */
export function buildRosterDiscoveryPrompt(input: RosterDiscoveryInput): string {
  const entityContextLines =
    input.profiles.length > 0
      ? buildEntityContextLines(input.profiles)
      : "（本书目前尚无已建档人物）";

  return [
    "## 角色",
    "你是古典中文文献的命名实体专家，专注于从文言文中准确识别人物称谓。",
    "",
    "## 任务",
    `阅读《${input.bookTitle}》第 ${input.chapterNo} 章「${input.chapterTitle}」的完整正文。`,
    "建立**本章人物名册**：枚举本章原文中所有明确出现的人物称谓（姓名、官衔称呼、亲属称呼等）。",
    "",
    "## 已知人物档案（Known Entities）",
    entityContextLines,
    "",
    "## 输出规则",
    "1. 每个条目的 **surfaceForm** 必须是原文精确字符串，不得修改或翻译",
    "2. 若 surfaceForm 对应已知人物 → 填入该人物的档案序号（entityId，如 1、2、3）",
    '3. 若 surfaceForm 确认为本书**全新故事人物** → 填 "isNew": true',
    '4. 若 surfaceForm 是**泛化称谓**（如 老爷、夫人、众人、那人、先生、他 等，无法唯一指向某人）→ 填 "generic": true',
    "5. 相同称谓只输出**一次**（去重）",
    "6. **不要**凭想象补充原文中未出现的人物",
    "7. **只列举书中的叙事故事人物（虚构角色）**，严格排除以下类型：",
    "   - 本书作者（如吴敬梓）、整理者、评注者、推荐序作者（如惺园退士）",
    "   - 在序言、题跋、附录中出现的真实历史人物（非故事角色）",
    "   - 现代文学批评家、学者（如鲁迅等）",
    "8. 单独出现的姓氏（如\"顾\"、\"夏\"、\"荀\"等单字），若无法确认是独立人物，标记为 generic",
    "9. 若 surfaceForm 是尊号/帝号/王号/封号（如太祖皇帝、吴王、太后），原文无法直接得知其真实姓名 → 配合 isNew: true 同时填 \"isTitleOnly\": true",
    "",
    "## 输出格式（仅输出 JSON 数组，不加任何说明或 Markdown 代码块）",
    JSON.stringify([
      { surfaceForm: "范举人", entityId: 1 },
      { surfaceForm: "严监生", isNew: true },
      { surfaceForm: "太祖皇帝", isNew: true, isTitleOnly: true },
      { surfaceForm: "那老者", generic: true }
    ], null, 2),
    "",
    "## 本章正文",
    input.content
  ].join("\n");
}

/**
 * 功能：生成"章节分段分析"高约束 Prompt。
 * 输入：input - 当前书籍、章节、分段内容与人物上下文。
 * 输出：可直接发送给模型的字符串 Prompt。
 * 异常：无。
 * 副作用：无。
 */
export function buildChapterAnalysisPrompt(input: BuildPromptInput): string {
  // 实体上下文：使用短整型索引格式（[N] 标准名 | 别名 | 小传），让模型直接引用标准名
  const entityContext =
    input.profiles.length > 0
      ? buildEntityContextLines(input.profiles)
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
    "1. OUTPUT: Return raw JSON only. Do not use markdown code blocks (` ` `json).",
    "2. ENTITY RESOLUTION: 必须优先匹配 [Known Entities]。若文中出现的称谓在已知档案的别名中，必须统一映射回该档案的标准名（canonicalName）。仅当确认为全新人物时才创建新 personaName。",
    "3. CATEGORY: biography.category 必须严格限制在 [BIRTH, EXAM, CAREER, TRAVEL, SOCIAL, DEATH, EVENT] 范围内。",
    "4. VERACITY: rawText 必须是原文的精准截取。event 描述需客观，避免主观抒情。",
    "5. FRAGMENTATION: 若当前片段不包含特定数据类型，对应数组返回 []。不要跨段推测。",
    "6. RELATION: relationship.description 只写结构化关系结论；relationship.evidence 单独填写原文证据短句（<=120字）。",
    "7. IRONY: ironyNote 为可选字段，仅在本段存在可直接引用的讽刺证据时填写；禁止泛化评价（如\"批判社会\"）。",
    "8. UNCERTAINTY: 不确定的人物或关系不要猜测，直接忽略。",
    "9. GENERIC TITLES: 老爷、夫人、太太、小姐、公子、掌柜、那人、众人、旁人等无法唯一指向具体人物的泛化称谓，禁止作为独立 personaName 输出，直接忽略。",
    "10. ALIAS MAPPING: 若原文使用官衔或亲属称谓指代已知人物（如\"范举人\"指代档案中的\"范进\"），personaName 必须填写该人物的标准名（canonicalName），而非原文称谓。",
    "11. VERBATIM NAME: personaName 必须为规范人名，不得在人名后附加\"大人\"\"老爷\"等称谓后缀。",
    "12. STORY CHARS ONLY: 只提取书中叙事故事人物（虚构角色）。严禁提取：作者（如吴敬梓）、评注者（如惺园退士）、序言里的真实历史人物、现代批评家（如鲁迅）、单独姓氏（如\"顾\"\"夏\"\"荀\"不可作为独立人物）。",
    "",
    "## Known Entities (Context)",
    entityContext,
    "",
    "## JSON Output Format",
    JSON.stringify({
      biographies: [
        {
          personaName: "实体标准名（对应 Known Entities 中的 canonicalName，或新人物名）",
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
          sourceName : "发起者标准名",
          targetName : "接收者标准名",
          type       : "关系类型（如: 师生, 敌对, 盟友, 家属）",
          weight     : 0.5,
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

/**
 * 功能：生成“称号人物真名溯源” Phase 5 Prompt。
 * 输入：input - 书名与待溯源称号列表。
 * 输出：可直接发送给模型的字符串 Prompt。
 * 异常：无。
 * 副作用：无。
 */
export function buildTitleResolutionPrompt(input: TitleResolutionInput): string {
  const tableRows = input.entries.map(
    (e) => `| ${e.title} | ${e.localSummary ?? ""} |`
  ).join("\n");

  const exampleOutput: Omit<TitleResolutionEntry, "personaId">[] = [
    { title: "太祖皇帝", realName: "朱元璋", confidence: 0.95, historicalNote: "明朝开国皇帝，庙号太祖" },
    { title: "吴王",   realName: "朱元璋", confidence: 0.90, historicalNote: "封吴王时期尚未称帝" },
    { title: "不知名称号", realName: null, confidence: 0.2, historicalNote: "无历史依据" }
  ];

  return [
    "## 角色",
    `你是中国古典文学历史背景专家，熟悉明清小说历史原型。`,
    "",
    "## 任务",
    `书名：《${input.bookTitle}》`,
    "以下人物在书中仅以称号出现，请根据书中语境和历史知识，推断其真实姓名。",
    "",
    "## 称号列表",
    "| 称号 | 书中摘要 |",
    "|------|----------|",
    tableRows,
    "",
    "## 输出规则",
    "1. realName 填写最准确的历史真名（如\"朱元璋\"）",
    "2. 若确实无法判断→ realName 填 null",
    "3. confidence 0.0-1.0：有据可查填 0.85+，推断填 0.5-0.7，不确定填 < 0.5",
    "4. historicalNote 简短说明推理依据（≤ 30字）",
    "5. 每个称号必须对应一条输出，不得多个称号共用同一条",
    "",
    "## 输出格式（仅输出 JSON 数组，不加任何说明或 Markdown 代码块）",
    JSON.stringify(exampleOutput, null, 2)
  ].join("\n");
}
