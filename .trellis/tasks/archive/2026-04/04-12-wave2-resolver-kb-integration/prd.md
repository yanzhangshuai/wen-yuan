# Wave2: PersonaResolver 知识库集成

> **收敛修订 2026-04-13**: 根据 D2/D12/D13 决策修订。runtimeKnowledge 为唯一数据源；任务启动强制刷新一次，任务内不热更新。

## Goal

将知识库运行时数据注入 PersonaResolver，使 resolver 在候选加载、评分、仲裁阶段能利用 KB 中的别名映射和角色特征信息。**runtimeKnowledge 为唯一数据源（D2），任务启动时强制刷新一次加载（D12），不做任务内热更新。**

## 前置文档

- `docs/Sequential-准确率提升整体优化方案.md` — 3.3 节
- `docs/全局知识库服务化重构设计.md` — 6 节

## 依赖

- `04-12-wave2-kb-schema-extend` — `loadFullRuntimeKnowledge()` 接口
- `04-12-wave2-alias-mapping-fix` — alias_mappings 表有数据

## 验收标准

- [ ] PersonaResolver.resolve() 接受可选 `runtimeKnowledge` 参数
- [ ] 当 KB 中有 alias→persona 映射且匹配当前 surfaceForm 时，跳过模糊匹配直接返回
- [ ] 当 KB 中有角色特征（genre/朝代/性别）时，作为额外信号加权
- [ ] SequentialPipeline 在启动时加载 runtimeKnowledge 并传入 resolver
- [ ] 已有测试全通过

## R1: PersonaResolver 接口扩展

文件: `src/server/modules/analysis/services/PersonaResolver.ts`

在 `ResolveInput` 类型中添加:
```typescript
interface ResolveInput {
  // ...existing fields
  runtimeKnowledge?: FullRuntimeKnowledge;
}
```

## R2: 候选加载阶段 — alias 快速命中

在 `loadCandidates()` 方法中，优先检查 KB alias lookup:

```typescript
// 在 DB 查询之前先查 alias lookup
if (input.runtimeKnowledge?.aliasLookup) {
  const mapped = input.runtimeKnowledge.aliasLookup.get(surfaceForm);
  if (mapped) {
    // 直接返回 mapped persona 作为 top candidate
    // confidence = max(mapped.confidence, 0.85)
    return [{ personaId: mapped.personaId, confidence: mapped.confidence, source: 'KB_ALIAS' }];
  }
}
// 无 KB 命中 → 走原有 DB 查询 + 模糊匹配路径
```

## R3: 评分加权 — KB 信号增强

在 `computeScore()` 方法中，为 KB 匹配的候选添加加分:

```typescript
// 如果候选来源于 KB_ALIAS → 加 0.15 分
if (candidate.source === 'KB_ALIAS') {
  score += 0.15;
}
// 如果 KB 中角色有 gender 且当前 mention 有 gender hint → 匹配时加 0.1
if (kbPersona.gender && mentionGenderHint && kbPersona.gender === mentionGenderHint) {
  score += 0.1;
}
```

## R4: roster suggestedRealName 透传

当 Phase 1 roster 返回 `suggestedRealName` 时，将其作为 resolver hint:

文件: `src/server/modules/analysis/services/ChapterAnalysisService.ts`

```typescript
// mergeRosterIntoPersonas() 或 resolveChunkMentions() 中:
if (rosterEntry.suggestedRealName) {
  resolveInput.hint = rosterEntry.suggestedRealName;
  // PersonaResolver 优先使用 hint 作为候选查询关键词
}
```

## R5: SequentialPipeline 集成

文件: `src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts`

```typescript
// 在 runSequentialChapterLoop() 开始处:
// D12: 强制刷新 — 清除旧缓存再加载
knowledgeCache.delete(bookId);
const runtimeKnowledge = await loadFullRuntimeKnowledge(bookId, bookTypeKey, prisma);
// 传入每次 chapter 分析:
const chapterResult = await chapterService.analyzeChapter({
  ...chapterInput,
  runtimeKnowledge,
});
// 注意: 任务执行过程中不再重新加载（D12）
```

## 关键文件

- `src/server/modules/analysis/services/PersonaResolver.ts`
- `src/server/modules/analysis/services/ChapterAnalysisService.ts`
- `src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts`
- `src/server/modules/analysis/config/pipeline.ts`
