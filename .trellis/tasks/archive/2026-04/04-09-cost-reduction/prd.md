# 书籍解析成本降低 50%+

## Goal

在不降低人物解析准确率的前提下，将书籍导入解析的 LLM 调用成本降低 50% 以上（当前单书 ¥5.8~7.1 → 目标 ≤ ¥3.0）。

## What I already know

### 当前成本基线（56回儒林外史）

| 指标 | 运行1 (915ad935) | 运行2 (c67815dc) |
|------|-----------------|-----------------|
| 总成本 | ¥5.82 | ¥7.09 |
| 总 Token | 1.37M+0.35M | 1.87M+0.40M |
| 总调用 | 188 次 | 187 次 |
| 总耗时 | 117min | 130min |

### 各阶段成本分布

| 阶段 | 调用数 | 主模型 | 输入+输出 Token (运行2) | 单价(输入/输出¥/M) |
|------|--------|--------|------------------------|-------------------|
| ROSTER_DISCOVERY | 56 | Qwen Max | 549K+70K | 2.4/6.0 |
| CHUNK_EXTRACTION | 74 | DeepSeek V3 | 572K+280K | 0.7/1.4 |
| CHAPTER_VALIDATION | 56 | Qwen Plus | 701K+52K | 0.8/2.0 |
| BOOK_VALIDATION | 1 | Qwen Plus | 43K+2K | 0.8/2.0 |

### 当前架构关键参数

- Phase 2 chunk: 6000字/片，500字重叠，3并发
- Phase 1 roster: 全章输入（≤20K），超长章节 15K 分片+2K 重叠
- 章节并发: 2
- 增量 Title Resolution: 每 5 章
- Chapter Validation: 每章都执行

### Prompt 模板 Token 估算（每次调用）

- Roster Discovery: ~1.5K 模板 + 章节正文 + profiles 上下文
- Chunk Analysis: ~1.8K 模板 + 2.5K chunk正文 + profiles 上下文 （× N chunks/章）
- Chapter Validation: ~2K 模板 + entities + mentions + relationships + 章节正文

### 已有审计报告结论（docs/人物解析链路审计报告.md）

- P1: Chunk Analysis 只注入 roster 中本 chunk 涉及的人物 → 节省 20-30% profiles token
- P1: Chapter Validation 条件触发 → 节省 ~15% 总 token
- P2: 精简 prompt 模板 → 节省 ~10%
- P2: profiles 格式压缩 → 节省 ~10%

## Corrections（对审计报告过期信息的修正）

1. **chunk size 已是 6000，非 2000**：审计报告写的 2000 是旧版，当前 `pipeline.ts` 中 `maxChunkLength = 6000`，`chunkOverlap = 500`。方案 D（增大 chunk size）的起点应从 6000 开始评估。
2. **CHAPTER_VALIDATION 是同步阻塞执行，非非阻塞**：当前 `runAnalysisJob.ts` 中每章解析后同步等待 validation 完成，改为条件触发对**耗时**和**成本**均有收益。
3. **DeepSeek Cache 不计入承诺收益**：当前 `deepseekClient.ts` 无 cache 参数，无 hit/miss 观测，无法保证折扣能稳定复现，降为潜在 bonus。
4. **ROSTER 模型降级是第二优先级杠杆**，应在 Prompt/调用结构优化完成并评估后再做，不是首要 open question。

## Requirements

* 按优先级顺序落地以下三项主线优化，每项有独立可验收标准：
  1. **[主线 C] profiles 注入范围收缩**：Chunk Analysis 的 Known Entities 只注入当前章节 Roster 涉及的人物，而非全书人物
  2. **[主线 D] 条件化 Chapter Validation**：只对高风险章节触发验证（新建人物多、低置信度实体多、TITLE_ONLY 比例高等），其余章节跳过
  3. **[主线 E] Prompt 模板精简**：压缩重复规则/schema/example 体积，减少每次调用的固定 token overhead
* 以上三项合计预估降本 **35~50%**，若叠加后续 A/B 实验有机会超 50%
* 以下为 **A/B 实验项**（不计入本轮承诺收益，完成主线后评估）：
  * **[实验 A] 增大 chunk size（6K→10K）**：中风险中收益，需金标回放验证
  * **[实验 B] ROSTER 模型降级**：Qwen Max → Qwen Plus，NER 能力风险需 A/B 证明
* **[暂缓 G] 合并 Phase1+Phase2**：架构大改，容易为降本伤准确率，本轮不碰

## Implementation Status

### 已实施（2025-04-09）

| 方案 | 改动文件 | 状态 | 说明 |
|------|---------|------|------|
| **[A] Chunk 6K→10K** | `pipeline.ts` | ✅ 已合入 | `maxChunkLength: 10000, chunkOverlap: 800` |
| **[C] Profiles 过滤** | `ChapterAnalysisService.ts` | ✅ 已合入 | Roster 结果过滤后只注入本章涉及人物 |
| **[D] 条件化 Validation** | `runAnalysisJob.ts`, `pipeline.ts` | ✅ 已合入 | `chapterValidationRiskThreshold: 3`，低风险章节跳过 |
| **[E] Prompt 精简** | `prompts.ts` | ✅ 已合入 | Entity 格式压缩、规则合并、JSON schema 压缩 |
| **[B] ROSTER 降级** | — | 📄 已文档化 | 见 `plan-b-roster-model-downgrade.md` |

### 测试状态

- 110 个测试全部通过（13 个测试文件）
- 含 3 个更新的快照测试

## Acceptance Criteria

