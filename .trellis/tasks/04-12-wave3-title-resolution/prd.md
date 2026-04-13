# Wave3: 称谓动态解析与灰区仲裁

> **收敛修订 2026-04-13**: 根据 D7 决策修订。本任务所有能力标记为"**修复后开启**"，不在修复完成前全量启用。需先完成 AliasMapping 管线修复 + KB 集成 + 评估管线验证无退化后再开启。

## Goal

开启 `dynamicTitleResolutionEnabled` 和 `llmTitleArbitrationEnabled` 配置项，使 PersonaResolver 能处理"称谓+姓名"的复合识别和灰区仲裁。**D7 已确认: 修复后开启，须满足前置条件。**

## 前置文档

- `docs/Sequential-准确率提升整体优化方案.md` — Wave 3 第 1 节
- `docs/角色解析准确率审计报告-儒林3.md` — 5.7 节

## 依赖

- `04-12-wave2-alias-mapping-fix` — alias_mappings 需有数据，否则称谓解析无目标候选
- `04-12-wave2-resolver-kb-integration` — runtimeKnowledge 可提供称谓→真名映射

## 验收标准

- [ ] `ANALYSIS_PIPELINE_CONFIG.dynamicTitleResolutionEnabled` 改为 `true` **（D7: 修复后开启，须先验证前置条件）**
- [ ] `ANALYSIS_PIPELINE_CONFIG.llmTitleArbitrationEnabled` 改为 `true` **（D7: 修复后开启，须先验证前置条件）**
- [ ] PersonaResolver 对 0.4-0.6 置信度候选发起 LLM 仲裁（调用已有代码路径）
- [ ] 称谓解析正确处理"称谓+姓名"型 surfaceForm（如"杜老爷"→解析为"杜"+"老爷"→匹配姓"杜"的 persona）
- [ ] LLM 仲裁调用有频率限制（每本书最多 N 次）
- [ ] 已有测试全通过

## R1: 开启配置（D7: 修复后开启）

文件: `src/server/modules/analysis/config/pipeline.ts`

> **D7 已确认**: 以下配置项在修复完成、评估管线验证无退化后才改为 true。前置条件:
> 1. AliasMapping 管线修复完成（alias_mappings 表有数据）
> 2. PersonaResolver KB 集成完成（runtimeKnowledge 可提供称谓→真名映射）
> 3. 评估管线 `pnpm eval:gate` 通过当前阈值

```typescript
export const ANALYSIS_PIPELINE_CONFIG = {
  // ...
  dynamicTitleResolutionEnabled: true,   // 原值 false → D7: 修复后改为 true
  llmTitleArbitrationEnabled: true,       // 原值 false → D7: 修复后改为 true
  // 新增:
  llmArbitrationMaxCalls: 100,           // 每本书上限
  llmArbitrationGrayZone: [0.4, 0.6],   // 灰区范围
};
```

## R2: 验证现有称谓解析代码路径

排查以下文件中 `dynamicTitleResolutionEnabled` 的使用:

- `src/server/modules/analysis/services/PersonaResolver.ts` — 搜索该配置项的 `if` 分支
- `src/server/modules/analysis/services/ChapterAnalysisService.ts` — 是否有称谓拆分逻辑
- `src/server/modules/analysis/config/lexicon.ts` — `titleStems`, `positionStems` 列表

确认: 
1. 代码路径存在但被 `if (!config.dynamicTitleResolutionEnabled) return` 跳过 → 翻转即可
2. 代码路径不存在 → 需要补实现（按 R3 处理）

## R3: 称谓拆分增强（如果 R2 发现路径不完整）

PersonaResolver 需能将 surfaceForm 拆分:
```typescript
function splitTitleAndName(surfaceForm: string, genericTitles: string[]): {
  title: string | null;  // "老爷", "先生", "太太"
  surname: string | null; // "杜", "秦", "王"
  residual: string | null; // 剩余部分
}
```

拆分后：
1. 先查 alias_mappings 中有没有 surfaceForm 的精确映射
2. 没有则用 surname + 已有 persona name 做前缀匹配
3. 最佳候选置信度在灰区 → 触发 LLM 仲裁

## R4: LLM 灰区仲裁

验证 `llmTitleArbitrationEnabled` 关联的代码:
- 灰区定义: confidence ∈ [0.4, 0.6]
- 当候选处于灰区时，构造 prompt 让 LLM 判断"X 是否指 Y？"
- 需要: 上下文片段（mention 所在句子前后 2 句）、候选 persona 名称列表
- 返回: 确认 persona_id 或 "无法确定"

频率限制:
```typescript
if (this.arbitrationCount >= config.llmArbitrationMaxCalls) {
  logger.warn('LLM arbitration limit reached, skipping');
  return originalResult;
}
this.arbitrationCount++;
```

## R5: 测试要点

- 称谓拆分: "杜老爷" → { title: "老爷", surname: "杜" }
- 灰区仲裁: mock LLM response, 验证 confidence 被提升到 ≥ 0.7
- 频率限制: 超过 maxCalls 后不再调用 LLM

## 关键文件

- `src/server/modules/analysis/config/pipeline.ts`
- `src/server/modules/analysis/services/PersonaResolver.ts`
- `src/server/modules/analysis/services/ChapterAnalysisService.ts`
- `src/server/modules/analysis/config/lexicon.ts`
