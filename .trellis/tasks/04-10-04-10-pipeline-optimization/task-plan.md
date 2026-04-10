# 全书解析准确率提升 + 通用化适配 — 实施任务文档

> **优先级**：先提升准确率 → 再建立评估基础设施 → 最后全面推进  
> **目标**：Entity F1 → 0.98（里程碑：0.80 → 0.85 → 0.90 → 0.95+）  
> **约束**：不针对特定小说硬编码规则；所有规范存储在单一可维护文件

---

## 一、总体架构：三条线并行

```
Line 1 (准确率主线)  ─ P0 ──────────────────────────────────────────────
  │  Phase A: Prompt 全面重构 + 规则统一化
  │  Phase B: PersonaResolver 中文语义增强
  │  Phase C: 跨章节上下文桥接 + ROSTER 自校验
  │  Phase D: Validation 智能化升级
  │
Line 2 (评估基础设施)  ─ P1 ─────────────────────────────────────────────
  │  Phase E: 真实 Goldset 构建
  │  Phase F: 自动化评估流水线 (eval pipeline)
  │  Phase G: 门控回归机制 (gate check)
  │
Line 3 (后续优化路径)  ─ P2 ─────────────────────────────────────────────
     Phase H: 体裁自动检测 + 预设扩展
     Phase I: DeepSeek Context Cache
     Phase J: Phase 1+2 合并实验
```

---

## 二、Line 1 — 准确率主线（P0）

### Phase A: Prompt 全面重构 + 规则统一化

**目标**：所有 prompt 模板通用化，引用统一规则库；增强实体对齐精确度。

#### A.1 统一规则库文件

**新建文件**：`src/server/modules/analysis/config/rules.ts`

将当前分散在 `lexicon.ts`、`prompts.ts`、`pipeline.ts` 中的规则统一到单一文件，设计如下：

