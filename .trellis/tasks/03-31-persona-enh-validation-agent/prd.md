# 人物增强-自检Agent与报告接口

## Goal
新增全书自检能力与报告查询/修正接口，形成可审核、可自动修正的质量闭环。

## Requirements
- 新建 ValidationAgentService（章节/全书校验、自动修正）
- 新增 buildChapterValidationPrompt/buildBookValidationPrompt/parseValidationResponse
- 在 runAnalysisJob 中集成全书自检与自动修正
- 新增 validation/alias-mappings API 路由

## Acceptance Criteria
- [ ] ValidationAgentService 单测通过
- [ ] runAnalysisJob 集成测试通过
- [ ] 新 API 路由测试通过
- [ ] 自检失败不阻塞主流程
