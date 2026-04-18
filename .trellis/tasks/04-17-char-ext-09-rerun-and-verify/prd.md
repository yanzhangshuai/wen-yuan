# feat: 清库重跑与验收报告

## Goal

对真实书籍 `book_id=7d822600-9107-4711-95b5-e87b3e768125`（儒林外史）执行：清空分析结果 → 重跑 threestage → 产出验收报告。所有指标达标方可合并 umbrella 任务。

## Requirements

### 1. 清库
- `tsx scripts/purge-book-analysis.ts --book-id=7d822600-9107-4711-95b5-e87b3e768125`
- 记录 before 计数（persona=646，biography=N，alias=0 等）

### 2. 重跑
- 通过 Admin 页面 / API 发起 threestage 架构分析
- 使用推荐的 LLM 模型组合（DeepSeek/Qwen 混配，见 `lib/model-recommendations.ts`）

### 3. 验收脚本 `scripts/verify-liurun-redesign.ts`
输出一份 Markdown 报告到 `docs/superpowers/reports/liurun-redesign-<timestamp>.md`，内容：

**§1 总体指标**
- CONFIRMED persona 数（目标 80–180）
- CANDIDATE persona 数
- MERGED_INTO persona 数
- alias_mappings 总数 + 按 aliasType 分布
- biography_records 按 actor_role 分布
- merge_suggestions PENDING 数

**§2 牛浦 / 牛布衣 专项**
- 两个 persona 是否独立存在
- 牛布衣 lastSeenChapter 值
- 第 21-24 回 biography 挂到谁名下（期望牛浦）
- IMPERSONATED_IDENTITY alias_mapping 是否存在
- 牛布衣别名列表（JOIN alias_mappings NAMED/COURTESY_NAME/TITLE 等）

**§3 五场景 fixture 运行结果**（直接引用 T08 测试输出）

**§4 Top 50 CONFIRMED personas + Top 20 CANDIDATE** 供人工抽评

**§5 异常告警**
- mention_count=0 的 persona 列表（应为空）
- biography_count=0 的 CONFIRMED persona 列表（应为空）
- 同一 alias 指向多个 targetPersonaId 的冲突（应为空）

### 4. 合并闸门
- 报告 §2 所有断言通过
- 报告 §5 异常全部为空
- §1 总数在合理区间

## Acceptance Criteria

- [ ] 验收报告已生成并 commit 到 docs/superpowers/reports/
- [ ] 伞任务 acceptance criteria 全部勾选
- [ ] 书籍重跑过程 log 保存（至少 jobId + 总 token 消耗）

## Definition of Done

- [ ] 若指标不达标，迭代 Prompt A/B/C 并记录在 `docs/superpowers/reports/iterations.md`
- [ ] 最终 PR 描述附验收报告摘要

---

## §0-FINAL 对齐补丁（最终契约 · 以此为准 · 覆盖前文冲突项）

> 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-FINAL（§0-F.1 ~ §0-F.5）。
> 两轮反审结论 + 用户"不区分 MVP 全量做"决策。

### 覆盖 / 新增（对齐 §0-11 §0-10 §0-13）

- [ ] **前置依赖**：T05 + T06 + T07 + T08 + T11 + T16（gold set）+ T14（twopass 基线）全部完成
- [ ] 执行顺序：
  1. 对 `book_id=7d822600-9107-4711-95b5-e87b3e768125` 执行 `purge-book-analysis`
  2. 启动三阶段管线（`ANALYSIS_PIPELINE=threestage`）
  3. 跑 gold set 350 条评测
  4. 跑五 BookType regression fixtures
- [ ] **六项硬门槛**（任一不达标禁止 PR-2 合并）：
  1. CANDIDATE 桶规模 ≤ 200（§0-11）
  2. Gold set `precision@top100 ≥ 0.85`，95% CI 下限 ≥ 0.80（§0-10）
  3. Stage A identityClaim 五类各自 precision ≥ 0.80
  4. 五 BookType regression fixtures 通过率 ≥ 80%
  5. 牛浦/牛布衣专项：牛浦事迹归牛浦比率 ≥ 90%
  6. Δ precision vs twopass 基线（T14）为正
- [ ] 产出 `.trellis/workspace/reports/rerun-2026-04-17.md`（含六门槛表 + 对照基线 + 抽样错误案例）
- [ ] **§0-13 PR-2 合并**：报告通过 → 切换 `ANALYSIS_PIPELINE` 默认值到 `threestage`，合并读路径 PR

### DoD 追加
- [ ] 报告里每个门槛都有具体数字 + 证据链接
- [ ] 失败门槛必须回退到相关子任务而非强行合 PR-2