```typescript
// src/server/modules/analysis/config/rules.ts

/**
 * 通用规则库：所有体裁共用的识别规范。
 * 修改此文件 = 修改 AI 识别行为，需配合 eval 回归验证。
 */

// ──────────────── 1. 泛化称谓词库 ────────────────────
// 安全级：任何体裁下均不应作为独立人物（代词、泛泛称呼）
export const SAFETY_GENERIC_TITLES: ReadonlySet<string> = new Set([...]);

// 默认级：多数体裁下为泛称，但特定体裁可豁免（如武侠中"掌门"）
export const DEFAULT_GENERIC_TITLES: ReadonlySet<string> = new Set([...]);

// ──────────────── 2. 姓名后缀阻断规则 ────────────────
// 硬阻断：出现即阻止合并（如"之父"、"之妻"表明是关系描述而非人名）
export const HARD_BLOCK_SUFFIXES: ReadonlySet<string> = new Set([...]);

// 软阻断：出现时降低合并分数（如"大人"、"将军"可能是同一人也可能不是）
export const DEFAULT_SOFT_BLOCK_SUFFIXES: ReadonlySet<string> = new Set([...]);

// ──────────────── 3. 称号/职位模式 ────────────────────
export const UNIVERSAL_TITLE_STEMS: readonly string[] = [...];
export const DEFAULT_POSITION_STEMS: readonly string[] = [...];

// ──────────────── 4. 体裁预设矩阵 ────────────────────
// 每种体裁的差异化配置（仅覆盖与默认不同的部分）
export const GENRE_PRESETS: Record<string, GenrePresetConfig> = {
  "明清官场": { /* 默认 — 无额外配置 */ },
  "武侠":     { exemptGenericTitles: ["掌门", "帮主", ...], ... },
  "宫廷家族": { exemptGenericTitles: ["夫人", "太太", ...], ... },
  "英雄传奇": { /* 水浒传类：绰号保护、法名映射 */
    exemptGenericTitles: ["好汉", "头领", "教头"],
    additionalTitlePatterns: ["员外", "教头", "都头", "押司", "提辖"],
  },
  "历史演义": { /* 三国演义类：字号/谥号/庙号保护 */
    exemptGenericTitles: ["丞相", "军师", "主公"],
    additionalTitlePatterns: ["太守", "刺史", "都督", "将军"],
    additionalPositionPatterns: ["司马", "司徒", "廷尉"],
  },
  "家族世情": { /* 红楼梦类：辈分称呼保护 */
    exemptGenericTitles: ["姑娘", "奶奶", "姐姐", "妹妹", "嫂子", "婶子"],
    additionalSoftBlockSuffixes: ["哥哥", "姐姐"],
  },
  "神魔小说": { /* 西游记类：法号/本相映射 */
    exemptGenericTitles: ["大王", "大圣", "长老", "法师"],
    additionalTitlePatterns: ["菩萨", "真人", "尊者", "天王", "星君"],
  },
};

// ──────────────── 5. Prompt 规则模板 ──────────────────
// 通用抽取规则（所有 prompt 引用同一源）
export const ENTITY_EXTRACTION_RULES: readonly string[] = [
  "surfaceForm 必须是原文精确字符串，禁止编造或改写。",
  "优先匹配已知人物档案中的标准名(canonicalName)；仅确认全新人物时才创建新 personaName。",
  "泛化称谓（GENERIC_TITLES_PLACEHOLDER）禁止作为独立 personaName。",
  "仅提取虚构角色，排除作者/评注者/真实历史人物/批评家/单独姓氏（除非在书中虚构化）。",
  "personaName 使用规范人名，禁止附加"大人""老爷"等后缀。",
  "已知别名须映射回标准名（如"范举人"→ 范进）。",
  "不确定时宁可忽略，避免误建幻觉人物。",
  "同一人物在同一片段中的多种称呼都应识别并映射到同一 entityId。",
];

// 关系抽取规则
export const RELATIONSHIP_EXTRACTION_RULES: readonly string[] = [
  "description 写结论，evidence 填原文短句（≤120字）。",
  "不跨段推测，当前片段无证据则不输出该关系。",
  "ironyNote 仅在有直接讽刺/反语证据时填写。",
  "避免自关系（source === target）。",
];

// ──────────────── 6. 中文姓名规则 ──────────────────
export const CHINESE_SURNAME_LIST: ReadonlySet<string> = new Set([
  // 百家姓常见姓氏（覆盖古典文学主要姓氏）
  "赵","钱","孙","李","周","吴","郑","王","冯","陈",
  "褚","卫","蒋","沈","韩","杨","朱","秦","尤","许",
  "何","吕","施","张","孔","曹","严","华","金","魏",
  "陶","姜","戚","谢","邹","喻","柏","水","窦","章",
  "云","苏","潘","葛","奚","范","彭","郎","鲁","韦",
  "昌","马","苗","凤","花","方","俞","任","袁","柳",
  "酆","鲍","史","唐","费","廉","岑","薛","雷","贺",
  "倪","汤","滕","殷","罗","毕","郝","邬","安","常",
  "乐","于","时","傅","皮","卞","齐","康","伍","余",
  "元","卜","顾","孟","平","黄","穆","萧","尹","姚",
  "邵","湛","汪","祁","毛","禹","狄","米","贝","明",
  "臧","计","伏","成","戴","谈","宋","茅","庞","熊",
  "纪","舒","屈","项","祝","董","梁","杜","阮","蓝",
  "闵","席","季","麻","强","贾","路","娄","危","江",
  "童","颜","郭","梅","盛","林","刁","钟","徐","邱",
  "骆","高","夏","蔡","田","樊","胡","凌","霍","虞",
  "万","支","柯","昝","管","卢","莫","经","房","裘",
  "缪","干","解","应","宗","丁","宣","贲","邓","郁",
  "单","杭","洪","包","诸","左","石","崔","吉","钮",
  "龚","程","嵇","邢","滑","裴","陆","荣","翁","荀",
  "羊","於","惠","甄","曲","封","储","靳","汲","邴",
  // 复姓
  "欧阳","司马","上官","诸葛","公孙","令狐","皇甫","尉迟","长孙","慕容",
  "夏侯","轩辕","端木","百里","东方","南宫","西门",
]);
```

**核心设计原则**：
- 所有 prompt 中的规则文本均从 `rules.ts` 的常量数组生成，杜绝多处 prompt 口径漂移
- 体裁预设使用 overlay 模式（基于默认配置覆盖差异项），新增体裁只需要加一个预设对象
- 百家姓表用于 PersonaResolver 的姓氏匹配增强，非硬编码到特定小说

#### A.2 Prompt 模板重构

**修改文件**：`src/server/modules/analysis/services/prompts.ts`

