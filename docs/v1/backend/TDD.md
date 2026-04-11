# 文渊后端 — 测试、验收与交付计划（TDD）

> 版本：1.0  
> 日期：2026-03-26  
> 执行角色：Codex 5.3（自动化执行）  
> 基准文档：PRD v1.2、task-backend.md、api-contracts.md、backend-architecture.md、db-dictionary.md

---

## 一、文档目的与范围

本文档是**后端代码完整性验收的权威执行手册**。Codex 在完成每一个阶段的代码实现后，必须严格按本文档逐项执行验收，所有验收项 100% 通过后方可标记该阶段完成。

**覆盖范围：**

- 所有 API Route Handler（`src/app/api/**`）
- 所有业务模块（`src/server/modules/**`）
- 所有基础设施层（`src/server/db/**`、`src/server/providers/**`、`src/server/security/**`）
- 中间件（`middleware.ts`）
- 数据库 Schema（`prisma/schema.prisma`）与种子数据（`prisma/seed.ts`）

**不在范围内：**

- 前端组件、页面渲染正确性
- AI 模型实际响应质量（模型外部依赖）
- Neo4j 社区检测算法（Phase 5 后续）

---

## 二、执行环境要求

执行所有验收前，必须确认以下环境就绪：

```bash
# 1. 依赖安装
pnpm install

# 2. Prisma 客户端生成
pnpm prisma:generate

# 3. 数据库迁移已应用
pnpm prisma:migrate
# 期望输出：Database schema is up to date!

# 4. 种子数据已写入
pnpm prisma:seed

# 5. TypeScript 编译
pnpm build
# 期望：0 errors

# 6. ESLint 检查
pnpm lint
# 期望：0 errors, 0 warnings
```

**必需环境变量（`.env.test` 或测试时注入）：**

```
DATABASE_URL=postgresql://...（测试库，与生产隔离）
JWT_SECRET=test-jwt-secret-at-least-32-bytes-001
APP_ENCRYPTION_KEY=test-enc-key-at-least-32-bytes-002
STORAGE_PROVIDER=local
STORAGE_LOCAL_ROOT=./storage-test
NODE_ENV=test
```

---

## 三、测试策略总览

| 测试层 | 工具 | 目标 | 说明 |
|---|---|---|---|
| 单元测试 | Vitest + vi.mock | 纯逻辑隔离，mock 所有外部依赖 | 每个 `.ts` 业务文件均须有对应 `.test.ts` |
| 集成测试 | Vitest + 真实 DB | Route Handler + 真实 Prisma（测试数据库） | 主链路主要场景 |
| 安全基线检查 | 代码审查 + 单测 | OWASP Top 10 适用项 | 附录 A 逐项核查 |
| 性能基线 | 手动或 k6 | p95 响应时间 | 附录 B |

**覆盖率门槛（强制）：**

```
lines: ≥ 90%
branches: ≥ 90%
functions: ≥ 90%
statements: ≥ 90%
```

运行覆盖率命令：

```bash
pnpm test:unit
```

覆盖率报告输出至 `coverage/unit/`，不满足门槛时 CI 必须失败。

---

## 四、Phase 1 验收：基础层

### 4.1 数据库 Schema 验收

#### 4.1.1 迁移状态验收

```bash
pnpm prisma:migrate status
```

**必须通过条件：**

- [ ] 输出 `Database schema is up to date!`
- [ ] 无 `drift detected` 警告
- [ ] 无未应用的 pending migration

#### 4.1.2 枚举值验收

逐一验证以下枚举存在于数据库并与代码对齐：

| 枚举 | 期望值 |
|---|---|
| `NameType` | `NAMED`, `TITLE_ONLY` |
| `RecordSource` | `AI`, `MANUAL` |
| `AppRole` | `ADMIN`, `VIEWER` |
| `ProcessingStatus` | `DRAFT`, `VERIFIED`, `REJECTED` |
| `AnalysisJobStatus` | `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELED` |
| `PersonaType` | `PERSON`, `LOCATION`, `ORGANIZATION`, `CONCEPT` |
| `BioCategory` | `BIRTH`, `EXAM`, `CAREER`, `TRAVEL`, `SOCIAL`, `DEATH`, `EVENT` |
| `ChapterType` | `PRELUDE`, `CHAPTER`, `POSTLUDE` |

**验收断言（单元测试内）：**

```typescript
it("BioCategory enum values are aligned with task spec", () => {
  expect(Object.values(BioCategory)).toContain("BIRTH");
  expect(Object.values(BioCategory)).toContain("CAREER");
  // 全量覆盖所有枚举值
});
```

#### 4.1.3 核心表结构验收

以下字段必须存在并类型正确：

**`books` 表：**
- [ ] `ai_model_id UUID?` FK → `ai_models.id`
- [ ] `parse_progress Int DEFAULT 0`
- [ ] `parse_stage String?`
- [ ] `raw_content Text?`
- [ ] `source_file_key String?`
- [ ] `source_file_url String?`
- [ ] `source_file_name String?`
- [ ] `source_file_mime String?`
- [ ] `source_file_size Int?`

**`personas` 表：**
- [ ] `name_type NameType DEFAULT NAMED`
- [ ] `record_source RecordSource DEFAULT AI`
- [ ] `aliases String[]`
- [ ] `confidence Float DEFAULT 1.0`
- [ ] `deleted_at Timestamptz?`

**`relationships` 表：**
- [ ] `record_source RecordSource DEFAULT AI`
- [ ] `confidence Float DEFAULT 1.0`
- [ ] `evidence Text?`
- [ ] `deleted_at Timestamptz?`
- [ ] 联合唯一约束：`(chapter_id, source_id, target_id, type, record_source)`

**`analysis_jobs` 表：**
- [ ] 所有字段符合 task-backend §3.9 定义
- [ ] `status AnalysisJobStatus DEFAULT QUEUED`
- [ ] `scope String DEFAULT 'FULL_BOOK'`

**`merge_suggestions` 表：**
- [ ] 所有字段符合 task-backend §3.10 定义
- [ ] `status String DEFAULT 'PENDING'`

#### 4.1.4 种子数据验收

```bash
pnpm prisma:seed
```

**验收条件：**

- [ ] `users` 表存在 1 条 `role=ADMIN` 记录，`username` = 环境变量 `ADMIN_USERNAME`
- [ ] 密码字段以 `$argon2id$` 开头（非明文）
- [ ] `ai_models` 表存在 7 条预置模型记录：DeepSeek V3、DeepSeek R1、通义千问 Max、通义千问 Plus、豆包 Pro、GLM 4.6、Gemini Flash
- [ ] 所有模型 `is_enabled=false`，`is_default=false`（初始状态）
- [ ] Seed 幂等：重复执行不报错，不产生重复数据

