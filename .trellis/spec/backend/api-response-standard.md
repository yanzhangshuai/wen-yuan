---
stage: mvp
---

# API 响应规范

> [SYNC-NOTE]
> 角色：事实基准（供 agents 使用）
> 主文档：.trellis/spec/backend/api-response-standard.md
> 镜像文档：.trellis/spec/backend/api-response-standard.zh.md
> 最近同步：2026-03-03
> 同步负责人：codex


## 规范结构

所有 API Routes 与 Server Actions 都应返回统一 payload：

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
3. 避免临时拼装 `NextResponse.json(...)` payload 结构。
4. 成功与失败路径都使用稳定的业务 `code` 常量。

## 现有参考

- `src/types/api.ts`
- `src/server/http/api-response.ts`
- `scripts/scaffold-api.mjs`（模板生成）

## 反模式

- 向客户端直接返回原始抛出错误对象。
- 在同一模块中混用多种响应结构。
- 省略 `meta.requestId`，导致请求链路不可追踪。

---

## 代码案例与原因

反例：
```ts
return NextResponse.json({
  ok: false,
  message: "failed",
});
```

正例：
```ts
return toNextJson(
  errorResponse(
    "ANALYZE_CHAPTER_FAILED",
    "章节分析失败",
    { type: "InternalError", detail: "..." },
    createApiMeta("/api/analyze", requestId, startedAt),
  ),
  500,
);
```

原因：
- 统一响应结构可保证前后端 contract 稳定，避免消费端分支爆炸。
- `requestId`/`code` 统一后，排障链路可检索、可回放。
