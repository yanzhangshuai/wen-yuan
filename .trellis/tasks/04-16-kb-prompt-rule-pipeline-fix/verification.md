# Verification Evidence

## Scope

- Task: `04-16-kb-prompt-rule-pipeline-fix`
- Objective: 修复 `PromptExtractionRule` 未接入分析运行时配置的断链，清理分析词库硬编码 fallback，确认知识库 DB 成为 Prompt/Resolver 的唯一知识数据源，并补齐 Phase 7 种子入库路径。
- Date: `2026-04-16`

## Preflight Checklist

- [x] `pnpm lint` 通过
- [x] `pnpm type-check` 通过
- [x] 本任务相关回归测试通过
- [x] backend code-spec 已补齐
- [x] `pnpm test` 全量通过
- [x] 手工浏览器验收不适用（纯后端 / 运行时配置与脚本契约变更）

## Code-Spec Sync

- Backend spec:
  - `.trellis/spec/backend/analysis-runtime-knowledge.md`
  - `.trellis/spec/backend/index.md`

本轮补齐的可执行契约包括：

- `loadAnalysisRuntimeConfig()` / `loadFullRuntimeKnowledge()` 是分析运行时知识的唯一装配入口
- `promptExtractionRule` 仅负责 `ENTITY` / `RELATIONSHIP` 抽取规则；`nerLexiconRule` 仅负责后缀与 stem 词典
- DB 无规则时按空集处理，不允许在 `lexicon.ts` / `prompts.ts` / Resolver 中回退到硬编码默认值
- `prisma/seed.ts -> seedKnowledgePhase7()` 的 Phase 7 入库路径与落表目标

## Commands Run

```bash
pnpm lint
pnpm type-check
pnpm exec vitest run \
  src/server/modules/knowledge/load-book-knowledge.test.ts \
  src/server/modules/analysis/config/lexicon.test.ts \
  src/server/modules/analysis/services/prompts.test.ts \
  src/server/modules/analysis/services/PersonaResolver.test.ts \
  src/server/modules/analysis/services/GlobalEntityResolver.test.ts \
  src/server/modules/analysis/services/ChapterAnalysisService.test.ts \
  src/server/modules/analysis/jobs/runAnalysisJob.test.ts
pnpm test
```

## Results

### Lint / Type Check

- `pnpm lint`: pass
- `pnpm type-check`: pass

### Task-Local Regression

- Result: `7 passed`
- Tests: `166 passed`
- Covered areas:
  - `load-book-knowledge` 通过 `promptExtractionRule` 装配 `entityExtractionRules` / `relationshipExtractionRules`
  - `lexicon` 在无配置时返回空集 / `null`，不再依赖硬编码默认词库
  - `prompts` 测试显式传入 `genericTitlesExample` 与抽取规则，验证 DB-only 契约
  - `PersonaResolver` / `GlobalEntityResolver` 在运行时显式消费 `lexiconConfig`
  - `ChapterAnalysisService` / `runAnalysisJob` 回归通过，说明分析链路未被 DB-only 改造破坏

### Full Test Suite

- `pnpm test`: pass
- 说明：全量 suite 在当前会话完成并返回退出码 `0`，覆盖率模式同时开启。

## Acceptance Decision

- [x] PASS
- [ ] BLOCKED
- Decision Reason: 断链修复、硬编码清理、Phase 7 入库路径与 backend code-spec 已闭环；`lint`、`type-check`、任务回归与全量 `test` 均通过，满足 `$finish-work` 完成条件。
