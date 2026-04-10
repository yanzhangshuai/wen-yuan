# 全书解析流程优化 — 提升准确率 + 降低成本 + 通用化适配

## Goal

系统性诊断当前书籍解析管线（6 阶段 LLM Pipeline），找出准确率瓶颈和成本浪费点，制定可落地的优化方案。目标：在适配多种古代文学体裁（水浒传、三国演义、红楼梦、西游记等）的前提下，提升人物识别准确率（减少漏识别/张冠李戴）、降低 LLM token 成本。

## What I already know

### 当前架构（6 阶段管线）

```
Phase 1: ROSTER_DISCOVERY（全章名册发现）   → Qwen Max
Phase 2: CHUNK_EXTRACTION（分片结构化提取） → DeepSeek V3
Phase 3: PersonaResolver（多信号实体对齐）  → 本地算法（无 AI 调用）
Phase 4: persistResult（事务持久化）        → 数据库写入
Phase 5: CHAPTER_VALIDATION（章节校验）     → Qwen Plus（条件触发）
Phase 6: BOOK_VALIDATION + 孤儿检测 + 称号溯源 + 灰区仲裁
```

### 当前成本基线（56回儒林外史 — 2026-04-09 A+C+D+E 优化后）

| 阶段 | 调用数 | 主模型 | Token (input+output) | 占总成本 |
|------|--------|--------|---------------------|---------|
| ROSTER_DISCOVERY | 56 | Qwen Max (¥2.4/6.0/M) | 549K+70K | ~29% |
| CHUNK_EXTRACTION | ~42* | DeepSeek V3 (¥0.7/1.4/M) | ~400K+200K* | ~26% |
| CHAPTER_VALIDATION | ~22* | Qwen Plus (¥0.8/2.0/M) | ~280K+21K* | ~15% |
| TITLE_RESOLUTION | 10-12 | Qwen Max | ~50K+5K | ~3% |
| BOOK_VALIDATION | 1 | Qwen Max | ~43K+2K | ~1% |

*注：chunk 10K + 条件化 validation 后预估值，待实测确认。

### 已实施的优化（04-09 成本优化轮）

| 方案 | 状态 | 效果 |
|------|------|------|
| [A] Chunk 6K→10K | ✅ | 减少 ~35% CHUNK 调用次数 |
| [C] Profiles 按 roster 过滤 + 15 核心兜底 | ✅ | 减少后期章节 50-70% profiles token |
| [D] 条件化 Chapter Validation（risk threshold=3） | ✅ | ~50-60% 章节跳过 validation |
| [E] Prompt 模板精简 | ✅ | ~8-12% 每次调用 token 减少 |
| [B] ROSTER 降级 (Max→Plus) | ❌ 实验失败 | 人物减少 35%，大量张冠李戴 |

### 当前准确率基线

| 指标 | 值 | 来源 |
|------|-----|------|
| Entity F1 | 0.74 | baseline.metrics.json |
| Relation F1 | 0.68 | baseline.metrics.json |
| 成本/万字 | ¥3.6 | baseline.metrics.json |

### 已修复的 P0 Bug（审计报告中的问题全部已修复）

- ✅ scorePair() 亲属后缀 return 0
- ✅ Profile upsert 空 update → 现在更新 localName
- ✅ UPDATE_NAME 别名链 → updatedNameIds 跟踪防重
- ✅ DeepSeek max_tokens → 默认 8192
- ✅ mergeChunkResults flatMap → 现在有 Map-based 去重
- ✅ 体裁预设扩展到 3 种（明清官场/武侠/宫廷家族）

### Qwen Plus 实验失败数据（04-10 B 方案实测）

| 指标 | Qwen Max (基线) | Qwen Plus (实验) | 差异 |
|------|-----------------|-----------------|------|
| 人物总数 | 268 | 174 | -35% |
| 张冠李戴（错误归并） | 少量 | 大量（向鼎↔董老太、景兰江↔丁言志等 10+ 对） | 严重恶化 |
| 根因 | — | ROSTER 漏识别 → Plan C 级联放大 | — |

