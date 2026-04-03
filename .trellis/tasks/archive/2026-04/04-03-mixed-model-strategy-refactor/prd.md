# 混合模型配置重构实施

## Goal
严格依据《书籍解析系统问题整改与混合模型配置重构实施方案》完成 Pipeline 混合模型配置体系重构，覆盖数据库、Provider、服务链路、API、前端与测试，形成可运行可验证的全量交付。

## Requirements
- 支持 Pipeline 各阶段独立模型配置，且使用 `BUSINESS_PIPELINE_STAGES` 遍历业务阶段
- 支持配置优先级：JOB > BOOK > GLOBAL > SYSTEM_DEFAULT，并在模型失效时自动降级
- 支持调用失败后的重试与 FALLBACK，`FALLBACK` 仅配置槽位不作为业务阶段
- Provider 统一升级为 `{ system, user }` 输入，返回 `usage`
- 新增并落地 `model_strategy_configs` 与 `analysis_phase_logs`
- 重构 `ChapterAnalysisService`、`ValidationAgentService`、`runAnalysisJob` 调用链
- 改造管理端策略 API、任务成本汇总 API 与前端策略配置界面
- 补齐 ModelStrategyResolver、AiCallExecutor、Provider、API、去重聚合与 repairJson 等测试

## Acceptance Criteria
- [ ] Prisma schema 与 migration 落地并可执行
- [ ] 模型解析、重试、fallback、usage、phase log、成本聚合链路打通
- [ ] 管理端支持 global/book/job 策略读写与推荐配置回填
- [ ] 前端模型策略 UI 与任务详情成本信息可用
- [ ] 关键单元测试与必要集成测试通过
- [ ] typecheck/lint/test 可验证，阻塞项有明确说明

## Technical Notes
- 文档 Phase A-J 与 TASK-001~TASK-037 为主映射，允许按现有代码结构合并实现但需明确映射
- 严格遵守红线：GLOBAL upsert 使用 findFirst + update/create；禁止 Object.values(PipelineStage) 直接遍历业务阶段；`callFn` 返回必须包含 usage
- 兼容现有数据与运行链路，冲突时优先遵循文档约束