---

### 4.2 Storage Provider 验收

**测试文件：** `src/server/providers/storage/index.test.ts`

#### 4.2.1 接口契约测试

| 测试用例 | 验收条件 |
|---|---|
| `STORAGE_PROVIDER=local` 时路由到 LocalStorageProvider | `provideStorage('local')` 返回实例，不抛错 |
| `STORAGE_PROVIDER=LOCAL`（大写）时正常路由 | 大小写不敏感，normalize 生效 |
| `STORAGE_PROVIDER=oss` 时抛出明确错误 | `Error: OSS storage provider is not implemented yet` |
| `STORAGE_PROVIDER=unknown` 时抛出明确错误 | `Error: Unsupported STORAGE_PROVIDER: unknown` |
| 默认值为 `local` | 不传 provider 时使用 local |

#### 4.2.2 LocalStorageProvider 行为测试

| 测试用例 | 验收条件 |
|---|---|
| `putObject(key, buffer)` 写入文件 | 文件存在于 `STORAGE_LOCAL_ROOT/key`，内容一致 |
| `putObject` 自动创建中间目录 | `mkdir -p` 行为验证 |
| `deleteObject(key)` 删除已存在文件 | 文件不再存在 |
| `deleteObject` 删除不存在文件 | 不抛错（幂等） |
| `getObjectUrl(key)` 返回正确 URL | 格式为 `/api/assets/{key}` |
| 路径穿越攻击防护 | `key = '../../../etc/passwd'` → 抛出错误 |

**路径安全强制验收：**

```typescript
it("rejects path traversal in key", async () => {
  const provider = new LocalStorageProvider("/tmp/storage-test");
  await expect(
    provider.putObject("../../etc/passwd", Buffer.from("x"))
  ).rejects.toThrow();
});
```

#### 4.2.3 静态资源代理 API 验收

**文件：** `src/app/api/assets/[...key]/route.test.ts`

| 测试用例 | 期望 HTTP 状态 | 验收条件 |
|---|---|---|
| GET `/api/assets/books/valid-file.txt`（文件存在） | 200 | 返回文件内容，`Content-Type: text/plain` |
| GET `/api/assets/books/image.png`（存在） | 200 | `Content-Type: image/png` |
| GET `/api/assets/not-found.txt`（不存在） | 404 | 标准错误 envelope |
| GET `/api/assets/../etc/passwd`（路径穿越） | 400 或 404 | 不暴露服务器文件 |
| 响应 Header 不含物理路径 | — | 无服务器路径泄露 |

---

### 4.3 鉴权模块验收

**测试文件：**
- `src/server/modules/auth/index.test.ts`
- `src/server/modules/auth/password.test.ts`
- `src/middleware.test.ts`
- `src/app/api/auth/login/route.test.ts`
- `src/app/api/auth/logout/route.test.ts`

#### 4.3.1 密码安全（`password.ts`）

| 测试用例 | 验收条件 |
|---|---|
| `hashPassword` 不返回明文 | 返回值不等于输入 |
| 哈希结果以 `$argon2id$` 开头 | Argon2id 算法确认 |
| `verifyPassword(correct, hash)` 返回 `true` | 正确密码验证通过 |
| `verifyPassword(wrong, hash)` 返回 `false` | 错误密码验证失败 |
| 两次相同密码哈希值不同 | 盐值随机性验证 |

#### 4.3.2 Token 签发与验证（`token.ts`）

| 测试用例 | 验收条件 |
|---|---|
| `issueAuthToken(issuedAt)` 返回 JWT 字符串 | 非空字符串，可解析 |
| `verifyAuthToken(validToken)` 返回 payload | `{ role: 'ADMIN', iat, exp }` |
| `verifyAuthToken(expiredToken)` 抛错 | 过期 token 被拒绝 |
| `verifyAuthToken(tamperedToken)` 抛错 | 篡改签名被拒绝 |
| JWT payload 不包含密码或 API Key | payload 字段白名单检查 |
| token 有效期 ≤ 7 天（604800 秒） | `exp - iat ≤ 604800` |

#### 4.3.3 Auth 上下文与守卫（`index.ts`）

| 测试用例 | 验收条件 |
|---|---|
| `x-auth-role: ADMIN` header → `{ role: ADMIN }` | Middleware 注入的 header 被识别 |
| 无 header → `{ role: VIEWER }` | 默认 viewer |
| Cookie 含有效 admin token → `{ role: ADMIN }` | 直接 cookie 验证路径 |
| Middleware role=VIEWER + 有效 cookie → `{ role: ADMIN }` | Cookie 优先于 middleware header |
| `requireAdmin({ role: ADMIN })` 不抛错 | 管理员通过 |
| `requireAdmin({ role: VIEWER })` 抛 `AuthError(AUTH_FORBIDDEN)` | 非管理员被拒绝 |
| `sanitizeRedirectPath(null)` → `"/"` | 空值回退 |
| `sanitizeRedirectPath("//evil.com")` → `"/"` | 开放重定向防护 |
| `sanitizeRedirectPath("http://evil.com/x")` → `"/"` | 外部 URL 被拒绝 |
| `sanitizeRedirectPath("/admin/books")` → `"/admin/books"` | 合法路径透传 |

#### 4.3.4 中间件行为（`middleware.ts`）

| 测试用例 | 期望 | 验收条件 |
|---|---|---|
| Viewer 访问 `/admin/model` | 307 重定向 | Location: `/login?redirect=%2Fadmin%2Fmodel` |
| Viewer 访问 `/admin` | 307 重定向 | Location: `/login?redirect=%2Fadmin` |
| Viewer 访问 `/api/admin/drafts` | 307 重定向 | admin API 被保护 |
| Admin 持有效 token 访问 `/admin/model` | 200（透传） | `x-auth-role: ADMIN` header 注入 |
| Admin 访问 `/api/admin/drafts` | 透传（200） | 请求继续 |
| 无 token 访问 `/api/books`（public） | 透传 | public 路由不被 middleware 拦截 |
| `buildCurrentPath("/admin", "?tab=keys")` | `"/admin?tab=keys"` | search 正确拼接 |
| `buildRedirectTarget("/admin/model?tab=keys")` | 正确 URL 编码 | — |

#### 4.3.5 登录 API（`POST /api/auth/login`）

