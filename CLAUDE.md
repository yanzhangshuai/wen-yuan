# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指引。

## 项目概述

文渊是一个面向中国古典文学的知识图谱系统。核心流程：导入书籍（如《儒林外史》）→ 章节拆分 → AI 分析提取人物实体与关系 → 可视化交互式知识图谱。系统有两种用户角色：ADMIN（管理书籍、运行分析、审核 AI 产出）和 VIEWER（只读图谱浏览）。

## 技术栈

- **框架**：Next.js 16 (App Router) + React 19，TypeScript (strict)，Tailwind CSS v4
- **数据库**：PostgreSQL 16 (Prisma 7) + Neo4j 5.15 (neo4j-driver)
- **包管理**：pnpm（ESM 项目，`"type": "module"`）
- **测试**：Vitest + V8 覆盖率（门禁只统计 `src/server` 服务端业务模块，行覆盖率阈值 85%）
- **Lint**：ESLint flat config + typescript-eslint + `@stylistic` 格式化规则
- **UI 组件**：Radix UI 基础组件 + shadcn/ui 模式，位于 `src/components/ui/`
- **图谱可视化**：D3 (d3-force, d3-zoom, d3-drag, d3-selection)
- **AI 供应商**：管理员在 `/admin/model` 自助维护 provider/model/baseUrl/apiKey；DeepSeek、Qwen、Doubao、GLM 与聚合网关走 `openai-compatible` 协议，Gemini 走 `gemini` 协议

## 常用命令

```bash
pnpm dev              # 启动开发服务器
pnpm build            # 生产构建
pnpm lint             # ESLint 检查
pnpm lint:fix         # ESLint 自动修复
pnpm type-check       # TypeScript 类型检查 (tsc --noEmit)
pnpm test             # 运行全部测试（含覆盖率）
pnpm test:watch       # 监听模式
npx vitest run src/server/modules/books/createBook.test.ts  # 运行单个测试文件
pnpm prisma:generate  # Schema 变更后重新生成 Prisma Client
pnpm prisma:migrate   # 创建/应用数据库迁移
npx ts-node scripts/eval/export-extraction.ts 儒林外史 歧路灯  # 导出提取结果（管线跑完后）
node scripts/eval/run-eval.ts                                  # eval gate（entityF1≥0.74 / relationF1≥0.68）
```

## 基础设施

