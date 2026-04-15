# 收敛修订: 待确认项落地与方案统一修订

## Goal

将 D1-D13 共 13 项已确认决策正式落实到方案文档、解析规则、人物定义、实施策略和 Trellis 执行任务中，消除文档与代码设计之间的口径冲突，生成可直接交给 Codex 执行的任务清单。

---

# 1. 修订后的结论总览

## 1.1 本轮确认了什么

| # | 决策 | 核心结论 |
|---|------|----------|
| D1 | 牛浦归属 | 牛布衣与牛浦郎独立存在；牛浦=牛浦郎，冒充经历归属牛浦郎 |
| D2 | 泛称存储 | 全部进 DB，硬编码全删，无 fallback |
| D3 | 自动合并 | 仅 conf=1.0 自动合并，其余必须人工确认 |
| D4 | 历史人物范围 | 构建通用中国历史人物库（500+条） |
| D5 | 数据产出 | LLM 生成 + 人工抽检，迭代优化 |
| D6 | 实施模式 | 开发者主导 + LLM 辅助 |
| D7 | 开启时机 | 所有新能力统一"修复后开启" |
| D8 | Book.genre | 直接删除，不做迁移 |
| D9 | 正则安全 | 100ms 超时 + ≤200 字符 + 禁嵌套量词 |
| D10 | 金标准标注 | 开发者手标 50-80 条核心样本 |
| D11 | 旧结构处理 | 直接删除（GENRE_PRESETS / classical-names / Book.genre） |
| D12 | 缓存策略 | 启动时加载一次，任务内不热更新 |
| D13 | 历史人物提取 | 书内有经历→提取(真名存储)；纯提及→不提取 |

## 1.2 与上一轮相比修正了什么

| 项目 | 上一轮表述 | 本轮修正 |
|------|-----------|----------|
| 泛称迁移 | "先硬编码再迁移 DB" | **无过渡期**，直接删硬编码，DB 唯一数据源 |
| Book.genre | "先标 @deprecated 再删" | **直接删除**，Prisma migration 移除列 |
| GENRE_PRESETS | "先保留 fallback 后删" | **直接删除**，BookType.presetConfig 唯一来源 |
| classical-names.ts | "先 @deprecated 再删" | **数据迁移后直接删除整个文件** |
| 历史人物库 | "简单黑名单" | **标记库**，非黑名单；命中后判断书内参与度 |
| 自动合并 | "conf≥0.85 自动合并" | **仅 conf=1.0 自动合并**，其余全部人工 |
| Wave1 过滤器 | "先加到代码常量" | **直接写入 DB**，代码只保留加载通道 |

## 1.3 已失效的旧结论

- ~~"GENRE_PRESETS 先保留 fallback"~~ → 直接删除
- ~~"classical-names.ts 先 @deprecated"~~ → 迁移后直接删除
- ~~"Book.genre 先 @deprecated"~~ → 直接删除
- ~~"conf≥0.85 自动合并"~~ → 仅 conf=1.0
- ~~"历史人物一律不提取"~~ → 有书内经历的提取，纯提及不提取
- ~~"Wave1 硬编码 RELATIONAL_TERMS Set"~~ → 存入 DB RelationalTermEntry
- ~~"新建 historical-figures.ts 代码常量"~~ → 直接建表 HistoricalFigureEntry

---

# 5. 统一解析规则口径

## 5.1 人物提取规则

### 应该提取的人物

| 类型 | 定义 | 示例 | 存储方式 |
|------|------|------|----------|
| **书内主要角色** | 有名/有姓、在情节中有行为/对话/事件参与 | 杜少卿、匡超人、范进 | `Persona.name` = 本名 |
| **书内次要角色** | 出场次数少但有具体行为或对话 | 牛玉圃、鲍文卿 | `Persona.name` = 本名 |
| **有书内经历的历史人物** | 历史真实人物在书中有行为/对话/事件 | 朱元璋（儒林第1回以"吴王"身份行动） | `Persona.name` = 真名，书内称谓记为 alias |
| **冒名/伪装角色** | 以他人身份活动，但有独立行为 | 牛浦郎（冒充牛布衣） | `Persona.name` = 真实身份，冒用身份记为 alias |

### 不应该提取的人物

| 类型 | 定义 | 示例 | 处理方式 |
|------|------|------|----------|
| **纯提及历史人物** | 仅被引用/提及/作为典故出现，无书内行为 | "如孔夫子所言" | 不建 Persona，标记为 `historical_figure_mention` |
| **泛称/通称** | 指代不明确的身份称呼 | 管家、差人、和尚 | 由知识库 `GenericTitleEntry` 过滤 |
| **纯关系称呼** | 仅通过亲属/社会关系称呼，无独立身份 | 母舅、姑老爷、浑家 | 由知识库 `RelationalTermEntry` 过滤 |
| **描述性短语** | 含结构性描述词的非名字短语 | "卖草的"、"周府的管家" | 由 `NamePatternRule` 过滤 |
| **家族/府第名** | X家/X府形式 | 杜家、严府 | 由 `NamePatternRule(FAMILY_HOUSE)` 过滤 |

## 5.2 名称分类与字段映射

| 名称类型 | 定义 | 字段 | 示例 |
|----------|------|------|------|
| **真名** | 角色的法定/本名，用于主实体标识 | `Persona.name` | 朱元璋、牛浦郎 |
| **别名** | 角色的其他称呼（书内外均可） | `AliasMapping.alias` | 匡迥→匡超人 |
| **书中称谓** | 角色在书中的阶段性/场景性称呼 | `AliasMapping.alias` + `source=BOOK_TITLE` | 吴王（朱元璋在第1回的称谓） |
| **身份/官职** | 角色的职务或社会身份 | `Profile.description` 或 `AliasMapping` | 杜老爷（杜少卿的尊称） |
| **关系称呼** | 基于人际关系的称呼 | 不建 Persona；若有绑定则记为 alias | 母舅→周母舅→周进 |
| **冒名身份** | 角色冒充他人使用的身份 | `AliasMapping.alias` + `source=IMPERSONATION` | 牛浦郎冒充"牛布衣" |
| **历史身份** | 历史人物的朝代/封号称谓 | `AliasMapping.alias` + `source=HISTORICAL_TITLE` | 太祖皇帝（朱元璋） |

## 5.3 冒名/伪装/借名归属规则

**核心原则**: 行为归属于真实行为人，被冒充者仅作为身份信息记录。

| 场景 | 归属规则 | 数据操作 |
|------|----------|----------|
| A冒充B行事 | 事件/经历归属 A | `Persona.name`=A，`AliasMapping(A, "B", source=IMPERSONATION)` |
| A和B都独立存在 | 各自独立 Persona | 两个独立 `Persona` 记录 |
| A在B的托名下写作 | A是作者Persona，B是笔名alias | `Persona.name`=A，`AliasMapping(A, "B", source=PEN_NAME)` |

