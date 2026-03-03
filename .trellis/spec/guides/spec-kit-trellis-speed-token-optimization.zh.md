# 速度与 Token 优化指南

> [同步说明]
> 角色：中文镜像（供阅读）
> 主文档：.trellis/spec/guides/spec-kit-trellis-speed-token-optimization.md
> 镜像文档：.trellis/spec/guides/spec-kit-trellis-speed-token-optimization.zh.md
> 最后同步：2026-03-03
> 同步人：codex

## 1）优先使用速度策略

- 默认速度策略：`ff-fast+n` / `ff-fast=c`
- 仅做必要检查：success / failure / boundary

## 2）减少输出体积

任务列表较大时，优先精简确认输出：

```bash
python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8
```

## 3）控制上下文预算

每轮建议：

- 最多 3 个文件
- 每个文件最多 120 行

辅助命令：

```bash
bash .trellis/scripts/context_budget_read.sh --max-files 3 --max-lines 120 <file1> <file2> <file3>
```

## 4）使用差量初始化/升级

- 快速初始化：

```bash
bash .trellis/scripts/flow_feature_init.sh --strategy fast "<需求>" [task-dir] [--stack "<技术栈>"] [--req-doc <需求文档>] [--stack-doc <技术栈文档>]
```

- 完整初始化（需要严格策略时）：

```bash
bash .trellis/scripts/flow_feature_init.sh --strategy strict "<需求>" [task-dir] [--stack "<技术栈>"] [--req-doc <需求文档>] [--stack-doc <技术栈文档>]
```

兼容写法（非默认）：`"<需求> || <技术栈>"`。

- 差量升级（仅补缺失章节）：

```bash
bash .trellis/scripts/flow_feature_upgrade_docs.sh [task-dir]
```

## 5）必须切严格策略的场景

出现任一情况必须切到严格策略：

- 需求歧义
- 跨层契约变化（API/Action/DB 签名、payload、env）
- 高风险改动

随后使用：`ff-full+n` / `ff-full=c`。
