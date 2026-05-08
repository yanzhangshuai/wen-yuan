import { createHash } from "node:crypto";

import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { clearKnowledgeCache } from "@/server/modules/knowledge/load-book-knowledge";

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
  bookTypeId?      : string | null;
}

export interface RelationshipTypeListParams {
  q?            : string;
  group?        : string;
  directionMode?: RelationshipDirectionMode;
  status?       : RelationshipTypeStatus;
  bookTypeId?   : string | null;
}

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

function toCreateData(code: string, input: RelationshipTypeInput): Prisma.RelationshipTypeDefinitionUncheckedCreateInput {
  const aliases = compactUnique(input.aliases);
  const examples = compactUnique(input.examples);

  return {
    code,
    bookTypeId      : input.bookTypeId ?? null,
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
  if (params && "bookTypeId" in params) where.bookTypeId = params.bookTypeId ?? null;
  if (params?.q) {
    const q = params.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { aliases: { has: q } },
      { description: { contains: q, mode: "insensitive" } }
    ];
  }

  const types = await prisma.relationshipTypeDefinition.findMany({
    where,
    orderBy: [{ group: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      bookType: {
        select: { id: true, key: true, name: true }
      }
    }
  });

  if (types.length === 0) {
    return [];
  }

  const codes = types.map((t) => t.code);
  const countResults = await prisma.relationship.groupBy({
    by    : ["relationshipTypeCode"],
    where : { relationshipTypeCode: { in: codes }, deletedAt: null },
    _count: { _all: true }
  });
  const countByCode = new Map(countResults.map((r) => [r.relationshipTypeCode, r._count._all]));

  return types.map((t) => ({
    ...t,
    _count: { relationships: countByCode.get(t.code) ?? 0 }
  })) as (typeof types[number] & { _count: { relationships: number } })[];
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
  const created = await prisma.relationshipTypeDefinition.create({
    data: toCreateData(code, normalized)
  });
  clearKnowledgeCache();
  return created;
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
    source          : current.source,
    bookTypeId      : input.bookTypeId !== undefined ? input.bookTypeId : current.bookTypeId
  };

  validateRelationshipTypeInput(merged);
  await assertNoActiveNameOrAliasConflict({
    id,
    name   : merged.name,
    aliases: compactUnique(merged.aliases),
    status : merged.status
  });

  const updated = await prisma.relationshipTypeDefinition.update({
    where: { id },
    data : {
      bookTypeId      : merged.bookTypeId ?? null,
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
  clearKnowledgeCache();
  return updated;
}

export async function deleteRelationshipType(id: string) {
  const entry = await prisma.relationshipTypeDefinition.findUnique({
    where : { id },
    select: { id: true, code: true, name: true }
  });
  if (!entry) {
    throw new Error("关系类型不存在");
  }

  const usageCount = await prisma.relationship.count({
    where: { relationshipTypeCode: entry.code, deletedAt: null }
  });
  if (usageCount > 0) {
    throw new Error("该关系类型已被角色关系引用，只能停用，不能删除");
  }

  const deleted = await prisma.relationshipTypeDefinition.delete({ where: { id } });
  clearKnowledgeCache();
  return deleted;
}

export async function batchUpdateRelationshipTypeStatus(ids: string[], status: RelationshipTypeStatus) {
  if (!RELATIONSHIP_TYPE_STATUSES.includes(status)) {
    throw new Error("关系类型状态不合法");
  }

  const result = await prisma.relationshipTypeDefinition.updateMany({
    where: { id: { in: ids } },
    data : { status }
  });
  clearKnowledgeCache();
  return result;
}

export async function batchChangeRelationshipTypeGroup(ids: string[], group: string) {
  if (!RELATIONSHIP_TYPE_GROUPS.includes(group as typeof RELATIONSHIP_TYPE_GROUPS[number])) {
    throw new Error("关系分组不合法");
  }

  const result = await prisma.relationshipTypeDefinition.updateMany({
    where: { id: { in: ids } },
    data : { group }
  });
  clearKnowledgeCache();
  return result;
}

export async function batchDeleteRelationshipTypes(ids: string[]) {
  const entries = await prisma.relationshipTypeDefinition.findMany({
    where : { id: { in: ids } },
    select: { id: true, code: true, name: true }
  });
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  const codes = entries.map((e) => e.code);
  const countResults = await prisma.relationship.groupBy({
    by    : ["relationshipTypeCode"],
    where : { relationshipTypeCode: { in: codes }, deletedAt: null },
    _count: { _all: true }
  });
  const countByCode = new Map(countResults.map((r) => [r.relationshipTypeCode, r._count._all]));

  for (const id of ids) {
    const entry = entryById.get(id);
    if (!entry) {
      throw new Error("关系类型不存在");
    }
    if ((countByCode.get(entry.code) ?? 0) > 0) {
      throw new Error(`关系类型“${entry.name}”已被角色关系引用，只能停用，不能删除`);
    }
  }

  const result = await prisma.relationshipTypeDefinition.deleteMany({
    where: { id: { in: ids } }
  });
  clearKnowledgeCache();
  return { count: result.count };
}
