# 文渊 · 人物解析准确率重设计（三阶段架构）

- **发起者**：yanzhangshuai
- **触发案例**：《儒林外史》`book_id=7d822600-9107-4711-95b5-e87b3e768125` 产出 646 人物、牛浦事迹全部错归牛布衣
- **目标**：准确率优先，允许牺牲召回率；不兼容老数据（现有该书分析结果可整表丢弃重跑）
- **决策**：采纳"大改"路线——架构、数据库、Prompt 同步重设计

---

## 0. 核心原则

1. **Mention 与 Persona 解耦**：原文里每个称呼的每次出现都是 `mention`，是否晋级为 `persona` 由全书聚合决定。
2. **合并必有证据**：任意两个 surfaceForm 合并为同一 persona，必须有 ≥2 个不同章节的互相印证证据片段；否则建 MergeSuggestion 挂起。
3. **冒名即分裂**：冒名 / 借名 / 化名 / 误认场景，必须用 `alias_mappings` 独立建模，**绝不**把冒用身份写进真身 `persona.aliases`。
4. **事件归属绑真身**：biography/mention 的 `personaId` 指向真正行动者；使用身份单独记录在 `used_identity_id`。
5. **严守入库门槛**：`mention=1` 且 `biography=0` 永不建 persona，只进候选中间表。
6. **通用优先、按书分化**：架构对所有中国古典小说通用；书的风格差异通过 **BookType 系统**（阈值 + Prompt 变体 + Few-shot）分化，而非改代码。
7. ~~**高风险多采样**~~：**已废弃**（两轮反审结论：引入复杂度但对精度提升无证据，放弃）。

---

## 0-FINAL. 决策冻结清单（两轮反审后锁定 · 覆盖前文）

> 本节为所有子任务的契约基线。下文 §2 ~ §7 凡与本节冲突之处，**以本节为准**。
> 决策状态：`LOCKED` = 不可再议；`REVERSAL` = 对早期方案的推翻；`REJECTED` = 已放弃不做。

### §0.F.1 十八条锁定（LOCKED）

| 编号 | 条款 | 备注 |
|------|------|------|
| **§0-1** | **Prompt 正文白名单**：Prompt A/B/C 正文仅允许 {占位符变量、通用分类规则、enum 枚举值、schema 说明}。**禁止任何具名实体**（"牛浦""王冕"等一律不得出现）。Few-shot 通过 `BookTypeExample` 表按 `bookTypeId` 动态注入。 | 防止将答案写进题干 |
| **§0-2** | **`persona.deathChapterNo` 双源机制**：①Stage 0 正则抽取死亡标记词（`病逝\|故去\|归天\|无常\|卒\|薨\|殁\|一命呜呼\|云亡\|殒\|死于`）→ 主语候选；②Stage C 写入 `category=DEATH` 的 biography。**两源任一命中即设置；冲突时以 Stage 0 为准**（正则确定性高）。 | 不让 LLM 独家决定"谁死了" |
| **§0-3** | **时空矛盾双检**：Stage B.5 时序一致性检查器同时检查 (a) `mentionChapterNo > deathChapterNo` 的死后行动、(b) 同章节跨地点并发出场。(b) 需要 `persona.currentLocation` 字段，属 T17。 | 冒名检测主探针 |
| **§0-4** | **Stage 0 覆盖率自白**：预处理器必须输出每章节 `{narrative, poem, dialogue, commentary, unclassified}` 五段字符占比。`unclassified > 10%` 的章节打标 `preprocessorConfidence=LOW`，下游 Stage B 合并阈值 +0.05、CONFIRMED 门槛 +1。 | 防止"正则赢 LLM"的过度自信 |
| **§0-5** | **区段判定权收回**（最关键一刀）：`POEM` 区段 → `identityClaim` 强制为 `HISTORICAL` 或 `POEM_ALLUSION`；`COMMENTARY` 区段 → 强制 `REPORTED`；`DIALOGUE` 区段 **引号内被提及的第三方** → 强制 `QUOTED`。**LLM 无权在这三类区段判 SELF**。规则由代码层在 Stage A 输出后强制覆写，不依赖 LLM 自觉。 | +反校准 1 见下 |
| **§0-6** | **`biographyCount` 口径**：有效事迹数 = 满足 `narrativeLens ∈ {SELF, IMPERSONATING}` AND `narrativeRegionType = NARRATIVE` AND `rawSpan.length ≥ 15` AND `actionVerb` 非空 的 biography 条数。四条件全满足才计数。 | 防止议论/诗词段冒充事迹 |
| **§0-7** | **CONFIRMED 门槛**：`(distinctChapters ≥ 2 AND mentionCount ≥ 2) OR (effectiveBiographyCount ≥ 2 AND 其中至少 1 条 rawSpan ≥ 15 字 AND 至少 1 条 actionVerb 在 Stage 0 NARRATIVE 区段内)`。后一支允许王冕式单章完整小传通过，但强约束断路浮点 biography。 | B2 雷补强 |
| **§0-8** | **Prompt A 结构化字段**：Stage A 输出每个 mention 必填 `suspectedResolvesTo: string \| null`（长度 ≤ 8 字，遇 COURTESY_NAME/NICKNAME/TITLE 疑似指向某人时填写，否则显式 null）。作为 Stage B 候选组通道②的稳定键。 | 不接受 LLM 自由文本 |
| **§0-9** | **MERGE 充要条件**：`confidence ≥ 0.85` 是**必要非充分**条件；**充分条件 = 2 章独立 evidence AND (规则预合并 ∨ AliasEntry 知识库命中)**。不满足充分条件者一律进 `merge_suggestions PENDING`，不自动合并。 | C2 硬化 |
| **§0-10** | **Gold set 规模**：≥ 350 条 = 150 真角色 + 150 噪声 + 50 边缘歧义。Stage A `identityClaim` 分层抽样：SELF / IMPERSONATING / QUOTED / REPORTED / HISTORICAL 五类各 ≥ 20 条（非自然分布）。 | A6 扩容 |
| **§0-11** | **CANDIDATE 桶 KPI**：《儒林外史》重跑后 CANDIDATE ≤ 200 合格 / 200–300 观察 / > 300 管线回炉。写入 T16 rerun-and-verify 验收。 | B4 雷补强 |
| **§0-12** | **BookType 系统全量做**：Book.type enum、`Book.type` 字段、`PromptTemplateVariant` / `BookTypeExample` 两张表、`thresholdsByBookType` 阈值映射本轮**全部建立并启用**。不再延后。 | 用户"都做"决策 |
| **§0-13** | **Feature flag 分两次 PR**：`ANALYSIS_PIPELINE=twopass \| threestage` 仅作紧急降级开关，**不是双活**。PR-1：schema + threestage 写路径上线（默认读路径仍走 twopass）；PR-2：读路径切换 threestage。T16 验收通过后合并 PR-2。 | C4 归 A 区 |
| **§0-14** | **Stage C → B 反馈通道**：Stage C 发现 IMPERSONATING / 时空矛盾时，写入 `merge_suggestions` (status=PENDING, source=STAGE_C_FEEDBACK)，**下一次 job 运行时 Stage B 消费**。**禁止运行时回环重跑** Stage B。 | 防死循环 |
| **§0-15** | **枚举裁剪 / 扩展最终集合**（本轮 BookType 全量做，枚举保持完整不缩）：<br>· **AliasType** (13): `NAMED / COURTESY_NAME / NICKNAME / TITLE / POSITION / KINSHIP / IMPERSONATED_IDENTITY / MISIDENTIFIED_AS / DHARMA_NAME / POSTHUMOUS_TITLE / GENERATIONAL / TRANSFORMATION / UNSURE`<br>· **NarrativeLens** (9): `SELF / IMPERSONATING / QUOTED / REPORTED / HISTORICAL / POEM_ALLUSION / TRANSFORMED / DREAM / UNSURE`<br>· **IdentityClaim** (7): `SELF / IMPERSONATING / QUOTED / REPORTED / HISTORICAL / POEM_ALLUSION / UNSURE` | 支撑水浒/西游/红楼 |
| **§0-16** | **T14 twopass 基线独立启动**：基于当前 twopass 架构跑一次完整评测，**不依赖 T01 schema 迁移**，产出"twopass 基线 precision" 数字作为三阶段达标对照基准。可与 T01 并行启动。 | 独立交付物 |
| **§0-17** | **AliasEntry 冷启动审计**：T15 alias-entry-audit **必须**先跑 `SELECT COUNT(*) FROM alias_entries WHERE bookId='儒林外史'`。若 < 30 条，T15 必须人工 seed ≥ 50 条核心字 / 号 / 尊称映射（王冕→贯索犯文昌；周进→周学道；范进→范举人 等）。否则三通道候选组退化为两通道。 | 防空任务 |
| **§0-18** | **反审结论归档**：最终计数 = 接受 11 条 / 打折接受 4 条 / 真反驳 2 条（C1 Stage B.5 真纠错 + C2 confidence 否决门槛）/ 伪反驳被反将 2 条（C3 AliasEntry 现状 + C4 flag 归 A 区）。 | 审计凭据 |

