# Backend Architecture（后端架构）

更新时间：2026-03-26

## 1. 分层结构

当前后端采用清晰分层：

1. 路由层：`src/app/api/**`
2. 业务层：`src/server/modules/**`
3. 基础设施层：`src/server/providers/**`、`src/server/db/**`、`src/server/security/**`
4. 协议层：`src/server/http/**`（统一响应、错误映射、分页解析）

请求主链路：

`Route Handler -> Module Service -> Prisma/Provider -> Response Envelope`

## 2. 鉴权架构

- Middleware（`middleware.ts`）只拦截 `/admin/*` 与 `/api/admin/*`：
- 校验 Cookie `token`。
- 注入 `x-auth-role`、`x-auth-current-path`。
- viewer 访问受保护路径时重定向 `/login?redirect=...`。
- 业务路由中再做 `getAuthContext + requireAdmin`，防止仅依赖中间件。
- 角色统一使用 Prisma 枚举：`AppRole.ADMIN` / `AppRole.VIEWER`。

## 3. 核心业务流

## 3.1 登录与会话

- `POST /api/auth/login`
- 同源校验（`Origin` 必须同站）。
- 按 IP 失败计数与临时锁定（内存限流）。
- `users` 表 + Argon2id 验证。
- 签发 JWT（7 天）并写入 httpOnly Cookie。
- `POST /api/auth/logout` 清 Cookie，幂等。

## 3.2 导入与存储

- `POST /api/books`（Admin）
- 接收 `multipart/form-data`（当前仅 `.txt`，最大 50MB）。
- 通过 `provideStorage()` 写入存储层。
- 当前实现：`local` provider；`oss` provider 预留未实现。
- 落库 `books`，保存 `source_file_*` 元数据与 `raw_content`。

## 3.3 章节切分与阅读

- `GET /api/books/:id/chapters/preview`：自动切分预览（不落库）。
- `POST /api/books/:id/chapters/confirm`（Admin）：确认后覆盖写入 `chapters`。
- `GET /api/books/:id/chapters/:chapterId/read`：按段读取与高亮回跳支持。

## 3.4 解析任务

- `POST /api/books/:id/analyze`（Admin）
- 先创建 `analysis_jobs` 任务并更新书籍状态为 `PROCESSING`。
- 路由层随后以 fire-and-forget 方式异步调度 `runAnalysisJobById(jobId)`，立即返回 `202`。
- 任务执行器支持：
  - `QUEUED -> RUNNING` 原子抢占（避免并发重复消费）
  - 进程中断后的 `RUNNING` 任务恢复执行
  - 章节级进度推进与失败回写（`books.parse_progress/parse_stage/error_log`）
- 写入 `analysis_jobs`（支持 `scope/chapter range/overrideStrategy/keepHistory`）。
- 路由不等待任务跑完，避免长请求阻塞；执行结果由任务状态与书籍状态字段体现。

## 3.5 图谱与审核

- 图谱读取：`/api/books/:id/graph`、`/api/books/:id/personas`、`/api/books/:id/relationships`。
- 最短路径：`POST /api/graph/path`。
- 优先尝试 Neo4j；未配置 Neo4j 时回退 PostgreSQL + BFS。
- 审核能力集中在 `/api/admin/*`：草稿批量确认/拒绝、合并建议处理、模型管理。

## 4. Provider 抽象

## 4.1 AI Provider

- 目录：`src/server/providers/ai/`
- 已实现：DeepSeek、Gemini、Qwen、Doubao（含 OpenAI-compatible 抽象）。

## 4.2 Storage Provider

- 目录：`src/server/providers/storage/`
- 接口：`putObject/deleteObject/getObjectUrl`。
- 实现：`LocalStorageProvider`。
- 访问链路：`/api/assets/[...key]` -> 本地文件读取 -> Content-Type 推断。

## 4.3 安全能力

- `src/server/security/encryption.ts`：
- 模型 Key 使用 AES-256-GCM（`APP_ENCRYPTION_KEY`）加密存储。
- 输出给前端时仅脱敏显示。

## 5. 设计约束

- 全部 API 使用统一 envelope，便于前端与日志系统稳定消费。
- 写接口默认管理员权限，读接口默认 viewer 可读（除 `/api/admin/*`）。
- 软删除优先，避免破坏审计链路。
- `src/server/actions` 已不再承载后端主流程，主逻辑统一在 `src/server/modules` + `src/app/api`。
- 解析主链路关键节点（`startBookAnalysis`、`runAnalysisJobById`、`/api/books/:id/analyze`）已补齐结构化详细注释，便于排障与交接。
