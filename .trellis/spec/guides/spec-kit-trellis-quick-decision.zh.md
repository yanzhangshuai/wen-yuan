# Spec-Kit + Trellis 一页速查图（决策树）

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/spec/guides/spec-kit-trellis-quick-decision.md
> 镜像文档：.trellis/spec/guides/spec-kit-trellis-quick-decision.zh.md
> 最后同步：2026-03-03
> 同步人：codex


> 用途：1 分钟判断本次需求该走哪条流程。

## 快速决策

```text
[开始]
  |
  v
是否是小改动（单点、低风险、<5分钟）？
  |-- 是 --> flow-lite
  |           /trellis:start
  |           /speckit.implement
  |           $finish-work
  |           询问是否执行 $record-session -> 用户确认后执行
  |
  |-- 否 --> 是否满足任一项？
              - 多文件或跨层改动
              - API/Action/DB 契约变化
              - 需求或验收标准不清晰
                |
                |-- 是 --> flow-feature（默认）
                |           /trellis:start
                |           先选策略：
                |           A) 速度策略（默认）
                |              fast_init -> flow-confirm --compact -> implement
                |              必要检查：success/failure/boundary -> flow-guard --verify -> finish
                |           B) 严格策略
                |              full_init -> specify/clarify/plan/tasks
                |              flow-confirm -> implement -> check-phase -> flow-guard --verify -> finish
                |           [升级规则] 速度策略若出现歧义/跨层契约变化/高风险 -> 切回严格策略
                |
                |-- 否 --> flow-bug（已知问题修复）
                            /trellis:start
                            /speckit.specify -> /clarify -> /tasks
                            （建议）task.py flow-confirm
                            /speckit.implement
                            /trellis:break-loop
                            $finish-work
                            询问是否执行 $record-session -> 用户确认后执行
```

## 触发词简写

- `ff-fast+n: <需求>`：速度策略 + 新分支
- `ff-fast=c: <需求>`：速度策略 + 当前分支
- `ff-full+n: <需求>`：严格策略 + 新分支
- `ff-full=c: <需求>`：严格策略 + 当前分支
- `ff-fast: <需求>`：强制速度策略（必要检查）
- `ff-full: <需求>`：强制严格策略（证明完整 + 全量检查）
- `ff+n: <需求>`：flow-feature + 新分支
- `ff=c: <需求>`：flow-feature + 当前分支
- `ff: <需求>`：先询问分支选择
- `fl+n` / `fl=c` / `fl`：flow-lite 同规则
- `fb+n` / `fb=c` / `fb`：flow-bug 同规则

> `+n` 默认可不传短名：助手优先用模型生成英文短名；若未传入，脚本回退 `feature-<hash>`，保证分支合法。

## 任务修改输入

- 自然语言：`修改：...`（推荐）
- 结构化：`+/-/~/>/!`
- 命令：`python3 ./.trellis/scripts/task.py flow-edit-tasks "<ops>"`

## 必过检查点

- 统一响应结构：`success/code/message/data|error/meta`
- 错误路径有稳定 `code`
- 至少覆盖 success / failure / boundary
- flow-feature 必有 `confirm.md` 且 `Confirmed: YES`
- 收尾必须先询问是否执行 `$record-session`

## 命令模板（双策略）

### 速度策略（默认）

```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy fast "<需求>" [task-dir] [--stack "<技术栈>"] [--req-doc <需求文档>] [--stack-doc <技术栈文档>]
python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8
# 等待：执行 / 修改：...
/speckit.implement
# 必要检查：success + failure + boundary
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
# 先询问是否执行 $record-session
$record-session
```

### 严格策略（证明完整）

```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy strict "<需求>" [task-dir] [--stack "<技术栈>"] [--req-doc <需求文档>] [--stack-doc <技术栈文档>]
/speckit.specify
/speckit.clarify
/speckit.plan
/speckit.tasks
python3 ./.trellis/scripts/task.py flow-confirm
/speckit.implement
# 完整检查（含 check-phase）
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
```

兼容写法（非默认）：`"<需求> || <技术栈>"` 一条输入也可用。

### 速度策略升级到严格策略

```text
bash .trellis/scripts/flow_feature_upgrade_docs.sh [task-dir]
/speckit.specify
/speckit.clarify
/speckit.plan
/speckit.tasks
python3 ./.trellis/scripts/task.py flow-confirm
/speckit.implement
```
