# 统一人物合并语义与 Profile 合并 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手动合并和建议接受走同一套合并逻辑，补上 Profile 合并，过滤僵尸建议。

**Architecture:** 从 `mergePersonas.ts` 模块顶层导出 `mergePersonasInTransaction(tx, input)` 作为唯一权威实现；`mergePersonas` 和 `acceptMergeSuggestion` 各司入口职责，共用核心。

**Tech Stack:** TypeScript, Prisma, Vitest

---

### Task 1: 抽出 `mergePersonasInTransaction` + 补 Profile 合并

**Files:**
- Modify: `src/server/modules/personas/mergePersonas.ts`

**What:** 将 `mergePersonas` 内 `$transaction` 回调逻辑提升为模块顶层导出函数 `mergePersonasInTransaction`，在其中补 Profile 合并。`mergePersonas` 变为薄封装：校验 + 开事务 + 调核心函数。

- [ ] **Step 1: 将事务体提取为模块顶层导出函数**

编辑 `src/server/modules/personas/mergePersonas.ts`。改动点：

1. 在 `shouldKeepFirstRelationship` 函数之后、`createMergePersonasService` 之前，插入 `mergePersonasInTransaction` 导出函数。
2. 函数体 = 原 `$transaction` 回调内容 + Profile 合并逻辑（见 Step 2）。
3. `mergePersonas` 简化为仅做校验 + `$transaction(tx => mergePersonasInTransaction(tx, input))`。

