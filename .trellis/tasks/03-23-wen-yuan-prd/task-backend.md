# 文渊 — 后端任务文档

> **执行角色**：后端 AI 模型  
> **协作约定**：前端 AI 模型同步执行 `task-frontend.md`，双方共享本文 §6 API 合约（本文为权威源）  
> **文档版本**：基于 PRD v1.2（2026-03-25）拆分

---

## 一、项目概览

**文渊**是一个 AI 驱动的中国古典文学人物关系图谱系统。后端负责：

- 书籍导入与文件存储（Storage Provider 抽象）
- AI 解析 Pipeline（分章解析、人物 / 关系提取、置信度评分）
- 图谱数据接口（PostgreSQL + Neo4j 双数据库）
- 管理审核 API（草稿确认、拒绝、合并、重解析）
- 登录鉴权（JWT + Argon2id + Middleware）
- 模型配置管理（API Key 加密存储、连通性测试）
- 静态资源统一访问代理

---

## 二、技术栈（后端部分）

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 框架 | Next.js 16 App Router Route Handlers | 后端 API 路由 |
| ORM | Prisma + PostgreSQL | 结构化数据 |
| 图数据库 | Neo4j | 路径查找、社区检测（Phase 3–4）|
| AI 提供方 | DeepSeek / 通义千问 / 豆包 / Gemini | 已有 `src/server/providers/ai/` 抽象 |
| 存储 Provider | `src/server/providers/storage/`（待实现）| local（默认）/ oss（预留）|
| 校验 | Zod | 所有输入边界 |
| 密码哈希 | Argon2id | `memoryCost=19456, timeCost=2, parallelism=1` |
| JWT | `jose`（HS256）| 兼容 Edge Runtime（Middleware）和 Node.js Route Handler |
| 测试 | Vitest | 业务逻辑单元测试 |

---

## 三、数据库 Schema（完整变更清单）

### 3.1 新增枚举

```prisma
enum NameType {
  NAMED
  TITLE_ONLY
  @@map("name_type")
}

enum RecordSource {
  AI
  MANUAL
  @@map("record_source")
}

enum AnalysisJobStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
  CANCELED
  @@map("analysis_job_status")
}

enum AppRole {
  ADMIN
  VIEWER
  @@map("app_role")
}
```

### 3.2 新建 `users` 表

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `UUID` | PK | — |
| `username` | `String` | UNIQUE | 登录凭证之一 |
| `email` | `String` | UNIQUE | 登录凭证之一 |
| `name` | `String` | NOT NULL | 显示名 |
| `password` | `String` | NOT NULL | Argon2id 哈希，不存明文 |
| `role` | `AppRole` | default `VIEWER` | — |
| `is_active` | `Boolean` | default `true` | — |
| `last_login_at` | `Timestamptz?` | — | — |
| `created_at` | `Timestamptz` | — | — |
| `updated_at` | `Timestamptz` | — | — |

> 初始管理员通过 `prisma db seed` 从环境变量写入：`ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD`（写入前 Argon2id 哈希）

### 3.3 新建 `ai_models` 表

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `UUID` | PK | — |
| `provider` | `String` | NOT NULL | `deepseek` / `qwen` / `doubao` / `gemini` |
| `name` | `String` | NOT NULL | 显示名称 |
| `model_id` | `String` | NOT NULL | API 调用标识 |
| `base_url` | `String` | NOT NULL | 默认官方地址，可自定义 |
| `api_key` | `String?` | — | 密文存储（`APP_ENCRYPTION_KEY` 加密）|
| `is_enabled` | `Boolean` | default `false` | — |
| `is_default` | `Boolean` | default `false` | — |
| `created_at` | `Timestamptz` | — | — |
| `updated_at` | `Timestamptz` | — | — |

预置内容（seed 时写入，用户只需填 Key）：

| 模型 | `model_id` | 默认 `base_url` | 环境变量 |
| --- | --- | --- | --- |
| DeepSeek V3 | `deepseek-chat` | `https://api.deepseek.com` | `DEEPSEEK_API_KEY` |
| DeepSeek R1 | `deepseek-reasoner` | `https://api.deepseek.com` | `DEEPSEEK_API_KEY` |
| 通义千问 Max | `qwen-max` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `QWEN_API_KEY` |
| 通义千问 Plus | `qwen-plus` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `QWEN_API_KEY` |
| 豆包 Pro | `doubao-pro-32k` | `https://ark.cn-beijing.volces.com/api/v3` | `DOUBAO_API_KEY` |
| Gemini Flash | `gemini-1.5-flash` | `https://generativelanguage.googleapis.com` | `GEMINI_API_KEY` |

