import { z } from "zod";

import { prisma } from "@/server/db/prisma";

import { executeKnowledgeJsonGeneration, type KnowledgeGenerationModelInfo } from "./generation-utils";

/**
 * ============================================================================
 * 文件定位：`src/server/modules/knowledge/generateSurnames.ts`
 * ----------------------------------------------------------------------------
 * 姓氏词库“模型生成”服务。
 *
 * 业务职责：
 * - 预览提示词；
 * - 调用模型返回候选；
 * - 进行候选去重、重叠检测与默认选中建议。
 *
 * 说明：本文件只负责“候选生成与预审”，最终落库由调用方审核后再执行。
 * ============================================================================
 */

const generatedSurnameSchema = z.object({
  surname    : z.string().trim().min(1),
  isCompound : z.boolean().optional(),
  priority   : z.number().int().min(0).max(20).optional(),
  description: z.string().trim().max(200).optional(),
  confidence : z.number().min(0).max(1).default(0.8)
});

const generatedSurnamesSchema = z.array(generatedSurnameSchema);
const SURNAME_PATTERN = /^[\u3400-\u9fff]{1,4}$/u;

export interface SurnameGenerationPreview {
  targetCount      : number;
  referenceBookType : {
    id  : string;
    key : string;
    name: string;
  } | null;
  systemPrompt: string;
  userPrompt  : string;
}

export interface GeneratedSurnameCandidate {
  surname          : string;
  isCompound       : boolean;
  priority         : number;
  description      : string | null;
  confidence       : number;
  overlapSurname   : string | null;
  defaultSelected  : boolean;
  recommendedAction: "SELECT" | "REJECT";
  rejectionReason? : string;
}

export interface SurnameGenerationReviewResult extends SurnameGenerationPreview {
  candidates: GeneratedSurnameCandidate[];
  skipped   : number;
  rawContent: string;
  model     : KnowledgeGenerationModelInfo;
}

interface NormalizedGeneratedSurname {
  surname    : string;
  isCompound : boolean;
  priority   : number;
  description: string | null;
  confidence : number;
}

function normalizeLookupValue(value: string): string {
  return value.trim().toLowerCase();
}