**牛浦/牛布衣案例**:
- `Persona: 牛浦郎`（真实角色，aliases=["牛浦"]）
- `Persona: 牛布衣`（独立角色，真实存在，后已去世）
- 牛浦郎使用"牛布衣"名义招摇过市期间的事件 → 归属 `牛浦郎`
- `AliasMapping(牛浦郎, "牛布衣", source=IMPERSONATION, chapters=[26-34])`

## 5.4 泛词知识库化规则

**为什么泛词必须入知识库**:
1. 泛称列表需要按书/书型定制（"管家"在某些书中特指某人）
2. 硬编码无法由非开发者维护
3. 知识库支持审核流、按书覆盖、按类型覆盖
4. 运行时一次加载、零 DB 查询（D12）

**泛词参与判断流程**:
```
rawName 进入 PersonaResolver
  → Step 1: 检查 runtimeKnowledge.safetyGenericTitles → 命中则直接 hallucinate
  → Step 2: 检查 runtimeKnowledge.relationalTerms → 命中且无alias绑定则 hallucinate
  → Step 3: 检查 runtimeKnowledge.namePatternRules → 命中 BLOCK 规则则 hallucinate
  → Step 4: 检查 runtimeKnowledge.defaultGenericTitles → 命中则 hallucinate（可被豁免）
  → Step 5: 检查 runtimeKnowledge.historicalFigures → 命中则进入D13判断
  → 后续: alias命中、相似度匹配、新建决策
```

## 5.5 历史人物库协同规则

**协同流程**:

```
1. 解析链路提取到名字 X
2. 检查 runtimeKnowledge.historicalFigures 是否命中
3. 若未命中 → 正常处理（非历史人物）
4. 若命中 → 进入 D13 判断:
   a. 检查当前 chunk/章节上下文:
      - X 有行为动词 → 初步判定"书内参与"
      - X 有对话 → 初步判定"书内参与"
      - X 仅出现在引述/典故/评论语境 → 初步判定"纯提及"
   b. 书内参与 → 建 Persona，name=真名（从 historicalFigures 表获取），
      书内称谓记为 AliasMapping
   c. 纯提及 → 不建 Persona，标记为 historical_figure_mention
      (可写入日志，不影响输出)
```

**判定信号**（优先级从高到低）:
1. 有直接对话引号 → 书内参与
2. 是动作主语（"吴王率军"、"朱元璋下令"） → 书内参与
3. 在"据说"/"传闻"/"古人云" 等引述框架中 → 纯提及
4. 在人物列举/背景描述中 → 纯提及
5. 不确定 → 标记为 `historical_figure_candidate`，写入 `merge_suggestions(status=PENDING)`

## 5.6 自动合并与人工确认边界

| 层级 | 条件 | confidence | 动作 |
|------|------|-----------|------|
| **Tier 1** | 精确名称匹配（name 完全相同） | 1.0 | **自动合并** |
| **Tier 2** | KB 别名驱动（aliasLookup 命中） | 0.85-0.95 | 写入 `merge_suggestions(PENDING)` → **人工确认** |
| **Tier 3** | Alias 交叉匹配 | 0.75-0.90 | 写入 `merge_suggestions(PENDING)` → **人工确认** |
| **Tier 4** | 共现分析（从未同章出现） | 0.60-0.80 | 写入 `merge_suggestions(PENDING)` → **人工确认** |
| **Tier 5** | 碎片清理（单mention低置信） | 0.40-0.60 | 写入 `merge_suggestions(PENDING)` → **人工确认** |

**硬性约束**: 不允许扩大 Tier 1 标准（如降低到 conf≥0.95）来换取表面准确率。

---

# 6. Trellis 人物文档同步方案

## 6.1 人物实体定义

### 角色类型分类体系

| 类型标识 | 中文名 | 定义 | 是否建 Persona | 示例 |
|----------|--------|------|---------------|------|
| `MAIN_CHARACTER` | 主角色 | 书内有大量情节、行为、对话参与的核心人物 | ✅ | 杜少卿、匡超人 |
| `MINOR_CHARACTER` | 次要角色 | 出场次数少但有具体行为/对话的人物 | ✅ | 牛玉圃、鲍文卿 |
| `HISTORICAL_ACTIVE` | 有书内经历的历史人物 | 历史真实人物在书中有行为/事件参与 | ✅ | 朱元璋（儒林第1回） |
| `HISTORICAL_MENTION` | 纯提及历史人物 | 历史人物仅被引用/提及/为典故 | ❌ | "如孔夫子所言" |
| `GENERIC_TITLE` | 泛称/通称 | 身份称呼，非具体人物 | ❌ | 管家、差人、和尚 |
| `RELATIONAL_TERM` | 关系称呼 | 亲属/社会关系称呼 | ❌ | 母舅、浑家、姑老爷 |
| `DESCRIPTIVE_PHRASE` | 描述性短语 | 含结构性描述词 | ❌ | 卖草的、周府的管家 |
| `FAMILY_HOUSE` | 家族/府第名 | X家/X府 | ❌ | 杜家、严府 |
| `IMPERSONATOR` | 冒名角色 | 以他人身份活动 | ✅（归属真实行为人） | 牛浦郎冒充牛布衣 |

### 判定优先级（从高到低）

```
1. 空名/过短/过长 → 直接丢弃
2. safety_generic 命中 → GENERIC_TITLE
3. relational_term 命中（无alias绑定） → RELATIONAL_TERM
4. namePatternRule 命中 BLOCK → DESCRIPTIVE_PHRASE / FAMILY_HOUSE
5. default_generic 命中 → GENERIC_TITLE
6. historicalFigure 命中 → 进入 D13 判断 → HISTORICAL_ACTIVE 或 HISTORICAL_MENTION
7. alias 命中 → 复用已有 Persona
8. 相似度匹配 → 候选合并
9. 新建 Persona
```

## 6.2 人物字段规范

### Persona 模型核心字段

| 字段 | 类型 | 说明 | 来源 |
|------|------|------|------|
| `name` | String | **真名**，角色主实体标识 | 解析提取 / 知识库映射 |
| `gender` | Enum? | 性别 | LLM 推断 |
| `description` | String? | 一句话描述 | LLM 生成 |
| `significance` | Enum | MAJOR / MINOR / BACKGROUND | mention 数量 + 章节跨度 |
| `isHistoricalFigure` | Boolean | 是否为历史人物（D13标记） | historicalFigures 命中 |
| `firstAppearChapter` | Int? | 首次出现章节 | 解析自动记录 |
| `mentionCount` | Int | 被提及次数 | 解析统计 |

