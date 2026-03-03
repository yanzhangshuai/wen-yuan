# Technical Plan - 中文流程文档交付

## 实施策略
1. 建立主文档：整合流程、命令说明、案例、泳道图。
2. 建立辅助文档：决策树速查、规范总览。
3. 建立导航入口：更新 `guides/index.md`。
4. 形成触发口令约定：flow-lite / flow-feature / flow-bug。

## 结构设计
- `spec-kit-trellis-playbook-zh.md`：规范总览与角色分工。
- `spec-kit-trellis-usage-zh.md`：详细步骤、命令说明、案例、口令、Mermaid。
- `spec-kit-trellis-quick-decision-zh.md`：一页决策树。
- `index.md`：统一导航。

## 质量与验证
- 文档交叉引用可达。
- 命令名称与仓库现有命令模板一致。
- 场景覆盖：success/failure/boundary 思维要求可在案例中找到。

## 风险与处理
- 风险：文档重复导致维护成本上升。
- 处理：总览文档只放原则，详细命令集中在 usage 文档。
