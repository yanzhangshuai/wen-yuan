import { createHash } from "node:crypto";

import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export const RELATIONSHIP_DIRECTION_MODES = ["SYMMETRIC", "INVERSE", "DIRECTED"] as const;
export const RELATIONSHIP_TYPE_STATUSES = ["ACTIVE", "INACTIVE", "PENDING_REVIEW"] as const;
export const RELATIONSHIP_TYPE_GROUPS = ["血缘", "姻亲", "师承", "社会身份", "权力关系", "利益关系", "情感关系", "对立关系", "其他"] as const;

export type RelationshipDirectionMode = typeof RELATIONSHIP_DIRECTION_MODES[number];
export type RelationshipTypeStatus = typeof RELATIONSHIP_TYPE_STATUSES[number];

export interface RelationshipTypeInput {
  name             : string;
  group            : string;
  directionMode    : RelationshipDirectionMode;
  sourceRoleLabel? : string | null;
  targetRoleLabel? : string | null;
  edgeLabel?       : string | null;
  reverseEdgeLabel?: string | null;
  aliases?         : string[];
  description?     : string | null;
  usageNotes?      : string | null;
  examples?        : string[];
  color?           : string | null;
  sortOrder?       : number;
  status?          : RelationshipTypeStatus;
  source?          : string;
}

export interface RelationshipTypeListParams {
  q?            : string;
  group?        : string;
  directionMode?: RelationshipDirectionMode;
  status?       : RelationshipTypeStatus;
}

export interface InitializeCommonRelationshipTypesResult {
  total          : number;
  created        : number;
  skipped        : number;
  skippedExisting: number;
  skippedConflict: number;
}

export const COMMON_RELATIONSHIP_TYPES: RelationshipTypeInput[] = [
  {
    name           : "父子",
    group          : "血缘",
    directionMode  : "INVERSE",
    sourceRoleLabel: "父亲",
    targetRoleLabel: "儿子",
    aliases        : ["父子关系"],
    description    : "父亲与儿子之间的血缘关系。",
    sortOrder      : 10
  },
  {
    name           : "母子",
    group          : "血缘",
    directionMode  : "INVERSE",
    sourceRoleLabel: "母亲",
    targetRoleLabel: "儿子",
    aliases        : ["母子关系"],
    description    : "母亲与儿子之间的血缘关系。",
    sortOrder      : 20
  },
  {
    name         : "兄弟",
    group        : "血缘",
    directionMode: "SYMMETRIC",
    aliases      : ["兄弟关系"],
    description  : "男性兄弟之间的血缘关系。",
    sortOrder    : 30
  },
  {
    name         : "姐妹",
    group        : "血缘",
    directionMode: "SYMMETRIC",
    aliases      : ["姐妹关系"],
    description  : "女性姐妹之间的血缘关系。",
    sortOrder    : 40
  },
  {
    name           : "兄妹",
    group          : "血缘",
    directionMode  : "INVERSE",
    sourceRoleLabel: "兄长",
    targetRoleLabel: "妹妹",
    aliases        : ["兄妹关系"],
    description    : "兄长与妹妹之间的血缘关系。",
    sortOrder      : 50
  },
  {
    name           : "姐弟",
    group          : "血缘",
    directionMode  : "INVERSE",
    sourceRoleLabel: "姐姐",
    targetRoleLabel: "弟弟",
    aliases        : ["姐弟关系"],
    description    : "姐姐与弟弟之间的血缘关系。",
    sortOrder      : 60
  },
  {
    name         : "夫妻",
    group        : "姻亲",
    directionMode: "SYMMETRIC",
    aliases      : ["夫妇", "配偶"],
    description  : "婚姻中的配偶关系。",
    sortOrder    : 70
  },
  {
    name           : "岳婿",
    group          : "姻亲",
    directionMode  : "INVERSE",
    sourceRoleLabel: "岳父",
    targetRoleLabel: "女婿",
    aliases        : ["岳丈", "丈人"],
    description    : "妻父与女婿之间的姻亲关系。",
    sortOrder      : 80
  },
  {
    name           : "翁媳",
    group          : "姻亲",
    directionMode  : "INVERSE",
    sourceRoleLabel: "公公",
    targetRoleLabel: "儿媳",
    aliases        : ["公媳"],
    description    : "丈夫之父与儿媳之间的姻亲关系。",
    sortOrder      : 90
  },
  {
    name           : "婆媳",
    group          : "姻亲",
    directionMode  : "INVERSE",
    sourceRoleLabel: "婆婆",
    targetRoleLabel: "儿媳",
    aliases        : ["婆媳关系"],
    description    : "丈夫之母与儿媳之间的姻亲关系。",
    sortOrder      : 100
  },
  {
    name           : "师生",
    group          : "师承",
    directionMode  : "INVERSE",
    sourceRoleLabel: "老师",
    targetRoleLabel: "学生",
    aliases        : ["师父", "徒弟", "弟子"],
    description    : "传授者与受教者之间的师承关系。",
    sortOrder      : 110
  },
  {
    name         : "同门",
    group        : "师承",
    directionMode: "SYMMETRIC",
    aliases      : ["同师", "师兄弟", "师姐妹"],
    description  : "师承来源相同的同门关系。",
    sortOrder    : 120
  },
  {
    name           : "主仆",
    group          : "社会身份",
    directionMode  : "INVERSE",
    sourceRoleLabel: "主人",
    targetRoleLabel: "仆人",
    aliases        : ["主家", "仆从", "奴仆"],
    description    : "主人与仆从之间的社会身份关系。",
    sortOrder      : 130
  },
  {
    name           : "上下级",
    group          : "权力关系",
    directionMode  : "INVERSE",
    sourceRoleLabel: "上级",
    targetRoleLabel: "下级",
    aliases        : ["上司", "属下", "隶属"],
    description    : "组织或职务体系中的上下级关系。",
    sortOrder      : 140
  },
  {
    name         : "同僚",
    group        : "社会身份",
    directionMode: "SYMMETRIC",
    aliases      : ["同事", "同官"],
    description  : "同一组织、职场或官署中的同僚关系。",
    sortOrder    : 150
  },
  {
    name         : "同乡",
    group        : "社会身份",
    directionMode: "SYMMETRIC",
    aliases      : ["乡人", "乡党"],
    description  : "籍贯或家乡相同的社会关系。",
    sortOrder    : 160
  },
  {
    name         : "朋友",
    group        : "情感关系",
    directionMode: "SYMMETRIC",
    aliases      : ["友人", "好友"],
    description  : "稳定的朋友关系。",
    sortOrder    : 170
  },
  {
    name         : "盟友",
    group        : "利益关系",
    directionMode: "SYMMETRIC",
    aliases      : ["同盟", "盟约"],
    description  : "基于共同目标或利益形成的联盟关系。",
    sortOrder    : 180
  },
  {
    name         : "敌对",
    group        : "对立关系",
    directionMode: "SYMMETRIC",
    aliases      : ["对手", "敌手"],
    description  : "稳定的对立关系。",
    sortOrder    : 190
  },
  {
    name           : "债权债务",
    group          : "利益关系",
    directionMode  : "DIRECTED",
    sourceRoleLabel: "债权人",
    targetRoleLabel: "债务人",
    aliases        : ["债主", "债务"],
    description    : "债权人与债务人之间的利益关系。",
    sortOrder      : 200
  }
];

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function compactUnique(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((item) => item.trim()).filter(Boolean)));
}

