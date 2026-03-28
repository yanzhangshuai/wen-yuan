# 后端代码验收执行任务（严格按 TDD）

## Goal
基于 [docs/v1/backend/TDD.md](/home/mwjz/code/wen-yuan/docs/v1/backend/TDD.md) 与 [docs/v1/backend/TDD-steps.md](/home/mwjz/code/wen-yuan/docs/v1/backend/TDD-steps.md) 创建并执行一套后端代码验收任务，确保后端交付满足文档定义的全部强制标准。

## Requirements
- 以 `TDD.md` 作为验收范围与通过标准的唯一权威基准。
- 以 `TDD-steps.md` 作为执行顺序与命令操作的唯一实操基准。
- 执行顺序必须遵循 `TDD-steps.md` 目录顺序（1 到 12），不得跳步。
- 所有“强制”项必须 100% 通过，包含：
  - TypeScript/Lint 全绿
  - 单测全通过
  - 覆盖率门槛达标（lines >= 80%, branches >= 70%, functions >= 80%, statements >= 80%）
  - 安全基线、API 契约、全链路场景全部通过
- 不允许将 `skip`、手工忽略或“部分通过”视作完成。
- 任一检查失败时，必须记录失败证据并回到对应步骤修复后重跑，直至通过。

## Acceptance Criteria
- [x] 已创建可执行验收清单，逐条映射 TDD/TDD-steps 章节。
- [x] 已锁定执行规则（不跳步、不降级标准、不省略强制项）。
- [x] 已定义每个 Phase 的入口命令、通过条件与失败回退动作。
- [x] 已定义最终 DoD 与证据记录要求。
- [x] 已将本任务设置为 backend 类型并激活为当前任务。

## Technical Notes
- 本任务产出仅针对后端验收执行，不扩展前端验收。
- 如 `TDD.md` 与 `TDD-steps.md` 出现冲突，按以下优先级处理：
  - 验收标准冲突：`TDD.md` 优先。
  - 执行命令或操作顺序冲突：`TDD-steps.md` 优先。
- 执行证据建议记录在任务目录下（命令、结果摘要、失败重试记录）。
