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
| [Neo4j 使用规范](./neo4j-guidelines.md) | Session 生命周期、参数化查询、与 Prisma 的边界 | 新增 |
| [AI 输出契约规范](./ai-output-contract.md) | Zod 校验、多模型一致性、幻觉处理、重试策略 | 新增 |
| [AI 模型配置契约](./ai-model-config.md) | 管理员模型 CRUD、protocol 分发、导入导出、SSRF 与删除保护 | 04-28 自定义模型配置 |
| [分析运行时知识契约](./analysis-runtime-knowledge.md) | 知识库 DB 到分析 Prompt/Resolver 的 DB-only 运行时契约 | 04-16 PromptExtractionRule 管道修复 |
| [类型安全](./type-safety.md) | 跨层类型约束与禁用模式 | 代码库既有模式 |
| [日志规范](./logging-guidelines.md) | 结构化日志规范 | 服务层既有模式 |
| [安全规范](./security-guidelines.md) | 鉴权、输入校验、敏感信息保护 | 项目安全基线 |
| [数据迁移规范](./migration-guidelines.md) | expand-contract 与回滚策略 | 数据可靠性要求 |
| [知识库批量操作契约](./knowledge-base-batch-ops.md) | 知识库管理台批量 API/Service/Prisma 跨层契约 | 04-16 知识库批量操作 |
| [角色资料工作台章节事迹与角色管理契约](./role-workbench-character-events.md) | 章节事迹校验、角色 CRUD、删除级联预览的跨层契约 | 04-28 角色资料工作台角色事迹管理 |
| [测试规范](./test-guidelines.md) | Vitest 测试模式、mock 策略、Route Handler 测试 | 项目测试约定 |
| [分析管线架构规范](./analysis-pipeline.md) | sequential/twopass 管线边界与调用约定 | 管线架构约定 |
| [Route Handler 编写规范](./route-handler-guidelines.md) | 鉴权顺序、Zod 校验、错误映射、分页解析 | 项目既有模式 |
| [质量规范](./quality-guidelines.md) | 交付前校验清单 | 项目流程约定 |

---

## 规范质量要求

所有后端规范文档需满足“具体规则 + 代码示例 + 原因说明”。


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