function buildCodeSeed(input: Pick<RelationshipTypeInput, "name" | "group" | "directionMode" | "sourceRoleLabel" | "targetRoleLabel">): string {
  return [
    input.group,
    input.directionMode,
    input.name,
    input.sourceRoleLabel ?? "",
    input.targetRoleLabel ?? ""
  ].join("|");
}

async function generateRelationshipTypeCode(input: RelationshipTypeInput): Promise<string> {
  const digest = createHash("sha1").update(buildCodeSeed(input)).digest("hex").slice(0, 10);
  const base = `relationship_${digest}`;
  let code = base;
  let suffix = 2;

  while (await prisma.relationshipTypeDefinition.findUnique({ where: { code }, select: { id: true } })) {
    code = `${base}_${suffix}`;
    suffix += 1;
  }

  return code;
}

function validateRelationshipTypeInput(input: RelationshipTypeInput): void {
  if (!RELATIONSHIP_DIRECTION_MODES.includes(input.directionMode)) {
    throw new Error("关系方向模式不合法");
  }
  if (!RELATIONSHIP_TYPE_GROUPS.includes(input.group as typeof RELATIONSHIP_TYPE_GROUPS[number])) {
    throw new Error("关系分组不合法");
  }
  if (input.status && !RELATIONSHIP_TYPE_STATUSES.includes(input.status)) {
    throw new Error("关系类型状态不合法");
  }
  if (input.directionMode === "INVERSE" && (!input.sourceRoleLabel?.trim() || !input.targetRoleLabel?.trim())) {
    throw new Error("互逆关系必须填写 source 与 target 两侧称谓");
  }
  if (input.directionMode === "DIRECTED" && !input.sourceRoleLabel?.trim()) {
    throw new Error("单向关系至少需要填写 source 侧称谓");
  }
}

