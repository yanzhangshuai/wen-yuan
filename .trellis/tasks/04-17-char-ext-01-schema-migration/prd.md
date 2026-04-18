# feat: 人物解析 schema 迁移 + 旧数据清洗脚本

## Goal

为三阶段架构准备数据库：enum 扩展、Persona 删 aliases 改走 alias_mappings、BiographyRecord 加事件归属字段、新增 PersonaMentionCandidate / AnalysisLlmRawOutput 两张表，并提供按书籍清空分析结果的脚本。

## Spec

见 `docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §3。

## Requirements

### 1. `prisma/schema.prisma` 改动
- enum `AliasType` 扩展为：NAMED / TITLE / POSITION / KINSHIP / NICKNAME / COURTESY_NAME / IMPERSONATED_IDENTITY / MISIDENTIFIED_AS（**删除现有不明 enum 值**）
- 新 enum：`PersonaLifecycle`(CONFIRMED/CANDIDATE/NOISE/MERGED_INTO)、`ActorRole`(SELF/IMPERSONATING/QUOTED/REPORTED/HISTORICAL)、`IdentityClaim`(SELF/IMPERSONATING/QUOTED/REPORTED/HISTORICAL/UNSURE)
- `Persona`：
  - 新增 `lifecycleStatus / mergedIntoId / mentionCount / distinctChapterCount / biographyCount / firstSeenChapter / lastSeenChapter`
  - **删除 `aliases String[]` 字段**（彻底不兼容老数据）
  - 新 `@@index([lifecycleStatus, deletedAt])`
- `AliasMapping`：
  - `personaId` 改为 NOT NULL（之前是 nullable）
  - 新 `targetPersonaId?`、`evidenceChapterNos Int[]`
  - 双向关系：`AliasPrimary` / `AliasTarget`
  - 新唯一约束 `(bookId, alias, personaId, aliasType)`
- `BiographyRecord`：加 `actorUsedIdentityId? / actorRole / evidenceRaw / evidenceSpanStart / evidenceSpanEnd / confidence`；新关系 `BiographyUsedIdentity`
- `Mention`：加 `surfaceForm / aliasUsageType / identityClaim / spanStart / spanEnd`
- 新表 `PersonaMentionCandidate`：完整字段见 spec §3.6
- 新表 `AnalysisLlmRawOutput`：完整字段见 spec §3.6

### 2. 迁移
- `pnpm prisma:migrate dev --name character-extraction-redesign`
- 不提供 up/down 数据迁移：**直接不兼容老数据**

### 3. 一次性清洗脚本 `scripts/purge-book-analysis.ts`
- 参数 `--book-id=<uuid>` 必填；`--dry-run` 只打印计数
- 级联删除：analysis_jobs、mentions、biography_records、relationships、alias_mappings、persona_mention_candidates、analysis_llm_raw_outputs、personas、persona_profiles、merge_suggestions
- 保留：book 主记录、chapters（文本不丢）

### 4. 同步修正受影响读取方（临时兼容层）
- `getBookById` / `listPersonas` 等所有直接读 `persona.aliases` 的处改为 JOIN alias_mappings 聚合。保持 DTO 旧字段名 `aliases: string[]` 以减少前端改动，但含义变为"alias_mappings 中 aliasType∈(NAMED,COURTESY_NAME,TITLE,NICKNAME) 的别名"。
- 冒名/误认映射 (IMPERSONATED_IDENTITY/MISIDENTIFIED_AS) 不进该数组，由 UI 通过别的字段展示。

## Acceptance Criteria

- [ ] `pnpm prisma:generate && pnpm prisma:migrate dev` 成功
- [ ] 本地 DB 能执行 `tsx scripts/purge-book-analysis.ts --book-id=7d822600-9107-4711-95b5-e87b3e768125 --dry-run` 输出预计删除计数
- [ ] 所有旧代码对 `persona.aliases` 字段的直接读写全部转换为 helper（grep 验证）
- [ ] `pnpm type-check` 通过
- [ ] `pnpm test` 中涉及 persona aliases 的测试全部改写为新契约

## Definition of Done

- [ ] schema.prisma / migration.sql committed
- [ ] scripts/purge-book-analysis.ts committed，带中文注释
- [ ] 变更不破坏现有"sequential"架构路径（sequential 继续可跑，但输出写入新 schema）

## 追加要求（通用化 · 与 T10/T11 对齐）

- [ ] `AliasType` enum 扩展至 13 种：NAMED / COURTESY_NAME / PEN_NAME / NICKNAME / DHARMA_NAME / POSTHUMOUS_TITLE / TITLE / POSITION / KINSHIP / GENERATIONAL / TRANSFORMATION / IMPERSONATED_IDENTITY / MISIDENTIFIED_AS（spec §3.1）
- [ ] 新增 `NarrativeLens` enum 9 种替代 biography 的 actorRole：SELF / IMPERSONATING / TRANSFORMED / MISIDENTIFIED / QUOTED / REPORTED / HISTORICAL / DREAM / PLAY_WITHIN_PLAY / POEM_ALLUSION
- [ ] `IdentityClaim` enum 新增 TRANSFORMED / DREAM
- [ ] 新增 `BookType` enum 9 种（SATIRICAL/HEROIC/HISTORICAL/MYTHOLOGICAL/DOMESTIC/ROMANTIC/DETECTIVE/NOTE_STYLE/GENERIC），`Book.type BookType default GENERIC`
- [ ] 新表 `PersonaEpoch(id, personaId, bookId, epochLabel, chapterStart, chapterEnd, summary)` — 支持同一 persona 多阶段事迹（宋江/孙悟空/匡超人）
- [ ] 新表 `PromptTemplateVariant(id, templateSlug, bookType, specialRules, fewShotsJson, createdAt, updatedAt)` unique(templateSlug, bookType)
- [ ] 新表 `BookTypeExample(id, bookType, stage, label, exampleInput, exampleOutput, verified, priority, createdAt, updatedAt)`，index(bookType, stage, priority)
- [ ] `biography_records` 的 actorRole 字段重命名/改类型为 narrativeLens（NarrativeLens 枚举）+ 新增 epochId（FK PersonaEpoch, nullable）+ 新增 sceneContextHint（string ≤30）
- [ ] `mentions` / `persona_mention_candidates` 加 sceneContextHint

---

## §0-FINAL 对齐补丁（最终契约 · 以此为准 · 覆盖前文冲突项）

> 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-FINAL（§0-F.1 ~ §0-F.5）。
> 两轮反审结论 + 用户"不区分 MVP 全量做"决策。

### 覆盖 / 新增（对齐 §0-12 §0-15 §0-2 §0-6）

- [ ] **枚举最终集合**（§0-15，BookType 全量做 → 枚举不缩）：
  - AliasType(13): NAMED/COURTESY_NAME/NICKNAME/TITLE/POSITION/KINSHIP/IMPERSONATED_IDENTITY/MISIDENTIFIED_AS/DHARMA_NAME/POSTHUMOUS_TITLE/GENERATIONAL/TRANSFORMATION/UNSURE
  - NarrativeLens(9): SELF/IMPERSONATING/QUOTED/REPORTED/HISTORICAL/POEM_ALLUSION/TRANSFORMED/DREAM/UNSURE
  - IdentityClaim(7): SELF/IMPERSONATING/QUOTED/REPORTED/HISTORICAL/POEM_ALLUSION/UNSURE
  - BookType(6): SATIRICAL/HEROIC/MYTHOLOGICAL/DOMESTIC/HISTORICAL/GENERIC（§0-12 全量做）
- [ ] **Persona 字段新增**（§0-2/§0-3）：`deathChapterNo Int?` / `firstActionChapterNo Int?` / `currentLocation String?`
- [ ] **BiographyRecord 字段新增**（§0-6 口径）：`narrativeLens NarrativeLens` / `narrativeRegionType String` / `rawSpan String` / `actionVerb String?` / `isPostMortem Boolean default false` / `category String?`（DEATH/MARRIAGE/EXAM/OFFICE/…）
- [ ] **Mention 字段新增**（§0-8）：`identityClaim IdentityClaim` / `suspectedResolvesTo String?` (len ≤ 8) / `narrativeRegionType String` / `chapterNo Int`
- [ ] **Book 字段新增**：`type BookType default GENERIC`
- [ ] **新建表**：AliasMapping / MergeSuggestion / CharacterCandidate / BookTypeConfig / PromptTemplateVariant / BookTypeExample
- [ ] **REJECTED（不做）**：PersonaEpoch 表整体删除（§0.F.3 REJ-1）
- [ ] **Feature flag**（§0-13）：`ANALYSIS_PIPELINE=twopass|threestage` 加入 `src/server/config/env.ts`
- [ ] Migration 名：`char_ext_01_core_schema`；不提供 down 迁移（直接不兼容老数据）

### DoD 追加
- [ ] 对 `book_id=7d822600-9107-4711-95b5-e87b3e768125` 跑 `purge-book-analysis --dry-run` 无错
- [ ] `pnpm type-check` + `pnpm lint` 干净（删除 Persona.aliases 会广泛报错必须一次性修）
