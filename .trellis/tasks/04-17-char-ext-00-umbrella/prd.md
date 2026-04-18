# feat: 《儒林外史》人物解析准确率重设计 (三阶段架构)

## Goal

一次性替换 twopass 为三阶段架构（章节硬提取 → 全书仲裁 → 事件归属），解决：
1. 《儒林外史》解析产出 **646 人物** 严重虚高问题
2. **牛浦冒名牛布衣** 场景事件错挂真身、aliases 污染问题
3. 纯提及即入库、无事迹证据、孤儿人物堆积问题

## Spec

**完整方案见**：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md`

## 已知根因（证据在 spec §1）

- P0 `GlobalEntityResolver.buildCandidateGroups` 同姓+allNames 交集 → 无证据合并
- P0 `GlobalEntityResolver.resolveGlobalEntities` L410 把 allNames 直接塞 persona.aliases
- P0 Prompt 让 LLM 把多称谓塞 aliases，冒名场景必污染
- P0 `Persona.aliases String[]` 无法承载 aliasType/evidence/target
- P1 `markOrphanPersonas` 只降 confidence 不隔离
- P1 `AliasMapping` 子系统完全未被 twopass 使用（本书 0 行）

## 子任务

| # | Slug | 优先级 | 依赖 |
|---|---|---|---|
| T1 | char-ext-01-schema-migration | P0 | — |
| T2 | char-ext-02-prompt-baselines | P0 | T1 |
| T3 | char-ext-03-stage-a-extractor | P0 | T1,T2 |
| T4 | char-ext-04-stage-b-resolver | P0 | T3 |
| T5 | char-ext-05-stage-c-attribution | P0 | T4 |
| T6 | char-ext-06-lifecycle-ui | P1 | T4 |
| T7 | char-ext-07-alias-mapping-ui | P1 | T6 |
| T8 | char-ext-08-regression-fixtures | P0 | T5 |
| T9 | char-ext-09-rerun-and-verify | P0 | T5,T8,T10,T11 |
| T10 | char-ext-10-booktype-system | P0 | T1 |
| T11 | char-ext-11-universal-fewshot | P0 | T1,T10 |

## Acceptance Criteria (伞任务级)

- [ ] 所有 11 个子任务完成并合并
- [ ] 《儒林外史》(SATIRICAL) 重跑后 CONFIRMED persona 数 ∈ [80, 180]
- [ ] 独立存在 `牛浦` / `牛布衣` 两个 persona，且牛布衣.lastSeenChapter=20
- [ ] 第 21-24 回所有牛浦事迹的 biography.personaId = 牛浦.id
- [ ] 存在 alias_mapping: alias="牛布衣", personaId=牛浦.id, targetPersonaId=牛布衣.id, aliasType=IMPERSONATED_IDENTITY
- [ ] 牛布衣 persona 通过 join 查到的 aliases 不包含 "牛浦郎/牛浦/浦郎"
- [ ] 5 种 BookType（SATIRICAL/HEROIC/HISTORICAL/MYTHOLOGICAL/DOMESTIC）至少各 1 个 fixture 全绿
- [ ] 每种 BookType precision@top100 ≥ 0.85（spec §6.2）
- [ ] BookType 系统装配生效：同一 baseline prompt 在不同 BookType 产出可区分的 specialRules/fewShots 段落
- [ ] 无任何 persona 的 mention_count=0 或 biography_count=0（严格由 lifecycle 门槛保证）

## Definition of Done

- [ ] spec 文档已合入 main
- [ ] 老 twopass 代码已删除（GlobalEntityResolver、TwoPassPipeline 等）
- [ ] Persona.aliases String[] 字段已删除，全链路走 alias_mappings
- [ ] Book.type 字段 + PromptTemplateVariant + BookTypeExample 三张表入库并 seed
- [ ] `pnpm lint && pnpm type-check && pnpm test` 全绿（≥90% 覆盖率）
- [ ] verify-liurun-redesign.ts 产出的验收报告附在 PR 描述
