# Wave2: 后分析实体合并器

> **收敛修订 2026-04-13**: 根据 D3 决策修订。仅 conf=1.0 自动合并，其余全部 PENDING 人工确认。

## Goal

在全书解析完成后，新增一个 PostAnalysisMerger 步骤，对产出的 Persona 做跨章节实体合并。**严格执行 D3: 仅 Tier 1（conf=1.0，精确名称匹配）自动合并，其余全部写入 merge_suggestions 表 status=PENDING，等待人工确认。不允许扩大自动合并范围。**

## 前置文档

- `docs/角色解析准确率审计报告-儒林3.md` — 5.3 节（29 个碎片家族，140+ fragment profiles）
- `docs/Sequential-准确率提升整体优化方案.md` — 3.2 节

## 验收标准

- [ ] 新建 `src/server/modules/analysis/services/PostAnalysisMerger.ts`
- [ ] 合并器至少覆盖 tier 1-3（精确匹配、KB 驱动、别名交叉），tier 4-5 可标记 TODO
- [ ] **D3 严格执行**: 仅 Tier 1（conf=1.0）→ status=AUTO_MERGED，其余 → status=PENDING
- [ ] 合并结果写入 merge_suggestions 表，每条记录包含 sourceId、targetId、strategy、confidence、status
- [ ] 实际执行后 merge_suggestions ≥ 30 条（使用儒林-3 数据验证）
- [ ] SequentialPipeline 在 chapter loop 完成后调用 PostAnalysisMerger
- [ ] 已有测试全通过

## R1: PostAnalysisMerger 核心逻辑

新建文件 `src/server/modules/analysis/services/PostAnalysisMerger.ts`:

```typescript
export class PostAnalysisMerger {
  async merge(bookId: string): Promise<MergeResult> {
    const personas = await this.loadAllPersonas(bookId);
    const suggestions: MergeSuggestion[] = [];

    // Tier 1: 精确名称匹配 — name 完全相同的不同 persona
    suggestions.push(...this.exactNameMatch(personas));

    // Tier 2: KB 驱动合并 — 知识库中已知的别名/本名对
    suggestions.push(...await this.kbDrivenMerge(personas, bookId));

    // Tier 3: 别名交叉 — persona A 的某 alias 与 persona B 的 name 匹配
    suggestions.push(...this.aliasCrossMerge(personas));

    // Tier 4: 共现分析 — 从未在同一 chunk 出现的同名 persona（TODO）
    // Tier 5: 碎片清理 — 单一 mention 的低置信度 persona（TODO）

    await this.writeSuggestions(bookId, suggestions);
    return { totalSuggestions: suggestions.length, byTier: ... };
  }
}
```

## R2: Tier 1 精确名称匹配

```typescript
exactNameMatch(personas: Persona[]): MergeSuggestion[] {
  // GROUP BY name → 每组保留 mentionCount 最高的作为 target
  // 其余均为 source
  // confidence = 1.0, strategy = 'EXACT_NAME'
  // **D3: status = 'AUTO_MERGED' — 唯一允许自动合并的层级**
}
```

**审计数据支撑**: 儒林-3 中有 4 组完全重复（匡超人 ×2、范进 ×2、杜少卿 ×2、牛布衣 ×2）。

## R3: Tier 2 KB 驱动合并

使用 `loadFullRuntimeKnowledge()` (来自 wave2-kb-schema-extend 任务) 或回退到 `buildAliasLookupFromDb()`:

```typescript
async kbDrivenMerge(personas: Persona[], bookId: string): Promise<MergeSuggestion[]> {
  const aliasLookup = await buildAliasLookupFromDb(bookId);
  // 对每个 persona.name，查 aliasLookup 是否有映射到另一 persona
  // confidence = 0.9, strategy = 'KB_ALIAS'
  // **D3: status = 'PENDING' — 必须人工确认**
}
```

## R4: Tier 3 别名交叉合并

```typescript
aliasCrossMerge(personas: Persona[]): MergeSuggestion[] {
  // 利用 alias_mappings / persona 的已知 aliases
  // 如果 persona A 的 alias X === persona B 的 name → merge B into A
  // confidence = 0.85, strategy = 'ALIAS_CROSS'
  // **D3: status = 'PENDING' — 必须人工确认**
}
```

## R5: 集成到 SequentialPipeline

在 `src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts` 中:

```typescript
// runSequentialChapterLoop() 完成后:
const merger = new PostAnalysisMerger(this.prisma, this.logger);
const mergeResult = merger.merge(bookId);
this.logger.info(`PostAnalysisMerger: ${mergeResult.totalSuggestions} suggestions`);
```

## R6: MergeSuggestion 数据模型

使用现有 `merge_suggestions` 表（已存在于 Prisma schema）:

| 字段 | 类型 | 说明 |
|------|------|------|
| sourcePersonaId | String | 被合并方 |
| targetPersonaId | String | 保留方 |
| strategy | String | EXACT_NAME / KB_ALIAS / ALIAS_CROSS |
| confidence | Float | 0-1 |
| status | String | **AUTO_MERGED**（仅 conf=1.0 精确匹配 D3）/ **PENDING**（其余全部）/ APPROVED / REJECTED |
| bookId | String | 所属书籍 |

## 关键文件

- `src/server/modules/analysis/services/PostAnalysisMerger.ts`（新建）
- `src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts`
- `src/server/modules/analysis/services/AliasRegistryService.ts`
- `prisma/schema.prisma` — MergeSuggestion model