### 各体裁特有挑战

| 书籍 | 体裁 | 核心挑战 |
|------|------|---------|
| 儒林外史 | 明清官场讽刺 | 官衔称谓多（"王举人"、"张静斋"）；人物流动快，每 2-3 章换批 |
| 水浒传 | 英雄传奇 | 108 将各有绰号+法名+真名（如"花和尚鲁智深=鲁达"）；大量战斗场面中的临时人物 |
| 三国演义 | 历史演义 | 超多同姓人物（刘备/刘表/刘璋/刘封…）；字-号-谥号-庙号多重别名；跨大时间跨度 |
| 红楼梦 | 家族世情 | 家族辈分嵌套极深；同一人多种辈分称呼（"二爷"、"宝兄弟"、"宝玉"）；丫鬟改名 |
| 西游记 | 神魔小说 | 法号/法名/本相（"孙行者"="齐天大圣"="美猴王"="孙悟空"）；妖怪临时角色极多 |

### 当前体裁预设配置

```typescript
GENRE_PRESETS = {
  "明清官场": {},  // 默认，无额外配置
  "武侠": {
    exemptGenericTitles: ["掌门", "帮主", "盟主", "先生", "公子"],
    additionalTitlePatterns: ["掌门", "盟主", "帮主", "长老", "护法"],
    additionalPositionPatterns: ["堂主"]
  },
  "宫廷家族": {
    exemptGenericTitles: ["夫人", "太太", "老爷", "小姐", "公子"]
  }
}
```

## Assumptions (temporary)

* Entity F1 = 0.74 是可信基线（待用真实 goldset 确认）
* 当前 goldset 是占位数据（张三/李四），需建立真实 goldset 后才能做严格回归
* A+C+D+E 优化后的成本降幅还未实测确认

## Open Questions

1. **[Blocking] 当前体裁识别是手动选择还是自动推断？** 书籍导入时用户是否选择体裁？如果没有，需要增加体裁自动检测还是手动选择？

## Requirements (evolving)

—— 待 brainstorm 收敛后填写 ——

## Acceptance Criteria (evolving)

- [ ] Entity F1 ≥ 0.80（从 0.74 提升 ≥ 6pp）
- [ ] Relation F1 ≥ 0.72（从 0.68 提升 ≥ 4pp）
- [ ] 单书成本 ≤ ¥3.0（56 章儒林外史）
- [ ] 水浒传 108 将 + 绰号覆盖率 ≥ 90%
- [ ] 红楼梦主要人物（贾宝玉/林黛玉等 20+ core）F1 ≥ 0.85
- [ ] 三国演义同姓人物区分正确率 ≥ 85%

## Definition of Done

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Eval goldset 建立并回归通过

## Out of Scope

* —— 待收敛 ——

## Technical Notes

### 当前管线 6 阶段详细数据流