### §0.F.2 反校准（REVERSAL）

| 编号 | 校准 | 说明 |
|------|------|------|
| **REV-1** | **§0-5 DIALOGUE 区段细分**：区分"引入句主语"与"引文内容"。`XX 道："..."` 中引入句主语 XX 仍可判 `SELF`；引号内被提及的第三方 → `QUOTED`；引号内自称 "我是 XX" 允许 SELF 但 evidence 必须覆盖引入句主语（即外部叙述者承认 XX 是说话者）。规则层实现，非 LLM 裁量。 | 防止"老子姓赵"式自称被全盘 QUOTED |
| **REV-2** | **§0-3 (b) 跨地点并发降级**：独立任务 T17 (`cross-location-concurrent`)，需要新增 `persona.currentLocation` 时序字段与 Stage 0 地点抽取。**不阻塞** T13 (Stage B.5)；T13 首版只做 (a) 死后行动。T17 完成后 Stage B.5 升级启用 (b)。 | 解耦降低 T13 复杂度 |

### §0.F.3 已放弃（REJECTED · 不做）

| 编号 | 项 | 放弃原因（两轮反审结论） |
|------|----|--------------------|
| **REJ-1** | `PersonaEpoch`（人物分身期） | 解决罕见问题但引入全链路复杂度，投入产出比极低 |
| **REJ-2** | `multiSampleHighRisk`（高风险多次采样一致性投票） | 无证据证明对精度有提升；API 成本 3×；与 §0-9 MERGE 充要条件功能重叠 |
| **REJ-3** | `Prompt D` (`STAGE_B_NOISE_FILTER` 专项提示) | 违反 §0-1 白名单；等效效果由 §0-7 CONFIRMED 门槛 + Stage B 合并规则覆盖 |

### §0.F.4 最终任务拓扑（17 项 + 伞 = 18 个 Trellis 任务 · 不区分 MVP）

```
Phase-0 基线（与主线并行，不阻塞）
  T14  twopass-baseline-evaluation           [独立] → 交付基线 precision 数字
  T15  alias-entry-audit-seed                [独立] → seed ≥50 条儒林 AliasEntry

Phase-1 结构改造
  T01  schema-migration                      [根] → enum(13/9/7) + 5 核心 schema 变更
  T12  chapter-preprocessor-stage-0          [依赖 T01] → 四区段 + 覆盖率 + 死亡标记
  T17  cross-location-extraction (REV-2)     [依赖 T12] → persona.currentLocation + 地点抽取

Phase-2 Prompt & 通用化底座
  T02  prompt-baselines                      [依赖 T01] → Prompt A/B/C + §0-1 白名单 + §0-8 suspectedResolvesTo
  T10  booktype-system                       [依赖 T01] → Book.type + PromptTemplateVariant + 阈值映射
  T11  universal-fewshot-library             [依赖 T10] → BookTypeExample + ≥5 BookType × 3 stage

Phase-3 三阶段管线
  T03  stage-a-extractor                     [依赖 T02, T12] → Stage A
  T13  stage-b5-temporal-consistency         [依赖 T03] → 时序检查器 (死后行动)；T17 后升级加跨地点
  T04  stage-b-resolver                      [依赖 T03, T13, T15] → 三通道候选组 + §0-9 MERGE 充要
  T05  stage-c-attribution                   [依赖 T04] → §0-5 区段判定权收回 + §0-14 merge_suggestions 反馈

Phase-4 UI
  T06  candidate-readonly-ui (原 lifecycle-ui)        [依赖 T04] → CANDIDATE 桶只读列表
  T07  impersonation-review-ui (原 alias-mapping-ui)  [依赖 T05] → 冒名 / 合并建议审核 UI

Phase-5 评测 & 回归
  T16  gold-set-annotation                   [依赖 T14] → 儒林 350 条分层标注
  T08  regression-fixtures                   [依赖 T10] → 5 BookType × 场景（无作弊提示）
  T09  rerun-and-verify                      [依赖 T05, T06, T07, T08, T11, T16] → 重跑 + gold 评测 + CANDIDATE KPI 验收
```

**依赖图关键路径**（阻塞最长链）：
`T01 → T02 → T03 → T13 → T04 → T05 → T07 → T09`（共 8 步）

**PR 合并顺序**（§0-13 两次 PR）：
- PR-1 合并范围：T01 + T10 + T11 + T12 + T02 + T03 + T13 + T04 + T05 + T15（写路径，读仍 twopass）
- PR-2 合并范围：T06 + T07 + T08 + T09 + T14 + T16 + T17 + 读路径切换

### §0.F.5 退役任务（Trellis 中已存在但需重写/删除）

| 原 slug | 处置 | 新定义 |
|---------|------|--------|
| `04-17-char-ext-06-lifecycle-ui` | **重命名+重写** | → T06 `candidate-readonly-ui`（只读、无晋级交互） |
| `04-17-char-ext-07-alias-mapping-ui` | **重写** | → T07 `impersonation-review-ui`（冒名审核 + MergeSuggestion 审核合并） |
| 无 | **新建** 6 项 | T12 / T13 / T14 / T15 / T16 / T17 |

---

## 1. 问题根因（扼要）

### 1.1 代码层根因

