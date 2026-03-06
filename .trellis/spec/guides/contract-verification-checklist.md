# 契约验收清单

> 验证 API/Action/类型契约在变更后仍稳定可用。

---

## 必须遵守

- 成功/失败/边界三路径都要验证 contract。
- 验证 `code/message/data/error/meta` 字段完整性与类型。
- 破坏性变更必须明确版本或兼容策略。
- 变更后调用方（前端或上游服务）至少跑一条集成验证。

---

## 代码案例

反例：
```ts
expect(response.status).toBe(200);
```

正例：
```ts
expect(payload.success).toBe(true);
expect(payload.code).toBe("ANALYZE_CHAPTER_OK");
expect(typeof payload.meta.requestId).toBe("string");
```

---

## 原因

- 只验 status 会漏掉字段漂移与语义漂移。
- contract 是跨层协作基础，必须当成可执行接口来验收。

---

## 验收清单

- [ ] 三路径 contract 均有断言
- [ ] `meta.requestId` 可追踪
- [ ] 错误分支 `code` 稳定
- [ ] 破坏性变更有版本/兼容说明