async function assertNoActiveNameOrAliasConflict(input: {
  id?    : string;
  name   : string;
  aliases: string[];
  status?: RelationshipTypeStatus;
}): Promise<void> {
  if (input.status === "INACTIVE") return;

  const values = new Set([normalizeToken(input.name), ...input.aliases.map(normalizeToken)]);
  const existing = await prisma.relationshipTypeDefinition.findMany({
    where: {
      status: { not: "INACTIVE" },
      ...(input.id ? { id: { not: input.id } } : {})
    },
    select: { name: true, aliases: true }
  });

  for (const item of existing) {
    const existingValues = [item.name, ...item.aliases].map(normalizeToken);
    const conflict = existingValues.find((value) => values.has(value));
    if (conflict) {
      throw new Error(`关系类型名称或别名冲突：${conflict}`);
    }
  }
}

function toCreateData(code: string, input: RelationshipTypeInput): Prisma.RelationshipTypeDefinitionCreateInput {
  const aliases = compactUnique(input.aliases);
  const examples = compactUnique(input.examples);

  return {
    code,
    name            : input.name.trim(),
    group           : input.group,
    directionMode   : input.directionMode,
    sourceRoleLabel : input.sourceRoleLabel?.trim() || null,
    targetRoleLabel : input.targetRoleLabel?.trim() || null,
    edgeLabel       : input.edgeLabel?.trim() || input.name.trim(),
    reverseEdgeLabel: input.reverseEdgeLabel?.trim() || null,
    aliases,
    description     : input.description?.trim() || null,
    usageNotes      : input.usageNotes?.trim() || null,
    examples,
    color           : input.color?.trim() || null,
    sortOrder       : input.sortOrder ?? 0,
    status          : input.status ?? "ACTIVE",
    source          : input.source ?? "MANUAL"
  };
}

export function inferRelationshipTypeLabels(input: {
  directionMode   : string;
  name            : string;
  sourceRoleLabel : string | null;
  targetRoleLabel : string | null;
  edgeLabel       : string;
  reverseEdgeLabel: string | null;
}) {
  const sourceToTarget = input.directionMode === "SYMMETRIC"
    ? input.edgeLabel
    : input.targetRoleLabel ?? input.edgeLabel;
  const targetToSource = input.directionMode === "SYMMETRIC"
    ? input.edgeLabel
    : input.sourceRoleLabel ?? input.reverseEdgeLabel ?? input.name;

  return {
    sourceToTarget,
    targetToSource,
    graphEdgeLabel       : input.edgeLabel,
    reverseGraphEdgeLabel: input.reverseEdgeLabel ?? input.edgeLabel
  };
}

export async function listRelationshipTypes(params?: RelationshipTypeListParams) {
  const where: Prisma.RelationshipTypeDefinitionWhereInput = {};
  if (params?.group) where.group = params.group;
  if (params?.directionMode) where.directionMode = params.directionMode;
  if (params?.status) where.status = params.status;
  if (params?.q) {
    const q = params.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { aliases: { has: q } },
      { description: { contains: q, mode: "insensitive" } }
    ];
  }

  return prisma.relationshipTypeDefinition.findMany({
    where,
    orderBy: [{ group: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: { relationships: true }
      }
    }
  });
}

export async function createRelationshipType(input: RelationshipTypeInput) {
  const normalized = { ...input, aliases: compactUnique(input.aliases), examples: compactUnique(input.examples) };
  validateRelationshipTypeInput(normalized);
  await assertNoActiveNameOrAliasConflict({
    name   : normalized.name,
    aliases: normalized.aliases ?? [],
    status : normalized.status
  });

  const code = await generateRelationshipTypeCode(normalized);
  return prisma.relationshipTypeDefinition.create({
    data: toCreateData(code, normalized)
  });
}

function collectRelationshipTypeTokens(input: Pick<RelationshipTypeInput, "name" | "aliases">): string[] {
  return [input.name, ...compactUnique(input.aliases)].map(normalizeToken).filter(Boolean);
}

export async function initializeCommonRelationshipTypes(): Promise<InitializeCommonRelationshipTypesResult> {
  const existing = await prisma.relationshipTypeDefinition.findMany({
    select: { name: true, aliases: true }
  });
  const existingTokens = new Set<string>();
  for (const item of existing) {
    for (const token of collectRelationshipTypeTokens(item)) {
      existingTokens.add(token);
    }
  }

  const result: InitializeCommonRelationshipTypesResult = {
    total          : COMMON_RELATIONSHIP_TYPES.length,
    created        : 0,
    skipped        : 0,
    skippedExisting: 0,
    skippedConflict: 0
  };

  for (const preset of COMMON_RELATIONSHIP_TYPES) {
    const tokens = collectRelationshipTypeTokens(preset);
    const nameToken = normalizeToken(preset.name);
    const hasConflict = tokens.some((token) => existingTokens.has(token));
    if (hasConflict) {
      result.skipped += 1;
      if (existingTokens.has(nameToken)) {
        result.skippedExisting += 1;
      } else {
        result.skippedConflict += 1;
      }
      continue;
    }

    await createRelationshipType({ ...preset, source: "SEED", status: "ACTIVE" });
    for (const token of tokens) {
      existingTokens.add(token);
    }
    result.created += 1;
  }

  return result;
}