```
输入: 章节全文（~3000-15000字）
  │
  ├─ Phase 1: ROSTER_DISCOVERY
  │  ├─ 全章输入（≤20K，否则分片 15K/2K overlap）
  │  ├─ Prompt: 已知人物档案 [N] name|alias1,alias2 + 全章正文
  │  ├─ 输出: surfaceForm → entityId/isNew/generic/isTitleOnly/aliasType
  │  └─ 构建 rosterMap (surfaceForm → personaId | "GENERIC")
  │
  ├─ Phase 2: CHUNK_EXTRACTION
  │  ├─ 分片: 10K/800 overlap → ~2-4 chunks/章
  │  ├─ Profiles: roster 命中 ∪ 前 15 核心人物
  │  ├─ Prompt: Known Entities + chunk 正文 + 规则
  │  ├─ 输出: { biographies[], mentions[], relationships[] }
  │  └─ mergeChunkResults: Map-based 去重（mention key, bio key, relation key + evidence 合并）
  │
  ├─ Phase 3: PERSIST (事务)
  │  ├─ 注册 alias mapping
  │  ├─ 每个 mention/bio/rel → PersonaResolver.resolve()
  │  │  ├─ Step 1: 空名/短名/安全泛称 → hallucinated
  │  │  ├─ Step 2: 配置级泛称检查（可选动态分档）
  │  │  ├─ Step 3: rosterMap 快速路径 → 直接返回
  │  │  ├─ Step 4: AliasRegistry 查询 → 章节作用域内匹配
  │  │  └─ Step 5: 多信号相似度匹配
  │  │     ├─ 精确匹配: 1.0
  │  │     ├─ 子串: 0.55-0.97（含 hard/soft block 后缀检查）
  │  │     ├─ Levenshtein (≥6字): 编辑距离
  │  │     ├─ Jaccard (<6字): 字符集交并比
  │  │     └─ ≥ 0.72 → 合并; < 0.72 + 正文存在 → 创建新人物
  │  └─ 批量插入 mention/biography/relationship
  │
  ├─ Phase 4: CHAPTER_VALIDATION（条件触发）
  │  ├─ 触发条件: newPersonas ≥ 3 || hallucinationCount > 0 || grayZoneCount > 0
  │  ├─ 检查: ALIAS_AS_NEW / WRONG_MERGE / MISSING_NAME / INVALID_REL / DUPLICATE / LOW_CONF
  │  └─ 自动修复: MERGE(≥0.9) / ADD_ALIAS(≥0.8) / UPDATE_NAME(≥0.85)
  │
  └─ Phase 5-6: BOOK-LEVEL (全书完成后)
     ├─ 孤儿检测: mention < 2 → confidence 降至 0.4
     ├─ Title Resolution: TITLE_ONLY persona → AI 推断真名
     ├─ Gray Zone Arbitration: 灰区称谓批量仲裁
     └─ Book Validation: 全书自检（非阻塞）
```

### PersonaResolver 评分算法关键参数

```
合并阈值: 0.72
AliasRegistry 命中阈值: 0.75
Ranked Honorific Boost: 0.78
Hard Block 后缀: 父亲/母亲/儿子/女儿/之妻/之子/之父/之母/老爹/老娘
Soft Block 后缀: 大人/先生/将军/夫人/娘子/老爷/官/相/爷/老/家/屯
Soft Block 惩罚因子: 0.4
```

### 关键文件

- `src/server/modules/analysis/config/pipeline.ts` — 管线配置中心
- `src/server/modules/analysis/config/lexicon.ts` — 词表/泛称/后缀配置
- `src/server/modules/analysis/services/ChapterAnalysisService.ts` — 章节分析主编排器
- `src/server/modules/analysis/services/PersonaResolver.ts` — 多信号实体对齐
- `src/server/modules/analysis/services/prompts.ts` — 所有 prompt 模板
- `src/server/modules/analysis/services/AliasRegistryService.ts` — 别名注册与查询
- `src/server/modules/analysis/services/ValidationAgentService.ts` — 章节/全书校验
- `src/server/modules/analysis/jobs/runAnalysisJob.ts` — 任务执行调度器
- `config/model-recommendations.v1.json` — 阶段默认模型映射
- `config/model-candidates.v1.json` — 模型定价候选集

### 成本优化方案矩阵（研究后）

| # | 方案 | 预估节省 | 准确率影响 | 状态 |
|---|------|---------|-----------|------|
| A | Chunk 6K→10K | -35% CHUNK 调用 | 低 | ✅ 已实施 |
| B | ROSTER 降级 | -67% ROSTER | 高（❌失败） | ❌ 已否决 |
| C | Profiles 过滤+兜底 | -15~20% input | 低（有兜底） | ✅ 已实施 |
| D | 条件化 Validation | -50% VALIDATION | 无 | ✅ 已实施 |
| E | Prompt 精简 | -8~12% token | 需验证 | ✅ 已实施 |
| F | DeepSeek cache | -30~50% CHUNK | 无 | 待实施 |
| G | 合并 Phase 1+2 | -30% 总成本 | 需验证 | 暂缓 |