### AliasMapping 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `alias` | String | 别名/称谓/冒名 |
| `personaId` | String | 关联的 Persona |
| `source` | Enum | `ROSTER_DISCOVERY` / `CHUNK_ANALYSIS` / `KB_ALIAS` / `IMPERSONATION` / `HISTORICAL_TITLE` / `BOOK_TITLE` / `MANUAL` |
| `confidence` | Float | 映射置信度 |
| `chapters` | Int[]? | 该别名生效的章节范围（冒名/阶段性称谓） |

### MergeSuggestion 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `sourcePersonaId` | String | 被合并方 |
| `targetPersonaId` | String | 保留方 |
| `strategy` | Enum | `EXACT_NAME` / `KB_ALIAS` / `ALIAS_CROSS` / `COOCCURRENCE` / `FRAGMENT` |
| `confidence` | Float | 合并置信度 |
| `status` | Enum | `AUTO_MERGED`（仅 conf=1.0）/ `PENDING`（其余全部） / `APPROVED` / `REJECTED` |

## 6.3 人物解析与合并规则

### 提取规则

| # | 规则 | 数据来源 | 动作 |
|---|------|----------|------|
| E1 | 名字长度 ∈ [2, 8] | 硬逻辑 | <2 或 >8 → hallucinate |
| E2 | 不在 safetyGenericTitles 中 | DB `GenericTitleEntry(tier=SAFETY)` | 命中 → hallucinate |
| E3 | 不在 relationalTerms 中（或有 alias 绑定） | DB `RelationalTermEntry` | 命中且无绑定 → hallucinate |
| E4 | 不匹配 BLOCK 类 namePatternRule | DB `NamePatternRule` | 命中 BLOCK → hallucinate |
| E5 | 不在 defaultGenericTitles 中（或有书级豁免） | DB `GenericTitleEntry(tier=DEFAULT)` | 命中 → hallucinate |
| E6 | 历史人物命中 → D13 判断 | DB `HistoricalFigureEntry` | 纯提及 → 不提取 |

### 排除规则

| # | 被排除的内容 | 排除方式 |
|---|-------------|----------|
| X1 | 空名 / 单字名 / 超长名 | 长度硬逻辑 |
| X2 | 泛称（管家、差人、和尚…） | `GenericTitleEntry` |
| X3 | 关系称呼（母舅、浑家…） | `RelationalTermEntry` |
| X4 | 描述短语（卖草的、X的Y） | `NamePatternRule(DESCRIPTIVE_PHRASE)` |
| X5 | 家族名（X家、X府） | `NamePatternRule(FAMILY_HOUSE)` |
| X6 | 纯提及历史人物 | `HistoricalFigureEntry` + D13 上下文判断 |
| X7 | 后缀过滤（X父亲、X之妻） | `ExtractionRule(HARD_BLOCK_SUFFIX / SOFT_BLOCK_SUFFIX)` |

### 自动合并规则

```
仅当: strategy=EXACT_NAME AND confidence=1.0
→ 自动执行合并，status=AUTO_MERGED

所有其他情况:
→ 写入 merge_suggestions，status=PENDING
→ 等待人工确认
```

### 冒名角色归属规则

```
1. 识别冒名关系（知识库 / LLM / 人工标注）
2. 冒名者的行为事件 → 归属 Persona(真实行为人)
3. 被冒充者 → 独立 Persona（如果本身也是书内角色）
4. 冒名身份 → 记入 AliasMapping(source=IMPERSONATION, chapters=[起始章-结束章])
5. 不将冒充期间事件归属给被冒充者
```

## 6.4 人物审核流

| 阶段 | 自动/人工 | 条件 | 动作 |
|------|----------|------|------|
| 解析完成 | 自动 | conf=1.0 精确匹配 | 自动合并 |
| 解析完成 | 自动 | conf<1.0 | 写入 PENDING |
| 审核队列 | 人工 | PENDING 状态的 merge_suggestions | 开发者逐条审核 |
| 审核队列 | 人工 | historical_figure_candidate | 开发者判断书内参与度 |
| 知识库更新 | 人工 | 新泛称/关系词/历史人物 | 管理后台操作 → 审核 → 入库 |
| 能力开启 | 人工 | dynamicTitleResolution 等 | 确认修复完成 → 改配置项为 true |

**修复后开启的能力清单**:
1. `dynamicTitleResolutionEnabled` — 称谓+姓名复合解析
2. `llmTitleArbitrationEnabled` — LLM 灰区仲裁
3. 知识库驱动的泛称分层过滤
4. 历史人物标记库过滤
5. 关系词过滤
6. NamePatternRule 正则过滤

**灰度放开策略**: 逐项开启，每开启一项重跑评估管线检查 precision/recall 无退化后再继续。

## 6.5 建议新增/修订的人物文档清单

| 文档 | 状态 | 位置 | 说明 |
|------|------|------|------|
| **人物实体定义与分类** | 新增 | `docs/spec/persona-entity-types.md` | 6.1 节内容 |
| **人物字段规范** | 新增 | `docs/spec/persona-field-spec.md` | 6.2 节内容 |
| **解析与合并规则** | 新增 | `docs/spec/persona-parse-merge-rules.md` | 6.3 节内容 |
| **审核流与能力开关** | 新增 | `docs/spec/persona-review-flow.md` | 6.4 节内容 |
| **统一解析规则口径** | 新增 | `docs/spec/unified-parsing-rules.md` | 第 5 节内容 |

---

# 7. 修订后的实施策略

## 7.1 Sequential 架构改动

| 改动点 | 内容 | 对应决策 | 状态 |
|--------|------|----------|------|
| PersonaResolver 过滤链 | 新增 6 个检查点（泛称/关系词/名字规则/历史人物/后缀/豁免） | D2/D13 | **修复后开启** |
| 运行时知识加载 | `loadFullRuntimeKnowledge()` 替代所有硬编码引用 | D2/D12 | 必须实现 |
| 长度阈值 | `name_too_long` 从 10 改为 8 | — | 可直接开启 |
| 缓存策略 | 任务启动加载一次，传入整个 pipeline | D12 | 必须实现 |

## 7.2 TwoPass 架构改动

| 改动点 | 内容 | 对应决策 |
|--------|------|----------|
| `loadTwoPassRuntimeContext()` | 替换 `buildAliasLookup(genre)` → `loadFullRuntimeKnowledge(bookId)` | D2/D11 |
| genre 参数 | 移除对 `book.genre` 的引用，改用 `book.bookTypeId` → `BookType.key` | D8 |
| 别名查找 | 从 `resolveByKnowledgeBase()` 切换到 `runtimeKnowledge.aliasLookup` | D11 |

## 7.3 全局知识库服务层改动