| 测试用例 | 期望状态 | 验收条件 |
|---|---|---|
| 正确账号密码 | 200 | `success: true`，`code: AUTH_LOGGED_IN`，响应含 `Set-Cookie: token=...` |
| Cookie 为 httpOnly + SameSite=Strict | — | Response header 检查 |
| 错误密码 | 401 | 错误信息不区分账号/密码 |
| 账号不存在 | 401 | 与错误密码返回相同错误信息（防枚举攻击） |
| 非同源 Origin | 403 | CSRF 防护生效 |
| 缺失 Origin header | 403 | — |
| `identifier` 为邮箱 | 200 | 邮箱登录路径支持 |
| `identifier` 为用户名 | 200 | 用户名登录路径有效 |
| 已停用账号（`is_active=false`） | 401 | 不允许登录 |
| 请求体缺失 `identifier` | 400 | Zod 校验错误 |
| 请求体缺失 `password` | 400 | Zod 校验错误 |
| 登录成功后 `last_login_at` 更新 | — | 数据库字段更新 |
| 响应 `data.user` 含 `{ id, username, name, role }` | — | 不含密码字段 |

#### 4.3.6 登出 API（`POST /api/auth/logout`）

| 测试用例 | 期望状态 | 验收条件 |
|---|---|---|
| 正常登出 | 200 | `Set-Cookie: token=; Max-Age=0` |
| 未登录状态登出 | 200 | 幂等，不报错 |

#### 4.3.7 登录限流验收

| 测试用例 | 验收条件 |
|---|---|
| 同 IP 5 分钟内失败 10 次后第 11 次 | 429，`Retry-After` header |
| 429 响应含 `code: COMMON_RATE_LIMITED` | 错误码正确 |
| 不同 IP 不互相影响 | IP1 锁定，IP2 仍可尝试 |

---

## 五、Phase 2 验收：书籍导入与 AI 解析

### 5.1 书籍 CRUD 验收

#### 5.1.1 书籍列表（`GET /api/books`）

**测试文件：** `src/app/api/books/route.test.ts` / `src/server/modules/books/listBooks.test.ts`

| 测试用例 | 期望状态 | 验收条件 |
|---|---|---|
| 正常获取书库列表 | 200 | `data` 为数组，含 `id/title/status` 字段 |
| 返回 `chapterCount` 统计 | 200 | 章节数正确 |
| 返回 `personaCount` 统计 | 200 | 有效人物数（不含软删除/REJECTED） |
| 返回 `lastAnalyzedAt` | 200 | 最近解析任务时间 |
| 返回 `currentModel` | 200 | 当前/最近模型名 |
| 返回 `lastErrorSummary`（失败时） | 200 | 失败摘要 |
| 软删除书籍不出现在列表 | 200 | `deleted_at IS NOT NULL` 被过滤 |
| 空书库返回空数组 | 200 | `data: []` |
| 多本书按 `created_at DESC` 排序 | 200 | 最新书在前 |
| 公开接口（无需登录） | 200 | viewer 可访问 |

#### 5.1.2 创建书籍（`POST /api/books`）

**测试文件：** `src/app/api/books/route.test.ts` / `src/server/modules/books/createBook.test.ts`

| 测试用例 | 期望状态 | 验收条件 |
|---|---|---|
| Admin 上传合法 `.txt` 文件 | 201 | `source_file_key`、`source_file_url` 已写入 |
| 文件写入 Storage Provider | — | 文件实际存在于 `storage/books/{id}/source/` |
| `raw_content` 已写入数据库 | — | Prisma 记录包含原始文本 |
| 初始 `status` 为 `PENDING` | — | 入库状态正确 |
| 文件超过 50MB | 413 | 明确错误提示 |
| 非 `.txt` 文件（如 `.pdf`） | 400 | 明确错误提示 |
| Viewer 上传 | 403 | `AUTH_FORBIDDEN` |
| 未登录上传 | 403 | 权限拒绝 |
| Storage putObject 被调用 | — | mock 验证调用参数 |
| `sourceFile*` 字段全部写入 | — | 所有元数据字段齐全 |

#### 5.1.3 书籍详情（`GET /api/books/:id`）

**测试文件：** `src/server/modules/books/getBookById.test.ts`

| 测试用例 | 期望状态 | 验收条件 |
|---|---|---|
| 有效 bookId | 200 | 返回完整书籍信息 |
| 不存在的 bookId | 404 | `COMMON_NOT_FOUND` |
| 软删除的 bookId | 404 | 同上 |
| 非 UUID 格式 bookId | 400 | Zod 校验错误 |
| 公开接口 | 200 | 无需登录 |

#### 5.1.4 删除书籍（`DELETE /api/books/:id`）

**测试文件：** `src/server/modules/books/deleteBook.test.ts`

| 测试用例 | 期望状态 | 验收条件 |
|---|---|---|
| Admin 软删除存在书籍 | 200 | `deleted_at` 写入，记录仍存在 |
| 删除后详情 API 返回 404 | 404 | 软删除过滤生效 |
| Viewer 删除 | 403 | 权限拒绝 |
| 删除不存在书籍 | 404 | `COMMON_NOT_FOUND` |

---

### 5.2 章节相关验收

#### 5.2.1 章节预览（`GET /api/books/:id/chapters/preview`）

**测试文件：** `src/server/modules/books/getChapterPreview.test.ts`

| 测试用例 | 验收条件 |
|---|---|
| 返回章节列表（type/no/title） | 结构正确 |
| 识别 `PRELUDE`（序言）类型 | ChapterType.PRELUDE |
| 识别 `POSTLUDE`（跋）类型 | ChapterType.POSTLUDE |
| 无 `raw_content` 时返回明确错误 | 500 或 400 |
| 章节识别不落库 | DB 无新 chapter 记录 |
| bookId 不存在 | 404 |

#### 5.2.2 章节确认（`POST /api/books/:id/chapters/confirm`）

**测试文件：** `src/server/modules/books/confirmBookChapters.test.ts`

| 测试用例 | 验收条件 |
|---|---|
| 提交章节列表后写入数据库 | `chapters` 表有对应记录 |
| 覆盖历史章节数据 | 旧章节被完全替换 |
| 章节 `(book_id, type, no)` 联合唯一约束 | 重复 no 时报正确错误 |
| Viewer 调用 | 403 |

#### 5.2.3 章节阅读（`GET /api/books/:id/chapters/:chapterId/read`）

**测试文件：** `src/server/modules/books/readChapter.test.ts`

| 测试用例 | 验收条件 |
|---|---|
| 获取章节原文 | 返回 `content` 字段 |
| 使用 `paraIndex` 参数定位段落 | 返回对应段落内容 |
| `highlight` 参数传递 | 响应含高亮锚点信息 |
| 章节不存在 | 404 |
| 公开接口 | 200（无需登录） |

---

### 5.3 AI 解析任务验收

#### 5.3.1 启动解析（`POST /api/books/:id/analyze`）

> **契约来源：** `api-contracts.md §5`  
> 成功状态码：**`202 Accepted`**（而非 200）；成功业务码：`BOOK_ANALYSIS_STARTED`。  
> 路由行为：先创建任务再以 **fire-and-forget** 异步调度 `runAnalysisJobById(jobId)`，立即返回 202，不等待执行完成。

