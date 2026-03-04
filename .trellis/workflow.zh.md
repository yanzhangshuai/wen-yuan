# 开发工作流

> [同步说明]
> 主文档：.trellis/workflow.md
> 镜像文档：.trellis/workflow.zh.md
> 最后同步：2026-03-04
> 同步人：codex

## 快速开始
1. `python3 ./.trellis/scripts/get_context.py`
2. 阅读规范索引：
   - `openspec/specs/engineering-standards/frontend/index.md`
   - `openspec/specs/engineering-standards/backend/index.md`
   - `.trellis/spec/guides/index.md`
3. 选择或创建任务：
   - `python3 ./.trellis/scripts/task.py list`
   - `python3 ./.trellis/scripts/task.py create "<title>" --slug <name>`

## 默认体系：OpenSpec + Trellis
- OpenSpec 负责规范资产。
- Trellis 负责执行流程和门禁。

### OpenSpec 文档约束
每个 flow-feature 任务必须有：
- `openspec/changes/<change>/proposal.md`
- `openspec/changes/<change>/design.md`
- `openspec/changes/<change>/tasks.md`
- `openspec/changes/<change>/spec-delta.md`

## Flow-Feature（速度策略）
```text
/trellis:start
bash .trellis/scripts/flow_feature_init_openspec.sh --strategy fast "<需求>" [task-dir] [--stack "<技术栈>"] [--req-doc <需求文档>] [--stack-doc <技术栈文档>]
python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8
# 等用户明确确认
implement
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
# 询问是否执行 $record-session
```

## Flow-Feature（严格策略）
```text
/trellis:start
bash .trellis/scripts/flow_feature_init_openspec.sh --strategy strict "<需求>" [task-dir] [--stack "<技术栈>"] [--req-doc <需求文档>] [--stack-doc <技术栈文档>]
# 补齐 proposal/design/tasks/spec-delta
python3 ./.trellis/scripts/task.py flow-confirm
# 等用户明确确认
implement
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
# 询问是否执行 $record-session
```

## 升级规则（强制）
出现以下任一情况，必须从速度策略切到严格策略：
- 需求歧义
- 跨层契约变化（API/Action/DB/env）
- 交付风险升高

命令：
```bash
bash .trellis/scripts/flow_feature_upgrade_docs_openspec.sh [task-dir]
```

## 门禁规则
- 实现前：`flow-confirm`
- finish/archive 前：`flow-guard --verify`
- 最少验证：success + failure + boundary

## 工作区规则
- 新任务必须写入 `openspec/changes/*`。
- 工程规范统一维护在 `.trellis/spec/engineering-standards/*`。