| 改动点 | 内容 |
|--------|------|
| 新增 3 张表 | `HistoricalFigureEntry`、`RelationalTermEntry`、`NamePatternRule` |
| 扩展 ExtractionRule | 新增 4 种 ruleType: HARD_BLOCK_SUFFIX / SOFT_BLOCK_SUFFIX / TITLE_STEM / POSITION_STEM |
| 扩展 GenericTitleEntry | 新增 `exemptInBooks`、`category` 字段 |
| 新建 `loadFullRuntimeKnowledge()` | 一次加载全部知识到内存，返回 `FullRuntimeKnowledge` |
| 管理后台 API | 历史人物 / 关系词 / 名字规则 CRUD + import + test |
| 初始化脚本 | `scripts/init-knowledge-phase7.ts` 填充全部种子数据 |

## 7.4 Book.genre / GENRE_PRESETS 下线

**执行步骤**:
1. Prisma schema 移除 `Book.genre` 字段
2. 新增 Prisma migration 删除 `genre` 列
3. 代码中所有 `book.genre` 引用替换为 `book.bookType?.key ?? null`
4. 删除 `pipeline.ts` 中的 `GENRE_PRESETS` 对象
5. 删除所有引用 `GENRE_PRESETS` 的代码路径
6. `BookType.presetConfig` 成为唯一配置来源

**已确认替换点**:
1. 前端导入页 `src/app/admin/books/import/page.tsx`：`handleCreateBook()` 中 `formData.set("genre", genre)` 改为传递新的 `bookTypeId`/`bookTypeKey`
2. 导入 API `src/app/api/books/route.ts`：`createBookFormSchema` 与 `POST()` 去掉 `genre` 字段，改收 `bookTypeId` 或 `bookTypeKey`
3. 建书服务 `src/server/modules/books/createBook.ts`：`createBook()` 写库时不再落 `genre`，改写 `bookTypeId`
4. 解析服务 `src/server/modules/analysis/services/ChapterAnalysisService.ts`：删除 `resolveBookLexiconConfig(chapter.book.genre)` 老逻辑，改为使用预加载 runtimeKnowledge

**风险**: Prisma 字段删除后需同步重新生成客户端代码，避免 `src/generated/prisma/**` 中残留 `genre` 类型。

## 7.5 任务启动强制刷新策略（D12）

```typescript
// SequentialPipeline.run() 入口处:
knowledgeCache.delete(bookId); // 强制清除旧缓存
const runtimeKnowledge = await loadFullRuntimeKnowledge(bookId, bookTypeKey, prisma);
// runtimeKnowledge 作为参数传入整个 pipeline，章节处理中不再查 DB
```

**不做**:
- 不做 admin 知识库变更后自动刷新
- 不做 WebSocket 推送
- 不做定时轮询

## 7.6 正则安全策略工程化（D9）

```typescript
// NamePatternRule 入库校验（API 层）:
function validateRegex(pattern: string): { valid: boolean; error?: string } {
  if (pattern.length > 200) return { valid: false, error: "超过200字符" };
  if (/(\(.+[+*]\))[+*]/.test(pattern)) return { valid: false, error: "禁止嵌套量词" };
  try {
    const start = Date.now();
    new RegExp(pattern);
    if (Date.now() - start > 100) return { valid: false, error: "编译超时" };
    return { valid: true };
  } catch (e) {
    return { valid: false, error: `正则语法错误: ${e.message}` };
  }
}

// 运行时执行保护:
function safeRegexTest(compiled: RegExp, input: string, timeoutMs = 100): boolean {
  // 使用 input 长度限制 + 预编译缓存
  if (input.length > 50) return false; // 人名不应超过50字符
  return compiled.test(input);
}
```

## 7.7 核心样本标注与评估体系（D10）

**标注内容**: `data/eval/goldset-rulin.v1.jsonl`，50-80 条核心角色
**标注格式**: 
```json
{
  "characterId": "char-001",
  "canonicalName": "杜少卿",
  "aliases": ["杜老爷", "少卿"],
  "gender": "male",
  "isHistorical": false,
  "firstAppearChapter": 31
}
```
**评估指标**: precision ≥ 0.70，recall ≥ 0.75，F1 ≥ 0.72，fragmentationRate ≤ 2.0
**自动化**: `pnpm eval:metrics` + `pnpm eval:gate`

## 7.8 修复后开启能力清单

| 能力 | 配置项 | 前置条件 | 开启方式 |
|------|--------|----------|----------|
| 称谓动态解析 | `dynamicTitleResolutionEnabled` | AliasMapping 管线修复 + KB 集成 | 改配置项为 true |
| LLM 灰区仲裁 | `llmTitleArbitrationEnabled` | 称谓动态解析开启 + 频率限制 | 改配置项为 true |
| 知识库泛称过滤 | 通过 `runtimeKnowledge` 自动生效 | DB 数据完整 + 硬编码已删 | KB 就绪即开启 |
| 历史人物标记库 | 通过 `runtimeKnowledge` 自动生效 | HistoricalFigureEntry 有数据 | 数据就绪即开启 |
| 关系词过滤 | 通过 `runtimeKnowledge` 自动生效 | RelationalTermEntry 有数据 | 数据就绪即开启 |
| NamePatternRule | 通过 `runtimeKnowledge` 自动生效 | 规则入库 + 正则校验通过 | 数据就绪即开启 |

## 7.9 文档同步机制

**原则**: 每个实施任务的 prd.md 中必须标注"是否需要同步文档"。

**同步触发条件**:
1. 新增/修改了 Persona 字段 → 更新 `persona-field-spec.md`
2. 新增/修改了过滤规则 → 更新 `persona-parse-merge-rules.md`
3. 新增/修改了审核流 → 更新 `persona-review-flow.md`
4. 新增/修改了角色类型 → 更新 `persona-entity-types.md`

**责任**: 实施任务的 Codex agent 在完成代码修改后，必须同步更新对应 spec 文档。

---

# 8. 修订后的 Trellis 执行任务清单（给 Codex）

## Phase 0: 文档与规范 (P0)

### Task 0.1: 创建人物规范文档

- **标题**: 创建人物实体/字段/规则/审核流规范文档
- **目标**: 建立全套人物解析规范，作为后续所有实施任务的依据
- **涉及目录**: `docs/spec/`
- **涉及文件**:
  - `docs/spec/persona-entity-types.md`（新建）
  - `docs/spec/persona-field-spec.md`（新建）
  - `docs/spec/persona-parse-merge-rules.md`（新建）
  - `docs/spec/persona-review-flow.md`（新建）
  - `docs/spec/unified-parsing-rules.md`（新建）
- **具体要求**: 内容对应本文档第 5、6 节
- **删除旧逻辑**: 否
- **新增测试**: 否
- **同步文档**: 本任务本身即是文档
- **验收标准**: 5 个文件存在且内容完整，与方案文档口径一致
- **优先级**: P0（最高，其他任务的前置依据）
- **风险**: 无
- **前置依赖**: 无