| 优先级 | 代码位置 | 问题 |
|---|---|---|
| P0 | `GlobalEntityResolver.ts::buildCandidateGroups` (L221–246) | 同姓 + allNames 交集 = 无证据自动合并 |
| P0 | `GlobalEntityResolver.ts::resolveGlobalEntities` (L410–427) | 不合并组的 aliases 仍采纳全部 allNames → 污染落库 |
| P0 | `prompts.ts::buildIndependentExtractionRulesText` (L213–231) | 指示 LLM"一人一条记录，多称谓放 aliases"——冒名场景必然错 |
| P0 | `schema.prisma::Persona.aliases` (L240) | `String[]` 无语义，承载不了 TITLE/IMPERSONATED 差异 |
| P1 | `runAnalysisJob.ts::markOrphanPersonas` (L298-314) | 只降 confidence 不隔离，UI 仍展示 |
| P1 | `AliasMapping` 子系统完全未被 twopass 使用（本书 0 行） |
| P1 | `BiographyRecord` 只有 `personaId`，无 `actor_role / used_identity / evidence_span` |

### 1.2 数据层证据（《儒林外史》一次 twopass 任务产出）

| 指标 | 值 |
|---|---:|
| Persona 总数（有 profile） | **646** |
| confidence = 0.4（mention<2 孤儿降级） | **488 (75.5%)** |
| 无任何 mention 的 persona | **335 (51.9%)** |
| 无任何 biography 的 persona | **460 (71.2%)** |
| 仅出现于 1 章的 persona | 164 |
| alias_mappings 本书行数 | **0** |

牛浦/牛布衣实证：
- `牛布衣 persona.aliases` = `[牛布衣, 年老幕客, 牛先生, 牛相公, 牛高士, 居士, **牛浦郎, 牛浦, 浦郎**, 小檀越, **牛姑爷**, **牛生员**, **侄孙**, 牛布衣先生]`
- 存在独立残留 `牛浦郎 conf=0.4 aliases=[牛浦]`
- 第 21–24 回全部牛浦事迹（偷诗稿、成亲、刻图书谎称、扬州、苏州、安东招赘）→ 挂在 `牛布衣.id` 下

---

## 2. 新架构：三阶段 + 候选分层

```
Book → Chapter
   │
   ▼
[Stage A · 章节硬提取]  (逐章并发，保守)
   输入: 全章正文
   输出: ChapterMention[]  — 每个称呼的每次关键出现
         { surfaceForm, aliasType, identityClaim, actionVerb,
           rawSpan, spanOffset, contextHint, confidence }
   禁止: 合并称呼、推断真名、生成 aliases
   写入: analysis_llm_raw_outputs + persona_mention_candidates（暂存）
   │
   ▼
[Stage B · 全书实体仲裁]  (一次全局)
   输入: 所有 ChapterMention[]
   处理:
     1) 聚合 surface→evidence，计算 mention_count / distinct_chapters / biography_seed
     2) 规则预分组（精确同名/知识库 AliasEntry 命中）→ 直接成 persona
     3) 疑似同一人（同姓+证据交叠）→ 送 LLM 仲裁 (Prompt B)
        必须返回 evidence[{chapterNo,span}]，否则拒绝合并
     4) 若 LLM 判 SPLIT 且包含 IMPERSONATED/MISIDENTIFIED →
        创建 N 个独立 persona + N-1 条 alias_mappings (aliasType=IMPERSONATED_IDENTITY)
     5) 噪声过滤 (Prompt D)：mention_count=1 且无 biography seed → 不建 persona
   输出:
     - personas (lifecycle_status=CONFIRMED|CANDIDATE)
     - alias_mappings (激活，带 target_persona_id)
     - merge_suggestions (置信 < 0.85 或证据 < 2 条的全部挂起)
   │
   ▼
[Stage C · 章节事件归属]  (逐章并发，使用 Stage B 产出的 persona 图)
   输入: 章节正文 + Stage B persona 列表 + alias_mappings
   处理:
     对每条候选 biography / mention 调 Prompt C:
       判定 actorTrueIdentity / actorUsedIdentity / actorRole
         (SELF|IMPERSONATING|QUOTED|REPORTED|HISTORICAL)
       HISTORICAL/QUOTED → 不进主时间轴，仅进 mention 旁注
       IMPERSONATING → personaId=真身, used_identity_id=被冒名身份
   输出: mentions / biography_records / relationships（带 evidence_span）
   │
   ▼
[入库门槛校验] (Stage B 内完成，Stage C 前置)
   CONFIRMED 条件（全部满足）:
     • distinct_chapters ≥ 2 或 biography_count ≥ 1
     • mention_count ≥ 3
     • 有 ≥1 条 biography 能与 rawText 做子串命中
     • 不是纯泛称/数量词/纯职位
   否则 → lifecycle_status='CANDIDATE'，UI 审核视图独立 Tab
```

---

## 3. 数据库重设计（直接迁移，不兼容老数据）

### 3.1 enum 扩展

```prisma
enum AliasType {
  NAMED                    // 真名（同一人的不同名字：牛浦/牛浦郎/浦郎）
  COURTESY_NAME            // 字（诸葛孔明的"孔明"）
  PEN_NAME                 // 号（东坡居士、青莲居士）
  NICKNAME                 // 绰号（及时雨、豹子头）
  DHARMA_NAME              // 法号/道号（三藏、孙行者、一清）
  POSTHUMOUS_TITLE         // 谥号/追封（武圣、关云长→汉寿亭侯）
  TITLE                    // 尊称/封号（老祖宗、太君）
  POSITION                 // 官职/职位（押司、知府、丞相）
  KINSHIP                  // 亲属代称（侄孙、表叔、姨妈）
  GENERATIONAL             // 辈分泛称（二爷、三奶奶、老太太）—— 必须场景消歧
  IMPERSONATED_IDENTITY    // 恶意冒用：personaId=真身，target_persona_id=被冒名者
  TRANSFORMATION           // 神魔变化/出家前后（孙悟空→行者；玄奘→三藏；白骨精→村姑）
  MISIDENTIFIED_AS         // 误认身份：personaId=真身，target_persona_id=被误认为者
}

enum PersonaLifecycle {
  CONFIRMED     // 已确认正式角色
  CANDIDATE     // 候选（入不了主库，审核可见）
  NOISE         // 明确噪声（通常不写，直接不建 persona）
  MERGED_INTO   // 已被合并到别的 persona
}

/// NarrativeLens：原 ActorRole 扩展，区分叙事透镜
enum NarrativeLens {
  SELF                // 真身亲历
  IMPERSONATING       // 冒用他人身份行动
  TRANSFORMED         // 变化形态行动（非恶意）
  QUOTED              // 他人对白转述
  REPORTED            // 叙述者回忆/追溯
  HISTORICAL          // 历史人物/典故引用
  DREAM               // 梦境/幻境（红楼太虚幻境）
  PLAY_WITHIN_PLAY    // 戏中戏 / 书中书
  POEM_ALLUSION       // 诗词用典
}

enum IdentityClaim {
  SELF
  IMPERSONATING
  TRANSFORMED
  QUOTED
  REPORTED
  HISTORICAL
  DREAM
  UNSURE
}

/// BookType：决定阈值 / Prompt 变体 / Few-shot 集
enum BookType {
  SATIRICAL         // 讽刺小说：儒林外史、官场现形记
  HEROIC            // 侠义小说：水浒传、三侠五义
  HISTORICAL        // 历史演义：三国演义、东周列国志
  MYTHOLOGICAL      // 神魔小说：西游记、封神演义
  DOMESTIC          // 世情小说：红楼梦、金瓶梅
  ROMANTIC          // 才子佳人：西厢记、牡丹亭
  DETECTIVE         // 公案小说：包公案、施公案
  NOTE_STYLE        // 笔记体：聊斋志异、阅微草堂笔记
  GENERIC           // 未分类兜底
}
```

