# 人物解析准确率重设计 · 三阶段管线实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 twopass 管线重建为三阶段管线（Stage 0 预处理 → Stage A 抽取 → Stage B 仲裁 → Stage B.5 时序检查 → Stage C 事迹归属），把《儒林外史》解析结果从 646 人物虚高 + 牛浦/牛布衣事迹错挂收敛至 CONFIRMED precision@top100 ≥ 85% 且 CANDIDATE ≤ 200。

**契约源（唯一事实）：** `docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-FINAL（§0-1 ~ §0-18 + REV-1/REV-2 + REJ-1/2/3）

**Trellis 等价性：** 本 plan 17 个 Task（T01~T17）一一对应 `.trellis/tasks/04-17-char-ext-{01..17}-*/prd.md`，DoD 完全一致；Trellis 用户用 `/trellis:start <slug>` 执行，本 plan 读者用 `superpowers:subagent-driven-development` 执行。

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Prisma 7 (PostgreSQL), Neo4j 5.15, pnpm, Vitest

**Book ID（主测试靶）：** `7d822600-9107-4711-95b5-e87b3e768125` 《儒林外史》

---

## 前置检查

在开始任何修改前：

```bash
cd /home/mwjz/code/wen-yuan
git status                  # 确认干净工作区
pnpm type-check             # 基线无错
pnpm lint                   # 基线无错
pnpm test                   # 基线全绿
pnpm prisma:generate        # 生成最新 Prisma Client
```

阅读契约文档：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-FINAL 章节（前 200 行），特别是 §0-1 ~ §0-18。

---

## 执行顺序（Wave 视图）

```
Wave 1 (可并行)    T14 twopass-baseline        T15 alias-entry-audit-seed
Wave 2 (可并行)    T01 schema-migration        T12 chapter-preprocessor-stage-0   T17 cross-location-extraction
Wave 3 (可并行)    T02 prompt-baselines        T10 booktype-system                T11 universal-fewshot
Wave 4 (串行)      T03 stage-a-extractor  →  T13 stage-b5-temporal  →  T04 stage-b-resolver  →  T05 stage-c-attribution
Wave 5 (可并行)    T06 lifecycle-ui            T07 alias-mapping-ui
Wave 6 (串行)      T16 gold-set  →  T08 regression-fixtures  →  T09 rerun-and-verify
```

关键路径：T01 → T02 → T03 → T13 → T04 → T05 → T07 → T09（8 步）。

PR 拆分（§0-13）：
- **PR-1 写路径**：T01+T10+T11+T12+T02+T03+T13+T04+T05+T15（默认 `ANALYSIS_PIPELINE=twopass` 不变）
- **PR-2 读路径**：T06+T07+T08+T09+T14+T16+T17，切换默认到 `threestage`，合并条件 = T09 六门槛全绿

---

## Task T14：Twopass 基线评测（独立启动）

**契约：** §0-16 · **Dependencies:** 无

- [ ] 在 staging 跑一次完整 twopass 分析儒林外史（`bookId=7d822600-9107-4711-95b5-e87b3e768125`）
- [ ] SQL 导出 personas / biography_records / alias_mappings 到 `.trellis/workspace/data/twopass-baseline-rulin.json`
- [ ] 按 `mentionCount` 降序取 50 + 随机取 50 共 100 条人工抽样
- [ ] 每条标注 `TRUE_ROLE / NOISE / ALIAS_DUP / ATTRIBUTION_ERROR`
- [ ] 计算 twopass precision = `count(TRUE_ROLE)/100`，归属正确率 = `count(!ATTRIBUTION_ERROR)/100`
- [ ] 牛浦/牛布衣专项 case study：贴完整 biography 归属链
- [ ] 写入 `docs/superpowers/reports/twopass-baseline.md`
- [ ] 双人交叉抽 10 条复查一致率 ≥ 80%
- [ ] `git commit -m "chore(analysis): twopass baseline report for rulin"`

---

## Task T15：AliasEntry 冷启动审计与儒林 seed

**契约：** §0-17 · **Dependencies:** 无

- [ ] 执行审计：`SELECT COUNT(*) FROM alias_entries WHERE "bookId" = '7d822600-9107-4711-95b5-e87b3e768125'`
- [ ] 记录到 `docs/superpowers/reports/alias-entry-audit.md`
- [ ] 若条数 ≥ 30：任务结束；否则进入 seed 流程
- [ ] 新建 `prisma/seed/rulin-aliases.ts` 导出 `seedRulinAliases(prisma)`，幂等（upsert by natural key）
- [ ] Seed 内容 ≥ 50 条，覆盖：
  - 字/号/尊称 ≥ 30 条（王冕/贯索犯文昌、周进/周学道、范进/范老爷/范举人、匡超人/匡迥、杜少卿/杜仪、马二先生/马纯上、娄瓒/娄三公子、娄瓒/娄四公子、虞博士/虞育德、庄绍光/庄尚志 …）
  - **禁合并清单**（IMPERSONATED_IDENTITY 关系，非 alias）≥ 5 条：牛浦✗牛布衣（冒名）、牛玉圃✗牛布衣（误认）、严贡生✗严监生（同姓兄弟）…
- [ ] 扩展 `prisma/seed.ts` 支持 `pnpm prisma:seed --only rulin-aliases`
- [ ] 幂等测试：跑两次结果一致
- [ ] 双人交叉复查抽 10 条无错
- [ ] `git commit -m "chore(knowledge): seed rulin alias entries and impersonation exclusion list"`

---

## Task T01：Schema Migration（三阶段字段扩展）

**契约：** §0-FINAL §0-12 §0-15 · **Dependencies:** 无 · **详细 DoD:** `.trellis/tasks/04-17-char-ext-01-schema-migration/prd.md`

- [ ] 新建 Prisma migration `add_three_stage_fields`
- [ ] Enum `AliasType` 扩展至 9 值：`NAMED / COURTESY_NAME / NICKNAME / TITLE / POSITION / KINSHIP / IMPERSONATED_IDENTITY / MISIDENTIFIED_AS / UNSURE`
- [ ] Enum `NarrativeLens`（新建）5 值：`SELF / IMPERSONATING / QUOTED / REPORTED / HISTORICAL`
- [ ] Enum `IdentityClaim`（新建）6 值：`SELF / IMPERSONATING / QUOTED / REPORTED / HISTORICAL / UNSURE`
- [ ] Enum `BookType`（§0-12 全量做，覆盖原 MVP 禁令）：`CLASSICAL_NOVEL / MODERN_NOVEL / HISTORICAL / BIOGRAPHY / OTHER`
- [ ] `Book` 表加 `type: BookType` 字段（default `OTHER`），回填儒林外史=`CLASSICAL_NOVEL`
- [ ] 新建表 `PromptTemplateVariant`（bookTypeId + templateSlug）
- [ ] 新建表 `BookTypeExample`（few-shot 样例库，per BookType）
- [ ] `Persona` 加字段：`preprocessorConfidence: enum(HIGH/LOW)`、`deathChapterNo: Int?`、`currentLocation: String?`、`mentionCount: Int default(0)`、`effectiveBiographyCount: Int default(0)`、`distinctChapters: Int default(0)`、`status: enum(CANDIDATE/CONFIRMED/MERGED)`
- [ ] `PersonaMention` 表（新建）：`personaId / chapterNo / rawSpan / surfaceForm / aliasType / identityClaim / narrativeRegionType / suspectedResolvesTo(≤8字) / evidence…`
- [ ] `BiographyRecord` 加 `narrativeLens: NarrativeLens`、`narrativeRegionType` 字段
- [ ] 新建表 `MergeSuggestion`（kind / status=PENDING/ACCEPTED/REJECTED / source / evidence）— 支撑 §0-14 反馈通道
- [ ] `ChapterPreprocessResult` 表（新建）：五段字符占比 + preprocessorConfidence
- [ ] **不**新建 `PersonaEpoch`（REJ-1）
- [ ] 本 migration 只加字段不读新字段；`ANALYSIS_PIPELINE` flag 默认 `twopass`（§0-13 PR-1）
- [ ] `pnpm prisma:generate && pnpm prisma:migrate`
- [ ] `pnpm type-check` + `pnpm lint` 绿
- [ ] `git commit -m "feat(db): three-stage schema migration (PR-1 write path)"`

---

## Task T12：Stage 0 章节预处理器（四区段 + 覆盖率 + 死亡标记）

**契约：** §0-4 §0-2 §0-5 · **Dependencies:** T01 · **详细 DoD:** `.trellis/tasks/04-17-char-ext-12-chapter-preprocessor-stage-0/prd.md`

- [ ] 新建 `src/server/modules/analysis/preprocessor/ChapterPreprocessor.ts` / `deathMarkers.ts` / `types.ts`
- [ ] 四区段正则切分：
  - POEM = `有诗为证|有词为证|诗曰|词曰` 起始至空行/此诗此词
  - DIALOGUE = `[""「『]` + 引入句 `XX 道|说|笑道|怒道|答道`
  - COMMENTARY = `却说|话说|看官听说|且说|按|诸君试看|原来` 起首议论段
  - NARRATIVE = 未匹配剩余
  - 重叠优先级 POEM > DIALOGUE > COMMENTARY > NARRATIVE
- [ ] 输出五段字符占比 `{ narrative, poem, dialogue, commentary, unclassified }`
- [ ] `unclassified > 0.10` → `preprocessorConfidence = LOW`
- [ ] 死亡标记词正则：`病逝|病故|故去|故了|归天|一命呜呼|无常|云亡|殒|殒命|殁|卒|薨|死于|死在|圆寂|羽化|殉|毙|夭亡`
- [ ] 向前扫 30 字内最近中文人名 token（2-4 字）作为主语候选
- [ ] 写入 `persona.deathChapterNo` 候选源
- [ ] 暴露 `preprocessChapter(text, chapterNo): ChapterPreprocessResult`
- [ ] 单元测试覆盖：纯叙章节 / 3 首诗 / 却说议论 / 王冕道 / 11 个死亡标记词 / LOW 打标
- [ ] 集成测试：儒林 55 回全跑，分布统计到 `.trellis/workspace/reports/preprocessor-rulin-coverage.md`
- [ ] 第 20 回牛布衣病逝 → deathChapterNo=20 候选写入 ✅
- [ ] `pnpm test -- preprocessor` 绿，覆盖率 ≥ 90%
- [ ] `git commit -m "feat(analysis): stage 0 chapter preprocessor with coverage self-report"`

---

## Task T17：跨地点并发检测（REV-2）

**契约：** §0-3(b) REV-2 · **Dependencies:** T12 · **详细 DoD:** `.trellis/tasks/04-17-char-ext-17-cross-location-extraction/prd.md`

- [ ] 新建 `src/server/modules/analysis/preprocessor/locationMarkers.ts`
- [ ] 地点动词正则：`往|到|去|赴|抵|至|进|出|住在|寓于|过|经`
- [ ] 组合模式：`(人名?)(动词)(地名)` → `LocationEvent`
- [ ] 维护 `locationExclusivityGraph`（JSON，≥ 10 条互斥/可疑对）
- [ ] Stage C 后按章节时序扫 LocationEvent 更新 `persona.currentLocation` + 可选 `persona_location_history`
- [ ] 测试：牛布衣扬州 vs 甘露庵同章 → 触发 IMPERSONATION_CANDIDATE；未知地点不触发
- [ ] 儒林 20-22 回 → 至少 1 条跨地点候选 dump 到 `.trellis/workspace/reports/cross-location-rulin.md`
- [ ] `git commit -m "feat(analysis): cross-location concurrency detection"`

---

## Task T02：Prompt Baselines（§0-1 白名单）

**契约：** §0-1 §0-8 REV-1 · **Dependencies:** T01 · **详细 DoD:** `.trellis/tasks/04-17-char-ext-02-prompt-baselines/prd.md`

- [ ] 删除原计划的 Prompt D（REJ-3）
- [ ] 新建 Prompt A（Stage A mention 抽取）baseline：输出 `{ surfaceForm, aliasType, identityClaim, narrativeRegionType, suspectedResolvesTo≤8字, evidence rawSpan, actionVerb, confidence }`
- [ ] Prompt B（Stage B 全书仲裁）：输入候选组，输出 MERGE/KEEP_SEPARATE + evidence
- [ ] Prompt C（Stage C biography 归属）：输入 mentions + personas，输出 `{ personaId, narrativeLens, rawSpan, category }`
- [ ] 所有 Prompt 正文**只允许** `{{占位符}}` / 通用分类规则 / enum 值 / schema 说明；**禁止**任何具名实体（人名、地名、书名、情节描述）
- [ ] 写验证脚本 `scripts/validate-prompt-whitelist.ts`：扫 `prompt_template_versions` 所有 baselines，正则检测简体/繁体人名/地名/书名，命中即 fail
- [ ] REV-1 DIALOGUE 细分写入 Prompt A 规则区：
  - 引入句主语（`XX 道：`）→ 允许 `identityClaim=SELF`
  - 引号内被提及第三方 → 强制 `QUOTED`
  - 引号内自称"我" → SELF 但 evidence 须覆盖引入句主语
- [ ] suspectedResolvesTo 字段：COURTESY_NAME/NICKNAME/TITLE mention 必填或显式 null
- [ ] 更新 `prisma/seed/prompt-template-baselines.ts`，跑 `pnpm prisma:seed`
- [ ] 验证脚本接入 CI：`pnpm test -- prompt-whitelist`
- [ ] `git commit -m "feat(prompts): three-stage prompt baselines with whitelist enforcement"`

---

## Task T10：BookType System（§0-12 全量做）

**契约：** §0-12（全量覆盖原 MVP 禁令） · **Dependencies:** T01 · **详细 DoD:** `.trellis/tasks/04-17-char-ext-10-booktype-system/prd.md`

- [ ] 后端：`/api/admin/books/:id` PATCH 支持 `type` 字段
- [ ] 管理页 UI：书籍详情编辑 + 导入向导选择 BookType（5 值下拉）
- [ ] `thresholdsByBookType` 映射表：每个 BookType 覆写 T04/T05 的阈值（CONFIRMED 门槛、MERGE confidence 基线）
- [ ] `CLASSICAL_NOVEL` 阈值参考 §0-7 基准；其他类型阈值可留 TODO 待调参
- [ ] 儒林外史回填 `type = CLASSICAL_NOVEL`（数据 migration）
- [ ] UI 测试：切换 BookType 后阈值读取正确
- [ ] `git commit -m "feat(books): book type system with per-type thresholds"`

---

## Task T11：Universal Few-shot（per-BookType 样例库）

**契约：** §0-1（禁泄漏） · **Dependencies:** T10 · **详细 DoD:** `.trellis/tasks/04-17-char-ext-11-universal-fewshot/prd.md`

- [ ] `BookTypeExample` 表写入 per-BookType few-shot（Prompt A/B/C 各 ≥ 3 例）
- [ ] Few-shot 示例**也**必须遵守 §0-1 白名单（用虚构占位名如"甲某"/"乙公"，或显式 fictitious disclaimer）
- [ ] Few-shot 内容走独立 `validate-fewshot-whitelist.ts` 校验
- [ ] 运行时：Stage A/B/C 调用前按 book.type 取对应 few-shot 拼接到 Prompt
- [ ] `git commit -m "feat(prompts): per-booktype fewshot examples with whitelist"`

---

## Task T03：Stage A Extractor（保守抽取）

**契约：** §0-5 §0-8 REV-1 · **Dependencies:** T02 T12 T14 · **详细 DoD:** `.trellis/tasks/04-17-char-ext-03-stage-a-extractor/prd.md`

- [ ] 新建 `src/server/modules/analysis/pipelines/threestage/StageAExtractor.ts`
- [ ] 输入：章节 + ChapterPreprocessResult.regionMap
- [ ] LLM 调用 Prompt A 抽取 mentions
- [ ] 规则层 `enforceRegionOverride(mention, regionMap)`（§0-5）：
  - 非 NARRATIVE 且非 DIALOGUE 引入句主语 → 不允许 `identityClaim=SELF`
  - POEM → 强制 `HISTORICAL` 或 `POEM_ALLUSION`（POEM_ALLUSION 不入枚举本轮，走 `UNSURE` + note）
  - COMMENTARY → 强制 `REPORTED`
  - DIALOGUE 引号内第三方 → 强制 `QUOTED`
  - DIALOGUE 引入句主语（REV-1） → 允许 SELF
- [ ] 写入 `PersonaMention` 表
- [ ] 单元测试覆盖 REV-1 全部 4 个用例 + §0-5 三硬约束
- [ ] 集成测试：儒林前 5 回 → identityClaim 分布合理
- [ ] `git commit -m "feat(analysis): stage A extractor with region-override enforcement"`

---

## Task T13：Stage B.5 时序一致性检查器

**契约：** §0-3(a) §0-14 · **Dependencies:** T03 T12（T17 后升级 b 项） · **详细 DoD:** `.trellis/tasks/04-17-char-ext-13-stage-b5-temporal-consistency/prd.md`

- [ ] 新建 `src/server/modules/analysis/pipelines/threestage/TemporalConsistencyChecker.ts`
- [ ] 检查 (a) 死后行动：`mention.chapterNo > persona.deathChapterNo` → 写 `MergeSuggestion(kind=IMPERSONATION_CANDIDATE, source=STAGE_B5_TEMPORAL, status=PENDING)`
- [ ] 检查 (b) 跨地点：feature flag `TEMPORAL_CHECK_LOCATION=false`（T17 完成后打开）
- [ ] §0-14：**只写 merge_suggestions，不触发 Stage B 重跑**；Stage B 下次 job 消费 PENDING 队列
- [ ] 单元测试：牛布衣 deathChapterNo=20 + 第 22 回牛布衣署名 → 1 条候选；death 当章不触发
- [ ] 集成测试：儒林全跑 → 至少发现牛浦冒名 3+ 处
- [ ] `git commit -m "feat(analysis): stage B.5 temporal consistency checker"`

---

## Task T04：Stage B Resolver（三通道候选组 + §0-9 充要）

**契约：** §0-7 §0-9 §0-4（LOW 加严） · **Dependencies:** T03 T13 T15 · **详细 DoD:** `.trellis/tasks/04-17-char-ext-04-stage-b-resolver/prd.md`

- [ ] 新建 `src/server/modules/analysis/pipelines/threestage/StageBResolver.ts`
- [ ] 三通道候选组构造：
  - 通道 ①：surfaceForm exact match
  - 通道 ②：suspectedResolvesTo key 聚合
  - 通道 ③：AliasEntry 知识库命中（依赖 T15 seed）
- [ ] LLM Prompt B 仲裁 MERGE / KEEP_SEPARATE
- [ ] §0-9 **MERGE 充要条件**（必要非充分）：
  - 必要：LLM confidence ≥ 0.85
  - 充分：2 章独立 evidence AND（规则预合并命中 ∨ AliasEntry 命中）
  - 否则降级为 `merge_suggestions(PENDING)` 人工审核
- [ ] 消费 T13 写入的 `IMPERSONATION_CANDIDATE`：作为 KEEP_SEPARATE 的强提示（禁止合并两侧 persona）
- [ ] §0-7 CONFIRMED 门槛：`(distinctChapters≥2 AND mentionCount≥2) OR (effectiveBiographyCount≥2 AND ≥1 条 rawSpan≥15 字 AND ≥1 条 actionVerb 在 NARRATIVE 区段)`
- [ ] §0-4 LOW 加严：`preprocessorConfidence=LOW` 的章节 mention 贡献下，`mentionCount + 1` 且 `distinctChapters + 1` 的额外要求
- [ ] 禁合并清单（T15 seed）绝对优先：牛浦 ✗ 牛布衣 永不合并
- [ ] 未满足 CONFIRMED → `status = CANDIDATE`
- [ ] 单元测试 + 集成测试（牛浦/牛布衣必不合并）
- [ ] `git commit -m "feat(analysis): stage B resolver with 3-channel candidacy and §0-9 merge sufficiency"`

---

## Task T05：Stage C Attribution（事迹归属 + 双源死亡 + 反馈通道）

**契约：** §0-5 REV-1 §0-2 §0-6 §0-14 · **Dependencies:** T04 · **详细 DoD:** `.trellis/tasks/04-17-char-ext-05-stage-c-attribution/prd.md`

- [ ] 新建 `src/server/modules/analysis/pipelines/threestage/StageCAttribution.ts`
- [ ] 输入：已仲裁的 personas + mentions
- [ ] LLM Prompt C 按 mention 产出 biography record（含 narrativeLens + rawSpan + category）
- [ ] 区段硬约束（§0-5 + REV-1）：
  - NARRATIVE 内 SELF → biography
  - DIALOGUE 引入句主语 SELF → biography
  - POEM/COMMENTARY/DIALOGUE 引号内第三方 → **不**产生 biography，只登记 mention
- [ ] §0-6 biographyCount 口径：只计 `narrativeLens ∈ {SELF, IMPERSONATING} AND narrativeRegionType = NARRATIVE AND rawSpan ≥ 15 AND actionVerb 非空` → 作为 `effectiveBiographyCount` 写回 persona
- [ ] §0-2 死亡 category：写 `category=DEATH biography` 时也更新 `persona.deathChapterNo`；与 Stage 0 正则冲突时 **Stage 0 胜出**
- [ ] §0-14 反馈：Stage C 发现 MERGE 疑点 → 写 `merge_suggestions(PENDING)`，**不**运行时回环，下次 job 消费
- [ ] 牛浦冒名场景测试：牛浦假装牛布衣 → biography 归牛浦（`narrativeLens=IMPERSONATING`，`impersonatedIdentity=牛布衣`），**不**归牛布衣
- [ ] 集成测试儒林 20-30 回
- [ ] `git commit -m "feat(analysis): stage C biography attribution with impersonation lens"`

---

## Task T06：CANDIDATE 只读列表 UI

**契约：** §0-FINAL · **Dependencies:** T05 · **详细 DoD:** `.trellis/tasks/04-17-char-ext-06-lifecycle-ui/prd.md`

- [ ] 新页面 `src/app/admin/books/[id]/candidates/page.tsx`
- [ ] 列表：`status=CANDIDATE` personas，按 `mentionCount` 降序
- [ ] 列：surfaceForm / mentionCount / distinctChapters / effectiveBiographyCount / 首次章节 / 末次章节 / preprocessorConfidence
- [ ] 只读，无合并按钮（合并在 T07 做）
- [ ] 点击行展开 mentions 列表（rawSpan 截断）
- [ ] 导出 CSV 按钮
- [ ] `git commit -m "feat(admin): candidate personas read-only list"`

---

## Task T07：Alias Mapping / 冒名审核 UI（3 Tab 审核中心）

**契约：** §0-FINAL · **Dependencies:** T05 · **详细 DoD:** `.trellis/tasks/04-17-char-ext-07-alias-mapping-ui/prd.md`

- [ ] 新页面 `src/app/admin/books/[id]/review-center/page.tsx`，3 个 Tab：
  - **Tab 1 · MERGE 建议**：`merge_suggestions.kind=MERGE_CANDIDATE, status=PENDING` 列表；显示两 persona 的 mention 证据、AliasEntry 命中、LLM confidence；按钮 Accept / Reject
  - **Tab 2 · 冒名候选**：`kind=IMPERSONATION_CANDIDATE`（T13 写入）；显示 deathChapterNo + postMortemChapterNo + rawSpan；按钮：标记为"真冒名"（创建 AliasEntry IMPERSONATED_IDENTITY）/ 拒绝
  - **Tab 3 · AliasEntry 维护**：CRUD 知识库
- [ ] Accept MERGE → 合并 persona（迁移 mention + biography）+ 写 audit log
- [ ] Accept IMPERSONATION → 创建 IMPERSONATED_IDENTITY alias，禁止未来 Stage B 合并两侧
- [ ] 所有操作写审计日志
- [ ] `git commit -m "feat(admin): review center for merges, impersonation, aliases"`

---

## Task T16：Gold Set 标注（350 条）

**契约：** §0-10 · **Dependencies:** T14（抽样源）或独立干抽 Stage A · **详细 DoD:** `.trellis/tasks/04-17-char-ext-16-gold-set-annotation/prd.md`

- [ ] 抽样设计：150 真角色 + 150 噪声（mentionCount=1 ×50 + 仅 POEM/COMMENTARY ×50 + 称谓碎片 ×50）+ 50 边缘歧义
- [ ] Stage A identityClaim 分层 ≥ 100 条（SELF/IMPERSONATING/QUOTED/REPORTED/HISTORICAL 各 ≥ 20）；IMPERSONATING 自然分布不足时**过采样**牛浦章节
- [ ] 标注 schema 见 prd.md
- [ ] 双人独立标注 → 计算 Cohen's kappa
- [ ] kappa < 0.75 → 修订手册，重新标分歧
- [ ] 产出 `fixtures/gold/rulin-350.json` + `fixtures/gold/rulin-identity-claim-100.json` + `docs/gold-annotation-guide.md`
- [ ] `git commit -m "chore(testing): rulin gold set 350 with kappa ≥ 0.75"`

---

## Task T08：Regression Fixtures（5 BookType 场景）

**契约：** §0-1（禁泄漏） · **Dependencies:** T16 · **详细 DoD:** `.trellis/tasks/04-17-char-ext-08-regression-fixtures/prd.md`

- [ ] 按 5 BookType 各准备 1 个 fixture：古典小说（儒林缩版）/ 现代小说 / 历史 / 传记 / 其他
- [ ] Fixture **文本**可以含真实历史人物（书本身内容），但 **Prompt/few-shot** 必须遵守 §0-1
- [ ] Fixture 包含 expected `{ personas, mentions, biographies }` 断言
- [ ] Vitest test suite 跑通所有 fixture
- [ ] `git commit -m "test(analysis): regression fixtures across 5 book types"`

---

## Task T09：Rerun 儒林外史 + 六门槛验收

**契约：** §0-11 §0-13 · **Dependencies:** T06 T07 T08 T16 T17 · **详细 DoD:** `.trellis/tasks/04-17-char-ext-09-rerun-and-verify/prd.md`

- [ ] 切换 `ANALYSIS_PIPELINE=threestage` 跑儒林外史完整分析
- [ ] SQL 导出结果 + 对比 T14 baseline
- [ ] **六项硬门槛**（全绿才合 PR-2）：
  1. CONFIRMED precision@top100 ≥ 85%（T16 gold set 比对）
  2. 归属正确率 ≥ 90%
  3. CANDIDATE 桶 ≤ 200（§0-11；200-300 观察；>300 回炉）
  4. 牛浦/牛布衣专项：biography 正确归属，牛浦有 IMPERSONATING 记录，牛布衣无冒名事迹
  5. preprocessorConfidence=LOW 章节占比 ≤ 10%
  6. T13 IMPERSONATION_CANDIDATE 命中 ≥ 3 处且人工复查 ≥ 2 条属真冒名
- [ ] 报告写入 `docs/superpowers/reports/threestage-rerun-verification.md`
- [ ] 全绿后 `ANALYSIS_PIPELINE` 默认值改 `threestage` + `git commit -m "feat(analysis): switch default pipeline to threestage (PR-2)"`

---

## 最终校验

完成 T09 后：

```bash
pnpm type-check && pnpm lint && pnpm test
```

- [ ] 所有测试绿
- [ ] T09 验证报告六门槛全绿
- [ ] 两份 PR（写路径 + 读路径）合入 dev
- [ ] 与 `docs/implementation/trellis-execution-plan.md` 导航状态对齐（17 任务全 done）

---

## 契约号快速索引

| § | 主题 | 涉及 Task |
|---|------|---------|
| §0-1 | Prompt 白名单 | T02 T08 T11 |
| §0-2 | deathChapterNo 双源 | T05 T12 |
| §0-3 | 时空双检 | T13 T17 |
| §0-4 | 覆盖率自白 | T04 T12 |
| §0-5 | 区段判定权收回 | T02 T03 T05 T12 |
| §0-6 | biographyCount 口径 | T05 |
| §0-7 | CONFIRMED 门槛 | T04 |
| §0-8 | suspectedResolvesTo | T02 T04 |
| §0-9 | MERGE 充要 | T04 |
| §0-10 | Gold set 350 | T16 |
| §0-11 | CANDIDATE ≤200 | T09 |
| §0-12 | BookType 全量做 | T01 T10 |
| §0-13 | Feature flag 两次 PR | T01 T09 |
| §0-14 | 反馈通道非回环 | T04 T05 T13 |
| §0-15 | 枚举裁剪终版 | T01 |
| §0-16 | T14 独立启动 | T14 |
| §0-17 | AliasEntry 审计前置 | T15 |
| REV-1 | DIALOGUE 引入句 SELF | T02 T03 T05 |
| REV-2 | 跨地点独立任务 | T13 T17 |