---

## Phase 1: DB Schema 与数据迁移 (P0)

### Task 1.1: Prisma Schema 新增 3 张表 + 扩展 ExtractionRule

- **标题**: 知识库表扩展 — HistoricalFigureEntry / RelationalTermEntry / NamePatternRule
- **目标**: 新增 3 张知识库表，扩展 ExtractionRule 4 种 ruleType，扩展 GenericTitleEntry 2 个字段
- **涉及目录**: `prisma/`
- **涉及文件**:
  - `prisma/schema.prisma` — 新增 3 个 model + 修改 GenericTitleEntry
- **涉及关键类型**: `HistoricalFigureEntry`、`RelationalTermEntry`、`NamePatternRule`、`GenericTitleEntry`
- **具体修改**:
  1. 新增 `HistoricalFigureEntry` model（含 category 增加 STATESMAN）
  2. 新增 `RelationalTermEntry` model
  3. 新增 `NamePatternRule` model
  4. `GenericTitleEntry` 新增 `exemptInBooks String[] @default([])`、`category String? @db.VarChar(30)`
  5. 在 `BookType` model 中增加对新表的 relation
- **删除旧逻辑**: 否
- **新增测试**: 否（schema 层无需单测）
- **同步文档**: 更新 `persona-field-spec.md` 中的字段说明
- **验收标准**: `npx prisma migrate dev` 成功，3 张新表创建，GenericTitleEntry 新字段存在
- **优先级**: P0
- **风险**: Prisma migration 与现有 migration 冲突 → 需确认 migration 顺序
- **前置依赖**: 无

### Task 1.2: 删除 Book.genre 字段

- **标题**: Book.genre 字段移除
- **目标**: Prisma schema 移除 `genre` 字段，新增 migration 删除列，全局替换代码引用
- **涉及目录**: `prisma/`、`src/`
- **涉及文件**:
  - `prisma/schema.prisma` — 移除 Book model 的 `genre` 字段
  - `src/app/admin/books/import/page.tsx`
  - `src/app/api/books/route.ts`
  - `src/server/modules/books/createBook.ts`
  - `src/server/modules/analysis/services/ChapterAnalysisService.ts`
  - `src/generated/prisma/**`（由 Prisma regenerate 自动更新）
- **涉及关键函数**: `handleCreateBook()`、`POST()`、`createBook()`、`resolveBookLexiconConfig()`（删除）
- **具体修改**:
  1. `prisma/schema.prisma`: Book model 删除 `genre String?` 行
  2. 新增 Prisma migration
  3. 所有 `book.genre` → `book.bookType?.key ?? null`
  4. 导入表单链路 `genre` 参数改为 `bookTypeId` / `bookTypeKey`
  5. 所有 `genre:` 在 Prisma query 和 API schema 中的引用移除
- **删除旧逻辑**: ✅ 删除 `genre` 字段及所有引用
- **新增测试**: 否（删除字段不需新测试，但已有测试若引用 genre 需修复）
- **同步文档**: 无
- **验收标准**: `npx prisma migrate dev` 成功，全局无 `book.genre` 引用，编译通过
- **优先级**: P0
- **风险**: 前端 UI 可能展示 genre → 需检查前端组件
- **前置依赖**: 无

### Task 1.3: 种子数据初始化脚本

- **标题**: init-knowledge-phase7.ts 种子数据填充
- **目标**: 将所有硬编码数据迁移到 DB，填充新增表的初始数据
- **涉及目录**: `scripts/`、`data/knowledge-base/`
- **涉及文件**:
  - `scripts/init-knowledge-phase7.ts`（新建）
  - `data/knowledge-base/historical-figures.seed.json`（新建）
  - `data/knowledge-base/relational-terms.seed.json`（新建）
  - `data/knowledge-base/name-pattern-rules.seed.json`（新建）
  - `data/knowledge-base/rulin-characters.seed.json`（新建）
  - `data/knowledge-base/sanguozhi-characters.seed.json`（新建）
  - `data/knowledge-base/xiyouji-characters.seed.json`（新建）
  - `data/knowledge-base/honglou-characters.seed.json`（新建）
  - `prisma/seed.ts` — 追加调用
- **涉及关键函数**: `initPhase7()`
- **具体修改**:
  1. 迁移 HARD_BLOCK_SUFFIXES(10) → ExtractionRule(HARD_BLOCK_SUFFIX)
  2. 迁移 DEFAULT_SOFT_BLOCK_SUFFIXES(12) → ExtractionRule(SOFT_BLOCK_SUFFIX)
  3. 迁移 UNIVERSAL_TITLE_STEMS(10) → ExtractionRule(TITLE_STEM)
  4. 迁移 DEFAULT_POSITION_STEMS(10) → ExtractionRule(POSITION_STEM)
  5. 填充 HistoricalFigureEntry ~100 条初始数据（后续 LLM 扩充到 500+）
  6. 填充 RelationalTermEntry ~80 条
  7. 填充 NamePatternRule ~15 条
  8. 修复牛布衣 aliases（D1）: 移除牛浦郎，新增独立牛浦郎条目
  9. classical-names.ts 5 个类型数据 → seed JSON
  10. 新增泛称写入 GenericTitleEntry（~50 条新增）
- **删除旧逻辑**: 否（此任务只做数据迁移，代码删除在 Task 2.1）
- **新增测试**: 验证脚本可重复执行（upsert），不报错
- **同步文档**: 无
- **验收标准**: 脚本执行后各表数据量: GenericTitleEntry≥110, SurnameEntry≥198, ExtractionRule≥54, HistoricalFigureEntry≥100, RelationalTermEntry≥80, NamePatternRule≥15
- **优先级**: P0
- **风险**: 数据质量 → 需人工抽检种子数据
- **前置依赖**: Task 1.1

---

## Phase 2: 核心服务层 (P0)

### Task 2.1: loadFullRuntimeKnowledge() 实现

- **标题**: 运行时知识一次加载服务
- **目标**: 实现 `loadFullRuntimeKnowledge()`，从 DB 一次加载全部知识到内存
- **涉及目录**: `src/server/modules/knowledge/`
- **涉及文件**:
  - `src/server/modules/knowledge/load-book-knowledge.ts` — 新增/扩展
- **涉及关键接口**: `FullRuntimeKnowledge`、`loadFullRuntimeKnowledge()`、`getOrLoadKnowledge()`
- **具体修改**:
  1. 定义 `FullRuntimeKnowledge` 接口（含 lexiconConfig, aliasLookup, historicalFigures, relationalTerms, namePatternRules, hardBlockSuffixes, softBlockSuffixes, titlePattern, positionPattern）
  2. 实现 `loadFullRuntimeKnowledge(bookId, bookTypeKey, prisma)` — 7 步加载
  3. 实现 `getOrLoadKnowledge()` 缓存包装 — bookId 级缓存
  4. 正则编译: namePatternRules 编译为 `RegExp`，含 D9 安全校验
  5. titleStems/positionStems → 编译为 `RegExp`