**测试文件：** `src/server/modules/books/startBookAnalysis.test.ts`、`src/app/api/books/[id]/analyze/route.test.ts`

| 测试用例 | 期望状态 | 验收条件 |
|---|---|---|
| Admin 启动全书解析 | **202** | `code: "BOOK_ANALYSIS_STARTED"`；`analysis_jobs` 创建，`status=QUEUED` |
| 任务创建后书籍状态联动 | — | `books.status=PROCESSING`，`parse_progress=0`，`parse_stage="文本清洗"` |
| `runAnalysisJobById` 被异步调用 | — | mock 验证函数被调用，但路由不 await 其结果 |
| 路由返回时任务可仍在 QUEUED（未执行完） | 202 | 不等待任务完成即响应 |
| 指定 `scope=CHAPTER_RANGE` + 合法范围 | 202 | `chapter_start/end` 写入任务记录 |
| `scope=CHAPTER_RANGE` 但缺少范围 | 400 | `AnalysisScopeInvalidError` |
| `chapterStart > chapterEnd` | 400 | 范围校验错误 |
| 指定不存在的 `aiModelId` | 404 | `AnalysisModelNotFoundError` |
| 指定已禁用模型 | 400 | `AnalysisModelDisabledError` |
| 书籍不存在 | 404 | `BookNotFoundError` |
| Viewer 调用 | 403 | 权限拒绝 |
| 携带 `overrideStrategy=DRAFT_ONLY` | 202 | 参数写入任务记录 |
| 携带 `overrideStrategy=ALL_DRAFTS` | 202 | 参数写入任务记录 |
| 携带 `keepHistory=true` | 202 | 参数写入任务记录 |
| `FULL_BOOK` 不携带范围参数 | 202 | `chapter_start/end` 为 null |

#### 5.3.2 解析进度（`GET /api/books/:id/status`）

**测试文件：** `src/server/modules/books/getBookStatus.test.ts`

| 测试用例 | 验收条件 |
|---|---|
| 返回 `status/progress/stage` 字段 | 结构符合 api-contracts |
| 任务刚创建时 `progress=0`，`stage="文本清洗"` | 与 `startBookAnalysis` 初始写入值一致 |
| `progress` 范围 0–100 | 数值合法 |
| `COMPLETED` 状态下 `progress=100` | 逻辑一致 |
| `ERROR` 状态下含 `errorLog` | 错误信息可读 |
| 公开接口 | 无需登录 |

#### 5.3.3 解析任务执行器（`runAnalysisJob`）

> **契约来源：** `backend-architecture.md §3.4`、`db-dictionary.md analysis_jobs`

**测试文件：** `src/server/modules/analysis/jobs/runAnalysisJob.test.ts`

**状态机流转验证：**

| 测试用例 | 验收条件 |
|---|---|
| 执行器开始时将任务 `QUEUED → RUNNING`（原子操作） | 数据库写入 `status=RUNNING`，`started_at` 非空 |
| 已被其他进程抢占为 `RUNNING` 的任务被跳过 | 不重复执行（并发防护）|
| 进程重启后发现遗留 `RUNNING` 任务，恢复执行 | 孤儿任务被续跑，不丢失 |
| 全部章节成功后任务 `RUNNING → SUCCEEDED` | `status=SUCCEEDED`，`finished_at` 非空 |
| 书籍状态随任务成功更新 | `books.status=COMPLETED`，`parse_progress=100` |
| 单章节 AI 调用失败时任务 `RUNNING → FAILED` | `status=FAILED`，`error_log` 含错误摘要 |
| 书籍状态随任务失败更新 | `books.status=ERROR`，`error_log` 非空 |
| 章节级进度推进 | 每章完成后 `books.parse_progress` 递增，`parse_stage` 更新 |
| `CANCELED` 状态任务不被执行 | 执行器检测到 `CANCELED` 后跳过 |

---

### 5.4 ChapterAnalysisService 单元验收

**测试文件：** `src/server/modules/analysis/services/ChapterAnalysisService.test.ts`

| 测试用例 | 验收条件 |
|---|---|
| 章节不存在时抛明确错误 | 非静默失败 |
| AI 返回合法 JSON → 写入 personas/mentions/biographies/relationships | 数据库操作被 mock 调用 |
| AI 返回缺字段 JSON → 字段填 null，不崩溃 | 容错处理验证 |
| AI 置信度 < 0.7 的实体被特殊标记 | `confidence < 0.7` 对应逻辑 |
| 匿名群体不提取（"众邻居"、"几个秀才" 等） | 不产生对应 Persona 记录 |
| 长文本自动分段（> MAX_CHUNK_LENGTH=3500） | 多 chunk 分拆，每段独立调用 AI |
| AI 并发数 ≤ AI_CONCURRENCY（3） | mock 验证并发上限 |
| AI 失败后 retry ≤ AI_MAX_RETRIES（2）次 | mock 验证重试次数 |
| 所有操作在一个事务内完成 | `$transaction` 被调用 |
| 返回 `ChapterAnalysisResult` 统计结构 | `created.personas/mentions/biographies/relationships` 均为整数 |
| `hallucinationCount` 字段已统计 | 异常实体计数 |

**Prompt 验收（`prompts.test.ts`）：**

| 测试用例 | 验收条件 |
|---|---|
| Prompt 含已识别人物列表上下文 | 动态注入验证 |
| 输出格式为强制 JSON Schema | Prompt 末尾含 JSON 格式约束 |
| 含古文人名识别 Few-shot 示例 | Few-shot 示例存在且合理 |

**PersonaResolver 验收（`PersonaResolver.test.ts`）：**

| 测试用例 | 验收条件 |
|---|---|
| 新人物创建新记录 | — |
| 别名匹配已有人物 → 不重复创建 | — |
| 同名不同书 → 各自创建 | book 范围隔离 |
| 置信度低于阈值时标记 | — |

---

## 六、Phase 3 验收：图谱数据与原文阅读

### 6.1 图谱数据 API

**测试文件：** `src/server/modules/books/getBookGraph.test.ts`

| 测试用例 | 期望状态 | 验收条件 |
|---|---|---|
| 获取图谱数据 | 200 | `{ nodes: [...], edges: [...] }` |
| `nodes[i]` 含必需字段 | — | `id/name/nameType/status/factionIndex/influence` |
| `edges[i]` 含必需字段 | — | `id/source/target/type/weight/sentiment/status` |
| `sentiment` 值正确映射（父子=positive，敌对=negative，其他=neutral） | — | 映射表完整 |
| 软删除节点不出现 | — | `deleted_at IS NOT NULL` 过滤 |
| `?chapter=5` 时只返回截至第 5 章数据 | — | 时间轴过滤生效 |
| bookId 不存在 | 404 | `BookNotFoundError` |
| 节点含 `x/y` 坐标（若已保存布局） | — | `visual_config` 坐标读取 |
| 未知关系类型 sentiment 回落 `neutral` | — | 不崩溃，不报错 |
| 空书（无人物）返回 `{ nodes: [], edges: [] }` | 200 | — |
| 公开接口 | 200 | 无需登录 |

