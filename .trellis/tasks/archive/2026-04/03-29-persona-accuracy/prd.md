# brainstorm: 人物解析准确率提升

## Goal

识别并修复书籍 AI 解析流程中导致人物（Persona）识别不准的根本原因，制定分阶段改进方案，提升实体提取精度、降低幻觉率、避免实体碎片化。

## What I already know

从代码库探索得到：

**解析流程（pipeline）**：

```
runAnalysisJob
 └─ loadChaptersForJob（按任务范围加载章节列表）
 └─ 按章节顺序循环（sequential）
     └─ analyzeChapter(chapterId)
         ├─ 加载 profiles（书籍内当前人物+别名）
         ├─ splitContentIntoChunks（按3500字分段）
         ├─ 并发（AI_CONCURRENCY=3）调用AI分析每个chunk
         │    └─ buildChapterAnalysisPrompt + providerClient.generateJson
         ├─ mergeChunkResults（flatMap，无去重）
         └─ $transaction → persistResult
              └─ 删旧草稿 → mention/bio/relationship 写入
              └─ personaResolver.resolve（逐个名字做 DB 查询 + Levenshtein 匹配）
```

## 已发现的关键问题

### 问题1：Prompt 输出格式不允许模型表达"我认出了已知实体"（严重）

**位置**：`prompts.ts`

Known Entities 上下文格式：
```
- ID: abc123; StandardName: 范进; Aliases: 范相公, 范举人
```

但 JSON Output Format 中人物只有：
```json
{ "personaName": "实体标准名" }
```

**问题**：模型知道已知实体的 ID，但输出格式里无法携带 personaId。模型只能输出一个字符串（可能用 StandardName，可能稍作变体），然后 PersonaResolver 在后端用 Levenshtein 再次匹配。这是双重模糊性：

1. 模型输出的名字可能与 StandardName 有轻微差异
2. PersonaResolver 的字符串匹配对差异容忍度低

**根因**：架构上"给模型看 ID 却不让模型输出 ID"导致信息丢失。

---

### 问题2：PersonaResolver 相似度算法对中文短名效果极差（严重）

**位置**：`PersonaResolver.ts` → `similarity()` + `scoreCandidate()`

算法：`1 - Levenshtein距离 / max(len_a, len_b)`，阈值 0.62。

**中文名场景下失效的案例**：
| 别名（提取）| 标准名 | Levenshtein | 相似度 | 阈值判断 |
|------------|--------|-------------|--------|---------|
| 范相公 | 范进 | 2 | 0.33 | ❌ 未超阈值，触发创建新 persona |
| 胡老爹 | 胡屠夫 | 2 | 0.33 | ❌ 同上 |
| 吴太守 | 吴大人 | 1 | 0.67 | ✅ 但"太守"≠"大人"，是误合并 |
| 老爷 / 夫人 | 任何人 | 大 | 低 | ❌ 但实际上这些泛化称谓不应提取 |

**根因**：Levenshtein 对语义相关但字形不同的中文别名（如称谓、官职）无能为力。

---

### 问题3：Prompt 缺乏对古典中文泛化称谓的过滤规则（严重）

**位置**：`prompts.ts` → Strict Rules

当前 Rule 8："不确定的人物或关系不要猜测，直接忽略。"

但没有明确列出高频泛化称谓的过滤规则，如：
- 单字称谓：老爷、夫人、太太、小姐、老汉、公子、先生
- 职位泛称：掌柜的、账房先生、门房、小厮、丫鬟（不唯一指向某人时不应提取）
- 叙事主语：他/她/众人/大家

这些被频繁误提取为独立 persona，导致幻觉率高、persona 总数虚涨。

---

### 问题4：Known Entities 上下文缺少 localSummary，模型消歧信息不足（中等）

**位置**：`prompts.ts` → `entityContext` 构建

当前只传了：`ID` / `StandardName` / `Aliases`

`AnalysisProfileContext` 中有 `localSummary`（书内小传），但没有传入 prompt。

例如：同书中有两个姓"王"的人物，如果 prompt 里有"王举人（考场同窗，家境富裕）"，模型就能正确区分而不是合并或新创建。

---

### 问题5：并发 Chunk 分析共享同一个静态 profiles 快照（低影响）

**位置**：`ChapterAnalysisService.ts` → `analyzeChapter()`

```ts
const profiles = chapter.book.profiles.map(...)  // 加载一次
// AI_CONCURRENCY=3 并发分析
const batchPromises = batch.map((chunk) => analyzeChunkWithRetry(runtimeAiClient, { profiles, ... }))
```

chunk1 新识别的人物不会出现在 chunk2/3 的 Known Entities 中（因为 profiles 已静态固定）。跨批次也一样（profiles 只在章节开始时加载一次）。

实际影响：同一章不同段第一次出现的人物，后几段看不到它，可能重复创建。但由于 `persistResult` 中的 `cache` Map 会缓存同名字符串的 resolve 结果，部分情况下能被去重。

---

### 问题6：mergeChunkResults 无结构化去重（低影响）

**位置**：`ChapterAnalysisService.ts` → `mergeChunkResults`

仅做 `flatMap`，没有对相同 (`personaName` + `rawText` + `paraIndex`) 去重。

`persistResult` 中通过 key 字符串去重做了后置防护，但 `event` 文本可能因模型输出微小差异（标点）导致 key 不同，产生重复 biography 记录。