- **删除旧逻辑**: 否
- **新增测试**: ✅ 单元测试: mock DB → 验证加载结果结构、缓存命中、正则编译
- **同步文档**: 无
- **验收标准**: 函数可正确加载全部知识类型，缓存命中率 100%（第二次调用），正则编译通过 D9 校验
- **优先级**: P0
- **风险**: 大量 DB 查询一次执行可能慢 → 使用 Promise.all 并行查询
- **前置依赖**: Task 1.1, Task 1.3

### Task 2.2: 删除硬编码常量文件

- **标题**: 删除 lexicon.ts 硬编码常量 + classical-names.ts + GENRE_PRESETS
- **目标**: 移除所有硬编码词表/规则，DB 成为唯一数据源
- **涉及目录**: `src/server/modules/analysis/config/`
- **涉及文件**:
  - `src/server/modules/analysis/config/lexicon.ts` — 删除 10 个常量导出
  - `src/server/modules/analysis/config/classical-names.ts` — **删除整个文件**
  - `src/server/modules/analysis/config/pipeline.ts` — 删除 `GENRE_PRESETS`
- **涉及关键函数/常量**:
  - 删除: `SAFETY_GENERIC_TITLES`, `DEFAULT_GENERIC_TITLES`, `HARD_BLOCK_SUFFIXES`, `DEFAULT_SOFT_BLOCK_SUFFIXES`, `UNIVERSAL_TITLE_STEMS`, `DEFAULT_POSITION_STEMS`, `CHINESE_SURNAME_LIST`, `ENTITY_EXTRACTION_RULES`, `RELATIONSHIP_EXTRACTION_RULES`
  - 删除: `SANGUO_NAMES`, `SHUIHU_NAMES`, `XIYOU_NAMES`, `HONGLOU_NAMES`, `RULIN_NAMES`, `buildAliasLookup()`, `resolveByKnowledgeBase()`
  - 删除: `GENRE_PRESETS`
- **具体修改**:
  1. `lexicon.ts`: 删除上述 9 个常量。保留接口定义（`BookLexiconConfig` 等）如仍有引用
  2. `classical-names.ts`: 删除整个文件
  3. `pipeline.ts`: 删除 `GENRE_PRESETS` 对象及其类型定义
  4. 全局搜索所有 import 以上常量/函数的文件 → 替换为从 `runtimeKnowledge` 获取
- **删除旧逻辑**: ✅ **大量删除**
- **新增测试**: 更新已有测试中引用这些常量的 mock
- **同步文档**: 更新 `persona-parse-merge-rules.md` 中的数据来源说明
- **验收标准**: 3 个文件中硬编码全部移除，编译通过，全局无对已删常量的引用
- **优先级**: P0
- **风险**: 删除后大量编译错误 → 必须先完成 Task 2.1 提供替代方案
- **前置依赖**: Task 2.1

---

## Phase 3: 解析链路改造 (P1)

### Task 3.1: PersonaResolver 集成 FullRuntimeKnowledge

- **标题**: PersonaResolver 全面接入知识库运行时数据
- **目标**: PersonaResolver.resolve() 使用 runtimeKnowledge 进行全部过滤和候选匹配
- **涉及目录**: `src/server/modules/analysis/services/`
- **涉及文件**:
  - `src/server/modules/analysis/services/PersonaResolver.ts`
- **涉及关键函数**: `resolve()`, `loadCandidates()`
- **具体修改**:
  1. `ResolveInput` 新增 `runtimeKnowledge?: FullRuntimeKnowledge`
  2. resolve() 按 6.1 节优先级顺序添加检查点:
     - safetyGenericTitles → hallucinate
     - relationalTerms（无alias绑定）→ hallucinate
     - namePatternRules(BLOCK) → hallucinate
     - defaultGenericTitles → hallucinate
     - historicalFigures → D13 判断
  3. loadCandidates() 优先查 aliasLookup
  4. 移除对硬编码常量的所有直接引用
  5. name_too_long 阈值从 10 改为 8
- **删除旧逻辑**: ✅ 移除对 lexicon.ts 常量的直接引用
- **新增测试**: ✅ ≥ 20 个测试用例覆盖每个过滤规则的命中/放行
- **同步文档**: 同步 `persona-parse-merge-rules.md`
- **验收标准**: PersonaResolver 完全依赖 runtimeKnowledge，无硬编码引用；测试覆盖全部检查点
- **优先级**: P1
- **风险**: 过滤规则误杀 → 需要豁免机制（exemptInBooks）
- **前置依赖**: Task 2.1, Task 2.2
- **标记**: **修复后开启**（除 name_too_long 阈值外，新过滤规则默认关闭）

### Task 3.2: AliasMapping 写入管线修复

- **标题**: AliasMapping 写入管线修复
- **目标**: Phase 1 roster 和 Phase 2 chunk 分析结果自动注册到 alias_mappings 表
- **涉及目录**: `src/server/modules/analysis/services/`
- **涉及文件**:
  - `src/server/modules/analysis/services/AliasRegistryService.ts`
  - `src/server/modules/analysis/services/ChapterAnalysisService.ts`
  - `src/server/modules/analysis/config/pipeline.ts`
- **涉及关键函数**: `registerAlias()`, `analyzeChapter()`
- **具体修改**:
  1. Phase 1 roster 结果自动注册 alias（source=ROSTER_DISCOVERY）
  2. Phase 2 chunk resolve 成功时注册 alias（source=CHUNK_ANALYSIS）
  3. 去重: 同一 alias 多 persona 抢注 → 保留最高 confidence
  4. 冒名场景: source=IMPERSONATION 标记
- **删除旧逻辑**: 否
- **新增测试**: ✅ 测试 alias 注册、去重、冲突处理
- **同步文档**: 无
- **验收标准**: 重新解析后 alias_mappings ≥ 50 条记录
- **优先级**: P1
- **风险**: 低置信度 alias 污染 → 设最低 confidence 阈值 0.5
- **前置依赖**: Task 2.1

### Task 3.3: PostAnalysisMerger 实现

- **标题**: 后分析实体合并器
- **目标**: 全书解析后跨章节 Persona 合并，仅 conf=1.0 自动合并，其余写入 PENDING
- **涉及目录**: `src/server/modules/analysis/services/`
- **涉及文件**:
  - `src/server/modules/analysis/services/PostAnalysisMerger.ts`（新建）
  - `src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts`