### 6.2 人物 API 验收

**测试文件：** `src/server/modules/personas/` 目录下各文件

#### 人物详情（`GET /api/personas/:id`）

| 测试用例 | 验收条件 |
|---|---|
| 返回基础信息 | `id/name/aliases/type/confidence` |
| 返回生平时间轴（biographies）按 `chapter_no` 排序 | 时间轴顺序正确 |
| 返回关系列表（含 source/target/type） | 关系数据完整 |
| 软删除人物 | 404 |
| 不存在的 personaId | 404 |

#### 创建手动人物（`POST /api/books/:id/personas`）

| 测试用例 | 验收条件 |
|---|---|
| 创建后 `record_source=MANUAL` | 来源标记正确 |
| 创建后 `status=VERIFIED`（手动数据直接验证） | 状态正确 |
| 缺失必填字段 `name` | 400 |
| Viewer 创建 | 403 |

#### 更新人物（`PATCH /api/personas/:id`）

| 测试用例 | 验收条件 |
|---|---|
| 更新 `name`、`aliases`、`hometown` | 正确写入 |
| 软删除的人物 | 404 |
| Viewer 操作 | 403 |

#### 删除人物（`DELETE /api/personas/:id`）

| 测试用例 | 验收条件 |
|---|---|
| Admin 软删除 | `deleted_at` 写入 |
| 级联标记关联关系为 `REJECTED` | 相关 relationships 状态更新 |
| 级联标记关联传记事件为 `REJECTED` | 相关 biography_records 状态更新 |
| Viewer 操作 | 403 |
| 不存在的人物 | 404 |

### 6.3 图谱布局（`PATCH /api/graphs/:id/layout`）

**测试文件：** `src/server/modules/graph/updateGraphLayout.test.ts`

| 测试用例 | 验收条件 |
|---|---|
| 保存节点坐标 | `visual_config` JSON 正确写入 |
| 部分节点更新（只更新传入节点） | 未传入节点坐标保持原值 |
| graphId 不存在 | 404 |
| Viewer 调用 | 403 |

### 6.4 最短路径（`POST /api/graph/path`）

**测试文件：** `src/server/modules/graph/findPersonaPath.test.ts`

| 测试用例 | 验收条件 |
|---|---|
| 两人之间有路径 | 返回节点/边序列 |
| 两人之间无路径 | 返回空路径或明确提示（非 500） |
| Neo4j 未配置时回退 PostgreSQL + BFS | 正常返回（降级生效） |
| `sourcePersonaId = targetPersonaId` | 400 或返回单节点路径 |
| bookId 不存在 | 404 |

---

## 七、Phase 4 验收：校对与审核

### 7.1 关系 CRUD

**测试文件：** `src/server/modules/relationships/` 目录下各文件

#### 关系列表

| 测试用例 | 验收条件 |
|---|---|
| 返回关系列表（基础字段齐全） | — |
| `?status=DRAFT` 过滤有效 | — |
| `?type=父子` 过滤有效 | — |
| `?source=personaId` 过滤有效 | — |
| 软删除关系不出现 | `deleted_at` 过滤 |
| 公开接口 | 无需登录 |

#### 创建手动关系

| 测试用例 | 验收条件 |
|---|---|
| 创建后 `record_source=MANUAL`，`status=VERIFIED` | — |
| 重复关系冲突（uniqueness 约束） | 409 或 400 |
| Viewer 创建 | 403 |

#### 更新、删除关系

| 测试用例 | 验收条件 |
|---|---|
| 更新 type/weight 正确写入 | — |
| 关系不存在 | 404 |
| 删除：`deleted_at` 写入 | 软删除 |
| Viewer 操作均为 403 | — |

### 7.2 传记事件 CRUD

**测试文件：** `src/server/modules/biography/` 目录下各文件

| 操作 | 测试用例 | 验收条件 |
|---|---|---|
| 创建 | `category` 为合法的 `BioCategory` | enum 校验，非法值 400 |
| 创建 | personaId 不存在 | 404 |
| 创建 | Viewer 操作 | 403 |
| 更新 | 更新 `event`、`category` | 正确写入 |
| 更新 | 记录不存在 | 404 |
| 删除 | `deleted_at` 写入 | 软删除 |
| 删除 | 不存在的记录 | 404 |

### 7.3 批量审核 API

**测试文件：** `src/server/modules/review/bulkReview.test.ts`

| 测试用例 | 验收条件 |
|---|---|
| 批量确认有效 ids | 所有记录 `status=VERIFIED` |
| 批量拒绝有效 ids | 所有记录 `status=REJECTED` |
| ids 为空数组 | 400 或 0 条更新（明确记录行为） |
| Viewer 调用 | 403 |

#### 草稿列表（`GET /api/admin/drafts`）

| 测试用例 | 验收条件 |
|---|---|
| 无参数获取全部草稿 | 返回 DRAFT 状态记录 |
| `?bookId=xxx` 按书筛选 | 仅返回该书草稿 |
| `?tab=personas` 按类型筛选 | 仅返回人物草稿 |
| `?source=AI` 按来源筛选 | — |
| 分页参数（page/pageSize）生效 | 正确分页 |
| Viewer 访问 | 403 |

### 7.4 合并建议 API

**测试文件：** `src/server/modules/review/mergeSuggestions.test.ts`

| 测试用例 | 验收条件 |
|---|---|
| 获取合并建议列表（默认 PENDING） | — |
| `?bookId=` 按书筛选 | — |
| `?status=ACCEPTED` 按状态筛选 | — |
| 接受建议：`status=ACCEPTED`，`resolved_at` 写入，执行合并 | 合并操作触发 |
| 拒绝建议：`status=REJECTED`，`resolved_at` 写入 | — |
| 暂缓建议：`status=DEFERRED`，`resolved_at` 写入 | — |
| 不存在的建议 | 404 |
| 已处理建议再次操作 | 409 Conflict |
| Viewer 操作任何建议 | 403 |

### 7.5 人物合并验收

**测试文件：** `src/server/modules/personas/mergePersonas.test.ts`

