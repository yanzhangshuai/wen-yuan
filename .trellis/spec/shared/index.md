---
stage: mvp
---

# 共享规范

> 跨前后端的通用规则，适用于项目所有代码。

---

## 规范列表

| 规范 | 目的 | 何时使用 |
|------|------|---------|
| [Zod-First 类型规范](./zod-typescript.md) | 外部数据（AI 输出/API 请求体）的 schema 定义方式 | 涉及 AI 输出解析、API 请求校验时 |
| [代码质量规范](./code-quality.md) | 禁止 `any`/`!`/`console.log` 等全局强制规则 | 所有代码编写和提交前 |

---

## 踩坑文档

常见生产环境问题的记录与解决方案：

| 文档 | 分类 | 严重等级 |
|------|------|---------|
| [PostgreSQL JSON vs JSONB](../big-question/postgresql-json-jsonb.md) | 数据库 | Critical |
| [Turbopack vs Webpack Flexbox](../big-question/turbopack-webpack-flexbox.md) | 构建系统 | Warning |
| [WebKit 移动端点击高亮](../big-question/webkit-tap-highlight.md) | 移动端/CSS | Info |

→ 查看完整索引：[big-question/index.md](../big-question/index.md)
