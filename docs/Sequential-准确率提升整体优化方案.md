# Sequential 架构准确率提升整体优化方案

> **前置**: `docs/角色解析准确率审计报告-儒林3.md`  
> **当前基线**: 精确率 ~19%, F1 ~0.31 (儒林-3), ~65-70% (儒林外史 402f2282)  
> **目标**: 精确率 85-90%, F1 ≥ 0.85  
> **范围**: Sequential 架构链路（Phase 1 Roster → Phase 2 Chunks → PersonaResolver → 后处理）

---

## 1. 问题分层与优先级

基于审计发现的 6 类错误，按收益/成本比排序为 3 个改进波次:

### Wave 1: 垃圾过滤强化（预计精确率 → 55-65%）

解决 A/B/C/D 类共 **202 个错误 profile**，纯规则层修改，不涉及 LLM 调用变更。

### Wave 2: 实体消歧增强（预计精确率 → 75-85%）

解决 E 类 **120+ 碎片化** 和 F 类 **15+ 错误合并**，涉及知识库、别名系统、后处理管线。

### Wave 3: 质量闭环与精调（预计精确率 → 85-90%）

置信度校准、动态泛称判定、全书验证、评估体系。

---

## 2. Wave 1: 垃圾过滤强化

### 2.1 扩充泛称词表

**改动文件**: `src/server/modules/knowledge/load-book-knowledge.ts` + DB `generic_title_entries` 表

> **D2 已确认**: 所有泛称全部进入知识库 DB 管理，硬编码全部移除。不保留 `lexicon.ts` 中的 `SAFETY_GENERIC_TITLES` / `DEFAULT_GENERIC_TITLES`。

**方案**:

通过 init 脚本将以下新增泛称写入 `GenericTitleEntry` 表：

```
tier=SAFETY 新增:
  管家, 差人, 长随, 番子, 门斗, 嫖客, 猎户, 斋公, 幕客, 典史,
  舵工, 朝奉, 樵夫, 养娘, 使女, 府尊, 盐捕分府, 学师,
  船家, 东家, 太保公, 看茶的, 走堂的, 卖草的, 卖人参的,
  掌舵的, 挑粪桶的, 火工道人, 报子上的老爷们

tier=DEFAULT 新增:
  番酋, 两位都督, 和尚, 道士, 道人, 小和尚, 贫僧, 僧宫老爷,
  首座, 知客, 老师父, 总兵, 总督, 府尹, 守备, 参将, 宗师
```

代码层 `PersonaResolver` 仅通过 `runtimeKnowledge.lexiconConfig.safetyGenericTitles` / `defaultGenericTitles` 读取，不再有硬编码常量。

**风险**: 某些词在特定小说中可能特指某人（如"管家来禀报"中的管家）。因此：
- 知识库支持按书/书籍类型覆盖（`exemptInGenres` / `exemptInBooks`）
- 启用 `dynamicTitleResolutionEnabled` 后可自动分层（D7: 修复后开启）

### 2.2 关系词过滤层

**改动文件**: `src/server/modules/analysis/services/PersonaResolver.ts`

> **D2 已确认**: 关系词列表统一存入 DB `relational_term_entries` 表，不硬编码在 PersonaResolver 中。

**在 `resolve()` 函数中，位于 safety_generic 检查之后，添加**:

```typescript
// 关系词检测 — 纯关系词不应作为独立 persona
// relationalTerms 来自 runtimeKnowledge.relationalTerms (Set<string>)
if (runtimeKnowledge.relationalTerms.has(rawName)) {
  // 检查此关系词是否已被 alias 稳定绑定到特定人物
  if (!aliasBinding) {
    return { status: "hallucinated", confidence: 0.9, reason: "relational_term" };
  }
}
```

初始数据（~80 条）通过 init 脚本写入 `RelationalTermEntry` 表，分类包含:
- KINSHIP: 母舅, 姑老爷, 姑爷, 女婿, 表兄, 表弟, 表侄, 小儿, 老侄, 二哥, 六哥, 浑家, 亲家, 内兄, 内弟, 妯娌, 嫂子 等
- SOCIAL: 季兄, 匡兄, 老友(部分场景) 等
- GENERIC_ROLE: 客人, 邻居, 伙计, 差人(作为角色关系词使用时) 等

