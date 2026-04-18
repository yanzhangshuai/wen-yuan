# feat: 跨地点并发检测（REV-2 · §0-3(b) 升级包）

## Goal
Stage 0 预处理器增加地点标记词识别，维护 `persona.currentLocation` 时序字段；Stage B.5 升级支持"同一 persona 同章节出现在两个互斥地点"→ 触发 IMPERSONATION_CANDIDATE。这是牛浦冒名检测的第二个强信号。

## 契约
- §0-3(b) REV-2：跨地点冲突检查；独立任务不阻塞 T13 首版

## 前置依赖
- T12 chapter-preprocessor-stage-0（在其基础上扩展 location extractor）
- T13 stage-b5-temporal-consistency（作为 B.5 升级的目标模块）

## Requirements

### 1. 地点标记词识别
- 新建 `src/server/modules/analysis/preprocessor/locationMarkers.ts`
- 标记词正则：`往\|到\|去\|赴\|抵\|至\|进\|出\|住在\|寓于\|过\|经\|从.*出发`
- 配合地点名词识别（中国古典小说常见：扬州 / 杭州 / 苏州 / 南京 / 京师 / 甘露庵 / 秦淮河 …）
- 组合模式：`(人名?)(去|到|往|抵) + (地名)` → 产出 `LocationEvent {personaSurfaceForm, location, chapterNo, spanStart, spanEnd}`

### 2. `persona.currentLocation` 维护
- Stage C 结束后，按章节时序扫所有 `LocationEvent`，以"最后一次已知地点"作为该 persona 在**下一章起**的 currentLocation
- 写入 `persona.currentLocation`（最新值）+ 可选历史表 `persona_location_history`

### 3. Stage B.5 升级
- 解除 `TEMPORAL_CHECK_LOCATION` flag
- 同章节检测：一个 persona 有两个 mention，分别关联不同 location（基于前/后文地点切换），且间距 < N 段落 → 视为矛盾，生成 IMPERSONATION_CANDIDATE

### 4. 互斥地点定义
- 维护一个小型 `locationExclusivityGraph`（JSON 配置）：
  - 明确互斥：扬州 ↔ 杭州 / 南京 ↔ 北京
  - 可疑（同城但不同场所）：秦淮河 ↔ 甘露庵 → 软提示（confidence 降低）
- 允许后续扩展

## TDD 测试清单

- [ ] 单元：`牛布衣往扬州去` + 同章节后文"牛布衣在甘露庵" → 触发 IMPERSONATION_CANDIDATE
- [ ] 单元：同章节内合理移动（扬州→苏州，间隔 30 段落）→ **不**触发
- [ ] 单元：未知地点 → 不触发
- [ ] 集成：儒林外史 20-22 回 → 至少发现 1 条跨地点 IMPERSONATION_CANDIDATE

## Definition of Done

- [ ] 测试绿；locationExclusivityGraph 至少 10 条配置
- [ ] T13 Stage B.5 flag `TEMPORAL_CHECK_LOCATION=true` 合入后全测试通过
- [ ] 儒林外史跑完 dump 跨地点候选到 `.trellis/workspace/reports/cross-location-rulin.md`