### 3.4 `Book` 表新增字段

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `ai_model_id` | `UUID?` | — | FK → `ai_models.id` |
| `parse_progress` | `Int` | `0` | 解析进度 0–100 |
| `parse_stage` | `String?` | — | 当前阶段文本 |
| `raw_content` | `Text?` | — | 原始文本（用于解析；不替代源文件）|
| `source_file_url` | `String?` | — | 可访问 URL |
| `source_file_key` | `String?` | — | 存储对象稳定 key |
| `source_file_name` | `String?` | — | 原始文件名 |
| `source_file_mime` | `String?` | — | MIME 类型 |
| `source_file_size` | `Int?` | — | 文件大小（bytes）|

> `Book.status` 保留 `String` 类型，枚举值：`PENDING` / `PROCESSING` / `COMPLETED` / `ERROR`

### 3.5 `Persona` 表新增字段

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `name_type` | `NameType` | `NAMED` | NAMED / TITLE_ONLY |
| `record_source` | `RecordSource` | `AI` | AI / MANUAL |
| `aliases` | `String[]` | `[]` | 别名列表（主字段）|
| `hometown` | `String?` | — | 籍贯 |
| `confidence` | `Float` | `1.0` | AI 置信度 |
| `deleted_at` | `Timestamptz?` | — | 软删除时间 |

### 3.6 `Profile` 表新增字段

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `official_title` | `String?` | — | 书中官职 |
| `local_tags` | `String[]` | `[]` | 性格 / 社会标签 |
| `deleted_at` | `Timestamptz?` | — | 软删除时间 |

### 3.7 `Relationship` 表新增字段

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `record_source` | `RecordSource` | `AI` | — |
| `confidence` | `Float` | `1.0` | — |
| `evidence` | `Text?` | — | 原文证据片段 |
| `deleted_at` | `Timestamptz?` | — | — |
| 唯一约束 | — | — | `chapter_id + source_id + target_id + type + record_source` |

### 3.8 `BiographyRecord` / `Mention` 表新增字段

两表均新增 `record_source RecordSource` 和 `deleted_at Timestamptz?`。

### 3.9 新建 `analysis_jobs` 表

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `UUID` | PK | — |
| `book_id` | `UUID` | FK → `books.id` | — |
| `ai_model_id` | `UUID?` | FK → `ai_models.id` | 本次任务模型 |
| `status` | `AnalysisJobStatus` | default `QUEUED` | — |
| `scope` | `String` | default `FULL_BOOK` | FULL_BOOK / CHAPTER_RANGE |
| `chapter_start` | `Int?` | — | 章节范围起点 |
| `chapter_end` | `Int?` | — | 章节范围终点 |
| `attempt` | `Int` | default `1` | 重试次数 |
| `error_log` | `Text?` | — | 失败日志摘要 |
| `override_strategy` | `String?` | — | `DRAFT_ONLY` / `ALL_DRAFTS` |
| `keep_history` | `Boolean` | default `false` | 是否保留历史草稿版本 |
| `started_at` | `Timestamptz?` | — | — |
| `finished_at` | `Timestamptz?` | — | — |
| `created_at` | `Timestamptz` | — | — |
| `updated_at` | `Timestamptz` | — | — |

### 3.10 新建 `merge_suggestions` 表

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `UUID` | PK | — |
| `book_id` | `UUID` | FK | — |
| `source_persona_id` | `UUID` | FK → personas | — |
| `target_persona_id` | `UUID` | FK → personas | — |
| `reason` | `Text` | NOT NULL | AI 建议原因 |
| `confidence` | `Float` | — | 0.0–1.0 |
| `evidence_refs` | `JSONB` | — | 原文证据锚点数组 |
| `status` | `String` | default `PENDING` | PENDING / ACCEPTED / REJECTED / DEFERRED |
| `created_at` | `Timestamptz` | — | — |
| `resolved_at` | `Timestamptz?` | — | — |

执行：

```bash
npx prisma migrate dev --name <migration_name>
npx prisma generate
```

---

## 四、模块目录结构

