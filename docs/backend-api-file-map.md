# Backend & API 代码文件结构说明

更新时间：2026-03-26  
统计口径：运行时代码（不含 `*.test.ts`）  
覆盖范围：`src/app/api/**`、`src/server/**`、`middleware.ts`

## 1. 目录结构（后端/API）

```text
middleware.ts
src/
  app/
    api/
      admin/
      assets/
      auth/
      biography/
      books/
      graph/
      graphs/
      personas/
      relationships/
  server/
    db/
    http/
    modules/
      analysis/
      auth/
      biography/
      books/
      graph/
      models/
      personas/
      relationships/
      review/
    providers/
      ai/
      storage/
    security/
```

## 2. 文件总览统计

- API 路由层（`src/app/api`）：35 个文件
- 服务端业务层（`src/server`）：59 个文件
- 根级后端入口：1 个文件（`middleware.ts`）
- 合计：95 个运行时代码文件

## 3. 逐文件职责说明

### 3.1 根级后端入口

| 文件 | 主要功能 |
| --- | --- |
| `middleware.ts` | 全局鉴权中间件：校验 token、注入 `x-auth-*` 请求头、保护 `/admin/*` 与 `/api/admin/*` 并重定向到登录页。 |

### 3.2 API 路由层（`src/app/api`）

| 文件 | 主要功能 |
| --- | --- |
| `src/app/api/admin/bulk-reject/route.ts` | 管理端批量拒绝草稿数据（人物/关系/事件）。 |
| `src/app/api/admin/bulk-verify/route.ts` | 管理端批量确认草稿数据。 |
| `src/app/api/admin/drafts/route.ts` | 获取管理审核看板草稿列表，支持筛选与分页参数。 |
| `src/app/api/admin/merge-suggestions/[id]/_shared.ts` | 合并建议子路由通用错误响应（not found/conflict）工具。 |
| `src/app/api/admin/merge-suggestions/[id]/accept/route.ts` | 接受指定合并建议并执行实体合并。 |
| `src/app/api/admin/merge-suggestions/[id]/defer/route.ts` | 延后指定合并建议（保留待处理状态）。 |
| `src/app/api/admin/merge-suggestions/[id]/reject/route.ts` | 拒绝指定合并建议。 |
| `src/app/api/admin/merge-suggestions/_shared.ts` | 合并建议路由参数/查询校验 schema 与 bad-request 响应工具。 |
| `src/app/api/admin/merge-suggestions/route.ts` | 查询合并建议队列列表。 |
| `src/app/api/admin/models/[id]/route.ts` | 更新单个模型配置（启用、Key、BaseURL 等）。 |
| `src/app/api/admin/models/[id]/set-default/route.ts` | 设置默认解析模型。 |
| `src/app/api/admin/models/[id]/test/route.ts` | 触发模型连通性测试。 |
| `src/app/api/admin/models/_shared.ts` | 模型路由参数与请求体 schema、bad-request 响应工具。 |
| `src/app/api/admin/models/route.ts` | 获取模型配置列表（管理端视图）。 |
| `src/app/api/assets/[...key]/route.ts` | 通过存储 key 读取并回传静态资源（封面、文本等）。 |
| `src/app/api/auth/login/route.ts` | 管理员登录：校验账号密码、写入 httpOnly JWT Cookie。 |
| `src/app/api/auth/logout/route.ts` | 管理员登出：清除登录 Cookie。 |
| `src/app/api/biography/[id]/route.ts` | 更新/删除单条传记事件。 |
| `src/app/api/books/[id]/_shared.ts` | 书籍子路由通用参数 schema 与 bookId 解析工具。 |
| `src/app/api/books/[id]/analyze/route.ts` | 启动书籍解析任务（支持范围、模型、重跑策略）。 |
| `src/app/api/books/[id]/chapters/[chapterId]/read/route.ts` | 获取章节原文阅读内容（支持段落定位）。 |
| `src/app/api/books/[id]/chapters/confirm/route.ts` | 提交章节切分确认结果（覆盖自动切分）。 |
| `src/app/api/books/[id]/chapters/preview/route.ts` | 获取章节切分预览（自动识别结果）。 |
| `src/app/api/books/[id]/graph/route.ts` | 获取单书图谱快照（节点/边/筛选条件）。 |
| `src/app/api/books/[id]/personas/route.ts` | 获取书籍人物列表、创建手动人物。 |
| `src/app/api/books/[id]/relationships/route.ts` | 获取书籍关系列表、创建手动关系。 |
| `src/app/api/books/[id]/route.ts` | 获取书籍详情、删除书籍。 |
| `src/app/api/books/[id]/status/route.ts` | 查询书籍解析状态与阶段进度。 |
| `src/app/api/books/route.ts` | 创建书籍（导入）与获取书库列表。 |
| `src/app/api/graph/path/route.ts` | 计算两人物最短关系路径（图查询）。 |
| `src/app/api/graphs/[id]/layout/route.ts` | 保存/更新图谱布局坐标配置。 |
| `src/app/api/personas/[id]/biography/route.ts` | 为指定人物新增传记事件。 |
| `src/app/api/personas/[id]/route.ts` | 获取/更新/删除人物详情。 |
| `src/app/api/personas/merge/route.ts` | 执行两个人物实体合并。 |
| `src/app/api/relationships/[id]/route.ts` | 更新/删除单条关系记录。 |

