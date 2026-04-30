import { z } from "zod";

import { prisma } from "@/server/db/prisma";

import { executeKnowledgeJsonGeneration, type KnowledgeGenerationModelInfo } from "./generation-utils";
import { RELATIONSHIP_DIRECTION_MODES, RELATIONSHIP_TYPE_GROUPS, type RelationshipDirectionMode } from "./relationship-types";

const behaviorWords = ["轻视", "奉承", "训斥", "求助", "背叛", "和解", "嘲讽", "责骂", "帮助", "争吵"];
const optionalGeneratedTextSchema = z.string().trim().nullable().optional();

const generatedRelationshipTypeSchema = z.object({
  name            : z.string().trim().min(1),
  group           : z.enum(RELATIONSHIP_TYPE_GROUPS),
  directionMode   : z.enum(RELATIONSHIP_DIRECTION_MODES),
  sourceRoleLabel : optionalGeneratedTextSchema,
  targetRoleLabel : optionalGeneratedTextSchema,
  edgeLabel       : z.string().trim().min(1),
  reverseEdgeLabel: optionalGeneratedTextSchema,
  aliases         : z.array(z.string().trim().nullable()).default([]),
  description     : z.string().trim().max(800).nullable().optional(),
  usageNotes      : z.string().trim().max(800).nullable().optional(),
  examples        : z.array(z.string().trim().nullable()).default([]),
  confidence      : z.number().min(0).max(1).default(0.8)
});

const generatedRelationshipTypesSchema = z.array(generatedRelationshipTypeSchema);

export interface RelationshipTypeGenerationPreview {
  targetCount : number;
  targetGroup : string | null;
  systemPrompt: string;
  userPrompt  : string;
}

export interface GeneratedRelationshipTypeCandidate {
  name             : string;
  group            : string;
  directionMode    : RelationshipDirectionMode;
  sourceRoleLabel  : string | null;
  targetRoleLabel  : string | null;
  edgeLabel        : string;
  reverseEdgeLabel : string | null;
  aliases          : string[];
  description      : string | null;
  usageNotes       : string | null;
  examples         : string[];
  confidence       : number;
  conflictWith     : string | null;
  defaultSelected  : boolean;
  recommendedAction: "SELECT" | "REJECT";
  rejectionReason? : string;
}

export interface RelationshipTypeGenerationReviewResult extends RelationshipTypeGenerationPreview {
  candidates     : GeneratedRelationshipTypeCandidate[];
  skipped        : number;
  skippedExisting: number;
  rawContent     : string;
  model          : KnowledgeGenerationModelInfo;
}

function normalizeLookupValue(value: string): string {
  return value.trim().toLowerCase();
}

function compactUnique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(
    values
      .map((item) => item?.trim() ?? "")
      .filter(Boolean)
  ));
}

function containsBehaviorWord(entry: { name: string; aliases: string[] }): string | null {
  const values = [entry.name, ...entry.aliases];
  return behaviorWords.find((word) => values.some((value) => value.includes(word))) ?? null;
}

