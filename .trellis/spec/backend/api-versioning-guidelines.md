# API 版本与兼容规范

> 管理 API/Action contract 演进，避免前后端同步失败。

---

## 必须遵守

- 破坏性变更必须引入新版本路径或新 contract（例如 `/api/v2/...`）。
- 非破坏性变更优先“新增字段”，禁止“重命名并直接删除旧字段”。
- 旧版本在退役前必须保留兼容窗口，并明确下线时间。
- `code` 语义稳定，禁止在同名 `code` 下改变业务含义。

---

## 代码案例

反例：
```ts
// 直接把字段 title 改成 name，旧字段彻底删除
return { success: true, code: "BOOK_OK", data: { name: book.title } };
```

正例：
```ts
// v1 保留 title；v2 引入 name
export function toBookPayloadV1(book: { title: string }) {
  return { success: true, code: "BOOK_OK", data: { title: book.title } };
}

export function toBookPayloadV2(book: { title: string }) {
  return { success: true, code: "BOOK_OK", data: { title: book.title, name: book.title } };
}
```

---

## 原因

- contract 突变会导致前端/第三方调用方在无预警下失败。
- 版本化可把风险从“线上事故”转为“受控迁移”。
- 稳定 `code` 语义可保障监控与告警规则长期有效。

---

## 验收清单

- [ ] 是否存在破坏性字段变更
- [ ] 破坏性变更是否提供 v2 或兼容层
- [ ] 是否记录兼容窗口与下线计划
- [ ] 是否补充成功/失败 contract 验证用例