### 3.3 数据访问与 HTTP 工具（`src/server/db` + `src/server/http`）

| 文件 | 主要功能 |
| --- | --- |
| `src/server/db/neo4j.ts` | Neo4j Driver 创建与复用（按环境变量懒加载）。 |
| `src/server/db/prisma.ts` | Prisma Client 单例初始化与复用。 |
| `src/server/http/api-response.ts` | 统一 API 响应协议封装（meta/success/error/NextResponse）。 |
| `src/server/http/read-json-body.ts` | 安全读取 JSON 请求体（失败时返回可控异常）。 |
| `src/server/http/route-utils.ts` | 路由通用工具：分页参数解析、成功/失败 JSON 输出。 |

### 3.4 业务模块层（`src/server/modules`）

#### 3.4.1 Analysis 模块

| 文件 | 主要功能 |
| --- | --- |
| `src/server/modules/analysis/services/ChapterAnalysisService.ts` | 章节解析总服务：调模型、结构化抽取、写回人物/关系/事件。 |
| `src/server/modules/analysis/services/PersonaResolver.ts` | 人物解析器：人物标准化、别名归并、匹配既有人物。 |
| `src/server/modules/analysis/services/aiClient.ts` | 章节解析 AI 客户端封装：把 prompt 调用 provider 并解析响应。 |
| `src/server/modules/analysis/services/prompts.ts` | 构建章节解析 Prompt 文本模板。 |

#### 3.4.2 Auth 模块

| 文件 | 主要功能 |
| --- | --- |
| `src/server/modules/auth/constants.ts` | 鉴权常量定义（cookie 名、TTL、角色、token payload 类型）。 |
| `src/server/modules/auth/edge-token.ts` | Edge Runtime 场景下的 token 校验逻辑（供 middleware 使用）。 |
| `src/server/modules/auth/index.ts` | 鉴权主入口：登录校验、签发/校验 token、上下文读取、管理员守卫。 |
| `src/server/modules/auth/login-rate-limit.ts` | 登录限流与失败锁定策略（按 IP 记录失败次数）。 |
| `src/server/modules/auth/password.ts` | 密码哈希与校验（Argon2id）。 |
| `src/server/modules/auth/token.ts` | token 签发与校验的底层实现。 |

#### 3.4.3 Biography 模块

| 文件 | 主要功能 |
| --- | --- |
| `src/server/modules/biography/createPersonaBiography.ts` | 新增人物传记事件服务。 |
| `src/server/modules/biography/deleteBiographyRecord.ts` | 删除（软删除）传记事件服务。 |
| `src/server/modules/biography/errors.ts` | Biography 模块专用错误类型定义。 |
| `src/server/modules/biography/updateBiographyRecord.ts` | 更新传记事件服务。 |

#### 3.4.4 Books 模块

| 文件 | 主要功能 |
| --- | --- |
| `src/server/modules/books/confirmBookChapters.ts` | 章节切分确认服务：保存用户修订后的章节结构。 |
| `src/server/modules/books/createBook.ts` | 创建书籍服务：写入书籍基础信息与源文本。 |
| `src/server/modules/books/deleteBook.ts` | 删除书籍服务（含相关数据清理/标记）。 |
| `src/server/modules/books/errors.ts` | Books 模块专用错误类型（书不存在、模型异常、范围异常等）。 |
| `src/server/modules/books/getBookById.ts` | 获取书籍详情服务。 |
| `src/server/modules/books/getBookGraph.ts` | 构造单书图谱快照数据（节点、边、统计、过滤）。 |
| `src/server/modules/books/getBookStatus.ts` | 获取书籍解析进度状态服务。 |
| `src/server/modules/books/getChapterPreview.ts` | 章节预览服务：原文切分与章节候选生成。 |
| `src/server/modules/books/listBooks.ts` | 书库列表聚合服务：卡片信息、统计、最近任务状态。 |
| `src/server/modules/books/readChapter.ts` | 章节阅读服务：按段落读取与定位校验。 |
| `src/server/modules/books/startBookAnalysis.ts` | 启动解析任务服务：创建 analysis job、校验范围/重跑参数。 |