| 测试用例 | 验收条件 |
|---|---|
| `sourceId = targetId` | `PersonaMergeInputError` |
| sourceId 不存在 | `PersonaNotFoundError` |
| targetId 不存在 | `PersonaNotFoundError` |
| 合并成功：relationship source 侧重定向到 targetId | — |
| 合并成功：relationship target 侧重定向到 targetId | — |
| 自环关系（合并后 source=target）被拒绝 | `status=REJECTED`，`deleted_at` 写入 |
| 重复关系被拒绝（相同 chapter+source+target+type） | 冲突关系软删除 |
| biography_records 全部重定向到 targetId | `persona_id=targetId` |
| mentions 全部重定向到 targetId | `persona_id=targetId` |
| sourceId Persona 软删除 | `deleted_at` 写入 |
| 别名归并（source 别名加入 target，去重） | `aliases` 合并去重 |
| 全部操作在一个 `$transaction` 内 | `$transaction` 调用覆盖所有操作 |
| `POST /api/personas/merge` Viewer 调用 | 403 |

---

## 八、Phase 4 续：模型配置验收

**测试文件：** `src/server/modules/models/index.test.ts`

### 8.1 模型列表（`GET /api/admin/models`）

| 测试用例 | 验收条件 |
|---|---|
| 返回所有模型（7 条预置） | — |
| `apiKey` 已脱敏 | 格式为 `sk-****xxxx`，非明文 |
| `apiKey=null` 时返回 null 或空字符串 | 不崩溃 |
| Viewer 访问 | 403 |

### 8.2 更新模型（`PATCH /api/admin/models/:id`）

| 测试用例 | 验收条件 |
|---|---|
| 更新 `apiKey` | 数据库存加密值（`enc:v1:...` 前缀） |
| 不传 `apiKey` 时保持原值 | 原加密值不变 |
| 更新 `baseUrl`、`isEnabled` | 正确写入 |
| 模型不存在 | 404 |
| Viewer 更新 | 403 |

### 8.3 设置默认模型（`POST /api/admin/models/:id/set-default`）

| 测试用例 | 验收条件 |
|---|---|
| 设置后该模型 `is_default=true` | — |
| 原默认模型 `is_default=false`（唯一默认） | 全局只有一个 is_default=true |
| 模型不存在 | 404 |

### 8.4 模型连通性测试（`POST /api/admin/models/:id/test`）

| 测试用例 | 验收条件 |
|---|---|
| 测试成功 | `{ success: true, latencyMs: number }` |
| 连接失败（网络错误） | `{ success: false, errorType: 'NETWORK_ERROR' }` |
| 认证失败（Key 无效） | `{ success: false, errorType: 'AUTH_ERROR' }` |
| 模型不可用 | `{ success: false, errorType: 'MODEL_UNAVAILABLE' }` |
| 超时 | `{ success: false, errorType: 'TIMEOUT' }` |
| 响应中不含明文 API Key | 检查响应 body 和 headers |
| SSRF 防护：非白名单域被禁止 | 400 或明确报错 |
| 白名单域包含 deepseek/qwen/doubao/glm/gemini 官方地址 | 正常访问 |

---

## 九、加密模块验收

**测试文件：** `src/server/security/encryption.test.ts`（必须存在）

| 测试用例 | 验收条件 |
|---|---|
| `encryptValue(plainText)` 返回 `enc:v1:...` 格式 | 验证前缀 |
| `decryptValue(cipherText)` 恢复明文 | 往返一致 |
| 空字符串透传（不加密） | `encryptValue("")` 返回 `""` |
| 不同调用产生不同密文（随机 IV） | 相同明文两次结果不同 |
| 篡改密文后解密抛错（GCM 认证失败） | 防篡改验证 |
| 缺失 `APP_ENCRYPTION_KEY` 时抛明确错误 | 非静默失败 |
| `maskApiKey("sk-abcdefgh1234")` 格式正确 | 返回 `sk-****1234` |

---

## 十、统一响应格式验收

所有 API 响应必须符合统一 envelope，验收断言：

```typescript
// 成功响应
const payload = await response.json();
expect(payload).toMatchObject({
  success: true,
  code: expect.any(String),
  message: expect.any(String),
  data: expect.anything(),
  meta: {
    requestId: expect.any(String),
    timestamp: expect.any(String),
    path: expect.any(String),
    durationMs: expect.any(Number)
  }
});

// 失败响应
expect(payload).toMatchObject({
  success: false,
  code: expect.any(String),
  message: expect.any(String),
  error: {
    type: expect.any(String),
    detail: expect.any(String)
  },
  meta: expect.objectContaining({ requestId: expect.any(String) })
});
```

**逐接口强制验收：**

- [ ] 成功响应含 `meta.requestId`（非空字符串）
- [ ] 成功响应含 `meta.durationMs`（非负整数）
- [ ] 失败响应含 `error.type` 与 `error.detail`
- [ ] 错误码仅使用 `ERROR_CODES` 中定义的值
- [ ] HTTP 状态码与 `success` 字段逻辑一致

---

## 十一、安全专项验收（OWASP 基线）

### 11.1 注入防护

| 检查项 | 验证方法 | 通过条件 |
|---|---|---|
| 所有 DB 查询使用 Prisma ORM | grep `$queryRawUnsafe` | 无匹配项 |
| 无字符串拼接 SQL | 代码审查 | 无 `WHERE id = '${var}'` 类代码 |

### 11.2 认证与会话安全

| 检查项 | 通过条件 |
|---|---|
| Cookie 含 `HttpOnly` | Response header 检查 |
| Cookie 含 `SameSite=Strict` | Response header 检查 |
| Cookie 含 `Path=/` | Response header 检查 |
| JWT 有效期 ≤ 7 天 | `exp - iat ≤ 604800` |
| JWT payload 不含密码字段 | `issueAuthToken` 参数不含 `password` |
| 密码使用 Argon2id | `$argon2id$` 前缀 |

### 11.3 敏感数据泄露

| 检查项 | 通过条件 |
|---|---|
| API Key 返回值为脱敏格式 | `sk-****xxxx` |
| 数据库 `api_key` 字段为加密格式 | `enc:v1:...` 前缀 |
| 解密 Key 不出现在日志/错误信息中 | grep 检查 `console.log.*decryptValue` 无匹配 |
| 错误响应不含明文 Key | 连通性测试失败响应 body 检查 |

### 11.4 越权访问

| 检查项 | 通过条件 |
|---|---|
| 写接口（POST/PATCH/DELETE）调用 `requireAdmin` | 代码审查 |
| `/api/admin/*` Route Handler 不需重复守卫 | Middleware 已保护 |
| 读接口（public GET）无 `requireAdmin` | 公开接口可正常访问 |

### 11.5 CSRF 防护

| 检查项 | 通过条件 |
|---|---|
| `POST /api/auth/login` 校验 `Origin` | 跨域 Origin → 403 |
| Cookie `SameSite=Strict` 防浏览器跨站请求 | Header 检查 |