```typescript
// ===== 在 shouldKeepFirstRelationship 之后插入 =====

/**
 * 在事务内执行人物合并（权威实现，供手动合并和建议接受共用）。
 */
export async function mergePersonasInTransaction(
  tx: PrismaClient,
  input: MergePersonasInput
): Promise<MergePersonasResult> {
  const personas = await tx.persona.findMany({
    where: {
      id       : { in: [input.sourceId, input.targetId] },
      deletedAt: null
    },
    select: {
      id     : true,
      name   : true,
      aliases: true
    }
  });

  const sourcePersona = personas.find((item) => item.id === input.sourceId);
  if (!sourcePersona) {
    throw new PersonaNotFoundError(input.sourceId);
  }

  const targetPersona = personas.find((item) => item.id === input.targetId);
  if (!targetPersona) {
    throw new PersonaNotFoundError(input.targetId);
  }

  const now = new Date();

  // BiographyRecord 迁移
  const biographyUpdated = await tx.biographyRecord.updateMany({
    where: { personaId: sourcePersona.id, deletedAt: null },
    data : { personaId: targetPersona.id }
  });

  // Mention 迁移
  const mentionUpdated = await tx.mention.updateMany({
    where: { personaId: sourcePersona.id, deletedAt: null },
    data : { personaId: targetPersona.id }
  });

  // Relationship 迁移
  const relations = await tx.relationship.findMany({
    where: {
      deletedAt: null,
      OR       : [
        { sourceId: sourcePersona.id },
        { targetId: sourcePersona.id }
      ]
    },
    select: {
      id                  : true,
      bookId              : true,
      sourceId            : true,
      targetId            : true,
      relationshipTypeCode: true,
      recordSource        : true
    }
  });

  const symmetricRelationshipTypes = await tx.relationshipTypeDefinition.findMany({
    where: { directionMode: "SYMMETRIC", status: "ACTIVE" },
    select: { code: true }
  });
  const symmetricTypeCodes = new Set(symmetricRelationshipTypes.map((item) => item.code));

  let redirectedRelationships = 0;
  let rejectedRelationships = 0;

  for (const relation of relations) {
    let nextSourceId = relation.sourceId === sourcePersona.id ? targetPersona.id : relation.sourceId;
    let nextTargetId = relation.targetId === sourcePersona.id ? targetPersona.id : relation.targetId;

    if (nextSourceId === nextTargetId) {
      await tx.relationship.update({
        where: { id: relation.id },
        data : { status: ProcessingStatus.REJECTED, deletedAt: now }
      });
      rejectedRelationships += 1;
      continue;
    }

    if (symmetricTypeCodes.has(relation.relationshipTypeCode) && nextSourceId > nextTargetId) {
      [nextSourceId, nextTargetId] = [nextTargetId, nextSourceId];
    }

    const duplicated = await tx.relationship.findFirst({
      where: {
        id                  : { not: relation.id },
        deletedAt           : null,
        bookId              : relation.bookId,
        sourceId            : nextSourceId,
        targetId            : nextTargetId,
        relationshipTypeCode: relation.relationshipTypeCode
      },
      select: { id: true, recordSource: true }
    });

    if (duplicated) {
      const keepCurrentRelation = shouldKeepFirstRelationship(relation, duplicated);
      const rejectedRelationshipId = keepCurrentRelation ? duplicated.id : relation.id;

      await tx.relationship.update({
        where: { id: rejectedRelationshipId },
        data : { status: ProcessingStatus.REJECTED, deletedAt: now }
      });

      if (keepCurrentRelation) {
        await tx.relationship.update({
          where: { id: relation.id },
          data : { sourceId: nextSourceId, targetId: nextTargetId }
        });
        redirectedRelationships += 1;
      }

      rejectedRelationships += 1;
      continue;
    }

    if (relation.sourceId !== nextSourceId || relation.targetId !== nextTargetId) {
      await tx.relationship.update({
        where: { id: relation.id },
        data : { sourceId: nextSourceId, targetId: nextTargetId }
      });
      redirectedRelationships += 1;
    }
  }

  // ===== Profile 合并（新增） =====
  const sourceProfiles = await tx.profile.findMany({
    where: { personaId: sourcePersona.id, deletedAt: null }
  });
  const targetProfiles = await tx.profile.findMany({
    where: { personaId: targetPersona.id, deletedAt: null }
  });
  const targetProfileByBook = new Map(targetProfiles.map((p) => [p.bookId, p]));

  for (const sp of sourceProfiles) {
    const tp = targetProfileByBook.get(sp.bookId);
    if (!tp) {
      await tx.profile.update({
        where: { id: sp.id },
        data : { personaId: targetPersona.id }
      });
    } else {
      await tx.profile.update({
        where: { id: tp.id },
        data : {
          localTags               : [...new Set([...tp.localTags, ...sp.localTags])],
          ironyIndex              : Math.max(tp.ironyIndex, sp.ironyIndex),
          localSummary            : tp.localSummary ?? sp.localSummary,
          officialTitle           : tp.officialTitle ?? sp.officialTitle,
          moralTier               : tp.moralTier ?? sp.moralTier,
          firstAppearanceChapterId: tp.firstAppearanceChapterId ?? sp.firstAppearanceChapterId,
          visualConfig            : (tp.visualConfig ?? sp.visualConfig) as Record<string, unknown> | null
        }
      });
      await tx.profile.update({
        where: { id: sp.id },
        data : { deletedAt: now }
      });
    }
  }

  // 别名合并
  await tx.persona.update({
    where: { id: targetPersona.id },
    data : {
      aliases: normalizeAliases([
        ...targetPersona.aliases,
        ...sourcePersona.aliases,
        sourcePersona.name
      ])
    }
  });

  // 软删除源人物
  await tx.persona.update({
    where: { id: sourcePersona.id },
    data : { deletedAt: now }
  });

  return {
    sourceId                : sourcePersona.id,
    targetId                : targetPersona.id,
    redirectedRelationships,
    rejectedRelationships,
    redirectedBiographyCount: biographyUpdated.count,
    redirectedMentionCount  : mentionUpdated.count
  };
}

// ===== mergePersonas 简化为 =====

async function mergePersonas(input: MergePersonasInput): Promise<MergePersonasResult> {
  if (input.sourceId === input.targetId) {
    throw new PersonaMergeInputError("源人物与目标人物不能相同");
  }

  return prismaClient.$transaction(async (tx) => {
    return mergePersonasInTransaction(tx, input);
  });
}
```

- [ ] **Step 2: 验证 typescript 编译**

```bash
pnpm type-check
```

---

### Task 2: `acceptMergeSuggestion` 复用核心函数

**Files:**
- Modify: `src/server/modules/roleWorkbench/mergeSuggestions.ts`

**What:** 将 `acceptMergeSuggestion` 中约 120 行内联合并逻辑替换为对 `mergePersonasInTransaction` 的一次调用。删除不再使用的 `normalizeAliases` 本地函数。

- [ ] **Step 1: 重构 `acceptMergeSuggestion`**

替换 `acceptMergeSuggestion` 函数体：

