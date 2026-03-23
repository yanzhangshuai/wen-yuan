# refactor: service层改用function模式

## Goal

将后端 service 层从 `class` 模式全面迁移到 `function factory` 模式（`createXxx(deps) => { method }` 形态），
统一代码风格，保持与已重构的 `ChapterAnalysisService`、`PersonaResolver`、`aiClient` 一致。

## What I already know

* `analysis/services/` 下三个文件已完成重构（未 staged）：
  * `ChapterAnalysisService.ts` → `createChapterAnalysisService()`
  * `PersonaResolver.ts` → `createPersonaResolver()`
  * `aiClient.ts` → `createChapterAnalysisAiClient()`（新文件）
* `project/services/project-service.ts`（`class ProjectDomainService`）已在工作区删除（未 staged），但**无替代文件**。
* `providers/ai/deepseekClient.ts` 和 `geminiClient.ts` 仍使用 `class`，但这是 infrastructure 层，不属于 service 层。
* `auth/rbac.ts` 中 `class AuthError extends Error` 是错误类，非服务，不在重构范围。
* 现有导出统计：`export class` 剩 3 处（2 在 providers、1 是 AuthError）。

## Assumptions (temporary)

* 重构范围 = service 层（`src/server/modules/**/services/`），不含 providers / error class。
* `project-service.ts` 需要补写 function factory 替代，不能留空删除。

## Open Questions

（无）

## Requirements

* analysis service 层三个文件已完成 function factory 重构，stage 并提交。
* `project-service.ts` 确认无引用方（grep 验证），直接删除，不补写替代。
* providers 层 class 保持不变（infrastructure adapter，不属于 service 层）。

## Acceptance Criteria

* [x] `analysis/services/` 下所有 service 文件已改为 function factory 模式。
* [x] `project-service.ts` 已删除（无调用方，死代码）。
* [ ] `export class` 仅剩 `providers/` 和 error class，无 service 层 class 残留。
* [ ] typecheck / lint / tests 通过。

## Decision (ADR-lite)

**Context**：`project-service.ts` 在工作区已被删除，需确认处置方式。

**Decision**：直接删除，不补写 function factory 替代。

**Consequences**：通过 grep 确认全仓库无任何 import 或引用，该文件为死代码，删除无破坏性影响。

## Definition of Done

* 所有 service 层文件不含 `export class`（除 Error 子类）。
* 现有单测仍可通过（mock 方式与 function factory 兼容）。
* lint / typecheck 绿。

## Out of Scope

* `providers/ai/deepseekClient.ts`、`geminiClient.ts` — infrastructure 层，保持 class。
* `auth/rbac.ts` 中的 `AuthError` — 错误类，不改。
* 不引入 DI 框架或全局容器。

## Technical Notes

* 关键文件：
  * `src/server/modules/analysis/services/` — 已完成
  * `src/server/modules/project/services/project-service.ts` — 已删除，待确认处置
  * `src/server/providers/ai/index.ts` — 已使用 `provideAi()` 工厂函数，providers 本身保持 class
* `project-service.ts` 原内容：`class ProjectDomainService`，包含 `listProjects / createProject / createWork / createWorkVersion`，所有方法依赖 `this.prismaClient`。