```
src/server/
├── modules/
│   ├── auth/
│   │   └── index.ts          # 登录、JWT 签发、requireAdmin()
│   ├── analysis/
│   │   └── services/
│   │       └── ChapterAnalysisService.ts  # AI 解析 Pipeline
│   ├── books/                # 书籍 CRUD、导入、进度
│   └── models/               # AI 模型配置（Key 加密）
├── providers/
│   ├── ai/                   # 已有；AI 客户端抽象
│   └── storage/              # 待实现；存储 Provider 抽象
├── db/
│   ├── prisma.ts             # Prisma 客户端单例
│   └── neo4j.ts              # Neo4j 驱动
└── http/
    ├── api-response.ts       # 统一响应格式
    └── route-utils.ts        # 通用工具（getAuthContext 等）
```

---

## 五、核心模块实现规范

### 5.1 存储 Provider（`src/server/providers/storage/`）

**接口定义：**

```typescript
interface StorageProvider {
  putObject(key: string, body: Buffer | Readable, options?: PutOptions): Promise<void>;
  deleteObject(key: string): Promise<void>;
  getObjectUrl(key: string): string;
}
```

**local Provider：**

- 落盘路径：`./storage/`（由 `STORAGE_LOCAL_ROOT` 环境变量配置）
- 本地文件通过 `/api/assets/[...key]` 统一代理，不暴露物理路径
- `getObjectUrl` 返回：`${STORAGE_PUBLIC_BASE_URL}/api/assets/${key}`

**路径规范：**

```
storage/books/<bookId>/source/<filename>   # 原始书籍文件
storage/books/<bookId>/cover/<filename>    # 封面图
storage/books/<bookId>/images/<filename>   # 其他图片
```

**环境变量：**

```
STORAGE_PROVIDER=local
STORAGE_LOCAL_ROOT=./storage
STORAGE_PUBLIC_BASE_URL=http://localhost:3000
# OSS 预留（不要求 M0 实现）
OSS_ENDPOINT=
OSS_BUCKET=
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_REGION=
OSS_PUBLIC_BASE_URL=
```

**约束：**

- 业务模块只能依赖统一接口，不直接 `fs.writeFile` 或使用 SDK
- 在业务代码里不能写死 `local` 或 `oss` 判断，通过 `STORAGE_PROVIDER` 环境变量选择
- 删除书籍时：先数据库软删除，再异步清理对象文件（M0 可先标记，后台任务清理）

### 5.2 鉴权模块（`src/server/modules/auth/index.ts`）

**登录流程：**

```typescript
// 1. 查库（支持邮箱或用户名登录）
// 2. Argon2id 验证密码
// 3. 签发 JWT：{ role: "admin", iat, exp }，HMAC-SHA256，7 天有效期
// 4. 写入 httpOnly Cookie（token，SameSite=Strict）
```

**JWT 工具（使用 `jose` 库，HS256）：**

```typescript
// jose 使用 Web Crypto API，同时兼容 Edge Runtime（Middleware）和 Node.js
// pnpm add jose
signJWT(payload: object, secret: string, expiresIn: string): Promise<string>
verifyJWT(token: string, secret: string): Promise<{ role: string; iat: number; exp: number }>
```

**Middleware（`middleware.ts`）：**

```typescript
// 读取 Cookie token，验证 JWT
// 有效 admin → 注入 x-auth-role: admin
// 无效/缺失 → 注入 x-auth-role: viewer
// /admin/* 页面 + /api/admin/* 接口：viewer → Response.redirect("/login?redirect=<path>")
```

**`matcher` 配置（`middleware.ts` 末尾导出）：**

```typescript
export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
// 仅对以上前缀自动拦截；其他资源路径（/api/books/* 等）
// 由各自 Route Handler 内显式调用 requireAdmin() 守卫写操作
```

**守卫函数：**

```typescript
function getAuthContext(request: Request): { role: "admin" | "viewer" }
function requireAdmin(auth: { role: string }): void  // 非 admin 抛 403
```

**速率限制（`POST /api/auth/login`）：**

- 同 IP 5 分钟内失败 10 次后锁定 15 分钟
- 在 Route Handler 或 Middleware 层实现

**CSRF 防护：**

- `SameSite=Strict` Cookie
- 校验 `Origin` Header（仅允许同源）
- 不使用额外 CSRF token

**登出：**

清除 `token` Cookie（`Set-Cookie: token=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`）

**环境变量：**

```
ADMIN_USERNAME=
ADMIN_EMAIL=
ADMIN_NAME=
ADMIN_PASSWORD=         # seed 时用于 Argon2id 哈希
JWT_SECRET=             # 随机生成，至少 32 字节
APP_ENCRYPTION_KEY=     # 用于 API Key 加解密，至少 32 字节
```

### 5.3 AI 模型 Key 安全规范

