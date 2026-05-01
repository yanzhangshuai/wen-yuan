# 子任务 C：人物合并与重跑解析的关系一致性保障

> **父任务**：[04-30-character-relation-entry-design](../04-30-character-relation-entry-design/prd.md)
> **依赖**：子任务 A（schema 必须就位）
> **可与子任务 B、D 并行**
> **验收点映射**：父 §7.12、§7.13

---

## 1. 目标

1. 重写 [mergePersonas.ts](../../../src/server/modules/personas/mergePersonas.ts) 的关系迁移逻辑：
   - 适配新 schema（`bookId + relationshipTypeCode` 唯一键，无 `chapterId/type`）；
   - SYMMETRIC 关系类型在合并后 re-canonicalize（swap source/target）保持「小者当 source」不变量；
   - 唯一键冲突按 `recordSource` 单调升级合并：保留更高级别行，软删低级别行；
   - 同事务迁移 `RelationshipEvent`（`sourceId/targetId/relationshipId` 重定向）。
2. 升级 [startBookAnalysis.ts](../../../src/server/modules/books/startBookAnalysis.ts) 的 re-analyze 入口：在启动新一轮 AI 解析前，**同事务**清空该书全部 `recordSource = DRAFT_AI` 的 Relationship 与 RelationshipEvent。

---

## 2. mergePersonas 改造

### 2.1 输入 / 输出（不变）

```ts
interface MergePersonasInput  { targetId: string; sourceId: string }    // sourceId 为被合并方
interface MergePersonasResult {
  sourceId                : string;
  targetId                : string;
  redirectedRelationships : number;
  rejectedRelationships   : number;
  redirectedRelationshipEvents: number;     // 新增
  redirectedBiographyCount: number;
  redirectedMentionCount  : number;
}
```

### 2.2 关系迁移核心算法（事务内）

```pseudo
loserId  = input.sourceId
winnerId = input.targetId

// Step 1: 加载 SYMMETRIC 类型集合（用于判断是否需要 swap）
symmetricTypes = SET of code WHERE directionMode='SYMMETRIC' AND status='ACTIVE'

// Step 2: 拉取 loser 涉及的全部 active 关系
loserRelations = SELECT * FROM relationships
  WHERE deleted_at IS NULL AND (source_id = loserId OR target_id = loserId)

// Step 3: 重定向 + canonicalize + 冲突合并
FOR each rel in loserRelations:
  newSource = rel.source_id == loserId ? winnerId : rel.source_id
  newTarget = rel.target_id == loserId ? winnerId : rel.target_id

  IF newSource == newTarget:
    // 自环 → 软删 + REJECTED
    UPDATE relationships SET deleted_at=NOW(), status='REJECTED' WHERE id=rel.id
    UPDATE relationship_events SET deleted_at=NOW() WHERE relationship_id=rel.id AND deleted_at IS NULL
    rejectedRelationships += 1
    CONTINUE

  IF rel.relationship_type_code IN symmetricTypes AND newSource > newTarget:
    SWAP newSource, newTarget

  // Step 4: 检测唯一键冲突
  conflict = SELECT * FROM relationships
    WHERE book_id=rel.book_id AND source_id=newSource AND target_id=newTarget
      AND relationship_type_code=rel.relationship_type_code
      AND id != rel.id AND deleted_at IS NULL

  IF NOT conflict:
    // 直接重定向
    UPDATE relationships SET source_id=newSource, target_id=newTarget WHERE id=rel.id
    // 同步迁移事件冗余字段
    UPDATE relationship_events SET source_id=newSource, target_id=newTarget
      WHERE relationship_id=rel.id AND deleted_at IS NULL
    redirectedRelationships += 1
  ELSE:
    // 唯一键冲突 → recordSource 单调升级合并
    winner_rel = MAX(rel, conflict) BY recordSource priority(MANUAL > AI > DRAFT_AI)
    loser_rel  = THE OTHER

    // 把 loser_rel 的事件全部迁移到 winner_rel
    UPDATE relationship_events SET relationship_id=winner_rel.id, source_id=newSource, target_id=newTarget
      WHERE relationship_id=loser_rel.id AND deleted_at IS NULL

    // 软删 loser_rel
    UPDATE relationships SET deleted_at=NOW(), status='REJECTED' WHERE id=loser_rel.id
    rejectedRelationships += 1

// Step 5: 迁移事件中冗余 source_id / target_id 仍为 loserId 的（防漏，理论上 Step 3/4 已覆盖）
UPDATE relationship_events SET source_id=winnerId WHERE source_id=loserId AND deleted_at IS NULL
UPDATE relationship_events SET target_id=winnerId WHERE target_id=loserId AND deleted_at IS NULL
redirectedRelationshipEvents = (累计计数)

// Step 6: 同原逻辑迁移 mention / biography / 合并 aliases / 软删 loser persona
```

### 2.3 `recordSource` 优先级函数

```ts
const SOURCE_RANK = { DRAFT_AI: 1, AI: 2, MANUAL: 3 } as const;
function pickHigher<T extends { recordSource: RecordSource }>(a: T, b: T): T {
  return SOURCE_RANK[a.recordSource] >= SOURCE_RANK[b.recordSource] ? a : b;
}
```

