# feat: Stage C 章节事件归属服务

## Goal

实现事件归属阶段：针对 Stage B 确立的 persona 列表，为每条事件 rawText 由 LLM 判定 actorTrueIdentity / actorUsedIdentity / actorRole，写入 biography_records / mentions。确保"牛浦冒名牛布衣"场景事件归到牛浦名下。

## Spec

见 spec §2（Stage C 段落）、§4.3（Prompt C）、§3.4（BiographyRecord 改造）。

## Requirements

### 1. 新文件 `src/server/modules/analysis/pipelines/threestage/StageCAttributor.ts`
- 入口 `attributeChapter({ bookId, chapterId, chapterNo, jobId, content, bookTitle, personas, aliasMappings })`
- 步骤：
  1. 从现有候选事件源（可先用 Stage A 的 mention.actionVerb 聚合，或 LLM 生成事件候选）产出 candidate events
  2. 对每个事件调用 Prompt C：
     - 传入 rawText、候选 personas（含 known_impersonations），候选 candidateId
     - LLM 返回 actorTrueIdentityId / actorUsedIdentityId / actorRole / category / evidenceRaw / evidenceSpan / confidence
  3. 硬校验：
     - actorRole=IMPERSONATING 必须有 actorUsedIdentityId 且其 alias_mappings 里有 target=actorTrueIdentity 的 IMPERSONATED_IDENTITY 记录
     - actorRole=HISTORICAL/QUOTED 且 actorTrueIdentity 的 lifecycle=CANDIDATE/无 → 不写 biography_records（仅写 mention 旁注）
     - confidence<0.6 → 写入 biography_records 但标记 review_required（利用 MergeSuggestion 或新字段，简单做法：confidence 字段本身）
  4. 写 biography_records（新字段全齐：personaId=真身 id、actor_used_identity_id、actor_role、evidence_raw、evidence_span_start/end、confidence）
  5. 写 mentions（surface_form、alias_usage_type、identity_claim、span_start/end）

### 2. 修改 `src/server/modules/analysis/jobs/runAnalysisJob.ts`
- 注册 architecture='threestage' → 调用 StageAExtractor → StageBResolver → StageCAttributor
- 删除对 `markOrphanPersonas` 的调用（语义已由 Stage B 的 lifecycle_status 接管）
- 老 sequential/twopass 路径保留代码不执行（标记 deprecated）；或直接删除——由实现者与评审决定

### 3. 工厂注册 `pipelines/factory.ts`
- 新 architecture key `threestage`
- 将 book 新发起的分析默认走 `threestage`
- `twopass` 仍可选但标记 deprecated

### 4. 单测
- StageCAttributor：mock personas 含 [牛浦 with impersonation 记录, 牛布衣]；输入第 21 回"到郭铁笔店刻图书，谎称牛布衣"；断言 personaId=牛浦.id, actor_used_identity_id=牛布衣.id, actor_role=IMPERSONATING。

## Acceptance Criteria

- [ ] 儒林外史重跑后第 21-24 回所有冒名事件 personaId=牛浦.id
- [ ] biography_records.actor_role 分布可通过 SQL 聚合验证（SELF/IMPERSONATING/QUOTED/REPORTED/HISTORICAL）
- [ ] HISTORICAL/QUOTED 事件不计入主时间轴查询
- [ ] threestage 架构成为默认

## Definition of Done

- [ ] 新代码 ≥90% 覆盖
- [ ] pipeline 工厂 e2e 测试通过
- [ ] 老 twopass 单测已删除或迁移至 threestage 断言

## 追加要求（通用化 · 与 T10/T11 对齐）

- [ ] 实现字段从 `actorRole` 迁移到 `narrativeLens`（9 种值），旧代码全面替换，不保留兼容名
- [ ] biography_records 写入时同时填 `epochId`（若 persona 有 PersonaEpoch 且 chapterNo 命中区间则关联，否则 null）
- [ ] KINSHIP / GENERATIONAL mention 的消歧**强制依赖 sceneContextHint**：若为空则降 confidence 并打日志
- [ ] narrativeLens ∈ { HISTORICAL, QUOTED, DREAM, PLAY_WITHIN_PLAY, POEM_ALLUSION } 的 biography 默认 lifecycle=CANDIDATE，不进主时间轴
- [ ] Prompt C 调用 resolvePromptTemplate 时传入 book.type，注入 bookTypeSpecialRules / bookTypeFewShots

---

## §0-FINAL 对齐补丁（最终契约 · 以此为准 · 覆盖前文冲突项）

> 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-FINAL（§0-F.1 ~ §0-F.5）。
> 两轮反审结论 + 用户"不区分 MVP 全量做"决策。

### 覆盖 / 新增（对齐 §0-5 REV-1 §0-14 §0-6）

- [ ] 新增 `src/server/modules/analysis/pipelines/threestage/StageCAttributor.ts`
- [ ] 每条 biography 必须同时填：`actor`（真身 personaId）/ `usedIdentityId?`（冒用对象 personaId）/ `narrativeLens` / `narrativeRegionType` / `rawSpan` / `actionVerb`
- [ ] **§0-6 口径**：只持久化满足 `narrativeLens ∈ {SELF,IMPERSONATING} AND narrativeRegionType=NARRATIVE AND rawSpan.length ≥ 15 AND actionVerb 非空` 的条目
- [ ] **§0-5 + REV-1** 区段判定权收回（同 T03 规则，但在 biography 层再应用一次防 LLM 越权）
- [ ] **§0-14 反馈通道**：发现与 Stage B 结果矛盾时（如某 biography 应归 personaA 但 B 归给 personaB）→ 写 `MergeSuggestion(source=STAGE_C_FEEDBACK, status=PENDING, kind=ATTRIBUTION_CONFLICT)`
- [ ] **禁止运行时回环**：不直接触发 Stage B 重跑；下次 job 运行时 Stage B 从 PENDING 队列消费
- [ ] **§0-2 双源写入**：`category=DEATH` 的 biography 触发 `persona.deathChapterNo` 更新（若与 Stage 0 正则冲突，以 Stage 0 为准）

### DoD 追加
- [ ] 测试：牛浦冒充牛布衣章节 → biography.actor=牛浦, usedIdentityId=牛布衣, narrativeLens=IMPERSONATING
- [ ] 测试：category=DEATH 写入后 persona.deathChapterNo 双源合并正确
