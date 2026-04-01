# 人物增强-性能优化批次

## Goal
在不降低准确率前提下，提升解析吞吐并降低查询与 token 成本。

## Requirements
- 新建并集成 BookPersonaCache
- 活跃人物上下文精简（最近章节 + 当前名册，最多60）
- 按 provider 调整并发度（含默认回退）
- 可选：Phase 1 并行预处理

## Acceptance Criteria
- [ ] 功能测试通过且准确率无回归
- [ ] DB 查询次数降低（目标 50%-70%）
- [ ] Prompt token 消耗下降（目标 30%-50%）
- [ ] provider 并发配置生效