### 3.2 persona 表改造

```prisma
model Persona {
  // 已有字段保留
  // ...
  lifecycleStatus       PersonaLifecycle @default(CANDIDATE) @map("lifecycle_status")
  mergedIntoId          String?          @map("merged_into_id") @db.Uuid
  mentionCount          Int              @default(0) @map("mention_count")
  distinctChapterCount  Int              @default(0) @map("distinct_chapter_count")
  biographyCount        Int              @default(0) @map("biography_count")
  firstSeenChapter      Int?             @map("first_seen_chapter")
  lastSeenChapter       Int?             @map("last_seen_chapter")

  // 废弃:
  // aliases String[]  ← 彻底移除。所有别名走 alias_mappings
  @@index([lifecycleStatus, deletedAt], map: "persona_lifecycle_idx")
}
```

> **重大设计决策**：**`Persona.aliases String[]` 字段删除**。所有别名语义走 `alias_mappings`。这样 UI/API 查询时需要 join，但换回了：(a) 每个别名有类型；(b) 有证据；(c) 有 status；(d) 冒名关系可直接建模。

### 3.3 alias_mappings 重塑（成为一等公民）

```prisma
model AliasMapping {
  id               String             @id @default(uuid()) @db.Uuid
  bookId           String             @map("book_id") @db.Uuid
  personaId        String             @map("persona_id") @db.Uuid  // ← 改为 NOT NULL
  alias            String
  aliasType        AliasType          @map("alias_type")
  targetPersonaId  String?            @map("target_persona_id") @db.Uuid
    // aliasType=IMPERSONATED_IDENTITY/MISIDENTIFIED_AS 时指向"被冒名/被误认者"
  resolvedName     String?            @map("resolved_name")
  confidence       Float              @default(0)
  evidence         String?            @db.Text
  evidenceChapterNos Int[]            @default([]) @map("evidence_chapter_nos")
  status           AliasMappingStatus @default(PENDING)
  chapterStart     Int?               @map("chapter_start")
  chapterEnd       Int?               @map("chapter_end")
  createdAt        DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime           @updatedAt @map("updated_at") @db.Timestamptz(6)

  book           Book     @relation(fields: [bookId],          references: [id], onDelete: Cascade)
  persona        Persona  @relation("AliasPrimary",   fields: [personaId],       references: [id], onDelete: Cascade)
  targetPersona  Persona? @relation("AliasTarget",    fields: [targetPersonaId], references: [id], onDelete: SetNull)

  @@unique([bookId, alias, personaId, aliasType], map: "alias_unique_per_persona")
  @@index([bookId, alias])
  @@index([bookId, personaId])
  @@index([bookId, targetPersonaId])
}
```

### 3.4 biography_records 改造

```prisma
model BiographyRecord {
  // 已有字段保留
  personaId              String         @map("persona_id") @db.Uuid  // 语义=真正行动者
  actorUsedIdentityId    String?        @map("actor_used_identity_id") @db.Uuid
  narrativeLens          NarrativeLens  @default(SELF) @map("narrative_lens")
  epochId                String?        @map("epoch_id") @db.Uuid
  sceneContextHint       String?        @map("scene_context_hint")     // ≤30字，场景绑定
  evidenceRaw            String?        @map("evidence_raw") @db.Text
  evidenceSpanStart      Int?           @map("evidence_span_start")
  evidenceSpanEnd        Int?           @map("evidence_span_end")
  confidence             Float          @default(1.0)

  usedIdentity Persona?       @relation("BiographyUsedIdentity",
                                         fields: [actorUsedIdentityId], references: [id], onDelete: SetNull)
  epoch        PersonaEpoch?  @relation(fields: [epochId], references: [id], onDelete: SetNull)
  @@index([narrativeLens, personaId], map: "biography_lens_idx")
  @@index([epochId])
}
```

> `narrativeLens=DREAM|PLAY_WITHIN_PLAY|POEM_ALLUSION|HISTORICAL|QUOTED` 默认不计入主时间轴查询；REPORTED 可选计入（后处理开关）。

### 3.5 mentions 改造

```prisma
model Mention {
  // 已有字段保留
  surfaceForm       String        @map("surface_form")
  aliasUsageType    AliasType     @map("alias_usage_type")
  identityClaim     IdentityClaim @default(SELF) @map("identity_claim")
  sceneContextHint  String?       @map("scene_context_hint")            // ≤30字
  spanStart         Int?          @map("span_start")
  spanEnd           Int?          @map("span_end")
}
```

### 3.6 新增中间表

```prisma
/// 章节级原始 mention 候选池，Stage A 产出，Stage B 聚合使用
model PersonaMentionCandidate {
  id                 String        @id @default(uuid()) @db.Uuid
  bookId             String        @map("book_id") @db.Uuid
  chapterId          String        @map("chapter_id") @db.Uuid
  chapterNo          Int           @map("chapter_no")
  jobId              String?       @map("job_id") @db.Uuid

  surfaceForm        String        @map("surface_form")
  aliasTypeHint      AliasType     @map("alias_type_hint")
  identityClaim      IdentityClaim @default(UNSURE) @map("identity_claim")
  actionVerb         String?       @map("action_verb")
  rawSpan            String        @map("raw_span")
  spanStart          Int?          @map("span_start")
  spanEnd            Int?          @map("span_end")
  contextHint        String?       @map("context_hint")
  sceneContextHint   String?       @map("scene_context_hint")
  confidence         Float         @default(0)

  promotedPersonaId  String?       @map("promoted_persona_id") @db.Uuid
  createdAt          DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)

  book    Book     @relation(fields: [bookId],    references: [id], onDelete: Cascade)
  chapter Chapter  @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  persona Persona? @relation(fields: [promotedPersonaId], references: [id], onDelete: SetNull)

  @@index([bookId, surfaceForm])
  @@index([bookId, chapterNo])
  @@index([bookId, promotedPersonaId])
  @@map("persona_mention_candidates")
}

/// LLM 原始产出缓存 — 回溯 / 离线调 Prompt 必备
model AnalysisLlmRawOutput {
  id           String   @id @default(uuid()) @db.Uuid
  jobId        String   @map("job_id") @db.Uuid
  stage        String                            // STAGE_A | STAGE_B | STAGE_C | STAGE_D
  chapterId    String?  @map("chapter_id") @db.Uuid
  chapterNo    Int?     @map("chapter_no")
  promptHash   String   @map("prompt_hash")
  rawResponse  String   @db.Text
  parsedJson   Json?    @map("parsed_json")
  tokenUsage   Json?    @map("token_usage")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  job     AnalysisJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  chapter Chapter?    @relation(fields: [chapterId], references: [id], onDelete: SetNull)

  @@index([jobId, stage])
  @@index([chapterId, stage])
  @@map("analysis_llm_raw_outputs")
}
```

### 3.7 通用化表（BookType / Epoch / Prompt 变体 / Few-shot）

