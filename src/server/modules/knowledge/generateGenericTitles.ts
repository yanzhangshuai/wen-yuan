import { z } from "zod";

import { prisma } from "@/server/db/prisma";

import { executeKnowledgeJsonGeneration, type KnowledgeGenerationModelInfo } from "./generation-utils";

/**
 * ============================================================================
 * 文件定位：`src/server/modules/knowledge/generateGenericTitles.ts`
 * ----------------------------------------------------------------------------
 * 泛化称谓词库“模型生成”服务。
 *
 * 业务职责：
 * - 预览提示词；
 * - 调用模型生成候选；
 * - 执行候选去重、重叠识别、默认推荐动作计算。
 *
 * 说明：本文件不直接落库，落库发生在人工审核确认后的上层流程。
 * ============================================================================
 */

const generatedGenericTitleSchema = z.object({
  title              : z.string().trim().min(1),
  tier               : z.enum(["SAFETY", "DEFAULT"]).default("DEFAULT"),
  exemptInBookTypeIds: z.array(z.string().trim().min(1)).default([]),
  description        : z.string().trim().max(500).optional(),
  confidence         : z.number().min(0).max(1).default(0.8)
});

const generatedGenericTitlesSchema = z.array(generatedGenericTitleSchema);

export interface GenericTitleGenerationPreview {
  targetCount      : number;
  referenceBookType : {
    id  : string;
    key : string;
    name: string;
  } | null;
  systemPrompt: string;
  userPrompt  : string;
}

export interface GeneratedGenericTitleCandidate {
  title              : string;
  tier               : "SAFETY" | "DEFAULT";
  exemptInBookTypeIds: string[];
  description        : string | null;
  confidence         : number;
  overlapTitle       : string | null;
  defaultSelected    : boolean;
  recommendedAction  : "SELECT" | "REJECT";
  rejectionReason?   : string;
}

export interface GenericTitleGenerationReviewResult extends GenericTitleGenerationPreview {
  candidates     : GeneratedGenericTitleCandidate[];
  skipped        : number;
  skippedExisting: number;
  rawContent     : string;
  model          : KnowledgeGenerationModelInfo;
}

interface NormalizedGeneratedGenericTitle {
  title              : string;
  tier               : "SAFETY" | "DEFAULT";
  exemptInBookTypeIds: string[];
  description        : string | null;
  confidence         : number;
}

function normalizeLookupValue(value: string): string {
  return value.trim().toLowerCase();
}