```typescript
// 文件顶部新增 import
import { mergePersonasInTransaction } from "@/server/modules/personas/mergePersonas";

// acceptMergeSuggestion 改为：
async function acceptMergeSuggestion(suggestionId: string): Promise<MergeSuggestionItem> {
  return prismaClient.$transaction(async (tx) => {
    const suggestion = await tx.mergeSuggestion.findUnique({
      where : { id: suggestionId },
      select: {
        id             : true,
        bookId         : true,
        sourcePersonaId: true,
        targetPersonaId: true,
        reason         : true,
        confidence     : true,
        evidenceRefs   : true,
        status         : true,
        createdAt      : true,
        resolvedAt     : true,
        book           : { select: { title: true } },
        sourcePersona  : {
          select: { id: true, name: true, aliases: true, deletedAt: true }
        },
        targetPersona  : {
          select: { id: true, name: true, aliases: true, deletedAt: true }
        }
      }
    });

    if (!suggestion) {
      throw new MergeSuggestionNotFoundError(suggestionId);
    }

    if (suggestion.status !== "PENDING") {
      throw new MergeSuggestionStateError(suggestion.id, suggestion.status);
    }

    if (suggestion.sourcePersona.deletedAt || suggestion.targetPersona.deletedAt) {
      throw new PersonaMergeConflictError(suggestion.id, "源人物或目标人物已被删除，无法执行合并");
    }

    // 调用权威合并核心
    await mergePersonasInTransaction(tx, {
      sourceId: suggestion.sourcePersonaId,
      targetId: suggestion.targetPersonaId
    });

    // 回写建议状态
    const now = new Date();
    const updatedSuggestion = await tx.mergeSuggestion.update({
      where: { id: suggestion.id },
      data : { status: "ACCEPTED", resolvedAt: now },
      select: {
        id             : true,
        bookId         : true,
        sourcePersonaId: true,
        targetPersonaId: true,
        reason         : true,
        confidence     : true,
        evidenceRefs   : true,
        status         : true,
        createdAt      : true,
        resolvedAt     : true,
        book           : { select: { title: true } },
        sourcePersona  : { select: { name: true } },
        targetPersona  : { select: { name: true } }
      }
    });

    return mapSuggestionRow(updatedSuggestion);
  });
}
```

- [ ] **Step 2: 删除 `normalizeAliases` 本地函数**

`normalizeAliases` 在 `mergeSuggestions.ts` 中仅被旧的 `acceptMergeSuggestion` 使用。重构后不再需要，删除该函数（约 15 行）。

- [ ] **Step 3: 验证 typescript 编译**

```bash
pnpm type-check
```

---

### Task 3: `listMergeSuggestions` 过滤僵尸建议

**Files:**
- Modify: `src/server/modules/roleWorkbench/mergeSuggestions.ts`

**What:** 在 `listMergeSuggestions` 的 where 条件中增加 `sourcePersona: { deletedAt: null }` 和 `targetPersona: { deletedAt: null }`。

- [ ] **Step 1: 添加 where 过滤条件**

在 `listMergeSuggestions` 函数的 `findMany` where 中增加两行：

```typescript
const suggestions = await prismaClient.mergeSuggestion.findMany({
  where: {
    ...(parsedFilter.bookId ? { bookId: parsedFilter.bookId } : {}),
    ...(parsedFilter.status ? { status: parsedFilter.status } : {}),
    sourcePersona: { deletedAt: null },
    targetPersona: { deletedAt: null }
  },
  // ... orderBy, select 不变
});
```

- [ ] **Step 2: 验证 typescript 编译**

```bash
pnpm type-check
```

---

### Task 4: 更新测试

**Files:**
- Modify: `src/server/modules/personas/mergePersonas.test.ts`
- Modify: `src/server/modules/roleWorkbench/mergeSuggestions.test.ts`

- [ ] **Step 1: mergePersonas.test.ts — 补 Profile mock + 新增 Profile 合并测试**

在每个测试的 mock tx 中增加 `profile` 模型:

```typescript
profile: {
  findMany: vi.fn().mockResolvedValue([]),
  update : vi.fn().mockResolvedValue({})
}
```

新增测试用例 "redirects source profile to target when target has no same-book profile":

```typescript
it("redirects source profile to target when target has no same-book profile", async () => {
  const profileUpdate = vi.fn().mockResolvedValue({});

  const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    persona: {
      findMany: vi.fn().mockResolvedValue([
        { id: "source-persona", name: "周进", aliases: [] },
        { id: "target-persona", name: "周学道", aliases: [] }
      ]),
      update: vi.fn().mockResolvedValue({})
    },
    biographyRecord           : { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    mention                   : { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    relationshipTypeDefinition: {
      findMany: vi.fn().mockResolvedValue([])
    },
    relationship: {
      findMany : vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update   : vi.fn().mockResolvedValue({})
    },
    profile: {
      findMany: vi.fn()
        .mockResolvedValueOnce([{ id: "prof-1", bookId: "book-1", personaId: "source-persona", localTags: [], ironyIndex: 5, localSummary: null, officialTitle: null, moralTier: null, firstAppearanceChapterId: null, visualConfig: null }])
        .mockResolvedValueOnce([]),
      update: profileUpdate
    }
  }));

  const service = createMergePersonasService({ $transaction: transaction } as never);
  await service.mergePersonas({ sourceId: "source-persona", targetId: "target-persona" });

  expect(profileUpdate).toHaveBeenCalledWith({
    where: { id: "prof-1" },
    data : { personaId: "target-persona" }
  });
});
```

