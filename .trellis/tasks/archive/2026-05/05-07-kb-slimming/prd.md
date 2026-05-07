# brainstorm: 知识库瘦身重构

## Goal

精简知识库模块，减少 DB 表、CRUD 服务、API 路由和管理页面的冗余，同时保持分析流水线核心能力不变。

## What I already know

从对话中的完整代码审查得出：

### 当前 11 张知识库相关表
- `book_types` — 书籍类型分类
- `alias_packs` + `alias_entries` — 别名知识包
- `surname_rules` — 姓氏词库
- `generic_title_rules` — 泛化称谓
- `ner_lexicon_rules` — NER 词典规则 (4 种 ruleType)
- `prompt_extraction_rules` — Prompt 提取规则 (2 种 ruleType)
- `historical_figure_entries` — 历史人物
- `name_pattern_rules` — 名字模式正则
- `relationship_type_definitions` — 关系类型定义
- `prompt_templates` + `prompt_template_versions` — 提示词模板

### 分析结论
- **保持**: BookType, AliasPack+AliasEntry, GenericTitleRule, RelationshipTypeDefinition, PromptTemplate
- **瘦身**: SurnameRule (DB→静态文件 + bookType 级少量 DB 覆盖)
- **合并**: NerLexiconRule + PromptExtractionRule → 单张 ExtractionRule 表
- **移除/静态化**: HistoricalFigureEntry, NamePatternRule

### 影响范围
- **Prisma schema**: 删除/修改 4 张表
- **服务端模块**: 合并 2 个 CRUD 模块，简化 surname 模块，移除 historical-figure/name-pattern 模块
- **API 路由**: ~30 个路由文件受影响
- **管理页面**: ~15 个页面/组件文件受影响
- **Seed 脚本**: 需更新种子数据逻辑

### 运行时汇聚点
所有知识通过 `loadFullRuntimeKnowledge()` → `FullRuntimeKnowledge` → 注入 `PersonaResolver` 和 `ChapterAnalysisService`。瘦身后 `FullRuntimeKnowledge` 接口需保持兼容。

## Requirements

### R1: 姓氏词库静态化
- 创建 `src/server/modules/knowledge/data/surnames.ts`，包含标准百家姓（单姓 ~500、复姓 ~80）
- `loadAnalysisRuntimeConfig` 默认加载静态姓氏，DB 中 bookType 级覆盖作为补充
- 保留 `surname_rules` 表仅用于 bookType 级自定义追加（如特定文本的非常见姓氏）
- 砍掉姓氏管理页面的批量 CRUD，仅保留 bookType 级追加入口（或简化为一个简单的管理页）
- 移除 `generateSurnames.ts`（AI 生成姓氏无必要——姓氏是封闭集合）

### R2: NER 词典规则 + Prompt 提取规则合并
- 新建 `extraction_rules` 表，ruleType 枚举扩展为 6 个值：`HARD_BLOCK_SUFFIX | SOFT_BLOCK_SUFFIX | TITLE_STEM | POSITION_STEM | ENTITY | RELATIONSHIP`
- 数据迁移：从 `ner_lexicon_rules` 和 `prompt_extraction_rules` 迁移现有数据
- 合并 CRUD 服务为单一 `extraction-rules.ts`
- 合并 API 路由为 `api/admin/knowledge/extraction-rules/`
- 合并管理页面
- 更新 `load-book-knowledge.ts` 从新表读取
- 移除旧表和旧代码

### R3: 历史人物移除
- 将 `historical_figure_entries` 表数据导出为静态文件 `data/historical-figures.ts`
- 移除 DB 表、CRUD、API 路由、管理页面
- `loadFullRuntimeKnowledge` 改为从静态文件加载
- 保留 `FullRuntimeKnowledge.historicalFigures` 和 `historicalFigureMap` 接口不变

### R4: 名字模式规则内聚
- 评估现有数据：若模式数量 ≤ 30 且稳定 → 写为代码常量 `data/name-patterns.ts`
- 若模式数量多且经常变化 → 作为 ruleType 合并到 `extraction_rules` 表
- 移除独立表、CRUD、API、管理页面
- `loadFullRuntimeKnowledge` 改为从静态文件或 extraction_rules 表加载

## Acceptance Criteria

- [ ] 静态姓氏文件覆盖常见单姓/复姓，`extractSurname()` 无需 DB 查询即可工作
- [ ] `extraction_rules` 表替代 `ner_lexicon_rules` + `prompt_extraction_rules`，数据完整迁移
- [ ] `loadFullRuntimeKnowledge` 返回的 `FullRuntimeKnowledge` 接口不变，所有现有测试通过
- [ ] 现有分析流水线测试（PersonaResolver、ChapterAnalysisService、load-book-knowledge）全部通过
- [ ] lint + typecheck 通过
- [ ] 管理页面功能正常（合并后的规则管理页、简化后的姓氏管理）
- [ ] Prisma migration 可正常执行

## Definition of Done

- 所有测试通过（含新增的迁移测试）
- lint / typecheck 绿色
- 旧表已删除，旧代码已清理
- Seed 脚本已更新

## Technical Approach

### 执行顺序（依赖关系）
1. **Subtask A**: 姓氏词库静态化（最独立，无依赖）
2. **Subtask B**: NER + Prompt 规则表合并（依赖 A 完成后 load-book-knowledge 的形态）
3. **Subtask C**: 历史人物 + 名字模式规则处理（可能与 B 并行，但建议串行避免冲突）

### 关键约束
- `FullRuntimeKnowledge` 接口保持向后兼容——PersonaResolver 和 ChapterAnalysisService 不应感知数据源变化
- Migration 需确保数据不丢失（先创建新表/文件 → 迁移数据 → 验证 → 删除旧表）
- 管理页面 URL 变更需要更新导航

## Out of Scope

- 不改变 BookType、AliasPack/AliasEntry、GenericTitleRule、RelationshipTypeDefinition、PromptTemplate 的结构
- 不修改 PersonaResolver 和 ChapterAnalysisService 的核心逻辑
- 不改变分析流水线的行为（只改变数据来源，不改变运行时行为）
- 不修改前端图谱可视化
