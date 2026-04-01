# 人物增强-别名注册与解析器增强

## Goal
实现别名注册表与解析器增强，使称号/别名在章节范围内可控归并，降低伪实体。

## Requirements
- 新建 AliasRegistryService 并实现查询/注册/缓存加载/待确认列表
- PersonaResolver 引入 Step 2.5 别名查询与章节号入参
- 增强 Phase 1 Prompt 输出 aliasType/contextHint/suggestedRealName/aliasConfidence
- 增强 Phase 1 解析函数兼容新字段
- ChapterAnalysisService 集成别名注册与溯源持久化

## Acceptance Criteria
- [ ] AliasRegistryService 单测通过
- [ ] PersonaResolver 新增测试通过
- [ ] Prompt snapshot 与解析测试通过
- [ ] ChapterAnalysisService 集成测试通过
