# OpenSpec + Trellis 协作手册

> [同步说明]
> 主文档：.trellis/spec/guides/openspec-trellis-playbook.md
> 镜像文档：.trellis/spec/guides/openspec-trellis-playbook.zh.md
> 最后同步：2026-03-04
> 同步人：codex

## 目标
OpenSpec 负责业务/功能规范，Trellis 负责技术/代码规范与执行流程。

## 速度策略
```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy fast "<需求>" [task-dir] [--stack "<技术栈>"] [--req-doc <需求文档>] [--stack-doc <技术栈文档>]
python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8
# 等待明确确认
implement
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
```

## 严格策略
```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy strict "<需求>" [task-dir] [--stack "<技术栈>"] [--req-doc <需求文档>] [--stack-doc <技术栈文档>]
# 在 openspec/changes/<change> 下补齐 proposal/design/tasks/spec-delta
python3 ./.trellis/scripts/task.py flow-confirm
# 等待明确确认
implement
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
```

## OpenSpec 必需文件
- `proposal.md`
- `design.md`
- `tasks.md`
- `spec-delta.md`

## 升级规则
当需求歧义、跨层契约变化、交付风险升高时：
```bash
bash .trellis/scripts/flow_feature_upgrade_docs.sh [task-dir]
```

## 工作区规则
- 业务/功能规范：`openspec/specs/`（domain, features, constraints）
- 功能变更：`openspec/changes/*`
- 技术/代码规范：`.trellis/spec/`（frontend, backend, guides）
