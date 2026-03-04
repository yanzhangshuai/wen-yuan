# Wen Yuan Gemini 规则（中文版）

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：GEMINI.md
> 镜像文档：GEMINI.zh.md
> 最后同步：2026-03-04
> 同步人：codex

## 必须流程（OpenSpec + Trellis）

- 每次会话先执行 `/trellis:start`。
- 中大型任务使用 OpenSpec 文档初始化 flow-feature：
  `bash .trellis/scripts/flow_feature_init_openspec.sh --strategy <fast|strict> "<需求>" [task-dir]`。
- 实现前执行确认门禁：
  `python3 ./.trellis/scripts/task.py flow-confirm`，并等待明确批准。
- finish/archive 前执行文档与验证门禁：
  `python3 ./.trellis/scripts/task.py flow-guard --verify`。
- 实现与检查完成后，询问是否执行 `$record-session`。

## 流程简写

- `ff+n` / `ff=c` / `ff`：flow-feature
- `ff-fast` / `ff-full`：速度策略与严格策略
- `fl+n` / `fl=c` / `fl`：flow-lite
- `fb+n` / `fb=c` / `fb`：flow-bug

## 核心约束

- 所有新功能变更必须写入 `openspec/changes/*`。
- API/Action 响应统一结构：`success/code/message/data|error/meta`。
- 复用 `src/types/api.ts` 与 `src/server/http/api-response.ts`。
- 多表写入必须使用 Prisma transaction。
- 保持严格 TypeScript 边界，避免 `any`。
- 禁止编辑 `src/generated/prisma/**` 下的生成文件。

## 验证基线

每次变更至少覆盖：
- 一条 success 路径
- 一条 failure 路径
- 一条 boundary/edge 路径