- `api_key` 加密存储（`APP_ENCRYPTION_KEY`，AES-256-GCM 推荐）
- 所有普通查询 API **只返回脱敏值**（如 `sk-****1234`）
- 服务端解密后调用，解密结果不写入日志、错误信息、响应体
- 连通性测试 API：服务端解密 → 调用最小 Prompt → 返回成功/失败/延迟/错误分类；不回传明文 Key
- 支持密钥轮换：`APP_ENCRYPTION_KEY` 更换后，历史密文需要重加密

### 5.4 AI 解析 Pipeline

**入口：** `POST /api/books/:id/analyze`

**解析流程：**

```
1. 创建 AnalysisJob 记录（status: QUEUED）
2. 更新 Book.status = PROCESSING
3. 文本清洗（去除无效字符、统一编码）
4. 章节识别与切分（正则 + 模型辅助）
5. 分章并行调用 AI（受速率限制，任务队列）
6. 每章解析结果入库（DRAFT 状态）
7. 每 10 章做一次跨章别名消歧
8. 全书完成 → 生成 MergeSuggestion
9. 更新 Book.status = COMPLETED，AnalysisJob.status = SUCCEEDED
10. 异常时 → Book.status = ERROR，AnalysisJob.status = FAILED，error_log 写摘要
```

**AI Prompt 约束：**

- 输出格式：强制 JSON Schema，字段缺失填 `null`
- 提供古文人名识别规则 Few-shot 示例
- 每章 Prompt 携带"已识别人物列表"作为上下文

**实体提取规则：**

- 有名有姓的人物：全量提取，`nameType: NAMED`
- 仅有称号的人物：以称号作为标准名，`nameType: TITLE_ONLY`
- 匿名群体（"众邻居"、"几个秀才"）：**不提取**
- AI 输出每个实体/关系附带置信度（0.0–1.0），低于 0.7 自动标记"待重点核对"

**原文锚点（每条关系/事件必须包含）：**

```typescript
interface EvidenceRef {
  chapterId: string;
  paraIndex?: number;
  evidenceText: string;
  confidence: number;
}
```

**可解析关系类型（20+）：**

`父子` `母子` `兄弟` `夫妻` `姻亲` `师生` `同年` `荐举` `债主` `债务人` `友好` `敌对` `下属` `上司` `同僚` `欣赏` `嘲讽` `同盟` `竞争` `其他`

**重解析粒度：**

| 参数 | 值 |
| --- | --- |
| scope | `FULL_BOOK` / `CHAPTER_RANGE` |
| override_strategy | `DRAFT_ONLY`（推荐默认）/ `ALL_DRAFTS` |
| keep_history | `true` / `false` |

- 已 `VERIFIED` 数据不得被重解析自动覆盖
- 两次解析结果取并集，冲突时标记"待仲裁"（可在 `evidence` 字段注明）
- 被覆盖草稿软删除（写 `deleted_at`），不物理删除

### 5.5 实体合并逻辑

```
POST /api/personas/merge
Body: { targetId: string, sourceId: string }
```

后端执行：

1. 将 `sourceId` 的所有 `Relationship` 中 `sourcePersonaId` / `targetPersonaId` 重定向到 `targetId`
2. 将 `sourceId` 的所有 `BiographyRecord` → `personaId` 更新为 `targetId`
3. 将 `sourceId` 的所有 `Mention` → `personaId` 更新为 `targetId`
4. `sourceId` Persona 软删除（`deleted_at = now()`）
5. 事务内完成，数据库失败时全部回滚

### 5.6 数据生命周期

- 业务删除一律先软删除（写 `deleted_at`）
- 软删除记录保留 30 天支持恢复
- 超过保留期进入离线物理清理任务，保留审计日志
- 删除人物时级联标记该人物相关关系/传记事件为 `REJECTED`（写 `deleted_at` + `status→REJECTED`）

---

## 六、API 接口规范（权威源）

**统一响应格式（`src/server/http/api-response.ts`）：**

```typescript
// 成功
{ success: true, data: T, message?: string }
// 失败
{ success: false, error: string, code?: string }
```

**权限说明（混合路由策略）：**

| 层级 | 路径前缀 | 保护机制 |
| --- | --- | --- |
| Tier 1 | `/api/admin/*` | Middleware `matcher` 自动拦截，viewer 访问直接重定向，Handler 无需重复校验 |
| Tier 2 | `/api/<resource>/*` | Route Handler 内须显式调用 `requireAdmin(getAuthContext(request))`，非 admin 抛 403 |