function buildGenericTitlePrompts(input: {
  targetCount      : number;
  referenceBookType: { key: string; name: string } | null;
  existingEntries      : Array<{
    title              : string;
    tier               : string;
    exemptInBookTypeIds: unknown;
    description        : string | null;
  }>;
  additionalInstructions?: string;
}): { systemPrompt: string; userPrompt: string } {
  const existingLines = input.existingEntries.length > 0
    ? input.existingEntries
      .slice(0, 120)
      .map((entry) => {
        const exemptInBookTypeIds = Array.isArray(entry.exemptInBookTypeIds)
          ? entry.exemptInBookTypeIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [];

        return `- ${entry.title}（层级：${entry.tier}${exemptInBookTypeIds.length > 0 ? `，题材豁免：${exemptInBookTypeIds.join("、")}` : ""}${entry.description ? `，说明：${entry.description}` : ""}）`;
      })
      .join("\n")
    : "（当前词库暂无既有条目）";

  const systemPrompt = [
    "你是中文古典文学泛化称谓词库构建助手。",
    "请严格输出 JSON 数组，不要输出任何额外说明、Markdown 或注释。",
    "每个对象必须包含 title、tier、exemptInBookTypeIds、confidence，可选 description。",
    "tier 只能是 SAFETY 或 DEFAULT。",
    "SAFETY 表示绝对泛称，任何情况下都不应指向具体人物；此时 exemptInBookTypeIds 必须为空数组。",
    "DEFAULT 表示默认泛称，但在某些题材中可能是稳定的人物称呼，此时可把对应题材 key 写入 exemptInBookTypeIds。",
    "confidence 低于 0.5 的候选不要输出。"
  ].join("\n");

  const userPrompt = [
    `请为泛化称谓词库补充 ${input.targetCount} 个高价值候选。`,
    input.referenceBookType
      ? `参考题材：${input.referenceBookType.name}（key: ${input.referenceBookType.key}）`
      : "参考题材：未指定，请从通用中文古典文学场景出发。",
    "目标：补充常见泛称，并区分哪些属于安全泛称、哪些只是在默认情况下视为泛称。",
    "排除：具体人名、完整官职名称、稳定专名、明显依赖单本书上下文才能成立的临时称呼。",
    "当前已存在条目：",
    existingLines,
    input.additionalInstructions ? `补充要求：${input.additionalInstructions}` : "",
    '输出示例：[{"title":"先生","tier":"DEFAULT","exemptInBookTypeIds":["武侠"],"confidence":0.88,"description":"多数场景为泛称，武侠中可稳定指人"}]'
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}

function buildGenericTitleReviewCandidates(input: {
  parsed         : z.infer<typeof generatedGenericTitlesSchema>;
  existingEntries: Array<{ title: string }>;
}): { candidates: GeneratedGenericTitleCandidate[]; skipped: number; skippedExisting: number } {
  const existingMap = new Map(
    input.existingEntries.map((entry) => [normalizeLookupValue(entry.title), entry.title])
  );

  const mergedByTitle = new Map<string, NormalizedGeneratedGenericTitle>();
  let skipped = 0;
  let skippedExisting = 0;

  for (const entry of input.parsed) {
    const title = entry.title.trim();
    if (!title) {
      skipped += 1;
      continue;
    }

    const key = normalizeLookupValue(title);
    if (existingMap.has(key)) {
      skipped += 1;
      skippedExisting += 1;
      continue;
    }

    const exemptInBookTypeIds = Array.from(new Set(
      entry.exemptInBookTypeIds
        .map((item) => item.trim())
        .filter(Boolean)
    ));
    const normalizedEntry: NormalizedGeneratedGenericTitle = {
      title,
      tier               : entry.tier,
      exemptInBookTypeIds: entry.tier === "SAFETY" ? [] : exemptInBookTypeIds,
      description        : entry.description?.trim() ? entry.description.trim() : null,
      confidence         : Math.max(0, Math.min(1, entry.confidence))
    };

    const existing = mergedByTitle.get(key);
    if (existing) {
      existing.tier = existing.tier === "SAFETY" || normalizedEntry.tier === "SAFETY"
        ? "SAFETY"
        : "DEFAULT";
      existing.exemptInBookTypeIds = Array.from(new Set([...existing.exemptInBookTypeIds, ...normalizedEntry.exemptInBookTypeIds]));
      existing.description = existing.description ?? normalizedEntry.description;
      existing.confidence = Math.max(existing.confidence, normalizedEntry.confidence);
      skipped += 1;
      continue;
    }

    mergedByTitle.set(key, normalizedEntry);
  }

  const candidates = Array.from(mergedByTitle.values())
    .map((entry) => {
      const confidenceTooLow = entry.confidence < 0.5;
      const defaultSelected = !confidenceTooLow;

      return {
        title              : entry.title,
        tier               : entry.tier,
        exemptInBookTypeIds: entry.tier === "SAFETY" ? [] : entry.exemptInBookTypeIds,
        description        : entry.description,
        confidence         : entry.confidence,
        overlapTitle       : null,
        defaultSelected,
        recommendedAction  : defaultSelected ? "SELECT" : "REJECT",
        rejectionReason    : confidenceTooLow
            ? "置信度低于 0.5，默认不保存"
            : undefined
      } satisfies GeneratedGenericTitleCandidate;
    })
    .sort((left, right) => {
      if (left.defaultSelected !== right.defaultSelected) {
        return Number(right.defaultSelected) - Number(left.defaultSelected);
      }
      if (left.confidence !== right.confidence) {
        return right.confidence - left.confidence;
      }
      return left.title.localeCompare(right.title, "zh-Hans-CN");
    });

  return { candidates, skipped, skippedExisting };
}

/**
 * 功能：预览泛化称谓候选生成提示词，不调用模型。
 */
export async function previewGenericTitleGenerationPrompt(input: {
  targetCount?           : number;
  additionalInstructions?: string;
  referenceBookTypeId?   : string;
}): Promise<GenericTitleGenerationPreview> {
  const [referenceBookType, existingEntries] = await Promise.all([
    input.referenceBookTypeId
      ? prisma.bookType.findUnique({
        where : { id: input.referenceBookTypeId },
        select: { id: true, key: true, name: true }
      })
      : Promise.resolve(null),
    prisma.genericTitleRule.findMany({
      where  : { isActive: true },
      orderBy: [{ tier: "asc" }, { title: "asc" }],
      take   : 120,
      select : {
        title              : true,
        tier               : true,
        exemptInBookTypeIds: true,
        description        : true
      }
    })
  ]);

  if (input.referenceBookTypeId && !referenceBookType) {
    throw new Error("参考题材不存在");
  }

  const targetCount = input.targetCount ?? 30;
  const prompts = buildGenericTitlePrompts({
    targetCount,
    referenceBookType,
    existingEntries,
    additionalInstructions: input.additionalInstructions
  });

  return {
    targetCount,
    referenceBookType,
    ...prompts
  };
}

/**
 * 功能：执行泛化称谓候选预审并返回可审核的数据集。
 */
export async function reviewGeneratedGenericTitles(input: {
  targetCount?           : number;
  additionalInstructions?: string;
  referenceBookTypeId?   : string;
  modelId?               : string;
}): Promise<GenericTitleGenerationReviewResult> {
  const preview = await previewGenericTitleGenerationPrompt(input);
  const [generated, existingEntries] = await Promise.all([
    executeKnowledgeJsonGeneration({
      selectedModelId: input.modelId,
      systemPrompt   : preview.systemPrompt,
      userPrompt     : preview.userPrompt,
      schema         : generatedGenericTitlesSchema
    }),
    prisma.genericTitleRule.findMany({
      where : { isActive: true },
      select: { title: true }
    })
  ]);

  const reviewed = buildGenericTitleReviewCandidates({
    parsed: generated.parsed,
    existingEntries
  });

  return {
    ...preview,
    candidates     : reviewed.candidates,
    skipped        : reviewed.skipped,
    skippedExisting: reviewed.skippedExisting,
    rawContent     : generated.rawContent,
    model          : generated.model
  };
}
