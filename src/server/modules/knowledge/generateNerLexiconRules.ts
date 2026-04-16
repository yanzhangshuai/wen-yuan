import { z } from "zod";

import { prisma } from "@/server/db/prisma";

import { executeKnowledgeJsonGeneration, type KnowledgeGenerationModelInfo } from "./generation-utils";

const generatedNerLexiconRuleSchema = z.object({
  content   : z.string().trim().min(1),
  confidence: z.number().min(0).max(1).default(0.8)
});

const generatedNerLexiconRulesSchema = z.array(generatedNerLexiconRuleSchema);

export interface NerLexiconGenerationPreview {
  ruleType         : "HARD_BLOCK_SUFFIX" | "SOFT_BLOCK_SUFFIX" | "TITLE_STEM" | "POSITION_STEM";
  targetCount      : number;
  referenceBookType: {
    id  : string;
    key : string;
    name: string;
  } | null;
  systemPrompt: string;
  userPrompt  : string;
}

export interface NerLexiconGenerationResult {
  created: number;
  skipped: number;
  model  : KnowledgeGenerationModelInfo;
}

function normalizeLookupValue(value: string): string {
  return value.trim().toLowerCase();
}

function buildNerLexiconPrompts(input: {
  ruleType   : NerLexiconGenerationPreview["ruleType"];
  targetCount: number;
  bookType   : { key: string; name: string } | null;
  activeRules : Array<{
    content : string;
    ruleType: string;
    bookType: { key: string; name: string } | null;
  }>;
  additionalInstructions?: string;
}): { systemPrompt: string; userPrompt: string } {
  const existingLines = input.activeRules.length > 0
    ? input.activeRules
      .slice(0, 120)
      .map((rule) => `- ${rule.content}（类型：${rule.ruleType}，适用：${rule.bookType?.name ?? "通用"}）`)
      .join("\n")
    : "（当前暂无已启用规则）";

  const systemPrompt = [
    "你是中文古典文学 NER 词典规则构建助手。",
    "请严格输出 JSON 数组，不要输出任何额外说明、Markdown 或注释。",
    "每个对象必须包含 content、confidence。",
    "content 必须是单条规则文本，不要输出解释字段。",
    "confidence 低于 0.5 的候选不要输出。"
  ].join("\n");

  const userPrompt = [
    `请为 NER 规则类型 ${input.ruleType} 生成 ${input.targetCount} 条候选规则。`,
    input.bookType
      ? `参考题材：${input.bookType.name}（key: ${input.bookType.key}）`
      : "参考题材：未指定，请按通用古典文学场景生成。",
    "目标：补充可直接用于规则词典的短语或词干，避免输出完整人物名、剧情说明或元话语。",
    "当前已启用规则：",
    existingLines,
    input.additionalInstructions ? `补充要求：${input.additionalInstructions}` : "",
    '输出示例：[{"content":"大人","confidence":0.9}]'
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}

export async function previewNerLexiconGenerationPrompt(input: {
  ruleType               : NerLexiconGenerationPreview["ruleType"];
  targetCount?           : number;
  bookTypeId?            : string;
  additionalInstructions?: string;
}): Promise<NerLexiconGenerationPreview> {
  const [referenceBookType, activeRules] = await Promise.all([
    input.bookTypeId
      ? prisma.bookType.findUnique({
        where : { id: input.bookTypeId },
        select: { id: true, key: true, name: true }
      })
      : Promise.resolve(null),
    prisma.nerLexiconRule.findMany({
      where: {
        ruleType: input.ruleType,
        isActive: true,
        ...(input.bookTypeId
          ? {
            OR: [
              { bookTypeId: null },
              { bookTypeId: input.bookTypeId }
            ]
          }
          : {})
      },
      orderBy: [{ sortOrder: "asc" }, { content: "asc" }],
      take   : 120,
      select : {
        content : true,
        ruleType: true,
        bookType: { select: { key: true, name: true } }
      }
    })
  ]);

  if (input.bookTypeId && !referenceBookType) {
    throw new Error("参考题材不存在");
  }

  const targetCount = input.targetCount ?? 30;
  const prompts = buildNerLexiconPrompts({
    ruleType              : input.ruleType,
    targetCount,
    bookType              : referenceBookType,
    activeRules,
    additionalInstructions: input.additionalInstructions
  });

  return {
    ruleType: input.ruleType,
    targetCount,
    referenceBookType,
    ...prompts
  };
}

export async function generateNerLexiconRules(input: {
  ruleType               : NerLexiconGenerationPreview["ruleType"];
  targetCount?           : number;
  bookTypeId?            : string;
  additionalInstructions?: string;
  selectedModelId?       : string;
  modelId?               : string;
}): Promise<NerLexiconGenerationResult> {
  const preview = await previewNerLexiconGenerationPrompt(input);
  const [generated, existingRules, lastRule] = await Promise.all([
    executeKnowledgeJsonGeneration({
      selectedModelId: input.selectedModelId ?? input.modelId,
      systemPrompt   : preview.systemPrompt,
      userPrompt     : preview.userPrompt,
      schema         : generatedNerLexiconRulesSchema
    }),
    prisma.nerLexiconRule.findMany({
      where: {
        ruleType  : input.ruleType,
        bookTypeId: input.bookTypeId ?? null
      },
      select: { content: true }
    }),
    prisma.nerLexiconRule.findFirst({
      where: {
        ruleType  : input.ruleType,
        bookTypeId: input.bookTypeId ?? null
      },
      orderBy: { sortOrder: "desc" },
      select : { sortOrder: true }
    })
  ]);

  const existingContentSet = new Set(
    existingRules.map((rule) => normalizeLookupValue(rule.content))
  );
  const seenGeneratedContent = new Set<string>();
  let skipped = 0;
  let nextSortOrder = (lastRule?.sortOrder ?? 0) + 1;

  const data = generated.parsed.flatMap((rule) => {
    const content = rule.content.trim();
    const normalizedContent = normalizeLookupValue(content);

    if (seenGeneratedContent.has(normalizedContent)) {
      skipped += 1;
      return [];
    }

    seenGeneratedContent.add(normalizedContent);

    if (existingContentSet.has(normalizedContent)) {
      skipped += 1;
      return [];
    }

    const sortOrder = nextSortOrder;
    nextSortOrder += 1;

    return [{
      ruleType  : input.ruleType,
      content,
      bookTypeId: input.bookTypeId,
      sortOrder,
      isActive  : false,
      source    : "LLM_SUGGESTED"
    }];
  });

  if (data.length > 0) {
    await prisma.nerLexiconRule.createMany({ data });
  }

  return {
    created: data.length,
    skipped,
    model  : generated.model
  };
}