export async function updateRelationshipType(id: string, input: Partial<RelationshipTypeInput>) {
  const current = await prisma.relationshipTypeDefinition.findUnique({ where: { id } });
  if (!current) {
    throw new Error("关系类型不存在");
  }

  const merged: RelationshipTypeInput = {
    name            : input.name ?? current.name,
    group           : input.group ?? current.group,
    directionMode   : (input.directionMode ?? current.directionMode) as RelationshipDirectionMode,
    sourceRoleLabel : input.sourceRoleLabel !== undefined ? input.sourceRoleLabel : current.sourceRoleLabel,
    targetRoleLabel : input.targetRoleLabel !== undefined ? input.targetRoleLabel : current.targetRoleLabel,
    edgeLabel       : input.edgeLabel !== undefined ? input.edgeLabel : current.edgeLabel,
    reverseEdgeLabel: input.reverseEdgeLabel !== undefined ? input.reverseEdgeLabel : current.reverseEdgeLabel,
    aliases         : input.aliases ?? current.aliases,
    description     : input.description !== undefined ? input.description : current.description,
    usageNotes      : input.usageNotes !== undefined ? input.usageNotes : current.usageNotes,
    examples        : input.examples ?? current.examples,
    color           : input.color !== undefined ? input.color : current.color,
    sortOrder       : input.sortOrder ?? current.sortOrder,
    status          : (input.status ?? current.status) as RelationshipTypeStatus,
    source          : current.source
  };

  validateRelationshipTypeInput(merged);
  await assertNoActiveNameOrAliasConflict({
    id,
    name   : merged.name,
    aliases: compactUnique(merged.aliases),
    status : merged.status
  });

  return prisma.relationshipTypeDefinition.update({
    where: { id },
    data : {
      name            : merged.name.trim(),
      group           : merged.group,
      directionMode   : merged.directionMode,
      sourceRoleLabel : merged.sourceRoleLabel?.trim() || null,
      targetRoleLabel : merged.targetRoleLabel?.trim() || null,
      edgeLabel       : merged.edgeLabel?.trim() || merged.name.trim(),
      reverseEdgeLabel: merged.reverseEdgeLabel?.trim() || null,
      aliases         : compactUnique(merged.aliases),
      description     : merged.description?.trim() || null,
      usageNotes      : merged.usageNotes?.trim() || null,
      examples        : compactUnique(merged.examples),
      color           : merged.color?.trim() || null,
      sortOrder       : merged.sortOrder,
      status          : merged.status
    }
  });
}

export async function deleteRelationshipType(id: string) {
  const entry = await prisma.relationshipTypeDefinition.findUnique({
    where  : { id },
    include: { _count: { select: { relationships: true } } }
  });
  if (!entry) {
    throw new Error("关系类型不存在");
  }
  if (entry._count.relationships > 0) {
    throw new Error("该关系类型已被角色关系引用，只能停用，不能删除");
  }

  return prisma.relationshipTypeDefinition.delete({ where: { id } });
}

export async function batchUpdateRelationshipTypeStatus(ids: string[], status: RelationshipTypeStatus) {
  if (!RELATIONSHIP_TYPE_STATUSES.includes(status)) {
    throw new Error("关系类型状态不合法");
  }

  return prisma.relationshipTypeDefinition.updateMany({
    where: { id: { in: ids } },
    data : { status }
  });
}

export async function batchChangeRelationshipTypeGroup(ids: string[], group: string) {
  if (!RELATIONSHIP_TYPE_GROUPS.includes(group as typeof RELATIONSHIP_TYPE_GROUPS[number])) {
    throw new Error("关系分组不合法");
  }

  return prisma.relationshipTypeDefinition.updateMany({
    where: { id: { in: ids } },
    data : { group }
  });
}

export async function batchDeleteRelationshipTypes(ids: string[]) {
  const entries = await prisma.relationshipTypeDefinition.findMany({
    where  : { id: { in: ids } },
    include: { _count: { select: { relationships: true } } }
  });
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  for (const id of ids) {
    const entry = entryById.get(id);
    if (!entry) {
      throw new Error("关系类型不存在");
    }
    if (entry._count.relationships > 0) {
      throw new Error(`关系类型“${entry.name}”已被角色关系引用，只能停用，不能删除`);
    }
  }

  const result = await prisma.relationshipTypeDefinition.deleteMany({
    where: { id: { in: ids } }
  });
  return { count: result.count };
}
