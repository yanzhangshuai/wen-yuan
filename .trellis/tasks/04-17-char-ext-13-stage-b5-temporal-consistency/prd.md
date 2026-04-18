# feat: Stage B.5 时序一致性检查器

## Goal
在 Stage B（全书实体仲裁）之前插入一道确定性规则检查，抓两类 IMPERSONATION 证据：**死后仍行动** 和 **同章节跨地点并发**（后者依赖 T17 先完成）。发现即生成 `merge_suggestions(kind=IMPERSONATION_CANDIDATE, status=PENDING)`。

## 契约
- §0-3（双检）§0-14（反馈通道 · 不回环）

## 前置依赖
- T03 stage-a-extractor（需要 mention 表已填）
- T12 chapter-preprocessor-stage-0（提供 deathChapterNo 双源之一）
- T17 cross-location-extraction（升级 (b) 检查时依赖；首版可先只做 (a)，后续再接入）

## Requirements

### 1. 模块结构
- 新建 `src/server/modules/analysis/pipelines/threestage/TemporalConsistencyChecker.ts`
- 运行时机：Stage A 完成后、Stage B 之前

### 2. 检查 (a) · 死后行动（首版实现）
```
for each mention m in book:
  if m.persona.deathChapterNo is set AND m.chapterNo > m.persona.deathChapterNo:
    => 写 MergeSuggestion {
         kind: 'IMPERSONATION_CANDIDATE',
         source: 'STAGE_B5_TEMPORAL',
         status: 'PENDING',
         evidence: {
           deathChapterNo,
           postMortemChapterNo: m.chapterNo,
           rawSpan: m.rawSpan
         }
       }
```

- 不阻塞 Stage B 继续跑；只是挂起一条待审建议

### 3. 检查 (b) · 同章节跨地点并发（T17 完成后启用）
- 依赖 `persona.currentLocation` 按章节时序追踪
- 同一 persona 在单章内同时出现在两个**互斥地点** → 触发 IMPERSONATION_CANDIDATE
- 在 T17 完成前，此检查走 feature flag `TEMPORAL_CHECK_LOCATION=false` 关闭

### 4. §0-14 反馈通道
- **只写 merge_suggestions**，不触发 Stage B 重跑
- Stage B 在下次 job 启动时从 PENDING 队列消费（批次性处理）

## TDD 测试清单

- [ ] 单元：牛布衣 deathChapterNo=20 + 第 22 回"牛布衣"署名卖诗 → 生成 1 条 IMPERSONATION_CANDIDATE
- [ ] 单元：未设置 deathChapterNo 的 persona → 不触发
- [ ] 单元：章节等于 deathChapterNo 的 mention → **不**触发（death 当章的尾声行动合理）
- [ ] 集成：儒林外史全跑 → 至少发现牛浦冒名 3+ 处

## Definition of Done

- [ ] 测试绿；`pnpm type-check` / `pnpm lint` 干净
- [ ] 对儒林外史产出 IMPERSONATION_CANDIDATE 列表 dump 到 `.trellis/workspace/reports/temporal-check-rulin.md`
- [ ] T17 完成后一周内补齐 (b) 用例