---

## 问题优先级矩阵

| 问题 | 影响 | 修复难度 | 优先级 |
|------|------|---------|------|
| P1: Prompt 无法传回 personaId | 实体碎片化 | 中（Prompt+类型) | 🔴 P0 |
| P2: Levenshtein 对中文短名失效 | 实体碎片化+误合并 | 中（算法改进）| 🔴 P0 |
| P3: 泛化称谓未过滤 | 幻觉率高 | 小（Prompt 规则）| 🔴 P0 |
| P4: localSummary 未传入 prompt | 消歧能力弱 | 小（一行改动）| 🟡 P1 |
| P5: profiles 静态快照 | 章内重复 persona | 大（架构改造）| 🟢 P2 |
| P6: mergeChunkResults 无去重 | 重复 bio 记录 | 小 | 🟢 P2 |

## 多轮自证（20 轮辩证摘要）

### 自证1：为什么不直接让模型输出 UUID personaId？

**假设**：让模型直接填 UUID → 零歧义。  
**反驳**：LLM 在看到 30+ UUID 后，随机抄写或拼凑错误 UUID 的概率极高，产生"静默误合并"（比创建新 persona 更危险 —— 把两个完全不同的角色合并是不可逆的数据污染）。  
**结论**：不用 UUID，改用 server 侧维护的短整型序列号（1/2/3...），模型只需输出简单数字，server 验证是否存在。

### 自证2：为什么不直接上 Embedding 语义相似度替换 Levenshtein？

**假设**：用 sentence-transformer 计算"范进"和"范相公"的向量余弦 → 接近 1.0。  
**反驳**：需要引入本地模型或额外 API（高耦合），且古典中文名字的向量表示质量因模型而异，"吴太守"和"吴大人"的语义相似度不代表他们是同一人。  
**结论**：不引入外部 embedding，用精心设计的**多信号评分**（精确 → 子串 → 首字 → Jaccard → Levenshtein）替代单一 Levenshtein。

### 自证3：两阶段方案（提取 vs 链接分离）是否值得额外 API 成本？

**假设**：两阶段 = 所有章节统一额外 +1 次 API 调用，成本不可接受。  
**反驳**：实体链接阶段的输入远比提取小（只有抽取到的名字列表 + Known Entities，不含原文），token 消耗约为提取的 1/5。且链接阶段可**条件触发**：若本章没有低置信度名字，完全跳过。  
**结论**：采用"条件触发式"实体链接 Agent，实际额外成本约 +15%。

### 自证4：模型真的能在提取阶段可靠返回 entityId 吗？

**假设**：让模型在 mentions 里直接填 `{"entityId": 3}` 代替 `{"personaName": "范相公"}` → 100% 准确。  
**反驳**：模型有时会对"确实存在于 Known Entities 的人物"自信地填错 entityId，尤其是在 Known Entities 列表很长时。更危险的是：错误 entityId 比错误名字更难发现。  
**结论**：保留 personaRef 为可选。正确流程是：模型**可以**填 entityId 来表示"我认出了这个人"，服务端**必须验证** entityId 有效，无效则回退到字符串匹配。添加 `possibleEntityId` 作为"提示信号"而非"权威决定"。

### 自证5：同一章内多 chunk 共享静态 profiles 是否真的有影响？

**假设**：影响不大，因为 resolve cache 已经在事务内去重了。  
**反驳**：假设章节有 6 段（chunk1-6）。chunk1 抽取了"周学道"并创建了新 persona。chunk2/3/4/5/6 的 AI prompt 里的 Known Entities 里没有"周学道"，AI 可能再次提取为新人物，产生 6 个"周学道"相关的 mentions 都指向同一个 resolveCache key，但 resolveCache 是基于字符串 key 的，只有字符串完全一致才复用。  
**结论**：每个 chunk batch 执行完毕后，从 DB 刷新一次 profiles，代价是 1 次 DB 查询，收益是后续 batch 的 AI 能看到已创建的实体。

## Technical Notes

### 关键文件

- `src/server/modules/analysis/services/prompts.ts` — Prompt 构建
- `src/server/modules/analysis/services/PersonaResolver.ts` — 实体对齐（Levenshtein）
- `src/server/modules/analysis/services/ChapterAnalysisService.ts` — 章节分析主流程
- `src/server/modules/analysis/jobs/runAnalysisJob.ts` — 任务调度Loop
- `src/types/analysis.ts` — AI 输出类型定义

### 可观测性现状

- 幻觉记录有日志 (`analysis.hallucination`)，但没有聚合 dashboard
- 每章 `created.personas` 数量有日志，但没有"误合并"统计
- 详情页（昨天刚做）可以看到 AnalysisJob 历史，但看不到每章幻觉率

## Acceptance Criteria（待补充）

- [ ] P0修复后，重新解析《儒林外史》第1-10回，人物总数与预期接近（原著约30个主要人物，不应超过50个，现在可能100+）
- [ ] 幻觉率（hallucination/total_mentions）应 < 15%（目前估计 > 30%）
- [ ] 同一人物的不同称谓（范进/范相公）应被归一到同一 persona，不应分裂

## Out of Scope（本次）

- 增加人工审核纠错工作台（另立任务）
- 换用更强的模型（使用层决策，不在代码层）
- Neo4j 关系图的准确率（依赖 persona 准确率，先解决 persona）
