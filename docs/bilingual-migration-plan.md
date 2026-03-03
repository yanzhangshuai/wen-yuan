# 全仓文档双语迁移计划

## 目标

- 统一命名：英文主文档 `*.md` + 中文镜像 `*.zh.md`
- 统一维护：所有双语文档带“同步说明块”
- 统一节奏：按优先级分批迁移，避免一次性改动过大

## 已完成（当前基线）

- 已建立双语主干：
  - `AGENTS.md` / `AGENTS.zh.md`
  - `GEMINI.md` / `GEMINI.zh.md`
  - `.trellis/workflow.md` / `.trellis/workflow.zh.md`
  - `.trellis/spec/guides/index.md` / `.trellis/spec/guides/index.zh.md`
  - `.trellis/spec/guides/spec-kit-workflow.md` / `.trellis/spec/guides/spec-kit-workflow.zh.md`
- 已建立模板：`.trellis/spec/guides/bilingual-doc-sync-template.md`
- 已生成跟踪表：`docs/bilingual-migration-tracker.md`

## 分批迁移策略

### 批次 1（P1，规范层）

范围：
- `.trellis/spec/frontend/*.md`
- `.trellis/spec/backend/*.md`
- `.trellis/spec/guides/code-reuse-thinking-guide.md`
- `.trellis/spec/guides/cross-layer-thinking-guide.md`

动作：
1. 保持英文主文档为 `*.md`
2. 为每个主文档新增 `*.zh.md`
3. 顶部加入同步说明块

验收：
- 每个 `*.md` 均存在对应 `*.zh.md`
- 命令、路径、门禁规则无差异

### 批次 2（P2，技能与模板）

范围：
- `.agents/skills/*/SKILL.md`
- `.specify/templates/*.md`
- `.specify/templates/commands/*.md`
- `.specify/memory/constitution.md`

动作：
- 同批次 1，按目录逐组迁移，优先常用技能

验收：
- 高频技能先覆盖（start / finish-work / record-session / speckit-*）

### 批次 3（P3，业务文档与任务文档）

范围：
- `docs/*.md`
- `specs/**/*.md`
- `.trellis/tasks/**/spec.md|plan.md|tasks.md|check.md|prd.md|confirm.md`
- `.specify/features/**/*.md`

动作：
- 对仍有维护价值的文档补双语；过期文档先标注再处理

验收：
- 活跃文档双语齐全，过期文档有状态标记

### 批次 4（P4，可选）

范围：
- `.trellis/workspace/**/*.md`（会话历史）

建议：
- 默认不做双语迁移，仅保留原文，避免维护成本过高

## 统一规则（强制）

1. 英文主文档（Agent 执行）：`<name>.md`
2. 中文镜像文档（人类阅读）：`<name>.zh.md`
3. 每次改动先改英文主文档，再同步中文镜像
4. 若中英冲突，以英文主文档为准

## 日常维护流程（建议）

1. 修改 `*.md`
2. 同步 `*.zh.md`
3. 更新两份文档顶部“最后同步日期/同步人”
4. 在 `docs/bilingual-migration-tracker.md` 标记状态

## 风险与控制

- 风险：中英文漂移
  - 控制：同步说明块 + 跟踪表 + 批次验收
- 风险：一次性迁移太大
  - 控制：按批次推进，每批可单独回滚

## 执行入口

- 迁移看板：`docs/bilingual-migration-tracker.md`
- 规则模板：`.trellis/spec/guides/bilingual-doc-sync-template.md`