| 当前问题 | 重构方案 |
|---------|---------|
| 规则文本硬编码在各 prompt 函数内 | 从 `rules.ts` 引用 `ENTITY_EXTRACTION_RULES`/`RELATIONSHIP_EXTRACTION_RULES` |
| 泛化称谓示例截取前 30 个 | 按当前体裁配置动态生成（排除豁免词） |
| system prompt 过于简短 | 增加角色框架：{体裁专家} + {已知问题提醒} + {输出质量要求} |
| 无跨章上下文传递 | Phase 2 prompt 新增"前章关键人物变动摘要" |
| JSON 输出格式缺乏约束 | 增加字段必填/可选的明确标注 |

**重构后的 buildRosterDiscoveryPrompt 结构**：

```
system: 
  你是古典中文文献的命名实体专家。
  当前书籍体裁：{genre}。
  你的任务是从原文中准确识别所有人物称谓并与已知档案对齐。
  关键要求：
  - 不要遗漏任何人物（宁多勿漏）
  - 同一人物的不同称呼都要识别
  - 区分同姓不同人（如"刘备"vs"刘表"）

user:
  ## 任务 (引用 rules.ts)
  ## 已知人物档案 (增强：显示人物别名 + 姓氏索引)
  ## 规则 (from ENTITY_EXTRACTION_RULES + 体裁特化补充)
  ## 前章人物变动摘要 (NEW: 上一章新增/消失的人物)
  ## 输出格式
  ## 本章正文
```

**重构后的 buildChapterAnalysisPrompt 结构**：

```
system:
  你是通用叙事文学结构化提取专家。
  当前书籍体裁：{genre}。
  关键要求：
  - 精准映射到已知人物，避免重复创建
  - 同一人物的称号/官衔/亲属称呼都归一到标准名
  - 关系必须有原文证据支撑

user:
  ## Task (引用 rules.ts)
  ## Rules (from ENTITY_EXTRACTION_RULES + RELATIONSHIP_EXTRACTION_RULES)
  ## Known Entities (增强：按姓氏分组 + 显示核心别名)
  ## 前片段上下文 (NEW: 上一 chunk 末尾人物列表)
  ## JSON Format
  ## Source Text
```

#### A.3 后续 Prompt 优化方向（记录但暂不实施）

- **Few-shot 动态示例**：根据体裁自动注入 2-3 个该体裁的典型识别案例
- **Self-Consistency**：对关键章节重复 2 次 Phase 1，取交集提高精度
- **Prompt Chain-of-Thought**：ROSTER 阶段要求模型先列出所有候选再逐个判断
- **温度自适应**：章节人物密度 > 15 时降低 temperature 减少幻觉

---

### Phase B: PersonaResolver 中文语义增强

**目标**：解决当前 Jaccard/Levenshtein 对 2-4 字中文人名效果差的核心问题。

**修改文件**：`src/server/modules/analysis/services/PersonaResolver.ts`

#### B.1 姓氏感知匹配

**问题**：当前 `scorePair` 对"范进" vs "范举人"使用 Jaccard（字符集交并比），无法理解姓氏语义。

**方案**：引入姓氏匹配信号，利用 `CHINESE_SURNAME_LIST`

```
新增函数: surnamePrefixScore(extracted, candidate)
  1. 提取 extracted 的首字/首二字（查百家姓表确认是否为姓氏）
  2. 提取 candidate 的姓氏
  3. 姓氏相同 → 返回 base boost (+0.15)
  4. 姓氏不同 → 返回 penalty (-0.10)
  5. 无法确定姓氏 → 返回 0（不干预）
```

修改 `scorePair` 函数：在最终评分中叠加 `surnamePrefixScore`，但设上限不超过 0.95。

#### B.2 别名类型感知评分

**问题**：当前所有别名权重相同，但"字"（如孔明=诸葛亮）和"绰号"（如花和尚=鲁智深）的匹配置信度应不同。

**方案**：

```
修改 multiSignalScore:
  - 从 aliasMapping 表读取 aliasType (TITLE/POSITION/KINSHIP/NICKNAME/COURTESY_NAME)
  - COURTESY_NAME (字/号) 精确命中 → confidence = 0.98
  - NICKNAME (绰号) 精确命中 → confidence = 0.95
  - TITLE (称号) 精确命中 → confidence = 0.90
  - POSITION (官职) 精确命中 → confidence = 0.85
  - KINSHIP (亲属关系) → 不提升（因为"某某之子"不等于是同一人）
```

#### B.3 短名相似度增强

**问题**：2-3 字中文名用 Jaccard 效果差（"贾政" vs "贾珍" Jaccard=0.33，但实际是不同人）。

**方案**：替换短名匹配策略

