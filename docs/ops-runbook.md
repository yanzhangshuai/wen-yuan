# Ops Runbook（后端运行手册）

更新时间：2026-03-26

## 1. 本地启动

1. 安装依赖：`pnpm install`
2. 生成 Prisma Client：`pnpm prisma:generate`
3. 执行迁移：`pnpm prisma:migrate`
4. 初始化种子：`pnpm prisma:seed`
5. 启动开发：`pnpm dev`

说明：当前 `dev` 脚本端口为 `3060`（见 `package.json`）。

## 2. 环境变量

最低必需：

- `DATABASE_URL`
- `JWT_SECRET`（至少 32 字节）
- `APP_ENCRYPTION_KEY`

管理员 seed：

- `ADMIN_USERNAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`（可选）

存储：

- `STORAGE_PROVIDER`（默认 `local`）
- `STORAGE_LOCAL_ROOT`（默认 `storage`）
- `STORAGE_PUBLIC_BASE_URL`（默认 `/api/assets`）

AI/模型：

- `MODEL_TEST_ALLOWED_HOSTS`（可选）
- 不使用模型级环境变量（如 `DEEPSEEK_API_KEY`）；模型 Key 统一在 `/admin/model` 配置并以密文入库

Neo4j（可选）：

- `NEO4J_URI`
- `NEO4J_USER`
- `NEO4J_PASSWORD`

## 3. 日常检查命令

- 类型与风格：`pnpm lint`
- 单测：`pnpm test:unit`
- Prisma 状态：`pnpm prisma:migrate status`

## 4. 常见故障处理

## 4.1 Prisma `P2022`（列不存在）

现象：`The column (...) does not exist in the current database`

处理：

1. `pnpm prisma:generate`
2. `pnpm prisma:migrate`
3. 如有历史环境差异，先确认当前数据库是否正确连接到目标 `DATABASE_URL`

## 4.2 Edge Runtime 报 Node 模块错误

现象：`node:path/node:crypto is not supported in the Edge Runtime`

处理：

1. 检查 `middleware.ts` 依赖链，避免引入 `Prisma Client` 或仅 Node Runtime 可用模块。
2. Middleware 只依赖 edge-safe 模块（当前实现使用 `auth/edge-token` + `jose`）。

## 4.3 登录接口返回 403“非法请求来源”

原因：`POST /api/auth/login` 强制同源校验。

处理：

1. 浏览器环境直接调用即可。
2. Postman/curl 需携带与请求地址一致的 `Origin` 头。

## 4.4 登录频率被限制（429）

机制：同 IP 5 分钟窗口累计失败达阈值后锁定 15 分钟。

处理：

1. 等待 `Retry-After` 指示时间后重试。
2. 本地开发可重启进程清空内存限流状态。

## 4.5 存储访问异常

现象：`/api/assets/*` 404/500 或导入失败。

处理：

1. 检查 `STORAGE_PROVIDER` 是否为已实现的 `local`。
2. 检查 `STORAGE_LOCAL_ROOT` 目录权限。
3. 校验对象 key 合法性（禁止 `../` 路径穿越）。

## 4.6 Neo4j 不可用

现象：图路径查询无法使用 Neo4j。

处理：

1. 未配置 Neo4j 时，系统会自动回退 PostgreSQL + BFS。
2. 若需启用 Neo4j，补齐 `NEO4J_*` 三个变量并确认连接可用。

## 5. 可中断执行建议

为了适配“今天没跑完、明天继续”：

1. 每次改动后先跑 `pnpm lint` 与关键单测再停。
2. 迁移与 seed 完成后再切分业务任务，避免第二天环境不一致。
3. 解析任务状态保存在 `analysis_jobs`，中断后可根据任务状态继续排查与补跑。
