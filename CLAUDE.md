# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指引。

## 项目概述

文渊是一个面向中国古典文学的知识图谱系统。核心流程：导入书籍（如《儒林外史》）→ 章节拆分 → AI 分析提取人物实体与关系 → 可视化交互式知识图谱。系统有两种用户角色：ADMIN（管理书籍、运行分析、审核 AI 产出）和 VIEWER（只读图谱浏览）。

## 技术栈

- **框架**：Next.js 16 (App Router) + React 19，TypeScript (strict)，Tailwind CSS v4
- **数据库**：PostgreSQL 16 (Prisma 7) + Neo4j 5.15 (neo4j-driver)
- **包管理**：pnpm（ESM 项目，`"type": "module"`）
- **测试**：Vitest + V8 覆盖率（行覆盖率阈值 90%）
- **Lint**：ESLint flat config + typescript-eslint + `@stylistic` 格式化规则
- **UI 组件**：Radix UI 基础组件 + shadcn/ui 模式，位于 `src/components/ui/`
- **图谱可视化**：D3 (d3-force, d3-zoom, d3-drag, d3-selection)
- **AI 供应商**：多供应商（DeepSeek、Qwen、Doubao、Gemini、GLM），统一 OpenAI 兼容客户端模式

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
- `admin/` — 管理后台（书籍管理、知识库、模型配置、审核）
- `api/` — API 路由处理器（与模块结构对应）
- `login/` — 登录页

### 服务端模块 (src/server/modules/)

每个模块是独立的业务域，包含各自的服务函数、错误类型和测试：

- **analysis/** — 核心 AI 分析管线。通过工厂模式选择两种架构：
  - `pipelines/sequential/` — 逐章顺序分析
  - `pipelines/twopass/` — 两遍式架构，含全局实体消解
  - `config/pipeline.ts` — 调优阈值（置信度、分片大小、并发数）
  - `services/` — ChapterAnalysisService、PersonaResolver、PostAnalysisMerger
- **books/** — 书籍 CRUD、章节拆分、分析任务启动
- **personas/** — 人物 CRUD、合并/拆分操作
- **relationships/** — 人物间关系管理
- **knowledge/** — 知识库：书籍类型、命名模式、提取规则、提示词模板基线、知识包
- **graph/** — Neo4j 图谱操作（路径查找、布局更新）
- **auth/** — JWT 鉴权，Edge Runtime 令牌验证，Argon2id 密码
- **models/** — AI 模型配置与供应商注册
- **review/** — AI 产出的人工审核流程（批量审核、合并建议）
- **biography/** — 人物传记事件管理（通过 API 路由）

### 服务端基础设施 (src/server/)

- `db/prisma.ts` — Prisma 客户端单例
- `db/neo4j.ts` — Neo4j 驱动单例
- `http/` — API 响应工具（`successResponse`、`errorResponse`、`failJson`、`parsePagination`）
- `providers/ai/` — AI 客户端实现（OpenAI 兼容基类 + 各供应商适配器）
- `security/` — 加密工具

### 前端组件 (src/components/)

- `ui/` — shadcn/ui 基础组件（不要直接编辑，通过 shadcn CLI 重新生成）
- `graph/` — 基于 D3 的图谱可视化组件
- `library/` — 书籍列表视图
- `review/` — 审核界面组件
- `layout/` — 应用外壳、侧边栏、导航
- `theme/` — 主题管理（next-themes）

### 共享工具 (src/lib/)

- `client-api.ts` — 前端 API 客户端工具
- `model-recommendations.ts` — 各分析阶段的模型选择推荐

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

### 分析管线

书籍处理流程：上传 → 章节拆分 → 创建分析任务 → 管线执行（sequential 或 twopass）→ 人物消解 → 分析后合并 → 同步图谱到 Neo4j。`analysis/config/pipeline.ts` 中的阈值是影响召回率/精度的业务参数。

### 数据库

- Prisma Client 生成到 `src/generated/prisma/`（gitignore 排除的产出物）
- Schema 使用 `@@map()` 映射为 snake_case 表名/列名
- Book 模型使用软删除（`deletedAt` 字段）
- Neo4j 存储图谱表示；PostgreSQL 是数据权威源

## 代码风格

- 双引号、必须分号、禁止尾逗号
- 多行对象字面量中冒号对齐（`@stylistic/key-spacing` align on colon）
- 使用 `type` 导入：`import { type Foo } from "..."`（ESLint 强制）
- Toaster 只能从 `@/components/ui/sonner` 导入，不能直接从 `sonner` 导入
- 未使用变量以 `_` 前缀允许保留；未使用导入自动移除
- 代码库中广泛使用中文注释