```prisma
/// 书籍表追加字段
model Book {
  // 已有字段保留
  type                   BookType  @default(GENERIC)
  // type 可由创建者手动选择，也可由 AI 分类器自动识别
}

/// 人物时间分期：解决"一人多阶段事迹"
/// 例：宋江(郓城押司 1-17回 / 落草 18-71回 / 招安后 72-120回)
///    孙悟空(石猴 / 美猴王 / 齐天大圣 / 行者 / 斗战胜佛)
///    匡超人(孝子农家子 / 官场堕落期)
model PersonaEpoch {
  id              String     @id @default(uuid()) @db.Uuid
  personaId       String     @map("persona_id") @db.Uuid
  epochName       String     @map("epoch_name")        // "郓城押司" / "落草期" / "招安后"
  primaryAlias    String?    @map("primary_alias")      // 该 epoch 最常用称呼
  chapterStart    Int        @map("chapter_start")
  chapterEnd      Int        @map("chapter_end")
  summary         String?    @db.Text
  createdAt       DateTime   @default(now()) @map("created_at") @db.Timestamptz(6)

  persona     Persona          @relation(fields: [personaId], references: [id], onDelete: Cascade)
  biographies BiographyRecord[]

  @@unique([personaId, epochName])
  @@index([personaId, chapterStart])
  @@map("persona_epochs")
}

/// Prompt 模板按 BookType 变体：每个 stage 可有 N 个变体
/// 变体内容会替换 Prompt 主体中的 {{bookTypeSpecialRules}} / {{bookTypeFewShots}} 占位符
model PromptTemplateVariant {
  id              String   @id @default(uuid()) @db.Uuid
  templateSlug    String   @map("template_slug")   // STAGE_A_EXTRACT_MENTIONS / STAGE_B_RESOLVE_ENTITIES / STAGE_C_ATTRIBUTE_EVENT / STAGE_D_NOISE_FILTER
  bookType        BookType @map("book_type")
  specialRules    String   @map("special_rules") @db.Text
  fewShotsJson    Json?    @map("few_shots_json")     // 见 book_type_examples，也可直接内联
  active          Boolean  @default(true)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([templateSlug, bookType])
  @@index([bookType])
  @@map("prompt_template_variants")
}

/// BookType 级别的 few-shot 示例集合，运行时拼接进 Prompt
model BookTypeExample {
  id              String   @id @default(uuid()) @db.Uuid
  bookType        BookType @map("book_type")
  stage           String                               // STAGE_A | STAGE_B | STAGE_C
  label           String                               // "冒名识别" / "同姓分裂" / "KINSHIP消歧"
  exampleInput    String   @map("example_input") @db.Text
  exampleOutput   String   @map("example_output") @db.Text
  note            String?  @db.Text
  priority        Int      @default(0)                 // 拼接顺序
  active          Boolean  @default(true)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([bookType, stage, priority])
  @@map("book_type_examples")
}
```

### 3.8 按 BookType 的阈值配置（代码侧，不落库）

```ts
// src/server/modules/analysis/config/pipeline-by-booktype.ts
export const thresholdsByBookType: Record<BookType, PipelineThresholds> = {
  SATIRICAL:    { minMentions: 3, minDistinctChapters: 2, sameSurnameDefaultSplit: true,  kinshipStrictMode: false, transformationEnabled: false, multiSampleHighRisk: true },
  HEROIC:       { minMentions: 2, minDistinctChapters: 1, sameSurnameDefaultSplit: false, kinshipStrictMode: false, transformationEnabled: false, multiSampleHighRisk: true  },
  HISTORICAL:   { minMentions: 3, minDistinctChapters: 2, sameSurnameDefaultSplit: true,  kinshipStrictMode: false, transformationEnabled: false, multiSampleHighRisk: true  },
  MYTHOLOGICAL: { minMentions: 2, minDistinctChapters: 1, sameSurnameDefaultSplit: true,  kinshipStrictMode: false, transformationEnabled: true,  multiSampleHighRisk: true  },
  DOMESTIC:     { minMentions: 4, minDistinctChapters: 2, sameSurnameDefaultSplit: true,  kinshipStrictMode: true,  transformationEnabled: false, multiSampleHighRisk: true  },
  ROMANTIC:     { minMentions: 2, minDistinctChapters: 1, sameSurnameDefaultSplit: false, kinshipStrictMode: false, transformationEnabled: false, multiSampleHighRisk: false },
  DETECTIVE:    { minMentions: 3, minDistinctChapters: 2, sameSurnameDefaultSplit: true,  kinshipStrictMode: false, transformationEnabled: false, multiSampleHighRisk: false },
  NOTE_STYLE:   { minMentions: 2, minDistinctChapters: 1, sameSurnameDefaultSplit: true,  kinshipStrictMode: false, transformationEnabled: true,  multiSampleHighRisk: false },
  GENERIC:      { minMentions: 3, minDistinctChapters: 2, sameSurnameDefaultSplit: true,  kinshipStrictMode: true,  transformationEnabled: true,  multiSampleHighRisk: true  },
};
```

字段含义：
- `sameSurnameDefaultSplit`：同姓默认 SPLIT。水浒 108 将重名少、绰号丰富 → false；三国同姓多 → true
- `kinshipStrictMode`：KINSHIP / GENERATIONAL 泛称（二爷、老太太）强制结合 sceneContextHint 消歧 → 红楼必开
- `transformationEnabled`：启用 TRANSFORMATION aliasType → 神魔小说开启
- `multiSampleHighRisk`：高风险 group 多采样（≥3 成员同姓族 / KINSHIP / 疑似冒名）→ 除 ROMANTIC/DETECTIVE 外默认开

---

## 4. Prompt 设计（四条，中文古典小说场景，入 prompt_template_baselines）

### 4.1 Prompt A · `STAGE_A_EXTRACT_MENTIONS` — 章节硬提取