### 11.6 SSRF 防护

| 检查项 | 通过条件 |
|---|---|
| 模型测试白名单域有效 | 非白名单域被拒绝 |

### 11.7 路径穿越

| 检查项 | 通过条件 |
|---|---|
| `LocalStorageProvider.putObject` 校验 key | `../` 被拒绝 |
| `/api/assets/[...key]` 不暴露 root 外文件 | 路径穿越测试通过 |

---

## 十二、全链路集成验收清单

以下场景必须完整跑通（使用测试数据库，非 mock）：

### 场景 A：完整书籍导入链路

```
1. POST /api/auth/login → 获取 cookie
2. POST /api/books → 上传 test.txt，获取 bookId
3. GET /api/books/{bookId} → 确认 status=PENDING
4. GET /api/books/{bookId}/chapters/preview → 确认章节识别
5. POST /api/books/{bookId}/chapters/confirm → 提交章节
6. POST /api/books/{bookId}/analyze → 202 BOOK_ANALYSIS_STARTED，任务状态=QUEUED，
   书籍 parse_progress=0，parse_stage="文本清洗"（fire-and-forget，不等待执行完成）
7. GET /api/books/{bookId}/status → 确认 status=PROCESSING 或 COMPLETED
```

### 场景 B：人物合并链路

```
1. 确认两个 persona 存在（personaA, personaB）
2. POST /api/personas/merge { sourceId: personaA, targetId: personaB }
3. GET /api/personas/{personaA} → 404（软删除）
4. GET /api/personas/{personaB} → aliases 包含 personaA 的别名
5. GET /api/books/{bookId}/relationships → 原 personaA 关系已重定向至 personaB
```

### 场景 C：审核流程链路

```
1. GET /api/admin/drafts → 获取 DRAFT 记录 ids
2. POST /api/admin/bulk-verify { ids: [...] } → 批量确认
3. GET /api/admin/drafts → 已确认记录不再出现（按 DRAFT 过滤）
4. GET /api/books/{bookId}/graph → 节点 status=VERIFIED
```

### 场景 D：模型密钥管理链路

```
1. GET /api/admin/models → apiKey 为脱敏值
2. PATCH /api/admin/models/{id} { apiKey: "sk-test-key-123" }
3. GET /api/admin/models → apiKey 仍为脱敏值（非明文）
4. 数据库直查 ai_models → api_key 字段以 enc:v1: 开头
5. POST /api/admin/models/{id}/test → 响应不含明文 Key
```

### 场景 E：权限防护链路

```
1. 无 cookie 访问 GET /admin/books → 307 重定向 /login
2. 无 cookie 访问 POST /api/admin/bulk-verify → 307 重定向
3. 使用 viewer token 访问 POST /api/books → 403
4. 使用 admin token 访问 POST /api/books → 201
```

---

## 十三、错误码完整性验收

`src/types/api.ts` 中以下错误码必须存在并被使用：

| 错误码 | 必须使用场景 |
|---|---|
| `COMMON_BAD_REQUEST` | 参数校验失败 |
| `COMMON_NOT_FOUND` | 资源不存在 |
| `COMMON_INTERNAL_ERROR` | 未预期服务端错误 |
| `COMMON_RATE_LIMITED` | 登录限流 |
| `AUTH_UNAUTHORIZED` | 未认证 |
| `AUTH_FORBIDDEN` | 已认证但权限不足 |
| `AUTH_LOGGED_IN` | 登录成功 |

---

## 十四、测试运行与覆盖率验收

### 14.1 运行所有单元测试

```bash
pnpm test:unit
```

**期望：**

- [ ] 所有测试文件通过（0 fail, 0 skip）
- [ ] 测试文件数量 ≥ 67 个（含现有文件及十五节补充文件）
- [ ] 总用例数 ≥ 400 条

**期望测试文件列表（完整）：**

```
src/middleware.test.ts
src/server/modules/auth/index.test.ts
src/server/modules/auth/password.test.ts
src/server/providers/storage/index.test.ts
src/server/providers/ai/index.test.ts
src/server/modules/books/createBook.test.ts
src/server/modules/books/listBooks.test.ts
src/server/modules/books/getBookById.test.ts
src/server/modules/books/deleteBook.test.ts
src/server/modules/books/getBookStatus.test.ts
src/server/modules/books/getChapterPreview.test.ts
src/server/modules/books/confirmBookChapters.test.ts
src/server/modules/books/startBookAnalysis.test.ts
src/server/modules/books/readChapter.test.ts
src/server/modules/books/getBookGraph.test.ts
src/server/modules/personas/createBookPersona.test.ts
src/server/modules/personas/listBookPersonas.test.ts
src/server/modules/personas/getPersonaById.test.ts
src/server/modules/personas/updatePersona.test.ts
src/server/modules/personas/deletePersona.test.ts
src/server/modules/personas/mergePersonas.test.ts
src/server/modules/relationships/createBookRelationship.test.ts
src/server/modules/relationships/listBookRelationships.test.ts
src/server/modules/relationships/updateRelationship.test.ts
src/server/modules/relationships/deleteRelationship.test.ts
src/server/modules/biography/createPersonaBiography.test.ts
src/server/modules/biography/updateBiographyRecord.test.ts
src/server/modules/biography/deleteBiographyRecord.test.ts
src/server/modules/graph/findPersonaPath.test.ts
src/server/modules/graph/updateGraphLayout.test.ts
src/server/modules/models/index.test.ts
src/server/modules/review/listDrafts.test.ts
src/server/modules/review/bulkReview.test.ts
src/server/modules/review/mergeSuggestions.test.ts
src/server/modules/analysis/services/aiClient.test.ts
src/server/modules/analysis/services/prompts.test.ts
src/server/modules/analysis/services/ChapterAnalysisService.test.ts
src/server/modules/analysis/services/PersonaResolver.test.ts
src/server/security/encryption.test.ts
src/server/http/route-utils.test.ts
src/app/api/auth/login/route.test.ts
src/app/api/auth/logout/route.test.ts
src/app/api/assets/[...key]/route.test.ts
src/app/api/books/route.test.ts
src/app/api/books/[id]/route.test.ts
src/app/api/books/[id]/status/route.test.ts
src/app/api/books/[id]/analyze/route.test.ts
src/app/api/books/[id]/graph/route.test.ts
src/app/api/books/[id]/personas/route.test.ts
src/app/api/books/[id]/relationships/route.test.ts
src/app/api/books/[id]/chapters/preview/route.test.ts
src/app/api/books/[id]/chapters/confirm/route.test.ts
src/app/api/books/[id]/chapters/[chapterId]/read/route.test.ts
src/app/api/personas/[id]/route.test.ts
src/app/api/personas/[id]/biography/route.test.ts
src/app/api/personas/merge/route.test.ts
src/app/api/relationships/[id]/route.test.ts
src/app/api/biography/[id]/route.test.ts
src/app/api/graph/path/route.test.ts
src/app/api/graphs/[id]/layout/route.test.ts
src/app/api/admin/drafts/route.test.ts
src/app/api/admin/bulk-verify/route.test.ts
src/app/api/admin/bulk-reject/route.test.ts
src/app/api/admin/merge-suggestions/route.test.ts
src/app/api/admin/merge-suggestions/[id]/accept/route.test.ts
src/app/api/admin/merge-suggestions/[id]/reject/route.test.ts
src/app/api/admin/merge-suggestions/[id]/defer/route.test.ts
src/app/api/admin/models/route.test.ts
src/app/api/admin/models/[id]/route.test.ts
src/app/api/admin/models/[id]/set-default/route.test.ts
src/app/api/admin/models/[id]/test/route.test.ts
```