- `[pub]` — 无需登录（viewer 可访问）
- `[admin]` on `/api/admin/*` — Middleware 已自动保护
- `[admin]` on 资源路径 — Handler 内须调用 `requireAdmin()`

### 6.1 书籍相关

```
GET    /api/books                         [pub]   书籍列表
POST   /api/books                         [admin] 创建书籍（上传文本 + 元数据）
GET    /api/books/:id                     [pub]   书籍详情
GET    /api/books/:id/status              [pub]   解析进度（前台用 completed/not 判断，运营端用详细阶段）
POST   /api/books/:id/analyze             [admin] 启动 AI 解析
DELETE /api/books/:id                     [admin] 删除书籍（软删除）
```

**`GET /api/books` 返回字段：**

```typescript
{
  id: string;
  title: string;
  author?: string;
  dynasty?: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "ERROR";
  coverUrl?: string;
  chapterCount: number;
  personaCount: number;       // 有效人物数（不含 REJECTED/软删除）
  lastAnalyzedAt?: string;    // 最近解析任务完成时间
  currentModel?: string;      // 当前/最近任务模型名称
  lastErrorSummary?: string;  // 最近一次失败摘要（截断）
}
```

**`GET /api/books/:id/status` 返回字段（运营端详细）：**

```typescript
{
  status: string;
  progress: number;           // 0-100
  stage?: string;             // "文本清洗" | "章节切分" | "实体提取" | "关系建模" | "完成"
  errorLog?: string;
}
```

### 6.2 人物与图谱

```
GET    /api/books/:id/graph               [pub]   图谱数据（章节过滤：?chapter=<n>）
GET    /api/books/:id/personas            [pub]   人物列表
POST   /api/books/:id/personas            [admin] 手动新增人物（recordSource: MANUAL）
GET    /api/personas/:id                  [pub]   人物详情（含生平时间轴、关系列表）
PATCH  /api/personas/:id                  [admin] 更新人物（校对）
DELETE /api/personas/:id                  [admin] 软删除（级联）
POST   /api/personas/merge                [admin] 合并两个 Persona
```

**`GET /api/books/:id/graph` 返回格式：**

```typescript
{
  nodes: Array<{
    id: string;
    name: string;
    nameType: "NAMED" | "TITLE_ONLY";
    status: "DRAFT" | "VERIFIED" | "REJECTED";
    factionIndex: number;    // 派系序号，前端按 % 12 取色板
    influence: number;       // 影响力权重（关系数 × 讽刺指数）
    x?: number; y?: number;  // 存储的布局坐标（来自 visual_config）
  }>;
  edges: Array<{
    id: string;
    source: string;         // personaId
    target: string;
    type: string;           // 关系类型
    weight: number;         // 亲密度
    sentiment: "positive" | "negative" | "neutral";
    status: "DRAFT" | "VERIFIED" | "REJECTED";
  }>;
}
```

### 6.3 传记事件

```
POST   /api/personas/:id/biography        [admin] 手动新增传记事件
PATCH  /api/biography/:id                 [admin] 更新传记事件
DELETE /api/biography/:id                 [admin] 软删除
```

### 6.4 关系

```
GET    /api/books/:id/relationships       [pub]   关系列表（支持筛选：?type=&status=&source=）
POST   /api/books/:id/relationships       [admin] 手动添加关系（recordSource: MANUAL）
PATCH  /api/relationships/:id             [admin] 更新关系（校对）
DELETE /api/relationships/:id             [admin] 软删除
```

### 6.5 原文阅读与路径查找

```
GET    /api/books/:id/chapters/:chapterId/read    [pub]   原文阅读
GET    /api/books/:id/chapters/:chapterId/read?paraIndex=<n>&highlight=<text>
POST   /api/graph/path                            [pub]   两人最短路径（Neo4j）
```

**`POST /api/graph/path` Body：**

```typescript
{ bookId: string; sourcePersonaId: string; targetPersonaId: string }
```

### 6.6 审核

```
GET    /api/admin/drafts                  [admin] 草稿汇总（支持 bookId / tab / source 筛选）
POST   /api/admin/bulk-verify             [admin] 批量确认（ids: string[]）
POST   /api/admin/bulk-reject             [admin] 批量拒绝（ids: string[]）
GET    /api/admin/merge-suggestions       [admin] 合并建议列表（?bookId=&status=）
POST   /api/admin/merge-suggestions/:id/accept    [admin]
POST   /api/admin/merge-suggestions/:id/reject    [admin]
POST   /api/admin/merge-suggestions/:id/defer     [admin]
```

