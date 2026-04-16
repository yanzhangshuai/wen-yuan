# Verification Evidence

## Scope

- Task: `04-16-kb-batch-ops-ui-fix`
- Objective: 为知识库管理台补齐四类批量操作、替换原生 `confirm()` / `prompt()` 为 UI 对话框，并修复侧边栏 active 高亮与 RSC 序列化边界问题。
- Date: `2026-04-16`

## Preflight Checklist

- [x] `pnpm lint` 通过
- [x] `pnpm type-check` 通过
- [x] 本任务相关测试通过
- [x] 前后端 cross-layer spec 已补齐
- [ ] `pnpm test` 全量通过
- [ ] 浏览器手工验收完成

## Code-Spec Sync

- Backend spec: `.trellis/spec/backend/knowledge-base-batch-ops.md`
- Frontend spec: `.trellis/spec/frontend/knowledge-base-admin-ui.md`
- Index sync:
  - `.trellis/spec/backend/index.md`
  - `.trellis/spec/frontend/index.md`

已记录的契约包括：

- Client Component -> client service -> Route Handler -> server module -> Prisma transaction 的批量操作链路
- `knowledgeBatchActionSchema` 的 payload 规则、成功码、错误矩阵
- `layout.tsx` 仅传递可序列化 `iconKey`，由 `knowledge-base-nav.tsx` 在客户端解析图标，避免 Server Component 向 Client Component 透传函数型 icon

## Commands Run

```bash
pnpm lint
pnpm type-check
pnpm exec vitest run \
  src/app/admin/knowledge-base/batch-action-controls.test.tsx \
  src/app/admin/knowledge-base/layout.test.tsx \
  src/app/admin/knowledge-base/knowledge-base-nav.test.tsx \
  src/app/api/admin/knowledge/surnames/routes.test.ts \
  src/lib/services/surnames.test.ts \
  src/server/modules/knowledge/catalog-services.test.ts
pnpm test
```

## Results

### Lint / Type Check

- `pnpm lint`: pass
- `pnpm type-check`: pass

### Task-Local Tests

- Result: `6 passed`
- Tests: `25 passed`
- Covered areas:
  - `BatchActionControls` 弹窗生命周期、pending 状态、`GLOBAL_BOOK_TYPE_VALUE -> null`
  - `layout.tsx` 不再向客户端导航透传 icon component
  - `KnowledgeBaseNav` 总览精确匹配、子路由前缀匹配
  - 姓氏批量操作 route/service/server module 契约

### Full Test Suite

- Result: fail
- Summary: `3 failed | 133 passed` test files, `16 failed | 1012 passed` tests
- Failing suites:
  - `src/server/modules/analysis/services/GlobalEntityResolver.test.ts`
  - `src/server/modules/analysis/services/PersonaResolver.test.ts`
  - `src/server/modules/analysis/services/prompts.test.ts`

主要失败形态：

- `GlobalEntityResolver` 期望进入 AI resolution path，但实际未调用 prompt builder
- `PersonaResolver` 多处 generic title / rosterMap / alias registration / scorePair 断言失败，另有多处 `directMatches.length` 读取 `undefined`
- `prompts.test.ts` 中默认 generic title prompt 片段与 roster discovery snapshot 不再匹配

这些失败对应的当前脏文件主要集中在 analysis / knowledge 加载链路：

- `src/server/modules/analysis/config/lexicon.ts`
- `src/server/modules/analysis/config/lexicon.test.ts`
- `src/server/modules/analysis/services/prompts.ts`
- `src/server/modules/knowledge/load-book-knowledge.ts`
- `src/server/modules/knowledge/load-book-knowledge.test.ts`

本任务知识库 UI / batch ops 相关验证未发现失败，但 `$finish-work` 不能在全量测试未通过时判定为完成。

## Manual Verification

- 未执行浏览器手工验收
- 待验收场景：
  - `/admin/knowledge-base` 及子页面加载时不再出现 “Only plain objects can be passed to Client Components” / “Functions cannot be passed directly to Client Components”
  - 四个批量操作页面的删除确认框、书籍类型设置对话框、成功后关闭/失败时保留上下文
  - 侧边栏 active 高亮在总览页与子页面间表现正确

## Acceptance Decision

- [ ] PASS
- [x] BLOCKED
- Decision Reason: 本任务代码、测试补充与 spec sync 已完成，但 `pnpm test` 仍被 analysis 模块 16 个失败用例阻塞，且浏览器手工验收尚未执行，未满足 `$finish-work` 完成条件。
