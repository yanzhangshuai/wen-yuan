import {
  PROMPT_TEMPLATE_METADATA,
  PROMPT_TEMPLATE_ORDER,
  type PromptTemplateSlug
} from "../../../lib/prompt-template-metadata.ts";

export interface PromptTemplateBaseline {
  slug        : PromptTemplateSlug;
  name        : string;
  description : string;
  codeRef     : string;
  isActive?   : boolean;
  systemPrompt: string;
  userPrompt  : string;
}

export const PROMPT_TEMPLATE_BASELINES: PromptTemplateBaseline[] = PROMPT_TEMPLATE_ORDER.map((slug) => {
  const meta = PROMPT_TEMPLATE_METADATA[slug];

  switch (slug) {
    case "INDEPENDENT_EXTRACTION":
      return {
        ...meta,
        isActive    : true,
        systemPrompt: "你是中国古典文学命名实体识别专家。请从给定章节中精准提取所有人物，注意区分人物的不同称谓并合并为同一条记录。",
        userPrompt  : [
          "## 任务",
          "列出《{bookTitle}》第{chapterNo}回「{chapterTitle}」中出现的所有人物。",
          "",
          "## 规则",
          "{independentRules}",
          "",
          "## 输出格式（仅输出 JSON 数组）",
          JSON.stringify([
            { name: "范进", aliases: ["范举人", "范老爷"], description: "落魄书生，考中举人后喜极而疯", category: "PERSON" },
            { name: "朱元璋", aliases: ["吴王", "太祖"], description: "被提及的历史人物", category: "MENTIONED_ONLY" }
          ], null, 2),
          "",
          "## 原文",
          "{content}"
        ].join("\n")
      } satisfies PromptTemplateBaseline;

    case "ENTITY_RESOLUTION":
      return {
        ...meta,
        isActive    : true,
        systemPrompt: "你是中国古典文学人物消歧专家。你的任务是判断从不同章节提取的人物称谓是否指向同一个人。注意：同姓但不同人（如兄弟、父子）不应合并。",
        userPrompt  : [
          "## 任务",
          "以下是从《{bookTitle}》各章节独立提取的人物候选组。每组内的人物名称可能指同一人（但也可能不是）。",
          "请逐组判断：组内这些称谓是否指同一个人？",
          "",
          "## 规则",
          "1. shouldMerge=true 仅当你确信组内所有称谓都指同一人（例如 范进/范举人/范老爷 是同一人）。",
          "2. shouldMerge=false 当组内存在不同人物的称谓（例如 娄三公子/娄四公子 是兄弟俩，不是同一人）。",
          "3. mergedName 填写最正式的全名。",
          "4. mergedAliases 包含所有确实属于该人物的称谓（包括 mergedName 本身）。",
          "5. 若 shouldMerge=false，mergedName 填组内第一个名字，mergedAliases 只含该名字。",
          "6. reason 简述判断依据，≤30字。",
          "",
          "## 候选组",
          "{candidateGroups}",
          "",
          "## 输出格式（仅输出 JSON 数组，每组一条）",
          JSON.stringify([
            { groupId: 1, shouldMerge: true, mergedName: "范进", mergedAliases: ["范进", "范举人", "范老爷"], reason: "同一人物的不同称呼" },
            { groupId: 2, shouldMerge: false, mergedName: "娄三公子", mergedAliases: ["娄三公子"], reason: "娄三公子和娄四公子是兄弟二人" }
          ], null, 2)
        ].join("\n")
      } satisfies PromptTemplateBaseline;

    case "TITLE_RESOLUTION":
      return {
        ...meta,
        isActive    : true,
        systemPrompt: "你是中国古典文学历史背景专家，熟悉明清小说历史原型。",
        userPrompt  : [
          "## 任务",
          "书名：《{bookTitle}》",
          "以下人物在书中仅以称号出现，请根据书中语境和历史知识，推断其真实姓名。",
          "",
          "## 称号列表",
          "| 称号 | 书中摘要 |",
          "|------|----------|",
          "{titleEntries}",
          "",
          "## 输出规则",
          "1. realName 填写最准确的历史真名（如\"朱元璋\"）。",
          "2. 若确实无法判断→ realName 填 null。",
          "3. confidence 0.0-1.0：有据可查填 0.85+，较有把握的推断填 0.7-0.85，一般推断填 0.5-0.7，不确定填 < 0.5。",
          "4. historicalNote 简短说明推理依据（≤30字）。",
          "5. 每个称号必须对应一条输出，不得多个称号共用同一条。",
          "",
          "## 输出格式（仅输出 JSON 数组，不加任何说明或 Markdown 代码块）",
          JSON.stringify([
            { title: "太祖皇帝", realName: "朱元璋", confidence: 0.95, historicalNote: "明朝开国皇帝，庙号太祖" },
            { title: "吴王", realName: "朱元璋", confidence: 0.9, historicalNote: "封吴王时期尚未称帝" },
            { title: "不知名称号", realName: null, confidence: 0.2, historicalNote: "无历史依据" }
          ], null, 2)
        ].join("\n")
      } satisfies PromptTemplateBaseline;

    case "TITLE_ARBITRATION":
      return {
        ...meta,
        isActive    : true,
        systemPrompt: "你是文学实体解析仲裁助手。",
        userPrompt  : [
          "## 任务",
          "判断《{bookTitle}》中的灰区称谓是否已经人格化为特定人物稳定称呼。",
          "",
          "## 约束",
          "1. 只针对给定称谓逐项判断，不扩展新增词。",
          "2. 若称谓明显泛指，isPersonalized 返回 false。",
          "3. confidence 只反映当前判断确信度。",
          "",
          "## 待判定称谓",
          "{terms}",
          "",
          "## 输出格式（仅输出 JSON 数组，不加任何说明）",
          JSON.stringify([
            { surfaceForm: "掌门", isPersonalized: true, confidence: 0.82, reason: "多章稳定指向同一人物" },
            { surfaceForm: "先生", isPersonalized: false, confidence: 0.74, reason: "多次泛指，缺乏稳定绑定" }
          ], null, 2)
        ].join("\n")
      } satisfies PromptTemplateBaseline;

    case "CHAPTER_ANALYSIS":
      return {
        ...meta,
        isActive    : true,
        systemPrompt: "你是通用叙事文学结构化提取专家，精准识别复杂文本中的实体轨迹与社交网络。重点：优先将称谓映射到已知人物，避免重复创建同一角色。",
        userPrompt  : [
          "## Task",
          "分析《{bookTitle}》第{chapterNo}回（{chapterTitle}）片段（{chunkIndex}/{chunkCount}），提取 biographies/mentions/relationships。",
          "",
          "## Rules",
          "{analysisRules}",
          "",
          "## Known Entities",
          "{knownEntities}",
          "",
          "## JSON Format",
          JSON.stringify({
            biographies  : [{ personaName: "标准名", category: "枚举", event: "行为", title: "头衔", location: "地点", virtualYear: "时间", ironyNote: "可选" }],
            mentions     : [{ personaName: "标准名", rawText: "原文", summary: "状态", paraIndex: 0 }],
            relationships: [{ sourceName: "发起者", targetName: "接收者", type: "关系类型", weight: 0.5, description: "结论", evidence: "原文证据" }]
          }, null, 2),
          "",
          "## Source Text",
          "{content}"
        ].join("\n")
      } satisfies PromptTemplateBaseline;

    case "ROSTER_DISCOVERY":
      return {
        ...meta,
        isActive    : true,
        systemPrompt: "你是古典中文文献的命名实体专家，专注于从文言文中准确识别人物称谓。重点：同一人物的不同称呼（姓名、字、号、官衔、亲属称呼）都应映射到同一 entityId。",
        userPrompt  : [
          "## 任务",
          "枚举《{bookTitle}》第{chapterNo}章「{chapterTitle}」原文中所有人物称谓（姓名、官衔、亲属称呼等）。",
          "",
          "## 已知人物档案",
          "{knownEntities}",
          "",
          "## 规则",
          "{rosterRules}",
          "",
          "## 输出格式（仅输出 JSON 数组）",
          JSON.stringify([
            { surfaceForm: "范举人", entityId: 1 },
            { surfaceForm: "范老爷", entityId: 1, aliasType: "NICKNAME" },
            { surfaceForm: "严监生", isNew: true },
            { surfaceForm: "太祖皇帝", isNew: true, isTitleOnly: true, aliasType: "TITLE", contextHint: "明朝开国", suggestedRealName: "朱元璋", aliasConfidence: 0.9 },
            { surfaceForm: "那老者", generic: true }
          ], null, 2),
          "",
          "## 本章正文",
          "{content}"
        ].join("\n")
      } satisfies PromptTemplateBaseline;

    case "CHAPTER_VALIDATION":
      return {
        ...meta,
        isActive    : true,
        systemPrompt: "你是一个文学文本实体解析的质量审核专家。你的任务是检查人物解析结果的准确性，发现并报告问题。",
        userPrompt  : [
          "## 核心原则",
          "1. 保守判断：只报告你确信存在的问题，不确定时宁可不报。",
          "2. 证据导向：每个问题必须附带原文证据或数据矛盾点。",
          "3. 不要过度修正：不要仅因为‘可能’就建议合并或拆分。",
          "4. 不要发明信息：不要推测原文中没有的信息。",
          "",
          "## 检查维度",
          "1. 别名误识别：检查新建人物是否实际上是已知人物的别名/称号。",
          "2. 错误合并：检查是否有不同人物被错误归到同一 persona。",
          "3. 漏掉映射：检查 TITLE_ONLY 人物是否有线索可确定真名。",
          "4. 关系合理性：检查关系是否自洽（无自我关系、无明显矛盾）。",
          "5. 同名异人：检查同名人物在不同上下文中是否表现一致。",
          "",
          "## 书籍上下文",
          "书名: 《{bookTitle}》",
          "章节: 第{chapterNo}回「{chapterTitle}」",
          "",
          "## 已知人物档案",
          "{existingPersonas}",
          "",
          "## 本章新建人物",
          "{newlyCreated}",
          "",
          "## 本章提及记录",
          "{chapterMentions}",
          "",
          "## 本章关系记录",
          "{chapterRelationships}",
          "",
          "## 原文片段（重点段落）",
          "{chapterContent}",
          "",
          "## 输出格式（仅输出 JSON）",
          JSON.stringify({
            issues: [{ type: "ALIAS_AS_NEW_PERSONA", severity: "ERROR", confidence: 0.85, description: "描述", evidence: "证据", affectedPersonaIds: ["id"], suggestion: { action: "MERGE", targetPersonaId: "id", sourcePersonaId: "id", newName: "名", newAlias: "别名", reason: "理由" } }]
          }, null, 2),
          "type: ALIAS_AS_NEW_PERSONA|WRONG_MERGE|MISSING_NAME_MAPPING|INVALID_RELATIONSHIP|SAME_NAME_DIFFERENT_PERSON|DUPLICATE_PERSONA",
          "severity: ERROR|WARNING|INFO; action: MERGE|SPLIT|UPDATE_NAME|ADD_ALIAS|DELETE|ADD_MAPPING|MANUAL_REVIEW",
          "无问题返回{\"issues\":[]}。confidence<0.6不报告。evidence必须来自原文，不可编造。"
        ].join("\n")
      } satisfies PromptTemplateBaseline;

    case "BOOK_VALIDATION":
      return {
        ...meta,
        isActive    : true,
        systemPrompt: "你是文学实体识别全书质检专家，需要做跨章节一致性检查。",
        userPrompt  : [
          "## 任务",
          "检查《{bookTitle}》全书人物解析结果的一致性与自洽性。",
          "",
          "## 检查重点",
          "1. 全书人物列表一致性（同人多名、同名异人、重复 persona）。",
          "2. 别名覆盖率（称号是否应回填到真实姓名）。",
          "3. 关系图自洽性（矛盾关系、自我关系）。",
          "4. 低置信实体是否需要人工审核。",
          "",
          "## 全书人物列表",
          "{personas}",
          "",
          "## 关系统计",
          "{relationships}",
          "",
          "## 低置信人物",
          "{lowConfidencePersonas}",
          "",
          "## 抽样原文证据",
          "{sourceExcerpts}",
          "",
          "## 输出格式（仅输出 JSON）",
          JSON.stringify({
            issues: [{ type: "DUPLICATE_PERSONA", severity: "WARNING", confidence: 0.9, description: "描述", evidence: "证据", affectedPersonaIds: ["id1", "id2"], suggestion: { action: "MERGE", targetPersonaId: "id1", sourcePersonaId: "id2", reason: "理由" } }]
          }, null, 2),
          "type: DUPLICATE_PERSONA|ALIAS_AS_NEW_PERSONA|WRONG_MERGE|MISSING_NAME_MAPPING|INVALID_RELATIONSHIP",
          "无问题返回{\"issues\":[]}。confidence<0.6不输出。仅输出有明确证据的问题。"
        ].join("\n")
      } satisfies PromptTemplateBaseline;

    case "STAGE_A_EXTRACT_MENTIONS":
      return {
        ...meta,
        isActive    : true,
        systemPrompt: [
          "你是中文长篇叙事文本的命名实体抽取助手。",
          "本任务只做硬提取：按出现顺序逐条列出章节内每一次人物称呼，禁止跨称呼合并、禁止跨章节推断、禁止臆造原文以外的信息。"
        ].join("\n"),
        userPrompt: [
          "## 任务",
          "对章节正文进行逐 mention 硬提取。对每一次人物称呼输出一条记录，同一人物的不同称呼必须各自成条。",
          "",
          "## 输入",
          "### 章节编号",
          "第 {chapterNo} 章",
          "",
          "### 区段标注（RegionType 列表）",
          "{regionMap}",
          "",
          "### 章节原文",
          "{chapterText}",
          "",
          "## 分类规则",
          "1. 仅输出原始 JSON，禁止 Markdown 代码块。",
          "2. surfaceForm 必须与原文一字不差（不得改写、不得补全）。",
          "3. aliasType 取值（9 选一，见 AliasType 枚举）：",
          "   - TITLE 封号/尊号；POSITION 职位；KINSHIP 亲属代称；NICKNAME 绰号；COURTESY_NAME 字号；",
          "   - NAMED 真名（同一人不同真名之一）；IMPERSONATED_IDENTITY 恶意冒名；MISIDENTIFIED_AS 误认；UNSURE 未定。",
          "4. identityClaim 取值（6 选一，见 IdentityClaim 枚举）：SELF / IMPERSONATING / QUOTED / REPORTED / HISTORICAL / UNSURE。",
          "5. narrativeRegionType 取值（4 选一）：NARRATIVE / DIALOGUE / POEM / COMMENTARY，取自 regionMap 标注。",
          "6. evidenceRawSpan 为包含本次 mention 的最小原文片段（必填，禁改写）。",
          "7. actionVerb 取 surfaceForm 紧邻的主动作动词（如 道/曰/说/走/见/答 等），不存在则填空字符串。",
          "8. confidence ∈ [0,1]，表示本次抽取的置信度。",
          "",
          "## 非 NARRATIVE 区段硬约束（§0-5）",
          "- narrativeRegionType = POEM：identityClaim 必须为 HISTORICAL（诗词典故统一归档），严禁标 SELF。",
          "- narrativeRegionType = COMMENTARY：identityClaim 必须为 REPORTED（说书人议论视角）。",
          "- narrativeRegionType = DIALOGUE：按下方 REV-1 规则进一步细分。",
          "- narrativeRegionType = NARRATIVE：按实际叙事判定 SELF / IMPERSONATING / REPORTED / HISTORICAL。",
          "",
          "## DIALOGUE 细分规则（§0-1 REV-1）",
          "- 引入句主语（形如「甲某道：『…』」）中的 surfaceForm：允许 identityClaim=SELF，evidenceRawSpan 必须覆盖引入句主语。",
          "- 引号内部被提及的第三方 surfaceForm：identityClaim 强制为 QUOTED，不得判 SELF。",
          "- 引号内部自称（形如「我是甲某」「在下姓乙」）：允许 identityClaim=SELF，但 evidenceRawSpan 必须同时覆盖本段引入句主语，以证明自称方身份。",
          "- 无法确定引入句主语者：identityClaim=UNSURE，交由 Stage B 仲裁。",
          "",
          "## suspectedResolvesTo 规则（§0-8）",
          "- 对 COURTESY_NAME / NICKNAME / TITLE / POSITION / KINSHIP 类型的 mention：必须给出 suspectedResolvesTo（≤ 8 个汉字）或显式 null，不得省略字段。",
          "- 对 NAMED / IMPERSONATED_IDENTITY / MISIDENTIFIED_AS：suspectedResolvesTo 可为 null。",
          "- 禁止臆造书外原型（不得把别名映射到原文未出现的历史人物）。",
          "",
          "## 书籍类型专属规则（运行时注入）",
          "{bookTypeSpecialRules}",
          "",
          "## 书籍类型示例（运行时注入）",
          "{bookTypeFewShots}",
          "",
          "## 输出格式（仅输出 JSON 对象，占位示例使用虚构代号甲/乙/丙，仅示意 schema）",
          JSON.stringify({
            mentions: [
              {
                surfaceForm        : "甲某",
                aliasType          : "NAMED",
                identityClaim      : "SELF",
                narrativeRegionType: "NARRATIVE",
                suspectedResolvesTo: null,
                evidenceRawSpan    : "甲某走进庭院",
                actionVerb         : "走",
                confidence         : 0.92
              },
              {
                surfaceForm        : "乙公",
                aliasType          : "COURTESY_NAME",
                identityClaim      : "SELF",
                narrativeRegionType: "DIALOGUE",
                suspectedResolvesTo: "乙丙",
                evidenceRawSpan    : "乙公答：久仰",
                actionVerb         : "答",
                confidence         : 0.81
              }
            ]
          }, null, 2)
        ].join("\n")
      } satisfies PromptTemplateBaseline;

    case "STAGE_B_RESOLVE_ENTITIES":
      return {
        ...meta,
        isActive    : true,
        systemPrompt: [
          "你是中文长篇叙事文本的实体仲裁助手。",
          "本任务从候选组（Stage A mention 聚合 + AliasEntry 命中）出发，判定哪些 surfaceForm 指向同一人物（MERGE），哪些必须保持独立（KEEP_SEPARATE）。"
        ].join("\n"),
        userPrompt: [
          "## 任务",
          "对以下候选组逐组做归并/分裂仲裁，输出 persona 决策，每条必须附带 evidence。",
          "",
          "## 候选组",
          "{candidateGroups}",
          "",
          "## AliasEntry 命中（知识库别名候选）",
          "{aliasEntries}",
          "",
          "## 决策规则",
          "1. action ∈ {MERGE, KEEP_SEPARATE}。",
          "2. MERGE 的必要条件：evidence 至少覆盖两个不同章节且明确指向同一人；仅姓氏相同/称谓相同不构成 MERGE 依据。",
          "3. aliasType=IMPERSONATED_IDENTITY 或 MISIDENTIFIED_AS 的 mention：**必须** KEEP_SEPARATE（真身与被冒名/误认者分立为两个 persona，由冒名链在 AliasEntry 关联）。",
          "4. 同姓但不同代际/身份（如父子、兄弟、主仆）：KEEP_SEPARATE。",
          "5. confidence ∈ [0,1]；**confidence ≥ 0.85 是必要非充分条件**，最终是否采纳由调用方强制校验（不得以高 confidence 绕过规则 2-4）。",
          "6. canonicalName 取组内最正式的真名；若组内全为称号/字号，canonicalName 取最高频且最通用的称谓。",
          "7. memberSurfaceForms 列出组内所有被合并的 surfaceForm（KEEP_SEPARATE 时仅含主条自身）。",
          "8. evidence 为引自章节原文的片段或明确的章节编号对照，禁止编造原文以外的信息。",
          "",
          "## 书籍类型专属规则（运行时注入）",
          "{bookTypeSpecialRules}",
          "",
          "## 书籍类型示例（运行时注入）",
          "{bookTypeFewShots}",
          "",
          "## 输出格式（仅输出 JSON 对象，占位示例使用虚构代号甲/乙/丙，仅示意 schema）",
          JSON.stringify({
            decisions: [
              {
                canonicalName     : "甲某",
                memberSurfaceForms: ["甲某", "甲先生"],
                action            : "MERGE",
                evidence          : "第1章「甲某走进庭院」与第2章「甲先生又至」指同一人",
                confidence        : 0.9
              },
              {
                canonicalName     : "乙公",
                memberSurfaceForms: ["乙公"],
                action            : "KEEP_SEPARATE",
                evidence          : "乙丙为另一独立人物，见第4章独立事件；aliasType=IMPERSONATED_IDENTITY 必须分立",
                confidence        : 0.88
              }
            ]
          }, null, 2)
        ].join("\n")
      } satisfies PromptTemplateBaseline;

    case "STAGE_C_ATTRIBUTE_EVENT":
      return {
        ...meta,
        isActive    : true,
        systemPrompt: [
          "你是中文长篇叙事文本的 biography 归属助手。",
          "本任务在 Stage B 解析结果之上，为章节原文生成 biography 记录，并按叙事透镜（NarrativeLens）区分真身亲历 / 冒用 / 转述 / 追忆 / 历史典故。"
        ].join("\n"),
        userPrompt: [
          "## 任务",
          "结合已解析 persona 与 mention 集，对章节事件做 biography 归属。",
          "",
          "## 输入",
          "### 章节编号",
          "第 {chapterNo} 章",
          "",
          "### 区段标注",
          "{regionMap}",
          "",
          "### 章节原文",
          "{chapterText}",
          "",
          "### 已解析 persona",
          "{resolvedPersonas}",
          "",
          "### mention 集（Stage A 归一后）",
          "{mentions}",
          "",
          "## 归属规则",
          "1. personaCanonicalName 必须来自「已解析 persona」列表，禁止新增未列出的人物。",
          "2. narrativeLens ∈ {SELF, IMPERSONATING, QUOTED, REPORTED, HISTORICAL}（NarrativeLens 枚举 5 选一）。",
          "   - POEM 区段事件统一归为 HISTORICAL；",
          "   - COMMENTARY 区段事件统一归为 REPORTED；",
          "   - DIALOGUE 区段被提及第三方事件归 QUOTED；",
          "   - IMPERSONATED_IDENTITY 类 mention 的事件归 IMPERSONATING；",
          "   - 其余主干叙事归 SELF。",
          "3. rawSpan 为事件对应的章节原文最小片段（必填，禁改写）。",
          "4. category 为事件类别（BIRTH / EXAM / CAREER / TRAVEL / SOCIAL / DEATH / EVENT 等），按项目既有枚举择一。",
          "5. chapterNo 与输入一致，用于下游聚合。",
          "6. 同一事件涉及多个 persona 时，拆成多条记录，每条对应一个 personaCanonicalName。",
          "7. 严禁臆造原文中未出现的事件，禁止跨章推断。",
          "",
          "## 书籍类型专属规则（运行时注入）",
          "{bookTypeSpecialRules}",
          "",
          "## 书籍类型示例（运行时注入）",
          "{bookTypeFewShots}",
          "",
          "## 输出格式（仅输出 JSON 对象，占位示例使用虚构代号甲/乙/丙，仅示意 schema）",
          JSON.stringify({
            records: [
              {
                personaCanonicalName: "甲某",
                narrativeLens       : "SELF",
                rawSpan             : "甲某走进庭院",
                category            : "TRAVEL",
                chapterNo           : 1
              },
              {
                personaCanonicalName: "乙公",
                narrativeLens       : "QUOTED",
                rawSpan             : "乙公答：久仰",
                category            : "SOCIAL",
                chapterNo           : 1
              }
            ]
          }, null, 2)
        ].join("\n")
      } satisfies PromptTemplateBaseline;
  }
});
