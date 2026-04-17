# feat: Stage B 全书实体仲裁 (含冒名建模)

## Goal

整体替换旧 `GlobalEntityResolver`。聚合 Stage A 产出的 mention candidates，决定晋级/合并/分裂/挂起/冒名建模。**彻底删除 union-find on 同姓+allNames**。

## Spec

见 spec §2（Stage B 段落）、§4.2（Prompt B）、§3.2/3.3（persona/alias_mappings 改造）。

## Requirements

### 1. 新文件 `src/server/modules/analysis/pipelines/threestage/StageBResolver.ts`
- 入口 `resolveBook({ bookId, jobId, bookTitle }): Promise<StageBReport>`
- 步骤：
  1. 从 `persona_mention_candidates` 聚合：
     - `grouped[surfaceForm] = { mentionCount, distinctChapters[], identityClaims Set, evidenceSpans: [ch, rawSpan][] }`
  2. **规则预合并**（零 LLM 调用）：
     - 精确同名且所有 identityClaim=SELF → 合并为 1 persona
     - 命中书籍 `AliasEntry` 知识库 → 按知识库合并
  3. **疑似同姓族候选组**：
     - 相同姓氏 + 任一共同章节 → 构造 candidateGroup
     - 注意：同姓 ≠ 直接合并，只是进入 LLM 仲裁
  4. **LLM 仲裁 (Prompt B)**：
     - 每 group 送一次；返回 decision + members + evidencePerMember
     - **硬校验**：
       - MERGE 必须 ≥ 2 distinct chapters evidence；否则降级为 UNSURE
       - 任一 member.role=IMPERSONATED/MISIDENTIFIED → 强制 SPLIT
       - confidence<0.85 → 降级 UNSURE
     - UNSURE → 不合并，生成 MergeSuggestion(PENDING)
  5. **入库门槛**（应用 CONFIRMED 规则，见 spec §2）：
     - 满足 → `lifecycle_status=CONFIRMED`
     - 不满足但看起来像人物 → CANDIDATE
     - 明确噪声（群体/职位/数量词）→ 直接不建 persona
  6. **冒名建模**：
     - 对 role=IMPERSONATED 的 member：建立 `alias_mappings{ personaId=真身, alias=使用身份名, targetPersonaId=被冒名者, aliasType=IMPERSONATED_IDENTITY, chapterStart/End, evidenceChapterNos }`
     - 对 role=MISIDENTIFIED：同上但 aliasType=MISIDENTIFIED_AS
  7. **正常别名**（role=REAL_PERSON 的多个 surfaceForm 合并为一人时）：
     - 写 `alias_mappings{ aliasType=NAMED/COURTESY_NAME/TITLE/...，无 targetPersonaId }`
  8. 写 personas（使用新 lifecycle 字段）；回填 persona_mention_candidates.promoted_persona_id

### 2. 禁止
- 禁止基于"名字前缀/包含/同姓"无证据合并
- 禁止把任何 allNames 原样塞 persona.aliases（该字段已删除）
- 禁止跳过 evidence 校验

### 3. 配置
- `config/pipeline.ts` 加：
  - `stageB: { minEvidenceChapters: 2, minConfidenceForMerge: 0.85, candidateGroupMaxSize: 8 }`

### 4. 单测 + 集成测
- `StageBResolver.test.ts` 覆盖：
  - 纯同名（无冒名）合并
  - 冒名 → SPLIT + IMPERSONATED_IDENTITY 建模
  - 同姓不同人 → 不合并
  - 低置信 → MergeSuggestion PENDING
  - 低 mention → CANDIDATE
- 集成 mock LLM 固定返回；验证 DB 落库正确

## Acceptance Criteria

- [ ] 儒林外史 fixture 场景（见 T08）全部通过
- [ ] 无任何 persona.aliases 写入（字段不存在）
- [ ] 所有别名走 alias_mappings，且 targetPersonaId 只在 IMPERSONATED/MISIDENTIFIED 时非 null
- [ ] MergeSuggestion PENDING 数量可观测（log + metrics）
- [ ] 旧 GlobalEntityResolver.ts 已删除

## Definition of Done

- [ ] 单元+集成测 ≥90%
- [ ] 代码 review 确认无 union-find 残留
- [ ] README / 内部文档更新

---

## §0-FINAL 对齐补丁（最终契约 · 以此为准 · 覆盖前文冲突项）

> 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-FINAL（§0-F.1 ~ §0-F.5）。
> 两轮反审结论 + 用户"不区分 MVP 全量做"决策。

### 覆盖 / 新增（对齐 §0-7 §0-9 §0-17 + 依赖 T13/T15）

- [ ] **三通道候选组**：
  - 通道 1：相同 `surfaceForm` 精确
  - 通道 2：相同 `suspectedResolvesTo` key（§0-8）
  - 通道 3：AliasEntry 命中 by (bookId, surfaceForm)
- [ ] **§0-9 MERGE 充要条件强制执行**：
  ```
  if (confidence < 0.85) => MergeSuggestion PENDING
  else if (distinctChapters >= 2 AND (rulePreMerge OR aliasEntryHit)) => 直接合并
  else => MergeSuggestion PENDING
  ```
- [ ] **§0-7 CONFIRMED 门槛分桶**：
  - `(distinctChapters >= 2 AND mentionCount >= 2)` 任一通过 → Persona CONFIRMED
  - `(effectiveBiographyCount >= 2 AND 其中 ≥1 条 rawSpan >= 15 字 AND ≥1 条 actionVerb 在 NARRATIVE 区段)` → Persona CONFIRMED（王冕式单章完整小传走这支）
  - 其余 → `character_candidates` CANDIDATE
- [ ] **§0-F.1 预处理器 LOW 时阈值加严**：preprocessorConfidence=LOW 章节 → mentionCount 和 distinctChapters 要求各 +1
- [ ] 前置依赖：T13（B.5 先跑消费死后行动告警）、T15（AliasEntry seed 后通道 3 才工作）

### DoD 追加
- [ ] 测试：牛浦 / 牛布衣两条候选在有 AliasEntry 禁合并记录时**不合并**
- [ ] 测试：单章完整小传角色能通过 CONFIRMED 门槛第二支
- [ ] 集成测试对儒林外史小样本产出不超过 10 条误合并