### 14.2 覆盖率强制验收

```
Coverage thresholds（vitest.config.ts 中定义）：
  lines:      ≥ 90%   ✓（必须）
  branches:   ≥ 90%   ✓（必须）
  functions:  ≥ 90%   ✓（必须）
  statements: ≥ 90%   ✓（必须）
```

覆盖率不满足时，禁止标记 Phase 完成。

---

## 十五、缺失测试文件补充任务

以下测试文件在执行时须先检查是否存在，若不存在则必须补充：

| 需补充的测试文件 | 对应源文件 | 最低用例要求 |
|---|---|---|
| `src/server/security/encryption.test.ts` | `src/server/security/encryption.ts` | 第九节全部用例 |
| `src/server/modules/analysis/services/ChapterAnalysisService.test.ts` | `src/server/modules/analysis/services/ChapterAnalysisService.ts` | §5.4 全部用例 |
| `src/server/modules/analysis/services/PersonaResolver.test.ts` | `src/server/modules/analysis/services/PersonaResolver.ts` | 新建/匹配/别名归并用例 |

---

## 十六、TypeScript 与 ESLint 验收

```bash
# TypeScript 编译
pnpm build
npx tsc --noEmit
# 期望：0 errors

# ESLint
pnpm lint
# 期望：0 errors, 0 warnings
```

**强制检查项：**

- [ ] 无生产代码使用 `any`（除非注释说明）
- [ ] 无 `@ts-ignore`（除非注释说明）
- [ ] 核心业务函数均有明确返回类型注解
- [ ] 无 `console.log`（生产代码中）
- [ ] 无未使用的 import

---

## 十七、非功能性基线（上线前手动验证）

| 指标 | 目标 | 验证方法 |
|---|---|---|
| `POST /api/auth/login` p95 响应时间 | < 300ms | 本地 10 次请求取 p95 |
| `GET /api/books/:id/graph`（20 回数据集） | < 1000ms | 本地测量 |
| `GET /api/books`（10 本书） | < 500ms | 本地测量 |
| `POST /api/personas/merge` | < 500ms | 本地测量 |

**参考测量命令：**

```bash
for i in $(seq 1 10); do
  time curl -s -o /dev/null -X POST http://localhost:3060/api/auth/login \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:3060" \
    -d '{"identifier":"admin@example.com","password":"yourpassword"}'
done
```

---

## 十八、交付检查清单（Definition of Done）

在 Codex 标记整个后端任务完成前，必须逐项确认：

### 代码质量

- [ ] `pnpm build` 0 errors
- [ ] `pnpm lint` 0 errors, 0 warnings
- [ ] `npx tsc --noEmit` 0 errors
- [ ] 无 `console.log` 在生产代码中
- [ ] 所有 Route Handler 入参通过 Zod 校验

### 测试与覆盖率

- [ ] `pnpm test:unit` 所有测试通过（0 fail, 0 skip）
- [ ] 覆盖率 lines ≥ 90%，branches ≥ 90%，functions ≥ 90%，statements ≥ 90%
- [ ] 第十五节所有缺失测试文件已补充

### 数据库

- [ ] `pnpm prisma:migrate status` → `Database schema is up to date!`
- [ ] `pnpm prisma:seed` 正常执行，幂等
- [ ] Schema 字段与 task-backend §3 完全对齐
- [ ] 所有 8 个枚举值对齐（§4.1.2）

### 安全

- [ ] 第十一节所有 OWASP 检查项通过
- [ ] API Key 加密存储（`enc:v1:...`），返回脱敏值
- [ ] 密码 Argon2id 哈希（`$argon2id$`），不存明文
- [ ] Cookie `httpOnly` + `SameSite=Strict`
- [ ] 登录限流生效（5min/10次 → 429）
- [ ] 路径穿越防护有效（Storage + assets 代理）
- [ ] SSRF 防护有效（模型测试白名单）

### API 契约

- [ ] 所有 API 响应符合统一 envelope 格式（含 `meta.requestId` + `meta.durationMs`）
- [ ] 错误码仅使用 `ERROR_CODES` 中定义的值
- [ ] HTTP 状态码与 `success` 字段逻辑一致

### 全链路

- [ ] 场景 A（书籍导入链路）完整通过
- [ ] 场景 B（人物合并链路）完整通过
- [ ] 场景 C（审核流程链路）完整通过
- [ ] 场景 D（模型密钥链路）完整通过
- [ ] 场景 E（权限防护链路）完整通过

---

## 附录 A：OWASP Top 10 适用项矩阵

| OWASP 风险 | 适用性 | 防护措施 | 验收章节 |
|---|---|---|---|
| A01 失效访问控制 | ✓ 高 | Middleware + requireAdmin 双层 | §4.3、§11.4 |
| A02 加密失败 | ✓ 高 | Argon2id + AES-256-GCM | §9、§11.2、§11.3 |
| A03 注入 | ✓ 高 | Prisma ORM 参数化查询 | §11.1 |
| A04 不安全设计 | ✓ 中 | 软删除、审计链路保留 | §5、§7 |
| A05 安全配置错误 | ✓ 中 | 环境变量分离，不硬编码 Key | §2 |
| A06 易受攻击的组件 | ✓ 低 | 定期 `pnpm audit` | — |
| A07 认证失败 | ✓ 高 | JWT + httpOnly Cookie + 限流 | §4.3 |
| A08 软件与数据完整性 | ✓ 中 | Zod 校验，事务保障 | §10 |
| A09 安全日志失败 | ✓ 低 | 不在日志输出明文 Key | §11.3 |
| A10 SSRF | ✓ 中 | 模型测试白名单域 | §11.6 |

---

*文档维护：每当后端 Schema 或 API 契约变更时，必须同步更新本文档对应章节。*