- [ ] 同一本书（56 回儒林外史）成本降幅 ≥ 35%（主线三项完成后）
- [ ] eval goldset：人物 F1 / 关系 F1 不低于当前 baseline
- [ ] JSON 成功率不低于当前基线
- [ ] 条件化 Validation 的风险判断规则经回放验证覆盖充分
- [ ] A/B 实验项有独立对比数据，才能计入最终降幅

## Definition of Done

- Tests added/updated (unit/integration where appropriate)
- Lint / typecheck / CI green
- Docs/notes updated if behavior changes
- A/B 对比数据记录在 `.trellis/tasks/04-09-cost-reduction/` 下

## Out of Scope

* 不改动数据库 schema 或入库契约
* 不引入全文 embedding 检索或完全替代现有链路的新架构
* 不因降本减少结构化字段或放松审核标准
* **F（DeepSeek cache 折扣）不计入本轮承诺降幅**，作潜在 bonus
* **G（合并 Phase1+Phase2）本轮暂缓**
* 不把"更新模型定价表"当主要降本手段

## Technical Approach

**主线优化顺序（分步落地）**

### Step 1: [主线 C] profiles 注入范围收缩
**代码改动点：**
- `ChapterAnalysisService.ts`：当前 `profiles = chapter.book.profiles`（全书人物），改为按当前章节 Roster 结果过滤
- 具体逻辑：Phase 1 Roster Discovery 产出 `rosterMap`（含本章涉及的所有 personaId），过滤 `book.profiles` 只保留 `rosterMap` 中出现的人物
- 注意：若 Roster 漏识别人物，该人物的 profile 也会被过滤掉，需在 merge 阶段做兜底

**预估收益：** 后期章节（人物多）可减少 50-70% profiles token，全书平均约 **15~20% input token 减少**

### Step 2: [主线 D] 条件化 Chapter Validation
**代码改动点：**
- `runAnalysisJob.ts`：当前 `validateChapter()` 每章同步执行，改为根据风险信号条件触发
- 风险信号（满足任一即触发）：
  - 本章新建人物数 > N（建议 N=3，待调）
  - 本章 TITLE_ONLY 人物数 > 0
  - 本章有 fallback 调用
  - 本章 biographies 数量异常（过多/过少）
- 默认：普通章节跳过 validation

**预估收益：** 约 50-60% 章节可跳过 → **VALIDATION 阶段成本减少约 50%** → 全书约 15~18% 总降本

### Step 3: [主线 E] Prompt 模板精简
**代码改动点（`prompts.ts`）：**
- `buildChapterAnalysisPrompt`：合并相似规则（当前 12 条有冗余），压缩 JSON schema/example 格式（移除注释字段），约可减少 300~500 tokens/call
- `buildRosterDiscoveryPrompt`：规则同样有压缩空间，约减少 200~400 tokens/call
- 需要配套更新 `prompts.test.ts` 快照测试

**预估收益：** 约 **8~12% 总 token 减少**

---

**三项合计预估总降本：约 38~50%**

## Decision (ADR-lite)

**Context**: 当前单书解析成本 ¥5.8~7.1，主要由 CHUNK_EXTRACTION + CHAPTER_VALIDATION + ROSTER_DISCOVERY 三阶段驱动。纯模型替换单独无法稳妥达到 50% 目标。

**Decision**: 以 C（profiles 过滤）+ D（条件化 Validation）+ E（Prompt 精简）为主线，A/B（chunk size 和 ROSTER 模型降级）作后续 A/B 实验，F（cache 折扣）和 G（架构合并）暂缓。

**Consequences**: 主线三项均为结构性优化，对准确率风险均属低到中；D 需要靠回放验证风险规则覆盖充分；A/B 实验项在主线完成后评估，不计入本轮承诺降幅。

## Technical Notes

### 成本优化方案矩阵（研究后）

| # | 方案 | 预估节省 | 准确率影响 | 实现难度 | 风险 |
|---|------|---------|-----------|---------|------|
| A | 增大 chunk size（6K→10K） | 15-25% CHUNK 调用 | 低 | 低 | chunk 过大可能降低精度 |
| B | Roster 阶段用 Qwen Plus 替代 Qwen Max | ~60% ROSTER 成本 | 需验证 | 低 | NER 能力可能下降 |
| C | 限制 profiles 注入范围（仅本章 roster 涉及的） | 20-30% input token | 无 | 中 | 逻辑变更需仔细测试 |
| D | 条件化 Chapter Validation | ~50-70% VALIDATION 成本 | 无 | 低 | 高风险章节判定逻辑 |
| E | Prompt 模板精简 | 10-15% 模板 token | 需验证 | 中 | 模板变更需回归测试 |
| F | 利用 DeepSeek cache hit 折扣 | 30-50% CHUNK 成本 | 无 | 中 | 需固定 prompt 前缀 |
| G | 合并 Phase 1+Phase 2（单轮提取） | ~30% 总成本 | 需验证 | 高 | 架构大改 |

### 关键文件

- `src/server/modules/analysis/services/ChapterAnalysisService.ts` — 章节分析主编排器
- `src/server/modules/analysis/services/prompts.ts` — 所有 prompt 模板
- `src/server/modules/analysis/config/pipeline.ts` — 管线静态配置
- `src/server/modules/analysis/services/ModelStrategyResolver.ts` — 模型策略解析
- `src/server/modules/analysis/services/ValidationAgentService.ts` — 验证服务
- `config/model-candidates.v1.json` — 模型候选与定价
- `docs/人物解析链路审计报告.md` — 已有审计报告
