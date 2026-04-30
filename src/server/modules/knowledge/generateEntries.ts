import { z } from "zod";

import { prisma } from "@/server/db/prisma";
import { createAiProviderClient, type AiProviderProtocol } from "@/server/providers/ai";
import { decryptValue } from "@/server/security/encryption";
import { repairJson } from "@/types/analysis";

import { auditLog } from "./audit";

/**
 * ============================================================================
 * 文件定位：`src/server/modules/knowledge/generateEntries.ts`
 * ----------------------------------------------------------------------------
 * 人物别名知识包“模型生成”服务。
 *
 * 业务职责：
 * - 生成前预览提示词；
 * - 调用模型产出候选并做去重/重叠检测/默认筛选；
 * - 在确认阶段写入条目并记录审计日志。
 * ============================================================================
 */

const generatedEntrySchema = z.object({
  canonicalName: z.string().trim().min(1),
  aliases      : z.array(z.string().trim().min(1)).default([]),
  confidence   : z.number().min(0).max(1).default(0.8)
});

const generatedEntriesSchema = z.array(generatedEntrySchema);

export interface AliasPackGeneratedCandidate {
  canonicalName    : string;
  aliases          : string[];
  confidence       : number;
  overlapEntries   : string[];
  overlapTerms     : string[];
  defaultSelected  : boolean;
  recommendedAction: "SELECT" | "REJECT";
  rejectionReason? : string;
}

export interface AliasPackGenerationPreview {
  packId     : string;
  packName   : string;
  genreKey   : string | null;
  targetCount: number;
  bookContext: {
    id    : string;
    title : string;
    author: string | null;
  } | null;
  systemPrompt: string;
  userPrompt  : string;
}

export interface AliasPackGenerationResult extends AliasPackGenerationPreview {
  created   : number;
  skipped   : number;
  rawContent: string;
  model: {
    id       : string;
    provider : string;
    protocol : AiProviderProtocol;
    modelName: string;
  };
}

export interface AliasPackGenerationReviewResult extends AliasPackGenerationPreview {
  candidates     : AliasPackGeneratedCandidate[];
  skipped        : number;
  skippedExisting: number;
  rawContent     : string;
  model: {
    id       : string;
    provider : string;
    protocol : AiProviderProtocol;
    modelName: string;
  };
}

interface NormalizedGeneratedEntry {
  canonicalName: string;
  aliases      : string[];
  confidence   : number;
}