```
你在解析中文古典小说《{{bookTitle}}》({{bookTypeLabel}}) 第 {{chapterNo}} 回 {{chapterTitle}} 的原文。
任务：抽取本章所有**真正出场或行动的角色称呼**及其出现点。

====== 原文 ======
{{content}}
====== 原文结束 ======

{{bookTypeSpecialRules}}   // 由 PromptTemplateVariant 按 BookType 注入
{{bookTypeFewShots}}        // 由 BookTypeExample 按 bookType+stage=STAGE_A 注入 (top 3)

【输出】仅一个 JSON 数组（无 markdown），每条对应一个 surfaceForm 的一次关键出现：
[
  {
    "surfaceForm": "牛浦",                      // 原文中出现的称呼，≤12 字
    "aliasType": "NAMED|COURTESY_NAME|PEN_NAME|NICKNAME|DHARMA_NAME|POSTHUMOUS_TITLE|TITLE|POSITION|KINSHIP|GENERATIONAL|UNSURE",
    "identityClaim": "SELF|IMPERSONATING|TRANSFORMED|QUOTED|REPORTED|HISTORICAL|DREAM|UNSURE",
    "actionVerb": "偷诗稿|刻图书|谎称|娶亲|出游|...",
    "rawSpan": "……偷看牛布衣诗稿，到郭铁笔店刻图书，谎称牛布衣……",  // ≤120 字原文
    "contextHint": "本段中牛浦冒充牛布衣，刻图书时自称牛布衣",          // ≤50 字
    "sceneContextHint": "郭铁笔店内",                                 // ≤30 字，KINSHIP/GENERATIONAL 消歧必填
    "confidence": 0.0-1.0
  }
]

【收录规则（宁缺毋滥）】
✔ 必须收录：有对白 / 行动 / 冲突 / 被他人当面讨论的角色
✘ 不要收录：
  - 仅作背景的群体（"众家丁"、"几个人"、"五个侄子"）
  - 纯数量+职位（"两位都督"、"府尹"）
  - 叙述者追忆 / 对白转述 / 历史典故 → 归入该角色其他真实出场的 mention，此处不单独成条
  - 纯地名、官署、家族名、组织名
  - 诗词引用里的人名（李白、项羽）→ identityClaim=HISTORICAL 或直接不收

【aliasType 识别要点】
- NAMED: 正式名字
- COURTESY_NAME: 字（关羽的"云长"）
- PEN_NAME: 号（东坡居士）
- NICKNAME: 绰号（及时雨、豹子头）
- DHARMA_NAME: 法号/道号（行者、三藏、一清）
- POSTHUMOUS_TITLE: 谥号/追封（关圣、武侯）
- TITLE: 尊称（老祖宗、太君、相公）
- POSITION: 官职（押司、知府、丞相）
- KINSHIP: 亲属代称（侄孙、表叔、姨妈）
- GENERATIONAL: 辈分泛称（二爷、三奶奶、老太太） → **必须填 sceneContextHint**

【identityClaim 判定】
- SELF：本名或常用称呼
- IMPERSONATING：某人**冒用/借用**他人身份（例："谎称牛布衣"）
- TRANSFORMED：神魔变化 / 出家改名（白骨精变村姑；玄奘被唤"三藏"）
- QUOTED：仅出现在他人对白/信件中被转述
- REPORTED：叙述者回忆旧事时提到
- HISTORICAL：历史人物 / 典故（"项羽"、"范仲淹"）
- DREAM：梦境 / 幻境中出现（红楼太虚幻境）
- UNSURE：拿不准 → 必须填此值，不得瞎猜

【禁止】
- 不要输出 aliases 字段
- 不要合并不同的 surfaceForm，即使你认为是同一人
- 不要把 IMPERSONATING/TRANSFORMED 的 surfaceForm 写成真身 NAMED
- 不要超出原文推测
```

### 4.2 Prompt B · `STAGE_B_RESOLVE_ENTITIES` — 全书实体仲裁

```
你在为《{{bookTitle}}》做全书人物实体消歧。以下是一组**疑似同一人**的 surfaceForm，
每个 surfaceForm 附带其在全书出现的章节号和若干证据片段。

====== 候选组 ======
{{candidateGroups}}
每个成员的形式为：
  - surfaceForm: "牛布衣"
    aliasTypeHints: [NAMED, TITLE]
    identityClaims: [SELF, IMPERSONATING]        ← 不同 mention 的不同 claim
    chapters: [10, 12, 20, 21, 22, 23, 24]
    evidence:
      - ch10: "牛布衣要娶他女儿做媳妇"
      - ch20: "牛布衣在甘露庵病逝"
      - ch21: "偷看牛布衣诗稿，到郭铁笔店刻图书，谎称牛布衣"
      - ch22: "从南京燕子矶前往扬州"
====== 组结束 ======

【输出】仅一个 JSON 数组，每个候选组一项：
[
  {
    "groupId": 1,
    "decision": "MERGE|SPLIT|UNSURE",
    "members": [
      {
        "surfaceForm": "牛布衣",
        "resolvedPersona": "牛布衣",              // 真身的规范名；冒名/变化时=真正行动者
        "role": "REAL_PERSON|IMPERSONATED|TRANSFORMED|MISIDENTIFIED|QUOTED_ONLY|HISTORICAL",
        "chapterRange": [10, 20],                 // 作为此 role 的章节区间
        "aliasType": "NAMED|COURTESY_NAME|PEN_NAME|NICKNAME|DHARMA_NAME|POSTHUMOUS_TITLE|TITLE|POSITION|KINSHIP|GENERATIONAL|IMPERSONATED_IDENTITY|TRANSFORMATION|MISIDENTIFIED_AS"
      },
      {
        "surfaceForm": "牛布衣",                   // 同一 surfaceForm 不同 role 要分条
        "resolvedPersona": "牛浦",                 // 真正行动者
        "role": "IMPERSONATED",
        "chapterRange": [21, 24],
        "aliasType": "IMPERSONATED_IDENTITY",
        "targetPersona": "牛布衣"                  // 被冒名者
      }
    ],
    "evidencePerMember": [                         // 每位成员至少给 2 条不同章节证据
      { "member": 0, "chapterNo": 10, "span": "牛布衣要娶他女儿做媳妇" },
      { "member": 0, "chapterNo": 20, "span": "牛布衣在甘露庵病逝" },
      { "member": 1, "chapterNo": 21, "span": "到郭铁笔店刻图书，谎称牛布衣" },
      { "member": 1, "chapterNo": 22, "span": "以牛布衣名义赴扬州" }
    ],
    "confidence": 0.0-1.0,
    "rationale": "≤120 字说明判定依据"
  }
]

【硬约束（违反则仲裁作废）】
1. MERGE 必须:
   - 所有成员 role=REAL_PERSON
   - 所有成员有 ≥2 个不同章节互相印证的证据
   - confidence ≥ 0.85
2. 任一成员是 IMPERSONATED/MISIDENTIFIED → 必须 SPLIT，并给 targetPersona
3. 仅因名字相似、同姓而合并 → 禁止
4. 仅单章共现 → UNSURE，不 MERGE
5. 同姓家族（牛浦/牛玉圃/牛布衣/牛老儿）: 默认 SPLIT，除非有明确证据指向同一人

【针对《{{bookTitle}}》(BookType={{bookTypeLabel}}) 的专项提示】
{{bookTypeSpecialRules}}
{{bookTypeFewShots}}   // bookType + stage=STAGE_B 的 few-shot

【多采样一致性（multiSampleHighRisk 模式启用时）】
本 Prompt 将被同一 group 调用 3 次（不同 temperature）。调用方将对比三次结果：
  - 3 次 decision 一致 → 采纳
  - 2:1 → 采纳多数派但 confidence *= 0.85
  - 三者各异 → 强制 decision=UNSURE
你无需感知多采样，但请保持**每次判断基于证据**，避免随机采样产生漂移。
```

### 4.3 Prompt C · `STAGE_C_ATTRIBUTE_EVENT` — 章节事件归属

