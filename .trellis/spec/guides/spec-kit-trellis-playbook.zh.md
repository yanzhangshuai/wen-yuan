# Spec-Kit + Trellis 协作手册（精简版）

> [同步说明]
> 角色：中文镜像（供阅读）
> 主文档：.trellis/spec/guides/spec-kit-trellis-playbook.md
> 镜像文档：.trellis/spec/guides/spec-kit-trellis-playbook.zh.md
> 最后同步：2026-03-03
> 同步人：codex

> 目标：速度优先，质量可控。  
> 原则：默认速度策略；风险触发时自动升级严格策略。

## 1）双策略模型

### 速度策略（默认）
适用：需求清晰、风险低、可快速回滚。

命令模板：

```text
ff-fast+n: <需求>   # 速度策略 + 新分支
ff-fast=c: <需求>   # 速度策略 + 当前分支
```

执行步骤：

```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy fast "<需求>" [task-dir] [--stack "<技术栈>"] [--req-doc <需求文档>] [--stack-doc <技术栈文档>]
python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8
# 等待：执行 / 修改 ...
/speckit.implement
# 必要检查：success + failure + boundary
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
```

### 严格策略（证明完整）
适用：跨层契约变化、风险高、需求不清晰。

命令模板：

```text
ff-full+n: <需求>   # 严格策略 + 新分支
ff-full=c: <需求>   # 严格策略 + 当前分支
```

执行步骤：

```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy strict "<需求>" [task-dir] [--stack "<技术栈>"] [--req-doc <需求文档>] [--stack-doc <技术栈文档>]
/speckit.specify
/speckit.clarify
/speckit.plan
/speckit.tasks
python3 ./.trellis/scripts/task.py flow-confirm
# 等待：执行 / 修改 ...
/speckit.implement
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
```

兼容写法（非默认）：`"<需求> || <技术栈>"` 一条输入也可用。

## 2）升级规则（速度策略 -> 严格策略）

命中任一条件必须升级：

- 需求或验收标准存在歧义
- API/Action/DB 的签名、payload、env 契约发生变化
- 交付风险升高（高影响、回滚困难、依赖不确定）

升级命令模板：

```text
bash .trellis/scripts/flow_feature_upgrade_docs.sh [task-dir]
/speckit.specify
/speckit.clarify
/speckit.plan
/speckit.tasks
python3 ./.trellis/scripts/task.py flow-confirm
/speckit.implement
```

## 3）不使用预定义触发词（手动模式）

你可以不用 `ff-fast` / `ff-full`，直接手动执行：

- 手动速度策略：`init --strategy fast -> flow-confirm --compact -> implement -> 必要检查 -> flow-guard --verify`
- 手动严格策略：`init --strategy strict -> specify/clarify/plan/tasks -> flow-confirm -> implement -> flow-guard --verify`

## 4）最小门禁

- 实施前必须 `flow-confirm`
- flow-feature 收尾前必须 `flow-guard --verify`
- 结束前必须显式询问是否执行 `$record-session`