```
对于 length < 6（中文 2-3 字）:
  if 姓氏相同 && 名不同 → 返回 0.25（可能同族但不是同一人）
  if 姓氏相同 && 名部分重叠(≥50%) → 返回 0.55 + overlap_ratio * 0.2
  if 姓氏不同 → 返回 Jaccard * 0.5（大幅降权，不同姓大概率不是同一人）
  if 完全相同字符集但顺序不同 → 返回 0.3
```

这个修改直接解决了三国/红楼梦中同姓人物误合并问题（刘备 vs 刘表 当前 Jaccard=0.67 > 0.72 是错误的）。

#### B.4 合并阈值动态调整

**问题**：固定 0.72 阈值在不同章节人物密度下表现不同。

**方案**：

```
当前章节人物密度 > 20 → 提升阈值至 0.78（高密度章节更保守）
当前章节人物密度 ≤ 5  → 降低阈值至 0.68（低密度章节可宽松）
默认 → 保持 0.72
```

---

### Phase C: 跨章节上下文桥接 + ROSTER 自校验

**目标**：解决章节间人物状态断裂 + ROSTER 单点故障。

#### C.1 前章人物变动摘要

**修改文件**：`ChapterAnalysisService.ts`

```
新增逻辑：analyzeChapter() 启动时
  1. 查询前一章的 newlyCreated personas（名字+别名+首次出现位置）
  2. 查询前一章的 relationships 摘要
  3. 构造 previousChapterSummary 传入 prompt
```

传入 Phase 1 和 Phase 2 的 prompt 中，让 AI 了解"上一章刚出现了哪些人，这一章应该优先关注他们的延续"。

#### C.2 ROSTER 自校验机制

**问题**：Phase 1 是单点故障（ROSTER 漏识别 → Plan C 级联放大 → 全链路错误）。

**方案**：Phase 2 完成后，对新增人物做反向验证

```
postChunkVerification():
  从 Phase 2 merge 结果中提取所有 personaName
  对比 Phase 1 的 rosterMap:
    - Phase 2 提到但 Phase 1 未发现的人物 → 警告 + 动态补入 rosterMap
    - Phase 1 标记为 GENERIC 但 Phase 2 多次提到的 → 重新评估
  recordRosterMissRate(chapter) → 用于后续自动触发 validation
```

这个方案不增加 AI 调用成本，仅用本地逻辑做一致性检查。

#### C.3 AliasRegistry 跨章节传播增强

**修改文件**：`AliasRegistryService.ts`

```
新增逻辑：
  当 Phase 2 在某章节发现 A称呼→某人物 的新映射时
  如果该映射在连续 2 章中出现 → 自动提升 confidence 至 CONFIRMED
  如果该映射与已有 CONFIRMED 映射冲突 → 标记为 CONFLICT 待人工审核
```

---

### Phase D: Validation 智能化升级

#### D.1 Validation 触发条件优化

**当前**：`newPersonas ≥ 3 || hallucinationCount > 0 || grayZoneCount > 0`

**优化**：增加基于 ROSTER 自校验的触发

```
新增触发条件:
  - rosterMissRate > 0.1（ROSTER 漏识别率超 10%）
  - sameChapterDuplicateNames > 0（同章出现疑似重复人物名）
  - crossChapterNameConflict > 0（跨章节姓名冲突）
```

#### D.2 Validation 修复信心提升

**当前**：自动修复阈值 MERGE ≥ 0.9，ADD_ALIAS ≥ 0.8

**优化**：引入多信号校验

```
MERGE 操作前额外检查:
  - 两个 persona 是否在同一章节同时被提及（如果是 → 不合并，他们是不同人）
  - 两个 persona 之间是否有直接 relationship 记录（如果有 → 不合并）
  - 合并后是否会导致自关系（self-loop）→ 不合并
```

---

## 三、Line 2 — 评估基础设施（P1）

### Phase E: 真实 Goldset 构建

**目标**：为儒林外史前 20 章建立真实 goldset，替代当前占位数据。

**输出文件**：`data/eval/goldset.v1.jsonl`（每行一个 JSON 对象）

#### E.1 Goldset 格式

```jsonl
{"chapterNo":1,"entities":[{"name":"王冕","aliases":["王冕"],"nameType":"NAMED"},{"name":"秦老","aliases":["秦老"],"nameType":"NAMED"}...],"relationships":[{"source":"王冕","target":"秦老","type":"NEIGHBOR"}...]}
{"chapterNo":2,...}
```