如两条 `recordSource` 相同：保留 `id` 字典序较小者（确定性）。

### 2.4 status 处理

合并后保留 winner_rel 的 `status` 不动（不强制升级 / 降级）；事件 `status` 保持原样。

---

## 3. startBookAnalysis re-analyze 清场

### 3.1 入口

[src/server/modules/books/startBookAnalysis.ts](../../../src/server/modules/books/startBookAnalysis.ts) `startBookAnalysis(bookId, options?)`。

### 3.2 在创建 AnalysisJob **之前**、同一事务内追加：

```ts
// 仅当本次为「全量重跑」（非增量章节追加）时执行清场
// options.scope 已存在，需要根据具体语义判断；如全书重跑则清场
if (isFullReanalysis(options)) {
  await tx.relationshipEvent.deleteMany({
    where: {
      bookId,
      recordSource: RecordSource.DRAFT_AI
    }
  });
  await tx.relationship.deleteMany({
    where: {
      bookId,
      recordSource: RecordSource.DRAFT_AI
    }
  });
}
```

> **关键约束**：
> - **HARD DELETE** 而非软删（节省后续 upsert 唯一键冲突处理；DRAFT_AI 是「未审稿」，无审计价值）。
> - 仅删 `DRAFT_AI`：`AI`（已审通过的 AI 行）/ `MANUAL`（人工录入）/ 已软删行全部保留。
> - 同事务执行：失败回滚不会留半截清场。

### 3.3 「全量重跑」识别规则

参考 `startBookAnalysis` 现有 `options.scope` / `options.chapterIds` 字段：
- 未指定章节范围 → 全量重跑 → 执行清场。
- 指定 `chapterIds` 子集 → 增量追加 → **不清场**（保留其它章节已 review 的事件）。

> 如现有 `options` 形态不支持上述判定，需在 service 层加 `options.fullReanalysis: boolean`，默认 false。

---

## 4. 单元测试

### 4.1 [mergePersonas.test.ts](../../../src/server/modules/personas/mergePersonas.test.ts) 必须新增

| # | 用例 |
| ---- | ---- |
| 1 | 普通迁移：loser→winner，无冲突，事件冗余字段同步更新 |
| 2 | 自环：合并后 source==target → 关系与事件全部软删 |
| 3 | SYMMETRIC re-canonicalize：合并后 newSource > newTarget 时自动 swap |
| 4 | 唯一键冲突 + winner 是 MANUAL：保留 MANUAL，软删 loser_rel；事件全部迁移到 MANUAL |
| 5 | 唯一键冲突 + 双方都是 DRAFT_AI：按 id 字典序保留较小者 |
| 6 | 冲突合并后事件 `source_id/target_id` 同步更新到 canonical 顺序 |
| 7 | mention/biography 迁移仍工作 |
| 8 | source/target 相同 → `PersonaMergeInputError` |

### 4.2 [startBookAnalysis.test.ts](../../../src/server/modules/books/startBookAnalysis.test.ts) 必须新增

| # | 用例 |
| ---- | ---- |
| 1 | 全量重跑：调用前 DB 有 5 条 DRAFT_AI Relationship + 10 条 DRAFT_AI Event + 2 条 AI + 1 条 MANUAL → 调用后只剩 2 AI + 1 MANUAL |
| 2 | 增量章节追加：传 `chapterIds: [...]` → DRAFT_AI 不被清场 |
| 3 | 清场失败回滚：mock `deleteMany` 抛错 → 整个事务回滚，AnalysisJob 未创建 |

行覆盖率 ≥ 95%。

---

## 5. 验收清单

- [ ] `pnpm test src/server/modules/personas/mergePersonas.test.ts` 全绿。
- [ ] `pnpm test src/server/modules/books/startBookAnalysis.test.ts` 全绿。
- [ ] 端到端：DB 准备一个 loser 与 winner，loser 有 2 条不同 typeCode 关系（含 1 SYMMETRIC + 1 DIRECTED）+ 5 条事件 → 调用 mergePersonas → 关系/事件全部迁到 winner，唯一键无冲突，前端再调聚合 API 能正确展示。
- [ ] 端到端：手动跑全量重跑 → DRAFT_AI 清空，再次 AI 解析后填充新 DRAFT_AI；`recordSource=AI` 与 `MANUAL` 的旧数据保留。
- [ ] 父 §7.12（合并后唯一键不变量）+ §7.13（re-analyze 清场仅清 DRAFT_AI）人工抽样验证通过。

---

## 6. 风险与回退

- **批量更新 N+1**：`loserRelations` 列表逐条 `findFirst` 检测冲突；如关系数 > 100 可改成一次 `findMany` 全量加载冲突候选。MVP 接受 N+1，加测「100 关系合并耗时 < 5s」基线。
- **swap 后下游展示混乱**：前端 Pair 抽屉按 canonical 顺序读，无影响；图谱按 source/target 渲染同样无影响。
- **回退**：mergePersonas 失败抛错回滚整个事务；不存在「半 swap」状态。
