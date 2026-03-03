# Quickstart: 数据库迁移与种子录入

## 前置条件

- 本机 PostgreSQL 可访问（当前项目使用 `127.0.0.1:5432`）。
- `.env` 中配置 `DATABASE_URL`。
- 已安装依赖并可执行 `pnpm`。

## 执行步骤

1. 生成 Prisma Client：

```bash
pnpm prisma:generate
```

2. 执行迁移（首次）：

```bash
pnpm prisma migrate dev --name init_schema
```

3. 执行种子录入：

```bash
pnpm prisma:seed
```

4. 边界验证（重复执行 seed）：

```bash
pnpm prisma:seed
```

5. 失败路径验证（模拟缺失配置）：

```bash
DATABASE_URL= pnpm prisma:seed
```

## 本次执行记录（2026-03-03）

- 迁移成功，生成并应用：`prisma/migrations/20260303065558_init_schema/migration.sql`
- 种子脚本成功执行两次，均输出：
  - `✅ 种子数据录入成功！`
  - `已创建书籍: 儒林外史`
- 失败路径验证成功：当 `DATABASE_URL` 为空时，脚本报错 `Missing DATABASE_URL in .env`

## 说明

- `prisma/seed.ts` 已改为事务化写入，确保多实体 seed 失败时整体回滚。
- 当前项目 `pnpm lint` 与 `pnpm tsc --noEmit` 存在既有问题：
  - `pnpm lint` 脚本在本项目环境下会报目录参数错误。
  - `pnpm tsc --noEmit` 存在与本次改动无关的既有类型错误（`AnalyzeButton` 路径）。