**注意**: 关系词 + 姓氏的组合（如"匡兄"→匡超人）应该通过 `applySurnameTitleBoost` 加权绑定到具体人物，而不是新建 persona。当前代码已有此逻辑但仅对"姓+排行+敬称"模式生效，需扩展到"姓+关系词"模式。

### 2.3 历史人物标记库

**新增表**: `historical_figure_entries`（Prisma schema 新增 model）

> **D4 已确认**: 构建通用中国历史人物库（500+ 条），不局限于单部作品。  
> **D5 已确认**: LLM 按朝代/类别批量生成 → 人工抽检 → 修正提示词 → 再生成 → 入库审核。  
> **D13 已确认**: 此表不是"黑名单"，而是"已知历史人物标记库"。命中后需进一步判断"书内是否有实际参与"。

**方案**:

数据存入 DB `HistoricalFigureEntry` 表，分 6 类: EMPEROR / SAGE / POET / GENERAL / MYTHICAL / STATESMAN。

**在 PersonaResolver.resolve() 中检查**:

```typescript
if (runtimeKnowledge.historicalFigures.has(extracted) || runtimeKnowledge.historicalFigures.has(rawName)) {
  // 命中历史人物标记库 — 不直接过滤，需判断书内参与程度
  // 情况1: 书内有实际经历/行为/对话 → 保留，主实体存真名，书内称谓记为 alias
  // 情况2: 仅纯提及/引用/典故 → hallucinate
  // 暂时策略: 标记 reason="historical_figure_candidate"，由后处理或人工确认
  // 修复后开启（D7）: 结合章节上下文做自动判断
  return { status: "hallucinated", confidence: 0.5, reason: "historical_figure_candidate" };
}
```

**更好的方案（修复后开启）**: 结合 Prompt 优化，让 LLM 在提取时区分 `ACTIVE_IN_STORY`（书内有实际参与）和 `MENTIONED_ONLY`（纯提及）。命中 `ACTIVE_IN_STORY` 的历史人物保留，存真名作为 canonicalName，书内称谓/身份作为 alias。

```typescript
if (HISTORICAL_FIGURE_BLACKLIST.has(extracted) || HISTORICAL_FIGURE_BLACKLIST.has(rawName)) {
  return { status: "hallucinated", confidence: 0.95, reason: "historical_figure" };
}
```

**历史人物标记库查询（已用 runtimeKnowledge，不再硬编码 — D2）**:

```typescript
// 在 PersonaResolver.resolve() 中，runtimeKnowledge.historicalFigures 已在任务启动时加载
// 不需要额外查询 DB
```

### 2.4 描述性短语检测

**改动文件**: `src/server/modules/analysis/services/PersonaResolver.ts`

```typescript
// 描述性短语检测规则
function isDescriptivePhrase(name: string): boolean {
  // "X的Y"模式: 卖菱小孩 → 不匹配, 卖纸的客人 → 匹配
  if (/的/.test(name) && name.length > 3) return true;
  // "人名+亲属词"模式: 王玉辉老妻, 匡超人浑家
  if (/^[\u4e00-\u9fa5]{2,4}(老妻|浑家|丈母|阿舅|父亲|母亲|儿子|女儿|公婆|大女儿|老朋友|堂弟|叔祖母)$/.test(name)) return true;
  // "X之Y"模式: 虞育德之母
  if (/之/.test(name) && name.length > 3) return true;
  // "X其余Y"模式: 王玉辉其余女儿
  if (/其余/.test(name)) return true;
  return false;
}
```

### 2.5 家族名过滤

```typescript
// 家族名检测: X家, X府
function isFamilyHouseName(name: string): boolean {
  if (/^[\u4e00-\u9fa5]{1,2}[家府]$/.test(name)) return true;
  if (/^[\u4e00-\u9fa5]{2,4}氏/.test(name) && name.length <= 4) return true;
  return false;
}
```

