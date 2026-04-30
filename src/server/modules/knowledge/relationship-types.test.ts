import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  batchChangeRelationshipTypeGroup,
  batchDeleteRelationshipTypes,
  batchUpdateRelationshipTypeStatus,
  COMMON_RELATIONSHIP_TYPES,
  createRelationshipType,
  deleteRelationshipType,
  initializeCommonRelationshipTypes,
  inferRelationshipTypeLabels
} from "@/server/modules/knowledge/relationship-types";

const hoisted = vi.hoisted(() => ({
  prisma: {
    relationshipTypeDefinition: {
      findMany  : vi.fn(),
      findUnique: vi.fn(),
      create    : vi.fn(),
      update    : vi.fn(),
      updateMany: vi.fn(),
      delete    : vi.fn(),
      deleteMany: vi.fn()
    }
  }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: hoisted.prisma
}));

describe("relationship-types", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("generates a stable code when creating a relationship type", async () => {
    hoisted.prisma.relationshipTypeDefinition.findMany.mockResolvedValueOnce([]);
    hoisted.prisma.relationshipTypeDefinition.findUnique.mockResolvedValueOnce(null);
    hoisted.prisma.relationshipTypeDefinition.create.mockResolvedValueOnce({ id: "rel-type-1" });

    await expect(createRelationshipType({
      name           : "岳婿",
      group          : "姻亲",
      directionMode  : "INVERSE",
      sourceRoleLabel: "岳父",
      targetRoleLabel: "女婿",
      aliases        : ["岳丈", "岳丈", "丈人"],
      examples       : ["胡屠户与范进"]
    })).resolves.toEqual({ id: "rel-type-1" });

    expect(hoisted.prisma.relationshipTypeDefinition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code           : expect.stringMatching(/^relationship_[a-f0-9]{10}$/),
        name           : "岳婿",
        edgeLabel      : "岳婿",
        aliases        : ["岳丈", "丈人"],
        source         : "MANUAL",
        status         : "ACTIVE",
        sourceRoleLabel: "岳父",
        targetRoleLabel: "女婿"
      })
    });
  });

  it("rejects inverse relationship types without both role labels", async () => {
    await expect(createRelationshipType({
      name           : "父子",
      group          : "血缘",
      directionMode  : "INVERSE",
      sourceRoleLabel: "父亲"
    })).rejects.toThrow("互逆关系必须填写 source 与 target 两侧称谓");

    expect(hoisted.prisma.relationshipTypeDefinition.findMany).not.toHaveBeenCalled();
  });

  it("rejects active name or alias conflicts before persisting", async () => {
    hoisted.prisma.relationshipTypeDefinition.findMany.mockResolvedValueOnce([
      { name: "父子", aliases: ["父亲", "儿子"] }
    ]);

    await expect(createRelationshipType({
      name           : "父女",
      group          : "血缘",
      directionMode  : "INVERSE",
      sourceRoleLabel: "父亲",
      targetRoleLabel: "女儿",
      aliases        : ["父亲"]
    })).rejects.toThrow("关系类型名称或别名冲突：父亲");

    expect(hoisted.prisma.relationshipTypeDefinition.create).not.toHaveBeenCalled();
  });

  it("prevents deleting a relationship type already referenced by relationships", async () => {
    hoisted.prisma.relationshipTypeDefinition.findUnique.mockResolvedValueOnce({
      id    : "rel-type-1",
      _count: { relationships: 2 }
    });

    await expect(deleteRelationshipType("rel-type-1")).rejects.toThrow("该关系类型已被角色关系引用，只能停用，不能删除");
    expect(hoisted.prisma.relationshipTypeDefinition.delete).not.toHaveBeenCalled();
  });

  it("prevents batch deleting relationship types that are already referenced", async () => {
    hoisted.prisma.relationshipTypeDefinition.findMany.mockResolvedValueOnce([
      { id: "rel-type-1", name: "岳婿", _count: { relationships: 1 } },
      { id: "rel-type-2", name: "师生", _count: { relationships: 0 } }
    ]);

    await expect(batchDeleteRelationshipTypes(["rel-type-1", "rel-type-2"]))
      .rejects
      .toThrow("关系类型“岳婿”已被角色关系引用，只能停用，不能删除");

    expect(hoisted.prisma.relationshipTypeDefinition.delete).not.toHaveBeenCalled();
  });

  it("batch updates relationship type status and group", async () => {
    hoisted.prisma.relationshipTypeDefinition.updateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 2 });

    await expect(batchUpdateRelationshipTypeStatus(["rel-type-1", "rel-type-2"], "PENDING_REVIEW"))
      .resolves
      .toEqual({ count: 2 });
    await expect(batchChangeRelationshipTypeGroup(["rel-type-1", "rel-type-2"], "姻亲"))
      .resolves
      .toEqual({ count: 2 });

    expect(hoisted.prisma.relationshipTypeDefinition.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ["rel-type-1", "rel-type-2"] } },
      data : { status: "PENDING_REVIEW" }
    });
    expect(hoisted.prisma.relationshipTypeDefinition.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ["rel-type-1", "rel-type-2"] } },
      data : { group: "姻亲" }
    });
  });

  it("infers forward and reverse labels for inverse relationship types", () => {
    expect(inferRelationshipTypeLabels({
      directionMode   : "INVERSE",
      name            : "岳婿",
      sourceRoleLabel : "岳父",
      targetRoleLabel : "女婿",
      edgeLabel       : "岳婿",
      reverseEdgeLabel: null
    })).toEqual({
      sourceToTarget       : "女婿",
      targetToSource       : "岳父",
      graphEdgeLabel       : "岳婿",
      reverseGraphEdgeLabel: "岳婿"
    });
  });

  it("initializes the built-in common relationship types when no conflicts exist", async () => {
    hoisted.prisma.relationshipTypeDefinition.findMany.mockResolvedValue([]);
    hoisted.prisma.relationshipTypeDefinition.findUnique.mockResolvedValue(null);
    hoisted.prisma.relationshipTypeDefinition.create.mockImplementation(({ data }) => Promise.resolve({ id: data.name, ...data }));

    const result = await initializeCommonRelationshipTypes();

    expect(result).toEqual({
      total          : COMMON_RELATIONSHIP_TYPES.length,
      created        : COMMON_RELATIONSHIP_TYPES.length,
      skipped        : 0,
      skippedExisting: 0,
      skippedConflict: 0
    });
    expect(hoisted.prisma.relationshipTypeDefinition.create).toHaveBeenCalledTimes(COMMON_RELATIONSHIP_TYPES.length);
    expect(hoisted.prisma.relationshipTypeDefinition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name  : "父子",
        source: "SEED",
        status: "ACTIVE"
      })
    });
  });

  it("skips built-in common relationship types that already exist by name", async () => {
    hoisted.prisma.relationshipTypeDefinition.findMany.mockResolvedValueOnce(
      COMMON_RELATIONSHIP_TYPES.map((item) => ({ name: item.name, aliases: item.aliases }))
    );

    const result = await initializeCommonRelationshipTypes();

    expect(result).toEqual({
      total          : COMMON_RELATIONSHIP_TYPES.length,
      created        : 0,
      skipped        : COMMON_RELATIONSHIP_TYPES.length,
      skippedExisting: COMMON_RELATIONSHIP_TYPES.length,
      skippedConflict: 0
    });
    expect(hoisted.prisma.relationshipTypeDefinition.create).not.toHaveBeenCalled();
  });
});
