# Wen Yuan Gemini 规则（中文版）

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：GEMINI.md
> 镜像文档：GEMINI.zh.md
> 最后同步：2026-03-03
> 同步人：codex

## 必须执行的命令

- 会话开始先执行 `/trellis:start`。
- 中大型任务按 Spec-Kit 顺序执行：
  `/speckit.specify`、`/speckit.clarify`、`/speckit.plan`、`/speckit.tasks`、`/speckit.implement`。
- 在 `/speckit.tasks` 之后、实现之前，必须执行任务确认关卡：
  `python3 ./.trellis/scripts/task.py flow-confirm`，并等待明确确认。
- 对 `flow-feature`，finish/archive 前需通过文档门禁：
  `python3 ./.trellis/scripts/task.py flow-guard`。
- 实现与检查完成后，必须明确询问是否执行 `$record-session`（不可跳过）。

## 流程简写

- `ff+n: <requirement>` = flow-feature（新分支）
- `ff=c: <requirement>` = flow-feature（当前分支）
- `ff: <requirement>` = 先询问分支选择
- `fl+n` / `fl=c` / `fl` = flow-lite（同样分支规则）
- `fb+n` / `fb=c` / `fb` = flow-bug（同样分支规则）
- 默认使用对话确认：
  - 任务拆解后，先询问用户确认（`执行`）或修改（`修改...`）
  - 仅在明确确认后继续执行。
- 任务修改输入支持：
  - 自然语言：`修改：...`
  - 结构化编辑：`+` 新增 / `-` 删除 / `~` 改写 / `>` 重排 / `!` 重新打开
  - 结构化编辑命令：
    `python3 ./.trellis/scripts/task.py flow-edit-tasks "<ops>"`
- 对 `ff+n`，如果自动短分支名非法/为空，先询问用户提供 kebab-case 短名后再建分支。
  可使用：
  `bash .trellis/scripts/flow_feature_create.sh "<requirement>" [short-name]`

## 实现约束

- API/Action 响应结构必须统一：
  `success/code/message/data|error/meta`。
- 复用 `src/types/api.ts` 与 `src/server/http/api-response.ts`。
- 多表写入必须使用 Prisma transaction。
- 保持严格 TypeScript 边界；业务逻辑避免 `any`。
- 禁止编辑 `src/generated/prisma/**` 下的生成文件。

## 团队风格

- 后端/服务导出优先使用中文 JSDoc 模板：
  `功能 / 输入 / 输出 / 异常 / 副作用`。
- React 组件应优先可读控制流；尽量避免 JSX 三元表达式。
- 前后端命名保持简洁、可读且一致。

## 前端规则

- 优先使用 early return、布尔守卫、辅助渲染函数，替代三元渲染。
- 组件中禁止嵌套三元。
- 若必须使用三元，仅允许单层且保持简短。

## 命名规则

- 命名简短但清晰，避免模糊命名（`a`、`tmp`、`data2`）。
- UI、actions、API、service 层使用一致的领域术语。
- 避免影响可读性的过度缩写。

## 注释与可复现性规则

- 生成代码必须补充足够注释/JSDoc，说明意图、输入输出约束、错误处理与副作用。
- 非平凡逻辑应有充分上下文，便于他人复现行为并快速排障。