### 2.6 人名长度阈值收紧

将 `name_too_long` 阈值从 10 字收紧到 **8 字**。中文正式人名最多 4 字（复姓+双名），加称号/字号最多 6-7 字（如"庄征君娘子"6 字也应被阻断为描述性短语）。

### Wave 1 预期效果

| 错误类型 | 修复前 | 修复后 | 消除率 |
|----------|--------|--------|--------|
| A 泛称 | 75 | ~10 | 87% |
| B 历史 | 69 | ~5 | 93% |
| C 家族名 | 18 | ~2 | 89% |
| D 描述短语 | 40 | ~5 | 88% |
| **合计** | **202** | **~22** | **89%** |

消除 ~180 个垃圾 profile → 623-180 = **443 profiles** → 精确率提升到 ~120/443 ≈ **27%** — 但碎片化未解决，E 类仍有 120+ 碎片。扣除碎片后有效 profile 约 323，其中约 120 个正确 → 精确率 ≈ **37%**。

> Wave 1 单独的效果有限，因为 E 类碎片化才是最大问题。但 Wave 1 是 Wave 2 的前置：减少噪声后，别名注册和实体合并才不会被垃圾数据污染。

---

## 3. Wave 2: 实体消歧增强

### 3.1 修复 AliasMapping 写入管线

**诊断**: 当前 `AliasRegistryService.registerAlias()` 方法存在但从未被调用（0 条记录）。

**排查方向**:
1. 检查 `ChapterAnalysisService` 中 `aliasRegistryService.registerAlias()` 的调用条件
2. 可能因为 `aliasRegistryMinConfidence = 0.75` 过高 + 初始 confidence 太低 → 始终不满足注册条件
3. 可能是 Phase 1 roster 的 `aliasType`/`aliasConfidence` 字段未被正确传递

**修复**: 确保 Phase 1 roster 发现的所有 `aliasType != null` 条目被自动注册到 AliasMapping，初始 confidence 取 roster 返回的 `aliasConfidence`。

### 3.2 知识库驱动的字号-本名映射

**核心思路**: 古典文学中人物有 姓名/字/号/谥/绰号 等多种称呼，字面匹配无法关联。需要引入**预置知识库**。

**数据结构**:

```sql
-- 知识库: 角色别名预映射
CREATE TABLE knowledge_character_alias (
  id            UUID PRIMARY KEY,
  book_type_id  UUID REFERENCES book_type(id),  -- 关联书籍类型
  canonical_name VARCHAR(50) NOT NULL,           -- 标准名: 迟衡山
  alias         VARCHAR(50) NOT NULL,            -- 别名: 迟均, 衡山先生
  alias_type    VARCHAR(20),                     -- COURTESY_NAME / STYLE_NAME / TITLE / NICKNAME
  confidence    FLOAT DEFAULT 1.0,
  UNIQUE(book_type_id, canonical_name, alias)
);
```

**初始化**: 为儒林外史预置 ~200 条字号-本名映射（可从文学数据库或手动整理获取）。

**集成点**: 在 `PersonaResolver.loadCandidates()` 中，当字面匹配无命中时，额外查询 `knowledge_character_alias`：

```typescript
// 新增: 知识库别名查询
const kbAliases = await prisma.knowledgeCharacterAlias.findMany({
  where: {
    bookTypeId: bookTypeId,
    alias: { equals: extracted, mode: "insensitive" }
  }
});
if (kbAliases.length === 1) {
  // 通过知识库找到唯一匹配 → 搜索 canonicalName 对应的 persona
  const kbCanonical = kbAliases[0].canonicalName;
  const kbMatch = await client.persona.findFirst({
    where: { name: kbCanonical, profiles: { some: { bookId } } }
  });
  if (kbMatch) {
    return [{ id: kbMatch.id, name: kbMatch.name, aliases: [...] }];
  }
}
```

### 3.3 全书级实体合并后处理

**新模块**: `src/server/modules/analysis/services/PostAnalysisMerger.ts`

