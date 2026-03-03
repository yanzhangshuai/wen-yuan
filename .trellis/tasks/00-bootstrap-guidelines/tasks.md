# Task Breakdown - 中文流程文档

## T1 文档总览
- [x] 新增 `spec-kit-trellis-playbook-zh.md`
- [x] 描述 Spec-Kit 与 Trellis 分工

## T2 详细流程
- [x] 新增 `spec-kit-trellis-usage-zh.md`
- [x] 增加“命令说明（完整）”
- [x] 增加 3 个案例
- [x] 增加 3 个触发口令（flow-lite/flow-feature/flow-bug）

## T3 决策与可视化
- [x] 新增 `spec-kit-trellis-quick-decision-zh.md`
- [x] 在 usage 文档加入 Mermaid 泳道图

## T4 导航与校验
- [x] 更新 `.trellis/spec/guides/index.md`
- [x] 执行流程冒烟测试（文档/模板/脚本存在性）

## 验收检查
- [x] 成功路径：flow-feature 可触发并执行约定步骤
- [x] 失败路径：说明 shell 无法直接执行 `/speckit.*`，改为对话触发
- [x] 边界场景：小改动使用 flow-lite，复杂任务默认 flow-feature