### 6.7 模型设置

```
GET    /api/admin/models                  [admin] 模型列表（apiKey 只返回脱敏值）
PATCH  /api/admin/models/:id             [admin] 更新模型配置（apiKey / baseUrl / isEnabled）
POST   /api/admin/models/:id/test        [admin] 连通性测试
POST   /api/admin/models/:id/set-default [admin] 设置默认模型
```

**`PATCH /api/admin/models/:id` Body：**

```typescript
{
  apiKey?: string;        // 传入时加密存储；不传时保持原值
  baseUrl?: string;
  isEnabled?: boolean;
}
```

**`POST /api/admin/models/:id/test` 返回：**

```typescript
{
  success: boolean;
  latencyMs?: number;
  errorType?: "NETWORK_ERROR" | "AUTH_ERROR" | "MODEL_UNAVAILABLE" | "TIMEOUT";
  errorMessage?: string;  // 人类可读摘要，不含明文 Key
}
```

### 6.8 认证

```
POST   /api/auth/login                    [pub]  登录（邮箱或用户名 + 密码）
POST   /api/auth/logout                   [pub]  登出（清除 Cookie）
```

**`POST /api/auth/login` Body：**

```typescript
{ identifier: string; password: string }
// identifier = email 或 username
```

**登录限流：** 同 IP 5 分钟内失败 10 次，锁定 15 分钟  
**错误响应：** 无论账号还是密码错误，统一返回 `{ success: false, error: "账号或密码错误" }`，不区分具体原因

**`POST /api/auth/login` 成功响应：**

```typescript
{
  success: true,
  data: { role: "admin", name: string }
  // 同时写入 httpOnly Cookie: token, SameSite=Strict, HttpOnly, Path=/
}
```

### 6.9 静态资源访问

```
GET    /api/assets/:key*                  [pub]   统一资源代理
```

- local Provider：从 `STORAGE_LOCAL_ROOT/key` 流式读取返回
- oss Provider：签名 URL 或代理
- 不暴露物理路径，不在响应 Header 中泄露服务器路径

---

## 七、双数据库策略

### 7.1 PostgreSQL（Prisma）

存储所有结构化数据：书籍、人物、关系、章节、任务、用户、模型配置等。

图谱数据默认从 PostgreSQL 查询，前端 D3.js 负责布局计算。

### 7.2 Neo4j

**接入时机：** Phase 3–4（已纳入 M0，见 §9）

**数据同步策略：**

- AI 解析完成后，`VERIFIED` 关系同步写入 Neo4j
- 人工确认/拒绝/合并操作后增量同步
- 不做实时双写；Neo4j 为查询优化层，PostgreSQL 为权威数据源

**使用场景：**

```cypher
// 最短路径查找
MATCH p = shortestPath((a:Persona {id: $sourceId})-[*]-(b:Persona {id: $targetId}))
RETURN p

// 社区检测（后续）
CALL gds.louvain.stream('personaGraph') YIELD nodeId, communityId
```

**`visual_config` 字段：** 存储 D3 布局坐标，避免每次重新计算：

```typescript
// Book.visualConfig JSONB
{ nodes: { [personaId]: { x: number; y: number } } }
```

---

## 八、安全规范

### 8.1 密码安全

- 哈希算法：Argon2id，参数 `memoryCost=19456, timeCost=2, parallelism=1`
- 禁止回退 bcrypt，禁止"密码 + secret 再 hash"自定义方案

### 8.2 JWT 安全

- 使用 `jose` 库（HS256）— 基于 Web Crypto API，同时兼容 Edge Runtime 和 Node.js（`jsonwebtoken` 在 Middleware 的 Edge Runtime 中**不可用**）
- JWT payload 只含 `{ role: "admin", iat, exp }`，不含用户 ID 等敏感信息
- 有效期 7 天，`httpOnly; SameSite=Strict; Path=/`

### 8.3 API Key 安全

- 入库时 AES-256-GCM 加密
- 查询接口只返回脱敏值（`sk-****<last4>`）
- 解密只在服务端执行，解密结果不写日志
- 连通性测试：服务端解密后调用，响应中不含明文 Key
- 日志/错误信息/调试输出中不得出现明文 Key

### 8.4 静态资源安全

- 不暴露服务器物理路径（`/api/assets/[...key]` 代理）
- `sourceFileKey` 是存储主键，`sourceFileUrl` 是派生值
- 删除时数据库软删除先于对象删除

### 8.5 输入校验