**触发时机**: 全书解析完成后，在 BOOK_VALIDATION 之前执行。

**合并策略** (按优先级):

1. **精确重名合并**: 同名 persona → 直接合并（当前有 4 组: 蘧公孙, 庄绍光, 朱元璋, 朱棣）
2. **知识库驱动合并**: 查 `knowledge_character_alias` 表，找到 canonical_name 相同但当前分散的 persona → 合并候选
3. **别名交叉合并**: persona A 的 aliases 包含 persona B 的 name，或反向 → 合并候选
4. **同姓+高频共现合并**: 两个 persona 同姓、在相同章节频繁共现且角色描述相似 → LLM 仲裁
5. **碎片清理**: 提及数 < 2 + 低置信度 + 与高置信度 persona 共享别名 → 疑似碎片，标记 mergeSuggestion

**安全措施** (D3 已确认):
- **仅 Tier 1（conf = 1.0，精确名称匹配）自动合并**
- 所有其它层级一律写 `MergeSuggestion` 表，状态 `PENDING`，等待人工确认
- 不允许扩大自动合并范围来换取表面准确率

### 3.4 增强 PersonaResolver 评分

**改动文件**: `src/server/modules/analysis/services/PersonaResolver.ts`

**当前问题**: 评分仅基于字面相似（包含/子串/编辑距离），无语义理解。

**改进点**:

1. **姓氏前缀加权**: 同姓候选优先。当前 `applySurnameTitleBoost` 仅对"姓+泛称"模式生效，应扩展到所有同姓匹配
2. **Roster 信号加权**: Phase 1 roster 如果在 `suggestedRealName` 字段给出了映射（如 "迟先生" → "迟衡山"），此信号应直接用于匹配
3. **知识库信号加权**: 若知识库中存在 `alias → canonical_name` 映射，直接提升对应候选分数
4. **降低合并阈值的可能性**: 在知识库/roster 有支撑的情况下，将 `personaResolveMinScore` 从 0.72 降到 0.6

### 3.5 别名交叉清理

**问题**: 当前 177 条共享别名中，"老爹"被 13 个 persona 共享。这种交叉会导致错误传播。

**方案**: 在全书后处理阶段，扫描所有 persona 的 aliases，若某 alias 被 N>2 个不同 persona 持有 → 从所有 persona 的 aliases 中移除该 alias（或降级为弱别名）。

### Wave 2 预期效果

| 错误类型 | Wave 1 后 | Wave 2 后 | 消除率 |
|----------|-----------|-----------|--------|
| E 碎片化 | 120+ | ~20 | 83% |
| F 错误合并 | 15 | ~5 | 67% |
| 别名交叉 | 177 | ~30 | 83% |

Wave 1+2 后: 有效 profile 约 **150-170**（120 正确 + 30-50 仍有问题），精确率 **71-80%**。

---

## 4. Wave 3: 质量闭环

### 4.1 开启 dynamicTitleResolutionEnabled

> **D7 已确认**: 修复后开启。所有新增能力统一标记为"修复后开启"，不在修复完成前全量启用。

**改动**: `pipeline.ts` 中 `dynamicTitleResolutionEnabled: true`

**前置条件**: Wave 2 AliasMapping 写入管线修复完成且 alias_mappings 有数据。

**效果**: 泛称不再一刀切过滤，而是通过 `collectPersonalizationEvidence()` 分层为 personalized/generic/gray_zone。

### 4.2 开启 llmTitleArbitrationEnabled

> **D7 已确认**: 修复后开启。

**改动**: `pipeline.ts` 中 `llmTitleArbitrationEnabled: true`

**前置**: dynamicTitleResolutionEnabled 必须为 true + AliasMapping 有数据。gray_zone 称谓会被批量提交给 LLM 做仲裁。

### 4.3 置信度校准

**当前问题**: 67.9% profile 在 0.4-0.6 区间，高置信度包含错误项。