#### E.2 构建方法

1. 用当前系统跑一轮儒林外史前 20 章
2. 人工校对每章的 entities 和 relationships
3. 标注 gold standard（该章应该识别到哪些人物、哪些关系）
4. 导出为 goldset.v1.jsonl

#### E.3 多体裁 Goldset 扩展计划

| 书籍 | 体裁 | 章节范围 | 优先级 |
|------|------|---------|--------|
| 儒林外史 | 明清官场 | 第 1-20 回 | P0 |
| 水浒传 | 英雄传奇 | 第 1-10 回 | P1 |
| 红楼梦 | 家族世情 | 第 1-10 回 | P1 |
| 三国演义 | 历史演义 | 第 1-10 回 | P2 |
| 西游记 | 神魔小说 | 第 1-10 回 | P2 |

---

### Phase F: 自动化评估流水线

**修改文件**：`scripts/eval/`

#### F.1 评估指标

```
Entity F1:
  Precision = 正确识别实体数 / 系统输出实体数
  Recall = 正确识别实体数 / goldset 实体数
  F1 = 2 * P * R / (P + R)

Entity F1 (strict): 精确名字匹配
Entity F1 (fuzzy): 允许别名匹配

Relation F1:
  同理，基于 (source, target, type) 三元组

额外指标:
  - 误建率 (False Positive Rate): 系统输出中不在 goldset 的人物比例
  - 漏识别率 (False Negative Rate): goldset 中未被系统识别的人物比例
  - 张冠李戴率: 系统将 A 的行为归到 B 的比例
  - 体裁覆盖率: 该体裁预设下的特殊规则命中率
```

#### F.2 评估脚本

```bash
# 运行评估
pnpm eval:run          # 跑 goldset 覆盖的章节
pnpm eval:compute      # 计算指标
pnpm eval:gate         # 门控检查（是否达标）

# 对比实验
pnpm eval:compare --baseline=v1 --experiment=v2
```

---

### Phase G: 门控回归机制

**输出文件**：`data/eval/gate.config.json`

```json
{
  "gates": {
    "entity_f1_strict": { "min": 0.80, "target": 0.95 },
    "entity_f1_fuzzy":  { "min": 0.85, "target": 0.98 },
    "relation_f1":      { "min": 0.72, "target": 0.85 },
    "false_positive_rate": { "max": 0.10 },
    "cost_per_10k_chars": { "max": 4.0 }
  },
  "blocking": ["entity_f1_strict", "false_positive_rate"]
}
```

任何代码修改在合并前必须通过 `pnpm eval:gate`，否则阻塞。

---

## 四、Line 3 — 后续优化路径（P2，记录但暂不实施）

### Phase H: 体裁自动检测

```
输入：书籍前 3 章文本
处理：
  1. 提取特征词频（官职词频、武功词频、家族称呼词频、神怪词频等）
  2. 对比 GENRE_PRESETS 中各体裁的特征分布
  3. 匹配最接近的体裁（可同时匹配多个，取 top 2）
  4. 若置信度 < 0.7 → 提示用户手动选择
输出：推荐体裁 + 置信度
```

### Phase I: DeepSeek Context Cache

利用 DeepSeek V3 的 cache 机制，让连续 chunk 的公共前缀（Known Entities + Rules）被缓存，节省 30-50% Phase 2 input token 成本。

### Phase J: Phase 1+2 合并实验

将 ROSTER_DISCOVERY + CHUNK_EXTRACTION 合并为单次 AI 调用，减少往返次数。风险：prompt 过长可能降低质量。需在 eval pipeline 就绪后才能安全实验。

---

## 五、实施路线图

### 里程碑 1：准确率 0.80（预计 2-3 天）

| 任务 | 对应 Phase | 工作量 | 依赖 |
|------|-----------|--------|------|
| 创建 `rules.ts` 统一规则库 | A.1 | 中 | 无 |
| 迁移 `lexicon.ts` → `rules.ts` | A.1 | 中 | A.1 创建 |
| 扩展 GENRE_PRESETS（7 种体裁） | A.1 | 小 | A.1 创建 |
| 重构 prompts.ts 引用统一规则 | A.2 | 大 | A.1 |
| PersonaResolver 姓氏感知匹配 | B.1 | 中 | A.1（百家姓表） |
| 短名相似度增强 | B.3 | 中 | B.1 |

### 里程碑 2：准确率 0.85 + 评估基线（预计 2-3 天）