function buildGenerationPrompts(input: {
  packName   : string;
  genreKey   : string | null;
  description: string | null;
  targetCount: number;
  bookContext: {
    title : string;
    author: string | null;
  } | null;
  existingEntries        : Array<{ canonicalName: string; aliases: string[] }>;
  additionalInstructions?: string;
}): { systemPrompt: string; userPrompt: string } {
  const existingLines = input.existingEntries.length > 0
    ? input.existingEntries
      .slice(0, 80)
      .map((entry) => `- ${entry.canonicalName}: ${entry.aliases.join("、") || "无别名"}`)
      .join("\n")
    : "（当前知识包暂无既有条目）";

  const systemPrompt = [
    "你是古典文学人物别名知识库构建助手。",
    "请严格按照 JSON 数组输出，不要输出任何额外说明、Markdown 或注释。",
    "每个条目必须包含 canonicalName、aliases、confidence。",
    "canonicalName 必须是人物最常见、最权威的全名。",
    "aliases 仅包含原著中实际出现的别名、字、号、绰号、官衔代称，不包含 canonicalName 本身。",
    "若同一称谓存在明显歧义，宁可不输出。",
    "confidence 低于 0.5 的条目不要输出。"
  ].join("\n");

  const userPrompt = [
    `请为知识包「${input.packName}」生成前 ${input.targetCount} 位主要人物及其别名。`,
    input.bookContext
      ? `目标书籍：《${input.bookContext.title}》${input.bookContext.author ? `（作者：${input.bookContext.author}）` : ""}`
      : "目标书籍：未指定，按当前知识包覆盖范围泛化生成。",
    `书籍类型：${input.genreKey ?? "未指定"}`,    `知识包说明：${input.description ?? "无"}`,
    "",
    "当前已存在条目：",
    existingLines,
    "",
    "请重点关注：字号、绰号、谥号、法号、官衔代称、家族中稳定使用的简称。",
    "排除内容：泛化称谓、临时称呼、明显歧义称号、未在原著中实际出现的叫法。",
    input.additionalInstructions ? `补充要求：${input.additionalInstructions}` : "",
    "",
    '输出格式示例：[{"canonicalName":"关羽","aliases":["关云长","云长","关公"],"confidence":0.95}]'
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}

async function getGenerationModel(selectedModelId?: string) {
  const select = {
    id      : true,
    provider: true,
    protocol: true,
    modelId : true,
    apiKey  : true,
    baseUrl : true
  } as const;

  const model = selectedModelId
    ? await prisma.aiModel.findFirst({
      where: {
        id       : selectedModelId,
        isEnabled: true,
        apiKey   : { not: null }
      },
      select
    })
    : await prisma.aiModel.findFirst({
      where: {
        isEnabled: true,
        apiKey   : { not: null }
      },
      orderBy: [
        { isDefault: "desc" },
        { updatedAt: "desc" }
      ],
      select
    });

  if (!model?.apiKey) {
    throw new Error(selectedModelId
      ? "选定模型不可用，请确认模型已启用并完成 Key 配置"
      : "未找到可用的已启用模型，请先在模型管理中配置默认模型");
  }

  return {
    id       : model.id,
    provider : model.provider,
    protocol : model.protocol as AiProviderProtocol,
    modelName: model.modelId,
    apiKey   : decryptValue(model.apiKey),
    baseUrl  : model.baseUrl ?? undefined
  };
}

function normalizeForLookup(value: string): string {
  return value.trim().toLowerCase();
}

function buildReviewCandidates(input: {
  parsed         : z.infer<typeof generatedEntriesSchema>;
  existingEntries: Array<{ canonicalName: string; aliases: string[] }>;
}): { candidates: AliasPackGeneratedCandidate[]; skipped: number; skippedExisting: number } {
  const canonicalNameMap = new Map<string, string>();
  const aliasToEntryNames = new Map<string, Set<string>>();

  for (const entry of input.existingEntries) {
    const canonicalKey = normalizeForLookup(entry.canonicalName);
    canonicalNameMap.set(canonicalKey, entry.canonicalName);

    const terms = [entry.canonicalName, ...entry.aliases];
    for (const term of terms) {
      const key = normalizeForLookup(term);
      if (!key) {
        continue;
      }
      const names = aliasToEntryNames.get(key) ?? new Set<string>();
      names.add(entry.canonicalName);
      aliasToEntryNames.set(key, names);
    }
  }

  const mergedByCanonical = new Map<string, NormalizedGeneratedEntry>();
  let skipped = 0;
  let skippedExisting = 0;

  for (const entry of input.parsed) {
    const canonicalName = entry.canonicalName.trim();
    const aliases = Array.from(new Set(
      entry.aliases
        .map((alias) => alias.trim())
        .filter((alias) => alias.length > 0 && alias !== canonicalName)
    ));

    if (!canonicalName || aliases.length === 0) {
      skipped += 1;
      continue;
    }

    const key = normalizeForLookup(canonicalName);
    if (canonicalNameMap.has(key)) {
      skipped += 1;
      skippedExisting += 1;
      continue;
    }

    const existing = mergedByCanonical.get(key);
    if (existing) {
      existing.aliases = Array.from(new Set([...existing.aliases, ...aliases]));
      existing.confidence = Math.max(existing.confidence, entry.confidence);
      skipped += 1;
      continue;
    }

    mergedByCanonical.set(key, {
      canonicalName,
      aliases,
      confidence: Math.max(0, Math.min(1, entry.confidence))
    });
  }

  const candidates = Array.from(mergedByCanonical.values()).map((entry) => {
    const overlapEntries = new Set<string>();
    const overlapTerms = new Set<string>();
    const canonicalKey = normalizeForLookup(entry.canonicalName);

    const canonicalAliasMatches = aliasToEntryNames.get(canonicalKey);
    if (canonicalAliasMatches) {
      for (const match of canonicalAliasMatches) {
        overlapEntries.add(match);
      }
      overlapTerms.add(entry.canonicalName);
    }

    for (const alias of entry.aliases) {
      const aliasKey = normalizeForLookup(alias);
      const aliasMatches = aliasToEntryNames.get(aliasKey);
      if (!aliasMatches) {
        continue;
      }

      for (const match of aliasMatches) {
        overlapEntries.add(match);
      }
      overlapTerms.add(alias);
    }

    const confidenceTooLow = entry.confidence < 0.5;
    const defaultSelected = !confidenceTooLow;

    let rejectionReason: string | undefined;
    if (confidenceTooLow) {
      rejectionReason = "置信度低于 0.5，默认不保存";
    }

    return {
      canonicalName    : entry.canonicalName,
      aliases          : entry.aliases,
      confidence       : entry.confidence,
      overlapEntries   : Array.from(overlapEntries),
      overlapTerms     : Array.from(overlapTerms),
      defaultSelected,
      recommendedAction: defaultSelected ? "SELECT" : "REJECT",
      rejectionReason
    } satisfies AliasPackGeneratedCandidate;
  }).sort((left, right) => {
    if (left.defaultSelected !== right.defaultSelected) {
      return left.defaultSelected ? -1 : 1;
    }
    return right.confidence - left.confidence;
  });

  return { candidates, skipped, skippedExisting };
}

async function runGenerationModel(input: {
  packId                 : string;
  targetCount?           : number;
  additionalInstructions?: string;
  modelId?               : string;
  bookId?                : string;
}): Promise<AliasPackGenerationReviewResult> {
  const preview = await previewAliasPackGenerationPrompt(input);
  const model = await getGenerationModel(input.modelId);
  const providerClient = createAiProviderClient({
    provider : model.provider,
    protocol : model.protocol,
    apiKey   : model.apiKey,
    baseUrl  : model.baseUrl,
    modelName: model.modelName
  });

  const aiResult = await providerClient.generateJson({
    system: preview.systemPrompt,
    user  : preview.userPrompt
  }, {
    temperature    : 0.2,
    maxOutputTokens: 8192,
    topP           : 1
  });

  const repaired = repairJson(aiResult.content);
  const parsed = generatedEntriesSchema.parse(JSON.parse(repaired));

  const existingEntries = await prisma.aliasEntry.findMany({
    where: {
      packId      : input.packId,
      reviewStatus: { in: ["PENDING", "VERIFIED"] }
    },
    select: {
      canonicalName: true,
      aliases      : true
    }
  });

  const reviewed = buildReviewCandidates({ parsed, existingEntries });

  return {
    ...preview,
    candidates     : reviewed.candidates,
    skipped        : reviewed.skipped,
    skippedExisting: reviewed.skippedExisting,
    rawContent     : aiResult.content,
    model          : {
      id       : model.id,
      provider : model.provider,
      protocol : model.protocol,
      modelName: model.modelName
    }
  };
}

/**
 * 功能：预览人物别名生成所用提示词，不触发模型调用。
 */
export async function previewAliasPackGenerationPrompt(input: {
  packId                 : string;
  targetCount?           : number;
  additionalInstructions?: string;
  bookId?                : string;
}): Promise<AliasPackGenerationPreview> {
  const [pack, bookContext] = await Promise.all([
    prisma.aliasPack.findUnique({
      where  : { id: input.packId },
      include: {
        bookType: { select: { key: true } },
        entries : {
          where  : { reviewStatus: { in: ["PENDING", "VERIFIED"] } },
          orderBy: { confidence: "desc" },
          take   : 80,
          select : {
            canonicalName: true,
            aliases      : true
          }
        }
      }
    }),
    input.bookId
      ? prisma.book.findUnique({
        where : { id: input.bookId },
        select: {
          id    : true,
          title : true,
          author: true
        }
      })
      : Promise.resolve(null)
  ]);

  if (!pack) {
    throw new Error("知识包不存在");
  }

  if (input.bookId && !bookContext) {
    throw new Error("目标书籍不存在");
  }

  const targetCount = input.targetCount ?? 50;
  const prompts = buildGenerationPrompts({
    packName              : pack.name,
    genreKey              : pack.bookType?.key ?? null,
    description           : pack.description,
    targetCount,
    bookContext,
    existingEntries       : pack.entries,
    additionalInstructions: input.additionalInstructions
  });

  return {
    packId  : pack.id,
    packName: pack.name,
    genreKey: pack.bookType?.key ?? null,
    targetCount,
    bookContext,
    ...prompts
  };
}

/**
 * 功能：执行 dry-run 预审，返回候选与默认建议，不写入数据库。
 */
export async function reviewGenerateEntries(input: {
  packId                 : string;
  targetCount?           : number;
  additionalInstructions?: string;
  modelId?               : string;
  bookId?                : string;
}): Promise<AliasPackGenerationReviewResult> {
  return runGenerationModel(input);
}

/**
 * 功能：落库保存“默认选中”的生成候选并写审计日志。
 */
export async function generateEntries(input: {
  packId                 : string;
  targetCount?           : number;
  additionalInstructions?: string;
  modelId?               : string;
  bookId?                : string;
  operatorId?            : string;
}): Promise<AliasPackGenerationResult> {
  const review = await runGenerationModel(input);
  const selectedEntries = review.candidates
    .filter((candidate) => candidate.defaultSelected)
    .map((candidate) => ({
      canonicalName: candidate.canonicalName,
      aliases      : candidate.aliases,
      confidence   : candidate.confidence
    }));

  const created = await prisma.$transaction(async (tx) => {
    let createdCount = 0;

    for (const entry of selectedEntries) {
      await tx.aliasEntry.create({
        data: {
          packId       : input.packId,
          canonicalName: entry.canonicalName,
          aliases      : entry.aliases,
          confidence   : entry.confidence,
          source       : "LLM_GENERATED",
          reviewStatus : "PENDING",
          notes        : `LLM 生成候选，待人工审核 model=${review.model.modelName}`
        }
      });
      createdCount += 1;
    }

    if (createdCount > 0) {
      await tx.aliasPack.update({
        where: { id: input.packId },
        data : { version: { increment: 1 } }
      });
    }
    return createdCount;
  });

  await auditLog({
    objectType: "KNOWLEDGE_PACK",
    objectId  : input.packId,
    objectName: review.packName,
    action    : "GENERATE",
    after     : {
      targetCount: review.targetCount,
      created,
      skipped    : review.candidates.length - created,
      modelId    : review.model.id,
      modelName  : review.model.modelName,
      bookId     : review.bookContext?.id ?? null,
      bookTitle  : review.bookContext?.title ?? null
    },
    operatorId: input.operatorId
  });

  return {
    ...review,
    created,
    skipped: review.candidates.length - created
  };
}