- **涉及关键函数**: `merge()`, `exactNameMatch()`, `kbDrivenMerge()`, `aliasCrossMerge()`
- **具体修改**:
  1. Tier 1 精确匹配 → confidence=1.0 → **AUTO_MERGED**
  2. Tier 2 KB 驱动 → confidence=0.85-0.95 → **PENDING**
  3. Tier 3 Alias 交叉 → confidence=0.75-0.90 → **PENDING**
  4. Tier 4/5 → TODO 标记
  5. SequentialPipeline 在 chapter loop 完成后调用
- **删除旧逻辑**: 否
- **新增测试**: ✅ 每个 tier 的合并逻辑 + PENDING/AUTO_MERGED 状态
- **同步文档**: 同步 `persona-parse-merge-rules.md` 中的合并规则章节
- **验收标准**: D3 严格执行；merge_suggestions ≥ 30 条（儒林-3）
- **优先级**: P1
- **风险**: Tier 2/3 误合并 → 但已保底为 PENDING 需人工确认
- **前置依赖**: Task 3.1, Task 3.2

### Task 3.4: Pipeline 集成 — runtimeKnowledge 传入

- **标题**: Sequential/TwoPass Pipeline runtimeKnowledge 集成
- **目标**: Pipeline 启动时加载 runtimeKnowledge，传入整个解析流程
- **涉及目录**: `src/server/modules/analysis/pipelines/`
- **涉及文件**:
  - `src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts`
  - `src/server/modules/analysis/pipelines/twopass/TwoPassPipeline.ts`
- **涉及关键函数**: `run()`, `runSequentialChapterLoop()`, `loadTwoPassRuntimeContext()`
- **具体修改**:
  1. SequentialPipeline.run(): 入口处 `knowledgeCache.delete(bookId)` 强制刷新 + `loadFullRuntimeKnowledge()`
  2. runtimeKnowledge 作为参数传入 `chapterService.analyzeChapter()`
  3. TwoPassPipeline: 相同逻辑，替换 `preloadedAliasLookup` / `preloadedLexiconConfig` 的老式加载通道，统一改为 `loadFullRuntimeKnowledge(bookId, bookTypeKey, prisma)`
  4. 移除对 `book.genre` 的引用
- **删除旧逻辑**: ✅ 删除 `buildAliasLookup(genre)` 调用
- **新增测试**: ✅ 集成测试: pipeline 启动时 runtimeKnowledge 正确加载
- **同步文档**: 无
- **验收标准**: Pipeline 零硬编码引用，runtimeKnowledge 从 DB 加载
- **优先级**: P1
- **风险**: TwoPassRuntimeContext 当前仅包含 `preloadedAliasLookup` 与 `preloadedLexiconConfig`，需平滑替换为完整 `runtimeKnowledge`
- **前置依赖**: Task 2.1, Task 2.2, Task 3.1

---

## Phase 4: 管理后台 API (P1)

### Task 4.1: 历史人物 CRUD + 批量导入 API

- **标题**: 历史人物管理后台 API
- **目标**: 提供 HistoricalFigureEntry 的 CRUD + 批量导入 + LLM 辅助生成端点
- **涉及目录**: `src/app/api/admin/knowledge/`
- **涉及文件**:
  - `src/app/api/admin/knowledge/historical-figures/route.ts`（新建）
  - `src/app/api/admin/knowledge/historical-figures/[id]/route.ts`（新建）
  - `src/app/api/admin/knowledge/historical-figures/import/route.ts`（新建）
- **涉及关键函数**: GET(list+filter), POST(create), PATCH(update), DELETE
- **具体修改**: 标准 CRUD 模式，参照现有 knowledge API 风格
- **删除旧逻辑**: 否
- **新增测试**: ✅ 每个端点 happy path + error path
- **同步文档**: 无
- **验收标准**: 全部端点可用，import 支持 JSON 批量导入
- **优先级**: P1
- **风险**: 无
- **前置依赖**: Task 1.1

### Task 4.2: 关系词 + 名字规则 CRUD API

- **标题**: 关系词 / 名字规则管理后台 API
- **目标**: 提供 RelationalTermEntry 和 NamePatternRule 的 CRUD API
- **涉及目录**: `src/app/api/admin/knowledge/`
- **涉及文件**:
  - `src/app/api/admin/knowledge/relational-terms/route.ts`（新建）
  - `src/app/api/admin/knowledge/relational-terms/[id]/route.ts`（新建）
  - `src/app/api/admin/knowledge/name-patterns/route.ts`（新建）
  - `src/app/api/admin/knowledge/name-patterns/[id]/route.ts`（新建）
  - `src/app/api/admin/knowledge/name-patterns/test/route.ts`（新建）
- **涉及关键函数**: GET, POST, PATCH, DELETE; test 端点接受 name + pattern 返回匹配结果
- **具体修改**:
  1. NamePatternRule 入库时执行 D9 正则安全校验
  2. test 端点: 接收 `{ name: string, ruleId?: string }` → 返回匹配结果
- **删除旧逻辑**: 否
- **新增测试**: ✅ CRUD + 正则校验 + test 端点
- **同步文档**: 无
- **验收标准**: 全部端点可用，正则校验拦截不安全模式
- **优先级**: P1
- **风险**: 无
- **前置依赖**: Task 1.1

---

## Phase 5: 评估体系 (P1)

### Task 5.1: 金标准数据集建立

- **标题**: 儒林外史金标准数据集（50-80条）
- **目标**: 开发者手工标注核心角色，建立评估基线
- **涉及目录**: `data/eval/`
- **涉及文件**:
  - `data/eval/goldset-rulin.v1.jsonl`（新建/扩展）
- **具体修改**: 基于审计报告标注 50-80 条，包含 canonicalName、aliases、gender、isHistorical、firstAppearChapter
- **删除旧逻辑**: 否
- **新增测试**: 否（数据文件）
- **同步文档**: 无
- **验收标准**: ≥ 50 条标注，格式符合 goldset.schema.json
- **优先级**: P1
- **风险**: 标注质量 → 需人工复核
- **前置依赖**: 无

### Task 5.2: 评估管线脚本

- **标题**: 自动评估管线 compute-metrics + check-gate
- **目标**: 可自动计算 precision/recall/F1/碎片率，实现质量门禁
- **涉及目录**: `scripts/eval/`
- **涉及文件**:
  - `scripts/eval/compute-metrics.ts`（修改/扩展）
  - `scripts/eval/check-gate.ts`（修改/扩展）
  - `package.json` — 新增 npm scripts
- **涉及关键函数**: `computeMetrics()`, `checkGate()`
- **具体修改**:
  1. 读取 goldset + DB Persona 数据
  2. 计算 precision、recall、F1、fragmentationRate、duplicateRate
  3. 门禁阈值: precision≥0.70, recall≥0.75, F1≥0.72, frag≤2.0
  4. NPM scripts: `pnpm eval:metrics`, `pnpm eval:gate`