- [ ] **Step 2: mergeSuggestions.test.ts — 更新 mock 结构**

"accepts suggestion and redirects records in one transaction" 测试的 mock tx 需要：
- 删除 `relationshipEvent: { updateMany: ... }`（模型已删除）
- 增加 `relationshipTypeDefinition: { findMany: vi.fn().mockResolvedValue([]) }`
- 增加 `profile: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}) }`
- `persona` 从 `update` 改为 `findMany` + `update`（核心函数用 findMany 而非直接用 update）

```typescript
it("accepts suggestion and redirects records in one transaction", async () => {
  const findFirst = vi.fn().mockResolvedValue(null);
  const relationshipUpdate = vi.fn().mockResolvedValue({});
  const biographyUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const mentionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const personaUpdate = vi.fn().mockResolvedValue({});
  const personaFindMany = vi.fn().mockResolvedValue([
    { id: "source-persona", name: "周进", aliases: ["周公"] },
    { id: "target-persona", name: "周学道", aliases: ["周大人"] }
  ]);
  const mergeSuggestionUpdate = vi.fn().mockResolvedValue(createSuggestionRow({
    id        : "s-accept",
    status    : "ACCEPTED",
    resolvedAt: new Date("2026-03-25T09:10:00.000Z")
  }));
  const mergeSuggestionFindUnique = vi.fn().mockResolvedValue({
    ...createSuggestionRow({
      id             : "s-accept",
      sourcePersonaId: "source-persona",
      targetPersonaId: "target-persona"
    }),
    sourcePersona: {
      id       : "source-persona",
      name     : "周进",
      aliases  : ["周公"],
      deletedAt: null
    },
    targetPersona: {
      id       : "target-persona",
      name     : "周学道",
      aliases  : ["周大人"],
      deletedAt: null
    }
  });
  const relationFindMany = vi.fn().mockResolvedValue([
    {
      id                  : "rel-self-loop",
      bookId              : "book-1",
      sourceId            : "source-persona",
      targetId            : "target-persona",
      relationshipTypeCode: "师生",
      recordSource        : "AI"
    },
    {
      id                  : "rel-update",
      bookId              : "book-1",
      sourceId            : "source-persona",
      targetId            : "other-persona",
      relationshipTypeCode: "同僚",
      recordSource        : "AI"
    }
  ]);
  const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    mergeSuggestion: {
      findUnique: mergeSuggestionFindUnique,
      update    : mergeSuggestionUpdate
    },
    persona: {
      findMany: personaFindMany,
      update  : personaUpdate
    },
    biographyRecord: { updateMany: biographyUpdateMany },
    mention        : { updateMany: mentionUpdateMany },
    relationshipTypeDefinition: {
      findMany: vi.fn().mockResolvedValue([])
    },
    relationship: {
      findMany : relationFindMany,
      findFirst,
      update   : relationshipUpdate
    },
    profile: {
      findMany: vi.fn().mockResolvedValue([]),
      update  : vi.fn().mockResolvedValue({})
    }
  }));
  const service = createMergeSuggestionsService({ $transaction: transaction } as never);

  const result = await service.acceptMergeSuggestion("s-accept");

  expect(result.status).toBe("ACCEPTED");
  expect(biographyUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: { personaId: "target-persona" }
  }));
  expect(mentionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: { personaId: "target-persona" }
  }));
  expect(relationshipUpdate).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "rel-self-loop" },
    data : expect.objectContaining({ status: ProcessingStatus.REJECTED })
  }));
  expect(personaUpdate).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "target-persona" },
    data : expect.objectContaining({ aliases: ["周大人", "周公", "周进"] })
  }));
  expect(mergeSuggestionUpdate).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "s-accept" },
    data : expect.objectContaining({ status: "ACCEPTED" })
  }));
});
```

- [ ] **Step 3: 运行全部测试**

```bash
pnpm test src/server/modules/personas/mergePersonas.test.ts
pnpm test src/server/modules/roleWorkbench/mergeSuggestions.test.ts
```

预期：全部通过。

- [ ] **Step 4: 运行 lint + type-check**

```bash
pnpm lint
pnpm type-check
```

- [ ] **Step 5: 运行全量测试确保无回归**

```bash
pnpm test
```

---
