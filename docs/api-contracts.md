# API Contracts（后端接口契约）

更新时间：2026-03-26  
适用代码：`src/app/api/**` + `src/server/http/**` + `src/server/modules/**`

## 1. 统一响应结构

所有 API 使用统一 envelope（见 `src/types/api.ts`、`src/server/http/api-response.ts`）。

成功响应：

```json
{
  "success": true,
  "code": "BOOKS_LISTED",
  "message": "书库列表获取成功",
  "data": {},
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-03-26T08:00:00.000Z",
    "path": "/api/books",
    "durationMs": 12
  }
}
```

失败响应：

```json
{
  "success": false,
  "code": "COMMON_BAD_REQUEST",
  "message": "请求参数不合法",
  "error": {
    "type": "ValidationError",
    "detail": "书籍 ID 不合法"
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-03-26T08:00:00.000Z",
    "path": "/api/books/:id",
    "durationMs": 6
  }
}
```

## 2. 鉴权与访问级别

- `Public`：匿名/viewer/admin 都可访问。
- `Admin`：仅管理员。实现上为双层保护：
- `middleware.ts` 保护 `/api/admin/*`。
- 业务路由内 `requireAdmin(auth)` 保护写操作与部分非 `/api/admin/*` 接口。

认证接口：

- `POST /api/auth/login`：同源校验 + 登录失败限流 + JWT Cookie 下发（7 天）。
- `POST /api/auth/logout`：清除 Cookie，接口幂等。

## 3. 端点清单（当前实现）

| Method | Path | Access | 说明 |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | Public | 管理员登录，写入 httpOnly Cookie |
| `POST` | `/api/auth/logout` | Public | 退出登录，清除 Cookie |
| `GET` | `/api/assets/:key*` | Public | 本地存储对象访问 |
| `GET` | `/api/books` | Public | 书库列表 |
| `POST` | `/api/books` | Admin | 导入书籍（`.txt`） |
| `GET` | `/api/books/:id` | Public | 书籍详情 |
| `DELETE` | `/api/books/:id` | Admin | 删除书籍 |
| `GET` | `/api/books/:id/status` | Public | 解析状态快照 |
| `GET` | `/api/books/:id/graph` | Public | 单书图谱数据 |
| `GET` | `/api/books/:id/chapters/preview` | Public | 自动章节切分预览 |
| `POST` | `/api/books/:id/chapters/confirm` | Admin | 章节确认落库 |
| `GET` | `/api/books/:id/chapters/:chapterId/read` | Public | 原文阅读/高亮定位 |
| `POST` | `/api/books/:id/analyze` | Admin | 创建解析任务（入队） |
| `GET` | `/api/books/:id/personas` | Public | 单书人物列表 |
| `POST` | `/api/books/:id/personas` | Admin | 手动新增人物 |
| `GET` | `/api/books/:id/relationships` | Public | 单书关系列表 |
| `POST` | `/api/books/:id/relationships` | Admin | 手动新增关系 |
| `GET` | `/api/personas/:id` | Public | 人物详情 |
| `PATCH` | `/api/personas/:id` | Admin | 更新人物 |
| `DELETE` | `/api/personas/:id` | Admin | 删除人物（软删） |
| `POST` | `/api/personas/:id/biography` | Admin | 新增人物传记事件 |
| `POST` | `/api/personas/merge` | Admin | 人物合并 |
| `PATCH` | `/api/relationships/:id` | Admin | 更新关系 |
| `DELETE` | `/api/relationships/:id` | Admin | 删除关系（软删） |
| `PATCH` | `/api/biography/:id` | Admin | 更新传记事件 |
| `DELETE` | `/api/biography/:id` | Admin | 删除传记事件（软删） |
| `POST` | `/api/graph/path` | Public | 两人物最短路径查询 |
| `PATCH` | `/api/graphs/:id/layout` | Admin | 保存图谱布局 |
| `GET` | `/api/admin/drafts` | Admin | 审核草稿列表 |
| `POST` | `/api/admin/bulk-verify` | Admin | 批量确认草稿 |
| `POST` | `/api/admin/bulk-reject` | Admin | 批量拒绝草稿 |
| `GET` | `/api/admin/merge-suggestions` | Admin | 合并建议队列 |
| `POST` | `/api/admin/merge-suggestions/:id/accept` | Admin | 接受合并建议 |
| `POST` | `/api/admin/merge-suggestions/:id/reject` | Admin | 拒绝合并建议 |
| `POST` | `/api/admin/merge-suggestions/:id/defer` | Admin | 暂缓合并建议 |
| `GET` | `/api/admin/models` | Admin | 模型配置列表 |
| `PATCH` | `/api/admin/models/:id` | Admin | 更新模型配置 |
| `POST` | `/api/admin/models/:id/set-default` | Admin | 设置默认模型 |
| `POST` | `/api/admin/models/:id/test` | Admin | 模型连通性测试 |

## 4. 错误码约定

- 通用：`COMMON_BAD_REQUEST` / `COMMON_NOT_FOUND` / `COMMON_INTERNAL_ERROR` / `COMMON_RATE_LIMITED`
- 认证：`AUTH_UNAUTHORIZED` / `AUTH_FORBIDDEN`

说明：业务模块可抛领域异常，路由层统一映射为上述标准错误码并保持 envelope 一致。

