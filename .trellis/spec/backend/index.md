---
stage: mvp
---

# 后端开发规范

> [SYNC-NOTE]
> 角色：事实基准（供 agents 使用）
> 主文档：.trellis/spec/backend/index.md
> 镜像文档：.trellis/spec/backend/index.zh.md
> 最近同步：2026-03-03
> 同步负责人：codex


> 面向 Next.js 服务端代码的项目后端约定。

---

## 指南索引

| 指南 | 说明 | 来源 |
|-------|-------------|--------|
| [API 响应规范](./api-response-standard.md) | 统一 API/Action payload 契约 | 迁移自 `.codex/skills/api-response-standard` |
| [注释模板](./comment-template.md) | backend/services 的中文 JSDoc 模板 | 迁移自 `.codex/skills/zh-comment-template` |
| [数据库规范](./database-guidelines.md) | Prisma 事务与生成代码规则 | 代码库既有模式 |
| [类型安全](./type-safety.md) | 跨层类型约束与禁用模式 | 代码库既有模式 |
| [日志规范](./logging-guidelines.md) | 结构化日志规范 | 服务层既有模式 |
| [安全规范](./security-guidelines.md) | 鉴权、输入校验、敏感信息保护 | 项目安全基线 |
| [API 版本与兼容规范](./api-versioning-guidelines.md) | contract 演进与兼容窗口 | 项目流程约定 |
| [数据迁移规范](./migration-guidelines.md) | expand-contract 与回滚策略 | 数据可靠性要求 |
| [质量规范](./quality-guidelines.md) | 交付前校验清单 | 项目流程约定 |

---

## 规范质量要求

所有后端规范文档需满足“具体规则 + 代码示例 + 原因说明”。
统一标准见：`../meta/spec-quality-standard.md`。

代码示例：
```ts
// 反例：临时响应结构
return NextResponse.json({ ok: false, msg: "failed" });

// 正例：统一响应 contract
return toNextJson(errorResponse("COMMON_BAD_REQUEST", "参数错误", detail, meta), 400);
```

原因：
- 索引给出最小示例后，团队在具体规范执行时更容易保持一致。

---

**语言**：说明性内容使用中文；技术术语与代码标识保持英文。
