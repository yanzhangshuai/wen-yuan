# Wave2: AliasMapping 写入管线修复

> **收敛修订 2026-04-13**: 根据 D1/D13 决策补充冒名场景（IMPERSONATION source）和历史人物书内称谓（HISTORICAL_TITLE source）。

## Goal

诊断并修复 AliasMapping 写入管线，使 Phase 1 roster 发现的别名关系自动注册到 alias_mappings 表，启用 PersonaResolver 的 alias 快速命中路径。**新增支持冒名场景（D1: 牛浦郎冒充牛布衣）和历史人物书内称谓（D13: 朱元璋=吴王）。**

## 前置文档

- `docs/角色解析准确率审计报告-儒林3.md` — 5.5 节 R5
- `docs/Sequential-准确率提升整体优化方案.md` — 3.1 节

## 验收标准

- [ ] 重新解析儒林-3 后，alias_mappings 表 ≥ 50 条记录
- [ ] PersonaResolver 通过 AliasMapping 命中的次数 ≥ 后续章节称谓匹配的 20%
- [ ] AliasRegistryService.registerAlias() 调用路径有效
- [ ] 已有测试全通过

## R1: 诊断 AliasMapping 未写入原因

**排查文件**:
- `src/server/modules/analysis/services/AliasRegistryService.ts` — `registerAlias()` 方法
- `src/server/modules/analysis/services/ChapterAnalysisService.ts` — 调用 `registerAlias` 的位置
- `src/server/modules/analysis/config/pipeline.ts` — `aliasRegistryMinConfidence: 0.75`

**预期原因**:
1. Phase 1 roster 返回的 `aliasConfidence` 低于 0.75 → 注册条件不满足
2. Phase 2 chunk 分析后 `registerAlias` 未被调用
3. 调用路径存在但被条件跳过

## R2: 修复方案

根据诊断结果，可能的修复:

### 方案 A: 降低注册阈值
将 `aliasRegistryMinConfidence` 从 0.75 降到 0.5，允许更多候选注册。

### 方案 B: Phase 1 roster 结果自动注册
在 roster 合并后，对每个 `aliasType != null && suggestedRealName != null` 的条目，调用:
```typescript
await aliasRegistryService.registerAlias({
  bookId,
  alias: entry.surfaceForm,
  personaId: resolvedPersonaId,
  confidence: entry.aliasConfidence ?? 0.6,
  source: "ROSTER_DISCOVERY"
});
```

### 方案 C: Phase 2 chunk 结果注册
对每个成功 resolve 到已有 persona 的 mention，若 `extractedName !== persona.name`，注册:
```typescript
await aliasRegistryService.registerAlias({
  bookId,
  alias: extractedName,
  personaId: persona.id,
  confidence: resolveResult.confidence,
  source: "CHUNK_ANALYSIS"
});
```

**推荐**: B + C 同时实施，A 酌情调整。

## R3: 去重与冲突处理

AliasMapping 注册时需处理:
- 同一 alias 被多个 persona 抢注 → 保留 confidence 最高的，其余标记 CONFLICTED
- 同一 persona 的同一 alias 多次注册 → upsert，取最高 confidence

## R4: 冒名/历史人物场景（D1/D13 新增）

新增 AliasMapping source 类型:
- `IMPERSONATION` — 冒名场景（如牛浦郎冒充牛布衣: `AliasMapping(牛浦郎, "牛布衣", source=IMPERSONATION, chapters=[26-34])`）
- `HISTORICAL_TITLE` — 历史人物书内称谓（如朱元璋: `AliasMapping(朱元璋, "吴王", source=HISTORICAL_TITLE, chapters=[1])`）
- `BOOK_TITLE` — 书内阶段性称谓

注册逻辑:
```typescript
// 冒名场景: 由知识库或人工标注触发
await aliasRegistryService.registerAlias({
  bookId,
  alias: impersonatedName,    // "牛布衣"
  personaId: realPersonaId,   // 牛浦郎的 ID
  confidence: 0.95,
  source: "IMPERSONATION",
  chapters: [26, 27, 28, ...34],
});
```

## 关键文件

- `src/server/modules/analysis/services/AliasRegistryService.ts`
- `src/server/modules/analysis/services/ChapterAnalysisService.ts`
- `src/server/modules/analysis/config/pipeline.ts`