| 任务 | 对应 Phase | 工作量 | 依赖 |
|------|-----------|--------|------|
| 构建儒林外史 goldset（前 20 章） | E.1-E.2 | 大 | 无 |
| 评估脚本 + 指标计算 | F.1-F.2 | 中 | E |
| 门控回归配置 | G | 小 | F |
| 别名类型感知评分 | B.2 | 中 | 无 |
| 跨章节上下文桥接 | C.1 | 中 | 无 |

### 里程碑 3：准确率 0.90+（预计 3-4 天）

| 任务 | 对应 Phase | 工作量 | 依赖 |
|------|-----------|--------|------|
| ROSTER 自校验机制 | C.2 | 中 | 无 |
| AliasRegistry 跨章节传播增强 | C.3 | 中 | 无 |
| Validation 触发条件优化 | D.1 | 小 | C.2 |
| Validation 多信号修复校验 | D.2 | 中 | 无 |
| 合并阈值动态调整 | B.4 | 小 | 无 |
| 水浒传实测验证 | — | 大 | E（多体裁 goldset） |

### 里程碑 4：准确率 0.95+（预计 3-5 天）

| 任务 | 对应 Phase | 工作量 | 依赖 |
|------|-----------|--------|------|
| 多体裁 goldset 扩展 | E.3 | 大 | E |
| 体裁自动检测 | H | 中 | A.1 |
| Prompt system 增强（few-shot） | A.3 | 中 | F（需 eval 验证） |
| DeepSeek Cache 集成 | I | 中 | 无 |
| 端到端回归所有体裁 | — | 大 | E.3 + F |

---

## 六、关键文件变更清单

| 文件 | 变更类型 | Phase |
|------|---------|-------|
| `src/server/modules/analysis/config/rules.ts` | **新建** | A.1 |
| `src/server/modules/analysis/config/lexicon.ts` | 重构→部分迁移到 rules.ts | A.1 |
| `src/server/modules/analysis/config/pipeline.ts` | GENRE_PRESETS 迁移到 rules.ts | A.1 |
| `src/server/modules/analysis/services/prompts.ts` | 全面重构 | A.2 |
| `src/server/modules/analysis/services/PersonaResolver.ts` | 评分算法增强 | B.1-B.4 |
| `src/server/modules/analysis/services/ChapterAnalysisService.ts` | 跨章上下文 + ROSTER 自校验 | C.1-C.2 |
| `src/server/modules/analysis/services/AliasRegistryService.ts` | 跨章节传播增强 | C.3 |
| `src/server/modules/analysis/services/ValidationAgentService.ts` | 多信号校验 | D.2 |
| `src/server/modules/analysis/jobs/runAnalysisJob.ts` | 触发条件优化 | D.1 |
| `data/eval/goldset.v1.jsonl` | 真实 goldset 数据 | E |
| `data/eval/gate.config.json` | 门控配置 | G |
| `scripts/eval/*.ts` | 评估脚本 | F |

---

## 七、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 98% F1 目标过于激进 | 可能无法达成 | 设置渐进里程碑（0.80→0.85→0.90→0.95），每级验收后再推进 |
| 姓氏匹配对复姓处理复杂 | 少量 edge case | 百家姓表包含常见复姓；罕见复姓降级到默认匹配 |
| 规则迁移可能引入回归 | 准确率下降 | 先建 goldset（E），迁移前后跑 eval 对比 |
| 体裁预设新增无法验证 | 新体裁效果未知 | 先在儒林外史验证框架，再扩展到其他小说 |
| Prompt 重构改变 AI 行为 | 不可预测的输出变化 | 灰度上线：先对 5 章测试，确认无严重回归后才全量 |

---

## 八、执行策略

**建议执行顺序**（考虑依赖和验证需要）：

```
Step 1: A.1 (rules.ts) + E (goldset) — 并行
  ↓
Step 2: A.2 (prompts 重构) + F (eval scripts) — 并行
  ↓
Step 3: G (gate check) — 建立回归基线
  ↓
Step 4: B.1 + B.3 (PersonaResolver 增强) — 有 eval 后可量化
  ↓
Step 5: C.1 + C.2 (跨章节 + ROSTER 自校验) — eval 验证
  ↓
Step 6: B.2 + B.4 + C.3 + D (精细化优化) — eval 验证
  ↓
Step 7: 多体裁扩展 — E.3 + H
```

每个 Step 完成后都跑 `pnpm eval:gate` 确认无回归。