- **删除旧逻辑**: 否
- **新增测试**: ✅ 小样本模拟输入验证计算正确性
- **同步文档**: 无
- **验收标准**: 脚本可执行，输出格式正确，门禁返回 pass/fail
- **优先级**: P1
- **风险**: 无
- **前置依赖**: Task 5.1

---

## Phase 6: 称谓解析与 LLM 仲裁 (P2)

### Task 6.1: 称谓动态解析开启

- **标题**: dynamicTitleResolution 开启 + 验证
- **目标**: 开启称谓+姓名复合解析能力
- **涉及目录**: `src/server/modules/analysis/`
- **涉及文件**:
  - `src/server/modules/analysis/config/pipeline.ts`
  - `src/server/modules/analysis/services/PersonaResolver.ts`
- **涉及关键函数**: `splitTitleAndName()`, 配置项 `dynamicTitleResolutionEnabled`
- **具体修改**:
  1. 确认代码路径完整性（是否有 if 分支跳过）
  2. 补全称谓拆分逻辑（如缺失）
  3. `dynamicTitleResolutionEnabled: true`
- **删除旧逻辑**: 否
- **新增测试**: ✅ 称谓拆分测试: "杜老爷"→{surname:"杜", title:"老爷"}
- **同步文档**: 更新 `persona-review-flow.md` 能力开关章节
- **验收标准**: 称谓解析正确处理"称谓+姓名"，评估管线无退化
- **优先级**: P2
- **风险**: 误匹配 → 评估管线验证
- **前置依赖**: Task 3.1, Task 3.2, Task 5.2
- **标记**: **修复后开启**

### Task 6.2: LLM 灰区仲裁开启

- **标题**: llmTitleArbitration 开启 + 频率限制
- **目标**: 对 0.4-0.6 置信度候选发起 LLM 仲裁
- **涉及目录**: `src/server/modules/analysis/`
- **涉及文件**:
  - `src/server/modules/analysis/config/pipeline.ts`
  - `src/server/modules/analysis/services/PersonaResolver.ts`
- **具体修改**:
  1. `llmTitleArbitrationEnabled: true`
  2. 新增 `llmArbitrationMaxCalls: 100` 频率限制
  3. 灰区范围: [0.4, 0.6]
- **删除旧逻辑**: 否
- **新增测试**: ✅ mock LLM response 验证仲裁流程 + 频率限制
- **同步文档**: 更新 `persona-review-flow.md`
- **验收标准**: 灰区候选触发 LLM 仲裁，超限时跳过
- **优先级**: P2
- **风险**: LLM 调用成本 → 频率限制控制
- **前置依赖**: Task 6.1
- **标记**: **修复后开启**

---

## 任务依赖图

```
Phase 0: [Task 0.1 文档规范]
              │
Phase 1: [Task 1.1 Schema] → [Task 1.3 种子数据]
         [Task 1.2 删Book.genre]
              │
Phase 2: [Task 2.1 loadFullRuntimeKnowledge] → [Task 2.2 删硬编码]
              │
Phase 3: [Task 3.1 Resolver集成] → [Task 3.3 PostMerger]
         [Task 3.2 AliasMapping修复]   → [Task 3.4 Pipeline集成]
              │
Phase 4: [Task 4.1 历史人物API]（可与Phase 3并行）
         [Task 4.2 关系词/规则API]
              │
Phase 5: [Task 5.1 金标准] → [Task 5.2 评估管线]
              │
Phase 6: [Task 6.1 称谓解析] → [Task 6.2 LLM仲裁] （修复后开启）
```

---

# 9. 待人工最终确认项

经过本轮收敛修订，绝大部分决策已锁定。以下事项中，仅 H2 仍需人工对推荐名单做最终审定：

| # | 问题 | 原因 | 建议 |
|---|------|------|------|
| H2 | 历史人物初始数据 100 条的最终名单 | 已可给出推荐名单，但正式入库前仍需人工审定 | 采用下方推荐名单作为 seed v0，开发者审定后入库 |

## 附录 A: 历史人物初始 100 条推荐名单（seed v0）

### EMPEROR（20）

秦始皇、汉高祖、汉文帝、汉景帝、汉武帝、汉光武帝、汉献帝、魏文帝、蜀汉昭烈帝、吴大帝、晋武帝、隋文帝、隋炀帝、唐高祖、唐太宗、武则天、宋太祖、元世祖、明太祖、清圣祖

### SAGE（15）

孔子、孟子、荀子、老子、庄子、墨子、韩非子、董仲舒、周敦颐、程颢、程颐、朱熹、王阳明、张载、王充

### POET（15）

屈原、曹植、陶渊明、王维、李白、杜甫、白居易、韩愈、柳宗元、苏轼、苏辙、李清照、陆游、辛弃疾、元好问

### GENERAL（15）

孙武、孙膑、白起、项羽、韩信、卫青、霍去病、关羽、张飞、赵云、周瑜、李靖、郭子仪、岳飞、戚继光

### STATESMAN（20）

管仲、晏婴、商鞅、李斯、张良、萧何、诸葛亮、司马懿、房玄龄、杜如晦、魏征、狄仁杰、范仲淹、包拯、王安石、司马光、寇准、于谦、张居正、林则徐

### MYTHICAL（15）

盘古、伏羲、女娲、神农、黄帝、炎帝、后羿、嫦娥、夸父、精卫、大禹、西王母、哪吒、杨戬、愚公

---

## 附录: 旧任务 PRD 修订映射

以下 8 个旧任务 PRD 需根据本轮修订更新：

| 旧任务 | 新任务映射 | 关键修订 |
|--------|-----------|----------|
| `04-12-wave1-filter-hardening` | → Task 3.1 | R1-R6 全部改为从 DB 加载，删除硬编码 RELATIONAL_TERMS Set |
| `04-12-wave2-kb-schema-extend` | → Task 1.1 + 1.3 + 2.1 | 新增 STATESMAN category；历史人物不是黑名单而是标记库 |
| `04-12-wave2-alias-mapping-fix` | → Task 3.2 | 新增 IMPERSONATION source；冒名场景处理 |
| `04-12-wave2-post-merge` | → Task 3.3 | D3 严格执行：仅 conf=1.0 AUTO_MERGED |
| `04-12-wave2-resolver-kb-integration` | → Task 3.1 + 3.4 | 合入 PersonaResolver 知识库集成 |
| `04-12-wave3-title-resolution` | → Task 6.1 | 标记"修复后开启" |
| `04-12-wave3-eval-pipeline` | → Task 5.1 + 5.2 | D10 手工标注 50-80 条 |
| `04-12-deprecate-classical-names` | → Task 2.2 | 不再 @deprecated，直接删除整个文件 |