```
你在为《{{bookTitle}}》第 {{chapterNo}} 回做事件归属修正。
以下是一条候选 biography/mention，以及本章相关角色上下文。

候选事件:
  rawText: "{{rawText}}"
  候选行动者（系统初判）: {{candidateName}}（persona_id={{candidateId}}）

本章相关角色（含冒名/误认关系，截至本回）:
{{candidatePersonas}}
  如：
  - 牛浦 (persona_id=p1, known_impersonations=[{ target: "牛布衣", since_ch: 21 }])
  - 牛布衣 (persona_id=p2)

【输出】单对象 JSON:
{
  "actorTrueIdentityId": "p1",             // 真正做这件事的 persona_id
  "actorUsedIdentityId": "p2",             // 该事件中使用的身份；与真身不同时代表冒名/变化/误认
  "narrativeLens": "SELF|IMPERSONATING|TRANSFORMED|MISIDENTIFIED|QUOTED|REPORTED|HISTORICAL|DREAM|PLAY_WITHIN_PLAY|POEM_ALLUSION",
  "epochId": "ep_xxx",                     // 可选：对应 persona_epochs 某阶段（宋江-押司期；孙悟空-学艺期）
  "sceneContextHint": "郭铁笔店内",          // 必填 ≤30 字：KINSHIP/GENERATIONAL 消歧依赖此字段
  "category": "BIRTH|EXAM|CAREER|TRAVEL|SOCIAL|DEATH|EVENT",
  "evidenceRaw": "到郭铁笔店刻图书，谎称牛布衣",
  "evidenceSpan": [123, 180],               // rawText 内 span，可选
  "confidence": 0.0-1.0,
  "rationale": "≤60 字"
}

【规则】
- rawText 里 "某某以 XX 名义做了 Y" → actor=某某, used=XX, narrativeLens=IMPERSONATING
- 神魔变化（"化作村姑"/"变成" + 主体不变）→ narrativeLens=TRANSFORMED, used=变化后身份
- rawText 是对白/信件转述 Y 做了什么 → actor=Y, narrativeLens=QUOTED；若 Y 未在本书真实出场则 HISTORICAL 并跳过
- rawText 是追溯多年前的往事 → narrativeLens=REPORTED
- 历史人物典故 → HISTORICAL
- 梦境/幻境（红楼太虚幻境；南柯一梦）→ DREAM，默认不进主轨
- 戏中戏（琵琶记/牡丹亭被演出）→ PLAY_WITHIN_PLAY，不进主轨
- 诗词典故中的人物 → POEM_ALLUSION
- KINSHIP/GENERATIONAL 的 candidateName（如"二爷"、"老太太"）**必须**结合 sceneContextHint 确认真身；无法确认时 narrativeLens=QUOTED 并降低 confidence
- HISTORICAL/QUOTED/DREAM/PLAY_WITHIN_PLAY/POEM_ALLUSION 默认不进时间轴主轨

{{bookTypeSpecialRules}}
{{bookTypeFewShots}}   // bookType + stage=STAGE_C 的 few-shot
```

### 4.4 Prompt D · `STAGE_B_NOISE_FILTER` — 候选晋级判定

```
以下是 Stage B 尚未进入 CONFIRMED 的候选角色列表（附聚合指标与样本）:
{{candidates}}
  每项:
    name: "老翁"
    mentionCount: 1
    distinctChapters: 1
    biographyCount: 0
    sampleSpans: ["那老翁走过来说……"]

请返回 JSON:
[
  { "name": "...", "decision": "CONFIRMED|CANDIDATE|NOISE", "reason": "≤40 字" }
]

【判定规则】
CONFIRMED 必须同时满足:
  - distinctChapters ≥ 2 或 biographyCount ≥ 1
  - mentionCount ≥ 3
  - 不是纯泛称/职位/数量词/亲属泛称
  - 原文样本中有明确动作或对白

CANDIDATE: 其他有至少 1 次 mention 且看起来是人物的（留给人工审核）
NOISE: 明显的泛称、群体、物品、地名、数量+职位组合

【动态阈值说明】
上面 distinctChapters/mentionCount 默认值将由 thresholdsByBookType 按本书 BookType 覆盖：
  - HEROIC(水浒): distinctChapters ≥ 1（很多配角只出一回但有完整事迹）
  - HISTORICAL(三国): distinctChapters ≥ 2, mentionCount ≥ 2（人物多, 必须去噪）
  - NOTE_STYLE(聊斋): distinctChapters ≥ 1, mentionCount ≥ 1（每篇独立）

{{bookTypeSpecialRules}}
```

---

## 5. 实施路线图（Trellis 任务分解）

父任务：`04-17-character-extraction-rewrite` (umbrella)

| # | Task slug | 优先级 | 依赖 | 关键交付 |
|---|---|---|---|---|
| T1 | `04-17-char-ext-01-schema-migration` | P0 | — | schema.prisma 改造 + migration + 旧书数据清空脚本（含 Book.type / PersonaEpoch / PromptTemplateVariant / BookTypeExample 四项） |
| T2 | `04-17-char-ext-02-prompt-baselines` | P0 | T1 | prompt_template_baselines.ts 新增 Stage A/B/C/D 四条 baseline + `{{bookTypeSpecialRules}}`/`{{bookTypeFewShots}}` 占位符 + 种子入库 |
| T3 | `04-17-char-ext-03-stage-a-extractor` | P0 | T1,T2 | 新 StageAExtractor 服务 + 写 PersonaMentionCandidate（含 sceneContextHint） |
| T4 | `04-17-char-ext-04-stage-b-resolver` | P0 | T3 | 新 GlobalEntityResolver v2（带 IMPERSONATED/TRANSFORMED 建模 + 入库门槛 + 多采样投票） |
| T5 | `04-17-char-ext-05-stage-c-attribution` | P0 | T4 | 新 EventAttribution 服务（narrativeLens + epochId + sceneContextHint）+ 改 ChapterAnalysisService |
| T6 | `04-17-char-ext-06-lifecycle-ui` | P1 | T4 | Persona lifecycle 过滤 + admin CANDIDATE tab |
| T7 | `04-17-char-ext-07-alias-mapping-ui` | P1 | T6 | 审核 UI 支持 IMPERSONATED_IDENTITY / TRANSFORMATION / MISIDENTIFIED 卡片 |
| T8 | `04-17-char-ext-08-regression-fixtures` | P0 | T5 | 5 种 BookType 各 ≥1 fixture（SATIRICAL/HEROIC/HISTORICAL/MYTHOLOGICAL/DOMESTIC）+ 断言 |
| T9 | `04-17-char-ext-09-re-run-and-verify` | P0 | T5,T8,T10,T11 | 清空 bookId 数据 + 重跑 + 多 BookType 指标达标 ≥85% |
| T10 | `04-17-char-ext-10-booktype-system` | P0 | T1 | Book.type 字段管理 + PromptTemplateVariant 运行时拼接 + thresholdsByBookType 注入 pipeline + BookType 手动/自动分类 |
| T11 | `04-17-char-ext-11-universal-fewshot` | P0 | T1,T10 | BookTypeExample seed（≥5 BookType × 3 stage × 3-5 条）+ 运行时按 bookType+stage 查询拼接 + Prompt 注入 |

**合并节奏**：T1 先出 PR；T2/T10/T11 并行；T3/T4/T5 按依赖串行；T6/T7/T8 可与 T4/T5 并行；T9 最终验收。

---

## 6. 验收指标

### 6.1 全局指标（准确率目标 ≥85%，多 BookType 覆盖）

| 指标 | 目标 | 当前 |
|---|---|---|
| 《儒林外史》CONFIRMED persona 数 | 80 – 180（真实核心约 120） | **646** |
| persona.aliases 污染率（含他人真名） | < 2% | 估 > 10% |
| mention=0 的 persona 占比 | 0%（由新门槛强制） | 51.9% |
| biography 事件 narrativeLens 正确率（人工抽 100） | ≥ 90% | 未标注 |
| precision@top100 人物（人工抽评） | ≥ 0.90 | 未标注 |