- 所有 Route Handler 入参使用 Zod 校验
- SQL 注入：Prisma ORM 参数化查询，不拼接 SQL 字符串
- XSS：所有 AI 生成内容存入数据库前不做 HTML 转义（在前端渲染时转义）

### 8.6 OWASP 基线

| 风险 | 防护措施 |
| --- | --- |
| 注入 | Prisma ORM 参数化查询 |
| 失效认证 | Argon2id + JWT + httpOnly Cookie + SameSite |
| 暴力破解 | 登录速率限制（5min/10次 锁定） |
| 敏感数据泄露 | API Key 加密存储 + 脱敏返回；Key 不出现在日志 |
| 越权访问 | Middleware + Layout 双重守卫；每个 admin Route Handler 调用 `requireAdmin` |
| CSRF | SameSite=Strict + Origin Header 校验 |
| SSRF | 连通性测试只允许已知 AI 提供商域名（白名单校验）|

---

## 九、实施阶段计划（后端视角）

### Phase 1 — 基础层

- [ ] **Schema 迁移**（§3 全部变更）
  - 运行 `prisma migrate dev`，验证 `prisma migrate status`
- [ ] **Seed**
  - 初始管理员账号（从环境变量读取，Argon2id 哈希）
  - 预置 AI 模型记录（6 个模型，默认禁用）
- [ ] **Storage Provider**
  - 新建 `src/server/providers/storage/`
  - 实现 `local` Provider（putObject / deleteObject / getObjectUrl）
  - 新建 `/api/assets/[...key]/route.ts` 统一资源代理
- [ ] **Auth 模块**
  - `src/server/modules/auth/index.ts`：signJWT / verifyJWT / getAuthContext / requireAdmin
  - Argon2id 密码哈希
  - 补充 `src/server/modules/auth/index.test.ts`
  - 删除遗留 `rbac.ts` 方案
- [ ] **Middleware**（`middleware.ts`）
  - JWT 校验 + `x-auth-role` 注入
  - `/admin/*` viewer → redirect `/login?redirect=<path>`
- [ ] **登录 API**
  - `POST /api/auth/login`：查库 → Argon2id 验证 → JWT → httpOnly Cookie
  - `POST /api/auth/logout`：清除 Cookie
  - 登录速率限制（IP 级别，5min/10 次失败锁定）

**验收：**

- `prisma migrate status` 显示迁移已应用
- 访问 `/admin/*` 未登录时重定向 `/login`
- 正确账号登录后跳回原页面

### Phase 2 — 书籍导入 + AI 解析

- [ ] **书籍列表 API**（`GET /api/books`）：返回 §6.1 所定义字段
- [ ] **书籍上传 API**（`POST /api/books`）：
  - 接收 multipart/form-data（文件 + 元数据）
  - 文件大小校验（50MB）
  - 经 Storage Provider 持久化，回填 `sourceFile*` 字段
  - `rawContent` 读取并写入（服务解析使用）
  - 书名 AI 识别（失败回退文件名）
- [ ] **章节识别 API**（`GET /api/books/:id/chapters/preview`）：返回自动识别的章节列表
- [ ] **章节确认 API**（`POST /api/books/:id/chapters/confirm`）：用户手动调整后提交
- [ ] **启动解析 API**（`POST /api/books/:id/analyze`）：
  - 创建 `AnalysisJob`
  - 触发 AI 解析 Pipeline（§5.4）
  - 分章并行调用，任务队列管理速率
  - 解析结果以 DRAFT 状态入库
  - 完成后生成 MergeSuggestion
- [ ] **解析进度 API**（`GET /api/books/:id/status`）

**验收：**

- 上传《儒林外史》前 20 回 `.txt` 完整跑通
- 章节识别率 > 90%
- 书名 AI 识别失败时回退文件名

### Phase 3 — 图谱数据 + 原文阅读

- [ ] **图谱数据 API**（`GET /api/books/:id/graph?chapter=<n>`）：§6.2 格式
- [ ] **人物详情 API**（`GET /api/personas/:id`）：含生平时间轴、关系列表
- [ ] **原文阅读 API**（`GET /api/books/:id/chapters/:chapterId/read`）：分段返回原文，支持 paraIndex + 高亮锚点
- [ ] **路径查找 API**（`POST /api/graph/path`）：Neo4j 最短路径
  - Neo4j 驱动接入（`src/server/db/neo4j.ts`）
  - VERIFIED 关系同步写入 Neo4j
- [ ] **布局坐标存储**：`PATCH /api/graphs/:id/layout`（拖拽节点后前端调用）

