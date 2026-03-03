# Clarify: 数据库迁移与种子数据录入

## Clarification Summary

- 需求目标明确为：在当前项目中完成 Prisma 数据库迁移，并执行种子数据录入。
- 采用 `flow-feature` 路径处理，分支策略为新建分支。
- 不引入新的业务需求扩展（如新增接口/前端页面），仅聚焦迁移与 seed 可执行性。

## Scope Confirmation

- In scope:
  - 检查并补齐 Prisma migration 资产。
  - 修正/增强 seed 脚本以满足稳定录入。
  - 执行迁移与 seed，并记录验证结果。
- Out of scope:
  - 新增前端页面或交互。
  - 非迁移相关的架构重构。

## Risks & Decisions

- 风险：seed 涉及多实体写入，若中途失败可能残留脏数据。
- 决策：优先使用事务或确定性清理顺序，确保可重复执行。
- 风险：章节文本很长，插入失败时不易定位。
- 决策：加强日志与错误上下文，明确失败步骤。

## Constraints Carry-Over (required)

- 前端复用/可读性/性能：本需求不直接改前端；若需联动，保持上述约束。
- Props typing：本需求不新增组件；新增时必须 `<ComponentName>Props`。
- 命名一致性：Prisma schema、migration、seed 中实体命名一致。
- 详细注释：保留关键注释，尤其是边界处理与副作用说明。
