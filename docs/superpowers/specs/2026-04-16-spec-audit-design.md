# Spec 审计设计文档

**日期**：2026-04-16  
**状态**：已执行  
**范围**：`.trellis/spec/` 全目录

---

## 背景

本次审计目标：
1. 移除 stage（mvp/growth/mature）配置系统，扁平化所有规范
2. 删除锁定未激活的过程类文档
3. 补足项目有实践但无文字化的规范
4. 修复已知的内容过时问题

---

## 执行结果

### 已删除文件（13 个）

| 文件 | 原因 |
|------|------|
| `guides/stage-activation-guide.md` | Trellis 框架元文件，不是项目开发规范 |
| `meta/spec-quality-standard.md` | 元规范（规范的规范），无直接开发价值 |
| `guides/adr-lite-template.md` | 过于正式的 ADR 模板，当前项目不使用 |
| `guides/contract-verification-checklist.md` | mature 阶段过程文档，当前项目不适用 |
| `guides/observability-verification.md` | mature 阶段，当前无可观测性基础设施 |
| `guides/release-readiness-checklist.md` | mature 阶段发布检查，当前开发迭代快 |
| `guides/risk-preflight-guide.md` | mature 阶段风险预演，过于正式 |
| `guides/verification-evidence-standard.md` | mature 阶段验证证据规范，过于正式 |
| `guides/verification-checklist.md` | growth 阶段，内容与 quality-guidelines 重叠 |
| `guides/code-reuse-thinking-guide.md` | growth 阶段，非核心 |
| `guides/strategy-selection-guide.md` | growth 阶段，非核心 |
| `frontend/zustand-store-template.md` | 项目无 Zustand，未来指向文档 |
| `frontend/knowledge-base-admin-ui.md` | 过于领域特定的 UI 契约，放 spec 层偏重 |
| `frontend/state-management.md` | 内容与 react-guidelines.md 高度重叠 |

### 保留的外部 skill 文件（用户确认必要）

| 文件 | 来源 skill |
|------|-----------|
| `frontend/nextjs-detailed-commenting.md` | next-skills |
| `frontend/nextjs-cache-strategy.md` | next-cache-components |
| `frontend/design-audit.md` | redesign-existing-projects |

### 已去除 stage frontmatter（33 个文件）

所有保留文件的 `---\nstage: xxx\n---` 前置块已批量移除。

### 修复优化项（4 项）

| 优化 | 处理方式 |
|------|---------|
| `backend/index.md` 悬空链接 `api-versioning-guidelines.md` | 删除该行引用 |
| `cross-layer-thinking-guide.md`（892 行）加载成本高 | 新增 TL;DR 快速参考表（11 条错误速查）在文件头部 |
| `hook-guidelines.md` "还没有自定义 hooks" 过时 | 更新为当前 hook 清单（useHydratedTheme 等） |
| `guides/index.md` 引用了已删除的 guides | 更新索引，去除无效链接 |

---

## 新增规范文件（4 个）

### `backend/test-guidelines.md`

**覆盖内容**：
- `vi.hoisted` + `vi.mock` 标准模式（解决 mock 提升问题）
- 工厂函数注入模式（service 层）
- Route Handler 测试（`NextRequest` mock，不启 HTTP Server）
- fixture 管理约定
- 禁止模式表（含覆盖率 ignore 注释禁止）

### `backend/analysis-pipeline.md`

**覆盖内容**：
- sequential / twopass 两种架构的流程图与边界
- `AnalysisPipeline` 接口契约（`run`、`isCanceled`、`onProgress` 回调）
- 阈值配置集中管理约定（`config/pipeline.ts`）
- 两种架构的适用场景对比
- 禁止模式（在 pipeline 内直接调 prisma 等）

### `frontend/graph-visualization.md`

**覆盖内容**：
- 组件层次（GraphView → ForceGraph → 布局算法）
- 结构重建 vs 样式更新的核心规则
- D3 simulation 参数约定与存储方式（useRef）
- 布局算法接口约定（返回 plan，不操作 DOM）
- 事件系统（回调透传 vs 内部处理分界）
- 颜色系统（主题 token，不硬编码）

### `backend/route-handler-guidelines.md`

**覆盖内容**：
- 标准 handler 结构模板（鉴权→校验→业务→响应）
- 鉴权必须第一步
- Zod 校验约定（query params / body / FormData）
- `okJson` / `failJson` 工具的使用
- `failJson` 错误映射矩阵（AuthError/ZodError/NotFoundError → HTTP 状态码）
- `parsePagination` 分页约定
- 路径参数 `params: Promise<{...}>` 类型约定

---

## 当前 spec 目录结构（执行后）

```
.trellis/spec/
├── frontend/           # 11 个文件（删除 3，新增 1）
│   ├── component-guidelines.md
│   ├── design-audit.md          ← 外部 skill 保留
│   ├── design-system.md
│   ├── directory-structure.md
│   ├── graph-visualization.md   ← 新增
│   ├── hook-guidelines.md       ← 已更新
│   ├── index.md
│   ├── nextjs-best-practices.md ← 外部 skill 保留
│   ├── nextjs-cache-strategy.md ← 外部 skill 保留
│   ├── nextjs-detailed-commenting.md ← 外部 skill 保留
│   ├── performance-guidelines.md
│   ├── quality-guidelines.md
│   ├── react-guidelines.md
│   └── type-safety.md
│
├── backend/            # 13 个文件（删除 0，新增 3）
│   ├── ai-output-contract.md
│   ├── analysis-pipeline.md     ← 新增
│   ├── analysis-runtime-knowledge.md
│   ├── api-response-standard.md
│   ├── comment-template.md
│   ├── database-guidelines.md
│   ├── index.md                 ← 已修复
│   ├── knowledge-base-batch-ops.md
│   ├── logging-guidelines.md
│   ├── migration-guidelines.md
│   ├── neo4j-guidelines.md
│   ├── quality-guidelines.md
│   ├── route-handler-guidelines.md ← 新增
│   ├── security-guidelines.md
│   ├── test-guidelines.md       ← 新增
│   └── type-safety.md
│
├── guides/             # 3 个文件（删除 11）
│   ├── comment-guidelines.md
│   ├── cross-layer-thinking-guide.md ← 已加 TL;DR 头部
│   ├── index.md                 ← 已更新
│   └── module-boundary-guidelines.md
│
├── shared/             # 3 个文件（无变化）
│   ├── code-quality.md
│   ├── index.md
│   └── zod-typescript.md
│
└── big-question/       # 4 个文件（无变化，记录真实 bug）
    ├── index.md
    ├── postgresql-json-jsonb.md
    ├── turbopack-webpack-flexbox.md
    └── webkit-tap-highlight.md
```

---

## 未来可考虑补充

| 规范 | 描述 | 优先级 |
|------|------|--------|
| `backend/prisma-schema-guidelines.md` | `@@map` 命名约定、软删除、索引设计、外键策略 | 低 |
| `frontend/client-api-guidelines.md` | `client-api.ts` 用法、API envelope 解包、loading/error 状态 | 低 |