**验收：**

- 图谱 API 返回节点 + 边，前端 D3 可渲染
- 路径查找返回正确关系链

### Phase 4 — 校对 & 手动管理

- [ ] **人物 CRUD**（`PATCH /api/personas/:id`、`DELETE /api/personas/:id`）
- [ ] **关系 CRUD**（`POST/PATCH/DELETE /api/books/:id/relationships`）
- [ ] **传记事件 CRUD**（`POST/PATCH/DELETE /api/personas/:id/biography`）
- [ ] **手动新增人物**（`POST /api/books/:id/personas`，`recordSource: MANUAL`，状态直接 VERIFIED）
- [ ] **手动连线**（`POST /api/books/:id/relationships`，`recordSource: MANUAL`，状态直接 VERIFIED）
- [ ] **删除人物级联**：软删除 + 级联标记关联数据 `REJECTED`
- [ ] **批量审核 API**（`POST /api/admin/bulk-verify` / `bulk-reject`）
- [ ] **合并建议 API**（`GET/POST /api/admin/merge-suggestions/*`）
- [ ] **实体合并 API**（`POST /api/personas/merge`，§5.5 逻辑）
- [ ] **重解析 API**（扩展 `POST /api/books/:id/analyze`，支持范围 + 模型覆盖 + 策略参数）
- [ ] **模型配置 API**（`GET/PATCH /api/admin/models/:id` + 连通性测试）
  - API Key 加密/解密
  - 脱敏返回
  - 连通性测试（SSRF 防护：白名单域名）

**验收：**

- 合并操作后关系线全部重定向，被合并节点软删除
- 批量确认正常更新状态
- 已 VERIFIED 数据不被重解析覆盖

### Phase 5 — 增强与优化

- [ ] **`.epub` 解析支持**：epub 转文本 + 章节识别（与 `.txt` 流程对齐）
- [ ] **大体量图谱性能**：数据库查询优化（索引、分页）；Top N 节点筛选逻辑
- [ ] **Neo4j 社区检测**：Louvain 算法，自动生成派系建议
- [ ] **数据生命周期任务**：软删除 30 天清理任务
- [ ] **非功能性基线验收**（§10）

---

## 十、非功能性基线

| 指标 | 目标 |
| --- | --- |
| `POST /api/auth/login` 响应时间 | p95 < 300ms |
| 书库到图谱首屏可交互 | p95 < 2.5s（前 20 回数据集）|
| 前 20 回解析总耗时 | p95 < 10 分钟（默认模型，单次任务）|
| 主要人物识别率 | ≥ 95%（以《儒林外史》前 20 回为基准）|
| 主要关系识别率 | ≥ 95% |
| 关系误报率 | ≤ 10% |
| 原文证据引用率 | ≥ 90% |

---

## 十一、Definition of Done

- 单元测试覆盖核心业务逻辑（AI 解析 / 实体合并 / 图谱数据计算 / 鉴权）
- TypeScript 编译 0 错误
- ESLint 0 警告
- 所有 API 返回符合 `src/server/http/api-response.ts` 约定
- 三套内置主题下（前端）无明显文字对比度问题
- 核心主链路可完整演示：导入 → 解析 → 图谱 → 原文 → 审核
- 若涉及 Schema 变更，`prisma migrate dev` 与 seed 可在本地跑通

---

## 十二、关键决策记录

### 决策 1 — 认证采用 `users` 表方案

- JWT（HS256，`jose`）+ Argon2id + httpOnly Cookie
- 初始管理员通过 seed 写入
- 后续扩展多管理员成本低

### 决策 2 — API Key 加密存储

- `ai_models.api_key` AES-256-GCM 加密，`APP_ENCRYPTION_KEY` 控制
- 普通查询只返回脱敏值
- 支持密钥轮换

### 决策 3 — 交付策略：M0 全量 + Phase 分步

- 取消 M1 独立批次，全部功能纳入 M0
- 执行层 Phase 1–5 分步交付，每阶段独立验收
- 产品承诺不再有"后续 M1 再做"的模糊后置

### 决策 4 — 登录接口安全基线

- 应用层速率限制（同 IP 5min/10次失败锁定）
- `SameSite=Strict` + `Origin` Header 校验防 CSRF
- 连通性测试白名单校验防 SSRF

### 决策 5 — 存储 Provider 抽象

- M0 默认 `local` Provider，不引入 S3 服务
- `src/server/providers/storage/` 抽象层预留 `oss` Provider
- 业务代码不直接读写 `storage/` 路径