function buildRelationshipTypePrompts(input: {
  targetCount            : number;
  targetGroup?           : string;
  additionalInstructions?: string;
  existingEntries: Array<{
    name           : string;
    group          : string;
    directionMode  : string;
    sourceRoleLabel: string | null;
    targetRoleLabel: string | null;
    aliases        : string[];
  }>;
}): { systemPrompt: string; userPrompt: string } {
  const existingLines = input.existingEntries.length > 0
    ? input.existingEntries.slice(0, 160).map((entry) =>
      `- ${entry.name}（${entry.group}/${entry.directionMode}，${entry.sourceRoleLabel ?? "-"} -> ${entry.targetRoleLabel ?? "-"}，别名：${entry.aliases.join("、") || "无"}）`
    ).join("\n")
    : "（当前关系类型知识库暂无既有条目）";

  const systemPrompt = [
    "你是中文古典文学角色关系类型知识库构建助手。",
    "请严格输出 JSON 数组，不要输出 Markdown、解释或注释。",
    "每个对象必须包含 name、group、directionMode、edgeLabel、aliases、confidence，可选 sourceRoleLabel、targetRoleLabel、reverseEdgeLabel、description、usageNotes、examples。",
    `group 只能是：${RELATIONSHIP_TYPE_GROUPS.join("、")}。`,
    "directionMode 只能是 SYMMETRIC、INVERSE、DIRECTED。",
    "只生成稳定结构关系类型，例如父子、岳婿、师生、主仆、同僚、上下级、同盟、敌对。",
    "不要生成轻视、奉承、训斥、求助、背叛、和解等行为、态度、事件词；这些应进入关系档案事件标签。",
    "INVERSE 必须给出 sourceRoleLabel 与 targetRoleLabel；DIRECTED 至少给出 sourceRoleLabel。",
    "AI 不要输出 code，系统会在人工保存时生成稳定 code。"
  ].join("\n");

  const userPrompt = [
    `请补充 ${input.targetCount} 个高价值角色关系类型候选。`,
    input.targetGroup ? `目标分组：${input.targetGroup}` : "目标分组：不限，请覆盖古典文学常见关系。",
    "当前已存在关系类型：",
    existingLines,
    input.additionalInstructions ? `补充要求：${input.additionalInstructions}` : "",
    '输出示例：[{"name":"岳婿","group":"姻亲","directionMode":"INVERSE","sourceRoleLabel":"岳父","targetRoleLabel":"女婿","edgeLabel":"岳婿","aliases":["岳丈","丈人","泰山"],"description":"妻子父亲与女婿之间的姻亲关系","usageNotes":"用于稳定身份关系，不用于描述态度或行为","examples":["胡屠户与范进"],"confidence":0.92}]'
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}

function buildReviewCandidates(input: {
  parsed         : z.infer<typeof generatedRelationshipTypesSchema>;
  existingEntries: Array<{ name: string; aliases: string[] }>;
}): { candidates: GeneratedRelationshipTypeCandidate[]; skipped: number; skippedExisting: number } {
  const existingMap = new Map<string, string>();
  for (const entry of input.existingEntries) {
    existingMap.set(normalizeLookupValue(entry.name), entry.name);
    for (const alias of entry.aliases) existingMap.set(normalizeLookupValue(alias), entry.name);
  }

  const merged = new Map<string, GeneratedRelationshipTypeCandidate>();
  let skipped = 0;
  let skippedExisting = 0;

  for (const item of input.parsed) {
    const aliases = compactUnique(item.aliases);
    const key = normalizeLookupValue(item.name);
    if (merged.has(key)) {
      skipped += 1;
      continue;
    }

    const conflictWith = existingMap.get(key)
      ?? aliases.map((alias) => existingMap.get(normalizeLookupValue(alias))).find(Boolean)
      ?? null;
    if (conflictWith) {
      skipped += 1;
      skippedExisting += 1;
      continue;
    }

    const behaviorWord = containsBehaviorWord({ name: item.name, aliases });
    const missingInverse = item.directionMode === "INVERSE" && (!item.sourceRoleLabel?.trim() || !item.targetRoleLabel?.trim());
    const missingDirected = item.directionMode === "DIRECTED" && !item.sourceRoleLabel?.trim();
    const lowConfidence = item.confidence < 0.5;
    const rejectionReason = behaviorWord
        ? `“${behaviorWord}”是行为/态度词，应进入关系档案事件标签`
        : missingInverse
          ? "互逆关系缺少双向称谓"
          : missingDirected
            ? "单向关系缺少 source 侧称谓"
            : lowConfidence
              ? "置信度低于 0.5"
              : undefined;

    merged.set(key, {
      name             : item.name.trim(),
      group            : item.group,
      directionMode    : item.directionMode,
      sourceRoleLabel  : item.sourceRoleLabel?.trim() || null,
      targetRoleLabel  : item.targetRoleLabel?.trim() || null,
      edgeLabel        : item.edgeLabel.trim(),
      reverseEdgeLabel : item.reverseEdgeLabel?.trim() || null,
      aliases,
      description      : item.description?.trim() || null,
      usageNotes       : item.usageNotes?.trim() || null,
      examples         : compactUnique(item.examples),
      confidence       : Math.max(0, Math.min(1, item.confidence)),
      conflictWith,
      defaultSelected  : !rejectionReason,
      recommendedAction: rejectionReason ? "REJECT" : "SELECT",
      rejectionReason
    });
  }

  const candidates = Array.from(merged.values()).sort((left, right) => {
    if (left.defaultSelected !== right.defaultSelected) return Number(right.defaultSelected) - Number(left.defaultSelected);
    if (left.confidence !== right.confidence) return right.confidence - left.confidence;
    return left.name.localeCompare(right.name, "zh-Hans-CN");
  });

  return { candidates, skipped, skippedExisting };
}

export async function previewRelationshipTypeGenerationPrompt(input: {
  targetCount?           : number;
  targetGroup?           : string;
  additionalInstructions?: string;
}): Promise<RelationshipTypeGenerationPreview> {
  const targetCount = input.targetCount ?? 30;
  const existingEntries = await prisma.relationshipTypeDefinition.findMany({
    where  : { status: { not: "INACTIVE" } },
    orderBy: [{ group: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    take   : 160,
    select : {
      name           : true,
      group          : true,
      directionMode  : true,
      sourceRoleLabel: true,
      targetRoleLabel: true,
      aliases        : true
    }
  });
  const prompts = buildRelationshipTypePrompts({
    targetCount,
    targetGroup           : input.targetGroup,
    additionalInstructions: input.additionalInstructions,
    existingEntries
  });

  return {
    targetCount,
    targetGroup: input.targetGroup ?? null,
    ...prompts
  };
}

export async function reviewGeneratedRelationshipTypes(input: {
  targetCount?           : number;
  targetGroup?           : string;
  additionalInstructions?: string;
  modelId?               : string;
}): Promise<RelationshipTypeGenerationReviewResult> {
  const preview = await previewRelationshipTypeGenerationPrompt(input);
  const [generated, existingEntries] = await Promise.all([
    executeKnowledgeJsonGeneration({
      selectedModelId: input.modelId,
      systemPrompt   : preview.systemPrompt,
      userPrompt     : preview.userPrompt,
      schema         : generatedRelationshipTypesSchema
    }),
    prisma.relationshipTypeDefinition.findMany({
      where : { status: { not: "INACTIVE" } },
      select: { name: true, aliases: true }
    })
  ]);
  const reviewed = buildReviewCandidates({
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
