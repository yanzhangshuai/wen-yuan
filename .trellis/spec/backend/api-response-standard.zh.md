# API Response Standard

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/spec/backend/api-response-standard.md
> 镜像文档：.trellis/spec/backend/api-response-standard.zh.md
> 最后同步：2026-03-03
> 同步人：codex


> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/backend/api-response-standard.md
> Mirror: .trellis/spec/backend/api-response-standard.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


## 规范结构

所有 API Routes 与 Server Actions 都应返回统一的 payload：

```ts
{
  success: boolean;
  code: string;
  message: string;
  data?: T;
  error?: { type: string; detail?: string };
  meta: {
    requestId: string;
    timestamp: string;
    path: string;
    durationMs?: number;
  };
}
```

## 必须遵循的实现模式

1. 在 `src/types/api.ts` 中维护共享契约。
2. 在 `src/server/http/api-response.ts` 中复用共享构建器。
3. 避免临时拼装 `NextResponse.json(...)` 的 payload 结构。
4. 成功与失败路径都使用稳定的业务 `code` 常量。

## 现有参考

- `src/types/api.ts`
- `src/server/http/api-response.ts`
- `scripts/scaffold-api.mjs`（模板生成）

## 反模式

- 向客户端直接返回原始抛出的错误对象。
- 在同一模块中混用多种响应结构。
- 省略 `meta.requestId`，导致请求链路不可追踪。
