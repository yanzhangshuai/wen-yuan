# 知识库 Phase 1 — Schema 与种子数据迁移

## Goal

将知识库设计文档 Phase 1 落地：在数据库中新增 BookType / KnowledgePack / KnowledgeEntry / BookKnowledgePack 四张核心表，并通过独立初始化脚本导入 `data/knowledge-base/book-types.init.json` 中的种子数据。

**参考文档**：`docs/知识库设计/知识库表设计与实施方案.md` Section 3 + Section 7.1 + Section 10 Phase 1

## Requirements

- 在 `prisma/schema.prisma` 新增 4 个模型：BookType、KnowledgePack、KnowledgeEntry、BookKnowledgePack
- Book 模型新增 `bookTypeId` FK 关联 BookType（保留原 `genre` 字段用于过渡）
- Book 模型新增 `bookKnowledgePacks` 关系
- Schema 遵循设计文档 Section 3.1 的完整定义（字段、索引、映射名）
- 创建 `scripts/init-knowledge-base.ts` 脚本：
  - 读取 `data/knowledge-base/book-types.init.json`
  - upsert BookType → create KnowledgePack → createMany KnowledgeEntry
  - 所有导入条目 reviewStatus = VERIFIED，source = IMPORTED
  - 幂等：已存在的 BookType 更新 presetConfig/name，已存在的 KnowledgePack 跳过
- 运行 `prisma migrate dev` 生成迁移文件
- 运行 init 脚本验证数据导入

## Acceptance Criteria

- [ ] `prisma migrate dev` 成功（无报错）
- [ ] 数据库中 BookType 表有 7 条记录
- [ ] 数据库中 KnowledgePack 表有 5 条记录（scope=GENRE）
- [ ] 数据库中 KnowledgeEntry 表有 318 条记录（全部 reviewStatus=VERIFIED）
- [ ] init 脚本可幂等重复执行（第二次运行不报错、不重复创建）
- [ ] `npx prisma generate` 后类型检查通过
- [ ] lint + typecheck 通过

## Technical Notes

- Phase 1 仅做 schema + 种子数据，不改动解析流水线（Phase 5 任务）
- `Book.genre` 字段保留不删，后续迁移脚本再处理数据对照
- init 脚本独立于 `prisma/seed.ts`，通过 `npx tsx scripts/init-knowledge-base.ts` 运行
- 设计文档中的 SurnameEntry、GenericTitleEntry、PromptTemplate、ExtractionRule 属于后续 Phase，本次不实现
