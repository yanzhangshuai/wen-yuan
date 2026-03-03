# 双语文档命名与同步模板

## 1）命名规范

- 主文档：`<name>.md`（agent 执行事实源）
- 镜像文档：`<name>.zh.md`（中文阅读镜像）
- 可选快照：`<name>.en.md`（迁移/归档用途）

示例：

- `AGENTS.md` + `AGENTS.zh.md`
- `GEMINI.md` + `GEMINI.zh.md`

## 2）语言策略

- 主文档 `.md` 可由团队约定为英文或中文，但必须明确且稳定。
- 镜像文档必须与主文档语义一致。

## 3）同步流程

1. 先更新主文档。
2. 再同步到镜像文档。
3. 更新两份文档顶部的同步元信息。
4. 用 diff 快速检查关键章节是否遗漏。

## 4）最小元信息块

主文档（`.md`）建议包含：

- Role
- Canonical path
- Mirror path
- Last synced date
- Sync owner

镜像文档（`.zh.md`）建议包含：

- 角色
- 主文档路径
- 镜像文档路径
- 最后同步日期
- 同步人