#### 3.4.5 Graph 模块

| 文件 | 主要功能 |
| --- | --- |
| `src/server/modules/graph/findPersonaPath.ts` | 图路径查询服务：计算两人物最短路径并返回路径节点/边。 |
| `src/server/modules/graph/updateGraphLayout.ts` | 图谱布局保存服务：持久化前端拖拽坐标。 |

#### 3.4.6 Models 模块

| 文件 | 主要功能 |
| --- | --- |
| `src/server/modules/models/index.ts` | 模型配置领域服务：列表、更新、设默认、连通性测试、管理端适配。 |

#### 3.4.7 Personas 模块

| 文件 | 主要功能 |
| --- | --- |
| `src/server/modules/personas/createBookPersona.ts` | 新增人物服务（支持手动录入）。 |
| `src/server/modules/personas/deletePersona.ts` | 删除人物服务（软删除与关联处理）。 |
| `src/server/modules/personas/errors.ts` | Personas 模块专用错误定义。 |
| `src/server/modules/personas/getPersonaById.ts` | 获取人物详情服务（基础信息、关系、时间线）。 |
| `src/server/modules/personas/listBookPersonas.ts` | 获取单书人物列表服务。 |
| `src/server/modules/personas/mergePersonas.ts` | 人物合并服务：关系/事件/Mention 重定向。 |
| `src/server/modules/personas/updatePersona.ts` | 更新人物资料服务。 |

#### 3.4.8 Relationships 模块

| 文件 | 主要功能 |
| --- | --- |
| `src/server/modules/relationships/createBookRelationship.ts` | 新增关系服务（手动连线）。 |
| `src/server/modules/relationships/deleteRelationship.ts` | 删除关系服务（软删除）。 |
| `src/server/modules/relationships/errors.ts` | Relationships 模块专用错误定义。 |
| `src/server/modules/relationships/listBookRelationships.ts` | 单书关系列表查询服务（支持过滤）。 |
| `src/server/modules/relationships/updateRelationship.ts` | 更新关系服务。 |

#### 3.4.9 Review 模块

| 文件 | 主要功能 |
| --- | --- |
| `src/server/modules/review/bulkReview.ts` | 审核批量操作服务（批量确认/拒绝）。 |
| `src/server/modules/review/listDrafts.ts` | 审核草稿列表聚合服务（人物/关系/事件）。 |
| `src/server/modules/review/mergeSuggestions.ts` | 合并建议服务：生成、分页、接受/拒绝/延后与冲突校验。 |

### 3.5 Provider 与安全层（`src/server/providers` + `src/server/security`）

#### 3.5.1 AI Provider

| 文件 | 主要功能 |
| --- | --- |
| `src/server/providers/ai/deepseekClient.ts` | DeepSeek Provider 客户端实现。 |
| `src/server/providers/ai/doubaoClient.ts` | 豆包 Provider（基于 OpenAI 兼容协议封装）。 |
| `src/server/providers/ai/geminiClient.ts` | Gemini Provider 客户端实现。 |
| `src/server/providers/ai/index.ts` | AI Provider 抽象接口与工厂选择器（按 provider 名称实例化）。 |
| `src/server/providers/ai/openaiCompatibleClient.ts` | OpenAI 兼容协议通用客户端基类。 |
| `src/server/providers/ai/qwenClient.ts` | 通义千问 Provider（复用 OpenAI 兼容基类）。 |

#### 3.5.2 Storage Provider

| 文件 | 主要功能 |
| --- | --- |
| `src/server/providers/storage/index.ts` | 存储 Provider 抽象入口与工厂（本地/OSS）。 |
| `src/server/providers/storage/localStorageProvider.ts` | 本地文件存储实现（写入、读取、删除、URL 组装）。 |
| `src/server/providers/storage/storage.types.ts` | 存储抽象类型定义（Put/Get/Delete 协议）。 |
| `src/server/providers/storage/storage.utils.ts` | 存储工具函数（key 规范化、路径解析、URL 拼接、类型推断）。 |

#### 3.5.3 Security

| 文件 | 主要功能 |
| --- | --- |
| `src/server/security/encryption.ts` | 敏感字段加解密与脱敏（如模型 API Key）。 |

## 4. 备注（不在本表统计内）

- `*.test.ts`：测试文件，未纳入“运行时代码结构”统计。
- `src/generated/**`：代码生成产物（如 Prisma 生成客户端），未纳入业务代码职责映射。
