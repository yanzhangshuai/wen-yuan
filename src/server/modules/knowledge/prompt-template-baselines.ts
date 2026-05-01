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
        systemPrompt: [
          "你是通用叙事文学结构化提取专家，精准识别复杂文本中的实体轨迹与社交网络。",
          "重点 1：优先将称谓映射到已知人物，避免重复创建同一角色。",
          "重点 2：关系分两层。结构关系（relationships）描述身份事实（父子/师生/同僚），全书唯一；关系事件（relationshipEvents）描述本章互动（资助/背叛/赔礼），可多次发生。",
          "重点 3：relationshipTypeCode 必须从字典挑选，不要自创。"
        ].join("\n"),
        userPrompt: [
          "## Task",
          "分析《{bookTitle}》第{chapterNo}回（{chapterTitle}）片段（{chunkIndex}/{chunkCount}），提取 biographies/mentions/relationships/relationshipEvents。",
          "",
          "## Rules",
          "{analysisRules}",
          "",
          "## 已知关系类型字典",
          "{relationshipTypeDictionary}",
          "",
          "## attitudeTags 三分类引导（每条事件最多 3 个，必须来自下列示例库）",
          "【情感态度】感激 / 怨恨 / 倾慕 / 厌恶 / 愧疚 / 惧怕",
          "【行为倾向】资助 / 提携 / 排挤 / 背叛 / 庇护",
          "【关系演化】疏远 / 决裂 / 修好 / 公开 / 隐瞒 / 利用",
          "若文本无明确态度信号，输出 []。",
          "",
          "## Known Entities",
          "{knownEntities}",
          "",
          "## JSON Format",
          JSON.stringify({
            biographies       : [{ personaName: "标准名", category: "枚举", event: "行为", title: "头衔", location: "地点", virtualYear: "时间", ironyNote: "可选" }],
            mentions          : [{ personaName: "标准名", rawText: "原文", summary: "状态", paraIndex: 0 }],
            relationships     : [{ sourceName: "标准名", targetName: "标准名", relationshipTypeCode: "PARENT_CHILD", evidence: "可选，原文片段" }],
            relationshipEvents: [{ sourceName: "标准名", targetName: "标准名", relationshipTypeCode: "PARENT_CHILD", summary: "本章互动事件摘要", evidence: "原文证据片段", attitudeTags: ["感激", "资助"], paraIndex: 12, confidence: 0.85 }]
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
  }
});