### 6.2 多 BookType 准确率达标要求（≥85%）

| BookType | 代表作 | CONFIRMED 数量预期 | precision@top100 | 冒名/变化归属正确率 |
|---|---|---|---|---|
| SATIRICAL | 儒林外史 | 80-180 | ≥ 0.92 | ≥ 0.90（牛浦/牛布衣） |
| HEROIC | 水浒传 | 100-150（108 将+主配角） | ≥ 0.94 | ≥ 0.88（宋江-押司/义军阶段） |
| HISTORICAL | 三国演义 | 200-350 | ≥ 0.88 | ≥ 0.85（刘备/刘表/刘璋同姓不合并） |
| MYTHOLOGICAL | 西游记 | 60-120 | ≥ 0.92 | ≥ 0.88（白骨精三变；孙悟空=行者） |
| DOMESTIC | 红楼梦 | 150-250 | ≥ 0.86 | ≥ 0.85（"二爷"消歧；宝玉/黛玉前世） |

**硬性门槛**：任一 BookType 的 precision@top100 < 0.85 → 视为未达标，需回炉 Stage B/C Prompt 或补 fewshot。

### 6.3 专项 fixture（至少覆盖以下场景，每场景有 CI 断言）

**SATIRICAL（儒林外史，必全过）**:
1. **牛浦 & 牛布衣分裂**：独立 persona + 冒名 alias_mapping；牛布衣.lastSeenChapter=20
2. **张铁臂 / 张俊民**：同人化名（IMPERSONATED_IDENTITY）
3. **严监生 / 严贡生**：两独立 persona
4. **娄三/娄四/娄中堂/娄太爷**：四独立 persona
5. **匡超人**：单 persona，aliases 仅真名 + 尊称

**HEROIC（水浒传）**:
6. **宋江 = 及时雨 = 公明**：单 persona，3 条 alias（NAMED + NICKNAME + COURTESY_NAME），含 PersonaEpoch（押司期 / 落草期 / 招安期）
7. **武松 = 行者武松**：TRANSFORMATION alias（出家为头陀）
8. **同姓不合并**：鲁智深 vs 鲁达 → MERGE（出家改名，TRANSFORMATION）；但王英/王庆/王伦三独立

**HISTORICAL（三国演义）**:
9. **刘备 = 玄德 = 刘豫州**：单 persona，COURTESY_NAME + POSITION 合并
10. **刘备/刘表/刘璋**：同姓 SPLIT，禁止合并
11. **关羽 = 云长 = 关公 = 关圣**：POSTHUMOUS_TITLE 合并但标注 epochId

**MYTHOLOGICAL（西游记）**:
12. **孙悟空 = 行者 = 齐天大圣 = 美猴王**：四 alias 合并；PersonaEpoch（学艺/大闹天宫/取经）
13. **白骨精三变**：单主体 + 三条 TRANSFORMATION alias（村姑/老妇/老翁），narrativeLens=TRANSFORMED

**DOMESTIC（红楼梦）**:
14. **"二爷" 场景消歧**：宝玉房中"二爷"=贾宝玉；琏二奶奶面前"二爷"=贾琏；sceneContextHint 必填
15. **林黛玉 = 潇湘妃子 = 颦儿**：PEN_NAME + NICKNAME 合并
16. **贾母 = 老祖宗 = 史太君**：TITLE + POSTHUMOUS_TITLE 合并

---

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Stage B LLM 调用量变大（每组必送 + 高风险 group ×3 采样） | 规则预分组兜住大多数高置信同名；token 预算增加 30-50%，可接受；多采样仅针对 ≥3 成员同姓族群启用 |
| 删除 `Persona.aliases String[]` 影响所有读取方 | 提供 `getPersonaWithAliases()` helper，集中查询；API 层兼容输出格式 |
| 新阈值把部分真角色也拦成 CANDIDATE | CANDIDATE 层可见可提升；审核员一键晋级 |
| 现有测试大面积失败 | 测试要么重写、要么删除；不保留兼容性 |
| **BookType 误判** | 默认 GENERIC 兜底；AI 自动分类后人工审核确认；支持 admin 改类型后 re-run |
| **Few-shot 质量不一致** | seed 必须 reviewer 至少 2 人 review；每条 fewshot 必须是真实原著片段；BookTypeExample 支持"实验中/已验证"标志 |
| **BookType 覆盖不全** | GENERIC 为兜底类型（不注入任何 specialRules/fewShots），新 BookType 可后续增量加入 |
| **多采样投票成本失控** | 多采样仅对 `members.length ≥ 3` 且同姓/同辈分的 group 启用；single member group 不触发 |
| **作者风格差异超出 BookType** | spec 保留 PromptTemplateVariant 支持"书籍级覆盖"（variant key = bookType OR bookId），可在 admin UI 为单本书微调 |

---

## 8. 执行 Prompt（交给 Claude Code 用）

### 8.1 代码修改执行 Prompt（Stage A-C 重构）
```
按 docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md
实施任务 T3/T4/T5。禁止保留老 twopass 实现——GlobalEntityResolver 整体删除重写，
ChapterAnalysisService 重构为 StageCAttribution。严格遵守：
1. Persona 不再有 aliases String[] 字段，所有别名读写走 AliasMapping
2. Pass 1 Prompt 只输出 ChapterMention（Prompt A），写入 PersonaMentionCandidate 表
3. Pass 2 强制 LLM 仲裁带 evidence，SPLIT+IMPERSONATED 写入 alias_mappings
4. Pass 3 每条 biography 必须有 actorRole + evidenceRaw
5. 入库门槛：未达 CONFIRMED 的一律 lifecycle_status=CANDIDATE
6. pnpm lint / pnpm type-check / pnpm test 必须全绿（阈值 90%）
7. 所有老 twopass 的单元测试按新契约重写，不保留旧断言
```

### 8.2 数据库迁移执行 Prompt
```
按 docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md
§3 执行 schema 迁移：
1. 修改 prisma/schema.prisma （enum + persona + alias_mappings + biography + mention + 2 个新表）
2. pnpm prisma:migrate dev --name "character-extraction-redesign"
3. 同时编写一次性清理脚本 scripts/purge-book-analysis.ts：
   - 参数 --book-id
   - 清空该书的 personas / profiles / mentions / biography_records / relationships /
     alias_mappings / persona_mention_candidates / analysis_llm_raw_outputs / analysis_jobs
4. 对 book_id=7d822600-9107-4711-95b5-e87b3e768125 执行一次 dry-run 打印将被删除的计数
```

### 8.3 回归验证执行 Prompt
```
按 docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md §6 执行:
1. 先执行 scripts/purge-book-analysis.ts --book-id=7d822600-9107-4711-95b5-e87b3e768125
2. 重新发起一次 twopass → 实际变为三阶段的任务
3. 跑完后执行 scripts/verify-liurun-redesign.ts 产出报告:
   - 总 CONFIRMED persona 数
   - 牛浦 / 牛布衣 双 persona 检查
   - 第 21-24 回 biography 的 actorRole 与 personaId
   - alias_mappings (type=IMPERSONATED_IDENTITY) 覆盖情况
   - 专项 fixture 5 条通过/失败
4. 所有指标达标后提交；任一不达标 → 不合并，分析 Prompt 后迭代
```