function buildSurnamePrompts(input: {
  targetCount      : number;
  referenceBookType: { key: string; name: string } | null;
  existingEntries      : Array<{
    surname    : string;
    isCompound : boolean;
    priority   : number;
    description: string | null;
    bookType   : { key: string; name: string } | null;
  }>;
  additionalInstructions?: string;
}): { systemPrompt: string; userPrompt: string } {
  const existingLines = input.existingEntries.length > 0
    ? input.existingEntries
      .slice(0, 120)
      .map((entry) => `- ${entry.surname}（${entry.isCompound ? "复姓" : "单姓"}，优先级 ${entry.priority}，适用：${entry.bookType?.name ?? "通用"}${entry.description ? `，说明：${entry.description}` : ""}）`)
      .join("\n")
    : "（当前词库暂无既有条目）";

  const systemPrompt = [
    "你是中文古典文学姓氏词库构建助手。",
    "请严格输出 JSON 数组，不要输出任何额外说明、Markdown 或注释。",
    "每个对象必须包含 surname、isCompound、priority、confidence，可选 description。",
    "surname 必须是单个姓氏词条，不得输出完整人名、称谓或职位。",
    "confidence 低于 0.5 的候选不要输出。",
    "priority 建议规则：复姓通常为 10，单姓通常为 0，可按业务价值微调。"
  ].join("\n");

  const userPrompt = [
    `请为姓氏词库补充 ${input.targetCount} 个高价值候选。`,
    input.referenceBookType
      ? `参考题材：${input.referenceBookType.name}（key: ${input.referenceBookType.key}）`
      : "参考题材：未指定，按通用中文古典文学场景生成。",
    "目标：优先补充复姓、容易误判的人名开头、以及古典小说中高频但词库尚未覆盖的姓氏。",
    "排除：完整人名、官职、称谓、绰号、地名、组织名。",
    "当前已存在条目：",
    existingLines,
    input.additionalInstructions ? `补充要求：${input.additionalInstructions}` : "",
    '输出示例：[{"surname":"欧阳","isCompound":true,"priority":10,"confidence":0.96,"description":"古典小说高频复姓"}]'
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}

function buildSurnameReviewCandidates(input: {
  parsed         : z.infer<typeof generatedSurnamesSchema>;
  existingEntries: Array<{ surname: string }>;
}): { candidates: GeneratedSurnameCandidate[]; skipped: number } {
  const existingMap = new Map(
    input.existingEntries.map((entry) => [normalizeLookupValue(entry.surname), entry.surname])
  );

  const mergedBySurname = new Map<string, NormalizedGeneratedSurname>();
  let skipped = 0;

  for (const entry of input.parsed) {
    const surname = entry.surname.trim();
    if (!SURNAME_PATTERN.test(surname)) {
      skipped += 1;
      continue;
    }

    const isCompound = entry.isCompound ?? surname.length >= 2;
    const priority = Math.max(0, Math.min(20, entry.priority ?? (isCompound ? 10 : 0)));
    const description = entry.description?.trim() ? entry.description.trim() : null;
    const confidence = Math.max(0, Math.min(1, entry.confidence));
    const key = normalizeLookupValue(surname);
    const existing = mergedBySurname.get(key);

    if (existing) {
      existing.isCompound = existing.isCompound || isCompound;
      existing.priority = Math.max(existing.priority, priority);
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.description = existing.description ?? description;
      skipped += 1;
      continue;
    }

    mergedBySurname.set(key, {
      surname,
      isCompound,
      priority,
      description,
      confidence
    });
  }

  const candidates = Array.from(mergedBySurname.values())
    .map((entry) => {
      const overlapSurname = existingMap.get(normalizeLookupValue(entry.surname)) ?? null;
      const confidenceTooLow = entry.confidence < 0.5;
      const defaultSelected = !overlapSurname && !confidenceTooLow;

      return {
        surname          : entry.surname,
        isCompound       : entry.isCompound,
        priority         : entry.priority,
        description      : entry.description,
        confidence       : entry.confidence,
        overlapSurname,
        defaultSelected,
        recommendedAction: defaultSelected ? "SELECT" : "REJECT",
        rejectionReason  : overlapSurname
          ? "姓氏已存在于当前词库中，默认不重复保存"
          : confidenceTooLow
            ? "置信度低于 0.5，默认不保存"
            : undefined
      } satisfies GeneratedSurnameCandidate;
    })
    .sort((left, right) => {
      if (left.defaultSelected !== right.defaultSelected) {
        return Number(right.defaultSelected) - Number(left.defaultSelected);
      }
      if (left.confidence !== right.confidence) {
        return right.confidence - left.confidence;
      }
      if (left.isCompound !== right.isCompound) {
        return Number(right.isCompound) - Number(left.isCompound);
      }
      return left.surname.localeCompare(right.surname, "zh-Hans-CN");
    });

  return { candidates, skipped };
}

/**
 * 功能：预览姓氏候选生成提示词，不调用模型。
 */
export async function previewSurnameGenerationPrompt(input: {
  targetCount?           : number;
  additionalInstructions?: string;
  referenceBookTypeId?   : string;
}): Promise<SurnameGenerationPreview> {
  const [referenceBookType, existingEntries] = await Promise.all([
    input.referenceBookTypeId
      ? prisma.bookType.findUnique({
        where : { id: input.referenceBookTypeId },
        select: { id: true, key: true, name: true }
      })
      : Promise.resolve(null),
    prisma.surnameEntry.findMany({
      where  : { isActive: true },
      orderBy: [{ isCompound: "desc" }, { priority: "desc" }, { surname: "asc" }],
      take   : 120,
      select : {
        surname    : true,
        isCompound : true,
        priority   : true,
        description: true,
        bookType   : { select: { key: true, name: true } }
      }
    })
  ]);

  if (input.referenceBookTypeId && !referenceBookType) {
    throw new Error("参考题材不存在");
  }

  const targetCount = input.targetCount ?? 30;
  const prompts = buildSurnamePrompts({
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
 * 功能：执行姓氏候选预审并返回可审核的数据集。
 */
export async function reviewGeneratedSurnames(input: {
  targetCount?           : number;
  additionalInstructions?: string;
  referenceBookTypeId?   : string;
  modelId?               : string;
}): Promise<SurnameGenerationReviewResult> {
  const preview = await previewSurnameGenerationPrompt(input);
  const [generated, existingEntries] = await Promise.all([
    executeKnowledgeJsonGeneration({
      selectedModelId: input.modelId,
      systemPrompt   : preview.systemPrompt,
      userPrompt     : preview.userPrompt,
      schema         : generatedSurnamesSchema
    }),
    prisma.surnameEntry.findMany({
      where : { isActive: true },
      select: { surname: true }
    })
  ]);

  const reviewed = buildSurnameReviewCandidates({
    parsed: generated.parsed,
    existingEntries
  });

  return {
    ...preview,
    candidates: reviewed.candidates,
    skipped   : reviewed.skipped,
    rawContent: generated.rawContent,
    model     : generated.model
  };
}
