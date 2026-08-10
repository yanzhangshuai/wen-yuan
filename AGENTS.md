# AGENTS.md

文渊：中国古典文学知识图谱系统（Next.js 16 App Router + React 19 + TS strict + Prisma 7 + Neo4j + D3）。深度中文项目，中文注释与交流。

`CLAUDE.md` 是权威的架构/流程文档（管线 v7、模块职责、鉴权、基础设施），本文件只写会踩坑的实操要点。

## 验证命令（提交/完成前按此顺序跑）

```bash
pnpm lint          # ESLint（flat config + @stylistic），错误需修
pnpm type-check    # tsc --noEmit
pnpm test          # vitest run --coverage，带覆盖率门禁，慢
```

- `pnpm test` 的覆盖率门禁**只统计 `src/server/**`**（阈值 lines/branches/functions/statements = 85/75/85/85）。改前端 UI 或 `scripts/` 时全量 `pnpm test` 没意义且慢。
- 聚焦验证用 `npx vitest run src/server/modules/<module>/<file>.test.ts`（测试与业务代码同目录共存）。
- 测试默认 **node** 环境（非 jsdom）；jsdom 仅在具体用例内按需启用。数据库依赖一律 mock，无需起数据库。
- 错误映射/业务测试位于 `src/server/modules/<domain>/`（analysis、identity、extraction、review、skills、books、graph、auth、models…），API 路由 `src/app/api/` 与之对应。

## 代码风格（ESLint 强制，不靠直觉）

- 双引号、必须有分号、**禁止尾逗号**。
- 多行对象字面量冒号**严格对齐**（key-spacing align on colon），key 用空格补齐对齐。
- `import { type Foo }` 强制；未使用 import 报错（`unused-imports`）。可用 `pnpm lint:fix` 自动修。
- Toaster 只能从 `@/components/ui/sonner` 导入（sonner 直导被禁）。

## ESM / 导入路径怪癖

- 项目 `"type": "module"`。`src/` 内用 `@/...` 别名、无扩展名导入；**`scripts/` 下（ts-node 直跑）必须写 `.ts` 扩展名**，否则解析失败。
- 路径别名 `@/* -> ./src/*` 在 tsconfig、vitest.config.ts 同步配置。

## 数据库 / Prisma 7

- Prisma Client 生成到 `src/generated/prisma/`（**已提交进 git**），**schema 变更后必须 `pnpm prisma:generate` 并提交重新生成的产物**，否则 CI/他人 checkout 会拿到旧 client。
- CLI 配置在 `prisma.config.ts`（读 `DATABASE_URL`）。schema 用 `@@map()` 映射 snake_case 表/列名。
- `pnpm prisma:migrate` = `prisma migrate dev`（开发库）。生产/部署走 docker compose 的 migrate 服务。
- Postgres 是数据权威源；Neo4j 只存图谱表示。本地端口：PG 5434、Neo4j Bolt 7687、App 3310。

## 基础设施 / 环境

- 全量部署 `docker compose up -d`；**开发模式**（数据库在宿主机）必须用：
  `docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build`
- 环境变量按环境文件加载：`.env` / `.env.dev` / `.env.test` / `.env.prod`（含 DATABASE_URL、NEO4J_*、JWT_SECRET）。
- AI 模型**不再 seed**；首次部署按 `docs/model-config-bootstrap.md` 在 `/admin/model` 手工添加首个模型（openai-compatible 协议为主，Gemini 才用 gemini 协议）。
- 鉴权：`middleware.ts` 保护 `/admin/*` 与 `/api/admin/*`，从 Cookie 验 JWT 并注入 `x-auth-role` / `x-auth-current-path` 头。

## Eval 门禁（改提取/身份/审核逻辑后验证）

`scripts/eval/run-eval.ts` 门禁 entityF1≥0.74 / relationF1≥0.68。**需要真实管线跑完 + 数据库**，非纯离线：

```bash
npx ts-node scripts/eval/export-extraction.ts 儒林外史 歧路灯   # 导出 facts → scripts/eval/results/<书>/ch01.json
node scripts/eval/run-eval.ts                                   # 注意用 node（Node 原生 type-stripping）
```

流程详见 `docs/books/eval-gate-runbook.md`。goldset 在 `scripts/goldset/`，书名必须与 goldset 目录名一致。

## 其他

- `scripts/skills/` 下是领域 skill MD（中文人名/称谓/关系码等），改提取 Prompt 前先看契约。
- 架构细节（v7 管线时序、facts 唯一写入口、AI 动态 skill 选择、审核棘轮）以 `CLAUDE.md` 与 `docs/architecture/15-agent-architecture-v7.md` 为准。