```bash
# 完整部署（数据库在容器内）：
docker compose up -d

# 开发模式（数据库在宿主机，容器通过 127.0.0.1 连接）：
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

PostgreSQL 默认端口：5434（容器内 5432 映射）。Neo4j Bolt：7687，HTTP：7474。

## 架构

### 路由分组 (src/app/)

- `(viewer)/` — 公开的图谱浏览页面（只读）
- `(graph)/` — 书籍图谱详情页
- `admin/` — 管理后台（书籍管理、技能管理、模型配置、审核）
- `api/` — API 路由处理器（与模块结构对应）
- `login/` — 登录页

### 服务端模块 (src/server/modules/)

每个模块是独立的业务域，包含各自的服务函数、错误类型和测试：

- **analysis/** — v7 确定性管线编排（`jobs/runAnalysisJob.ts`：逐章提取→身份→归并→Pass3-5）+ AI 调用执行器（`services/AiCallExecutor.ts`，统一默认模型 + 可选 modelId 覆盖）+ 成本汇总（`services/jobCostSummary.ts`）
- **identity/** — v7 身份 Pass：提取后按"去重表面形式紧凑名单"全局规范化（`identityPass.ts`，替代 v5 的 Tier1 原文枚举）+ 确定性归并（`projection.ts`，临时实体→canonical，facts/mentions 重指向，dropped 软删）+ 登记表派生视图（`registry.ts`）+ 分布式冲突扫描
- **extraction/** — Pass1 逐章单轮提取（`extractor.ts`，无登记表、章内共指、chapterNo=本章）+ 实体验收闸（`guardrails.ts`：实体从事实两端反推 + 锚定/从属指称/泛称三闸）+ 关系物化聚合（`aggregator.ts`，`refreshRelationshipsForBook`）+ Union-Find 别名合并（`aliasResolver.ts`）
- **review/** — Pass4 例外优先审核：自动接受栈（`autoAccept.ts` 五条件）+ 人审队列 + 棘轮校准 + 关系级幻觉定向抽样 + 跨模型复核 + 实体合并事务（`mergeEntities.ts`）+ 错误族（`errors.ts`）
- **skills/** — Skill 域：CRUD/版本（`skillService.ts`）+ AI 动态选择器（`skillSelector.ts`，`selectSkillsForJob`）+ 装载器（`loader.ts`，`resolveSkillsForJob`）+ 关系码契约取码 + 生成器（`skillGenerator.ts`）
- **books/** — 书籍 CRUD、章节拆分、分析任务创建（`startBookAnalysis.ts`）
- **graph/** — Neo4j 图谱操作（路径查找、布局更新）
- **auth/** — JWT 鉴权，Edge Runtime 令牌验证，Argon2id 密码
- **models/** — AI 模型配置 CRUD、默认模型解析（`defaultModel.ts`：loadSystemDefaultModel / loadModelById）、连通性测试与协议化客户端分发

> v4 的 `personas/relationships/knowledge/biography` 模块已删除（persona→entity、biographyRecord→fact 统一模型）；知识全部 Skill 化，无独立知识库。

### 服务端基础设施 (src/server/)

- `db/prisma.ts` — Prisma 客户端单例
- `db/neo4j.ts` — Neo4j 驱动单例
- `http/` — API 响应工具（`successResponse`、`errorResponse`、`failJson`、`parsePagination`）
- `providers/ai/` — AI 客户端实现（OpenAI 兼容基类 + 各供应商适配器）+ 统一 JSON 调用（`callJsonLlm.ts`）
- `security/` — 加密工具

### 前端组件 (src/components/)

- `ui/` — shadcn/ui 基础组件（不要直接编辑，通过 shadcn CLI 重新生成）
- `graph/` — 基于 D3 的图谱可视化组件
- `library/` — 书籍列表视图
- `review/` — 审核界面组件（role-workbench-panel、chapter-events-workbench、entity-merge-tool 等）
- `layout/` — 应用外壳、侧边栏、导航
- `theme/` — 主题管理（next-themes）

### 共享工具 (src/lib/)

- `client-api.ts` — 前端 API 客户端工具

### 路径别名

`@/*` 映射到 `./src/*`（在 tsconfig.json 和 vitest.config.ts 中同步配置）。

## 关键模式

### API 路由处理器

所有 API 路由使用 `src/server/http/` 的共享工具：
- 统一使用 `successResponse()` / `errorResponse()` 包装响应，保持一致的 JSON 信封格式
- 使用 `failJson()` 做错误映射（AuthError → 401/403，校验错误 → 400 等）
- 分页通过 `parsePagination(searchParams)` 解析

### 鉴权流程

Edge 中间件（`middleware.ts`）保护 `/admin/*` 和 `/api/admin/*` 路由。从 Cookie 验证 JWT，注入 `x-auth-role` / `x-auth-current-path` 请求头供下游使用。未登录时重定向到 `/login?redirect=...`。

### 分析管线（v7 逐章提取 + 实体验收闸 确定性编排）

书籍处理流程：上传 → 章节拆分 → 创建分析任务（`startBookAnalysis`）→ `runAnalysisJobById`（`analysis/jobs/runAnalysisJob.ts`）编排管线 → 图谱同步。

管线时序（硬约束，`runAnalysisJob.ts` 27 单测锁定；架构见 `docs/architecture/15-agent-architecture-v7.md`）：

```
claim(QUEUED→RUNNING) → 快照(selectSkillsForJob) → 装载(resolveSkillsForJob)
  → Pass1 逐章提取(extractSlice+实体验收闸+落库，临时实体，无登记表，chapterNo=本章)
  → Pass1.5 身份 Pass(identityPass：去重表面形式紧凑名单全局规范化)
  → Pass1.75 确定性归并(projection：临时实体→canonical，facts/mentions 重指向)+dropped 清理
  → Pass3 聚合(refreshRelationships+Neo4j)
  → Pass4 自动接受(acceptFactsForJob) → Pass5(markOrphan+skillGenerator) → 终态
```

关键点：

- **提取先于身份**：身份判定在"去重表面形式名单"上做（~10-15K token），不在原文上做——消除 v5 过度列举的结构性来源（3 章分卷看不到变体两端）
- **逐章提取（v7）**：片大小=1 章，章节归属天然正确；删除了 v6 的 chapterNo 输出 + evidence 反查（BIOGRAPHY 实测 41% 失败）
- **实体验收闸（v7）**：实体从保留事实两端反推，过"锚定+从属指称+泛称"三闸才落库，0 提及垃圾源头被挡
- **dropped 软删（v7）**：身份 Pass 判定的一次性称呼软删实体+mentions+以其为主体的 facts（不再是仅降置信）
- **personaCount 口径（v7）**：PERSON ∧ 未软删 ∧ ≥1 mention（`countEffectivePersonas`）
- **facts 唯一写入口**：facts/mentions/aliases 由管线落库（extractSlice 只返回不落库）
- **模型统一默认**：AiCallExecutor 恒走 `loadSystemDefaultModel`；跨模型复核显式传 `modelId`
- **skills 由 AI 动态选择**：任务启动 `selectSkillsForJob` 现选 + 快照进任务，任务间互不干扰
- 取消贯穿（每 Pass 前查 CANCELED）；提取并发 ≤3；章节失败重试 2 次
- 留痕：`agent_runs`（各 runType）+ `agent_write_audits`
- 已删除 v5 的 Tier1 原文枚举登记表 / Tier2 / reconcile（身份 Pass 看到全名单 + 频次，其召回兜底被覆盖）

### Prompt 模板

v5 已删除 prompt_templates 数据库表与知识库模块。Prompt 全部硬编码在各域 `prompts.ts`（减法原则，systemPrompt ≤300-500 token，无分步流程/CRITICAL/负面指令/few-shot）。领域知识由装载的 Skill MD 文档（frontmatter 契约 + 正文）注入。

### 数据库

- Prisma Client 生成到 `src/generated/prisma/`（gitignore 排除的产出物）
- Schema 使用 `@@map()` 映射为 snake_case 表名/列名
- Book 模型使用软删除（`deletedAt` 字段）
- Neo4j 存储图谱表示；PostgreSQL 是数据权威源
- AI 模型不再由 seed 重置；首次部署按 `docs/model-config-bootstrap.md` 在管理台添加首个模型
- 核心运行表：`entities`/`entity_profiles`/`aliases`/`mentions`/`facts`/`relationships`/`skills`/`skill_versions`/`analysis_jobs`/`agent_runs`/`agent_write_audits`（v5 统一实体/事实模型）
- 关系码契约在 skill frontmatter（`relationshipCodes` 闭集），非独立表

## 代码风格

- 双引号、必须分号、禁止尾逗号
- 多行对象字面量中冒号对齐（`@stylistic/key-spacing` align on colon）
- 使用 `type` 导入：`import { type Foo } from "..."`（ESLint 强制）
- Toaster 只能从 `@/components/ui/sonner` 导入，不能直接从 `sonner` 导入
- 未使用变量以 `_` 前缀允许保留；未使用导入自动移除
- 代码库中广泛使用中文注释