**方案**: 引入后校准函数，基于以下信号调整 confidence:
- 提及次数: mentions=0 → confidence *= 0.5
- 别名冲突数: conflicts>3 → confidence *= 0.8
- 历史人物匹配: → confidence = 0.1
- 知识库确认: → confidence *= 1.3 (cap at 1.0)

### 4.4 评估体系建设

> **D10 已确认**: 开发者基于审计报告手工标注 50-80 条核心角色样本，作为评估与回归基线。

**数据**: 建立 `data/eval/goldset-rulin.v1.jsonl` — 儒林外史角色标注金标准:
- 标注 ~120 个角色的标准名、别名、性别、角色类型
- 标注 ~50 个"不应出现"的反例（历史人物、泛称）

**自动评估**: 扩展 `scripts/eval/compute-metrics.ts` 支持:
- Precision@K (K=100,150,200)
- Recall@K
- F1
- 碎片化率: 1 - (unique real entities / total profiles)
- 交叉污染率: shared aliases / total aliases

### Wave 3 预期效果

全部 3 个 Wave 完成后:
- 精确率: **85-90%**
- 召回率: **90-95%**
- F1: **0.87-0.92**
- 碎片化率: < 5%
- 别名交叉率: < 10%

---

## 5. 实施路线图

```
Week 1-2: Wave 1 (垃圾过滤)
├── 扩充泛称词表                            [2h]
├── 关系词过滤层                            [3h]
├── 历史人物黑名单                          [4h] 
├── 描述性短语检测                          [3h]
├── 家族名过滤                              [1h]
├── 长度阈值收紧                            [0.5h]
├── 单元测试                                [4h]
└── 回归验证 (重新解析儒林-3)                [2h]

Week 3-4: Wave 2 (实体消歧)
├── 修复 AliasMapping 写入管线               [4h]
├── 字号-本名知识库表设计 + 迁移             [4h]
├── 知识库初始化 (儒林外史 ~200 条)           [6h]
├── PersonaResolver 知识库集成               [6h]
├── 全书实体合并后处理模块                    [8h]
├── 别名交叉清理                            [3h]
├── 集成测试                                [4h]
└── 回归验证                                [2h]

Week 5-6: Wave 3 (质量闭环)
├── 开启 dynamicTitleResolution              [1h]
├── 开启 llmTitleArbitration                 [1h]
├── 置信度校准                              [4h]
├── 评估金标准制作                          [8h]
├── 自动评估管线                            [4h]
├── 端到端回归                              [2h]
└── 文档更新                                [2h]
```

---

## 6. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 泛称扩充导致过度过滤（正确角色被误杀） | 召回率下降 | 启用 dynamicTitleResolution + 知识库豁免 |
| 历史人物黑名单误杀同名虚构角色 | 特定书籍角色丢失 | 黑名单存知识库，支持按书覆盖 |
| 知识库初始化数据不完整 | 碎片化仅部分改善 | 分阶段补充，优先高频角色 |
| 全书合并后处理误合并 | 不同人物被错误合并 | MergeSuggestion 表 + 人工审核 |
| 评分改动引入新回归 | 其他书籍准确率下降 | 自动评估管线覆盖多本书 |

---

## 7. 已确认决策点（原"待团队确认"，全部已锁定）

> 以下决策已在 `docs/待确认项汇总.md` 中正式确认。

| # | 原问题 | 已确认决策 | 对应编号 |
|---|--------|-----------|----------|
| 1 | 泛称词表存储方式？ | **全部进 DB**，硬编码全删 | D2 |
| 2 | 历史人物库范围？ | **通用中国历史人物库（500+条）** | D4 |
| 3 | 知识库字号映射产出？ | **开发者主导 + LLM 辅助** | D6 |
| 4 | 合并策略保守度？ | **仅 conf=1.0 自动合并，其余人工确认** | D3 |
| 5 | 评估金标准标注？ | **开发者手标 50-80 条核心样本** | D10 |
| 6 | dynamicTitleResolution 开启时机？ | **修复后开启** | D7 |
| 7 | 历史人物提取规则？ | **非黑名单，命中后判断书内参与程度** | D13 |
