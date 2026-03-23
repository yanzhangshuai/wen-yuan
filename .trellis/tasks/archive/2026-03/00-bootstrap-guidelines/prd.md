# 引导任务：补全项目开发规范

## 目的

欢迎使用 Trellis！这是你的第一个任务。

AI agents 会通过 `.trellis/spec/` 理解你的项目编码约定。
**如果模板是空的，AI 往往会写出不符合你项目风格的通用代码。**

这次补全是一次性投入，但会持续提升后续每次 AI 协作质量。

---

## 你的任务

基于**现有代码库**补全规范文件。

### 前端规范

| 文件 | 需要记录的内容 |
|------|------------------|
| `.trellis/spec/frontend/directory-structure.md` | 组件/页面/hook 组织方式 |
| `.trellis/spec/frontend/component-guidelines.md` | 组件模式、props 约定 |
| `.trellis/spec/frontend/hook-guidelines.md` | 自定义 hook 命名与模式 |
| `.trellis/spec/frontend/state-management.md` | 状态库、状态边界、放置位置 |
| `.trellis/spec/frontend/type-safety.md` | TypeScript 约定与类型组织 |
| `.trellis/spec/frontend/quality-guidelines.md` | lint、测试、可访问性 |

### 思考指南（可选）

`.trellis/spec/guides/` 目录已提供一套通用思考指南。
如有必要，可根据项目情况进行定制。

---

## 如何补全规范

### 步骤 0：先导入现有规范（推荐）

很多项目已经有编码约定文档，**先检查这些文件**，再决定是否从零编写：

| 文件 / 目录 | 工具 |
|------|------|
| `CLAUDE.md` / `CLAUDE.local.md` | Claude Code |
| `AGENTS.md` | Claude Code |
| `.cursorrules` | Cursor |
| `.cursor/rules/*.mdc` | Cursor（规则目录） |
| `.windsurfrules` | Windsurf |
| `.clinerules` | Cline |
| `.roomodes` | Roo Code |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.vscode/settings.json` → `github.copilot.chat.codeGeneration.instructions` | VS Code Copilot |
| `CONVENTIONS.md` / `.aider.conf.yml` | aider |
| `CONTRIBUTING.md` | 通用项目约定 |
| `.editorconfig` | 编辑器格式规则 |

若上述文件存在，优先读取并提取相关规则填入对应 `.trellis/spec/` 文档，可显著减少重复整理成本。

### 步骤 1：分析代码库

可让 AI 帮你从真实代码提炼模式：

- “读取所有现有配置文件（CLAUDE.md、.cursorrules 等），提取编码约定到 .trellis/spec/”
- “分析我的代码库，并记录观察到的模式”
- “查找错误处理 / 组件 / API 模式并整理成规范”

### 步骤 2：记录现实，而非理想

写当前代码库**真实在做的事**，不是理想状态。
AI 需要匹配现有模式，而不是引入新的偏差。

- **看真实代码**：每类模式至少找 2-3 个实例
- **附带文件路径**：用真实路径作为示例
- **列出反模式**：明确团队避免的做法

---

## 完成清单

- [ ] 已补全对应项目类型的规范
- [ ] 每份规范至少有 2-3 个真实代码示例
- [ ] 已记录反模式

完成后执行：

```bash
python3 ./.trellis/scripts/task.py finish
python3 ./.trellis/scripts/task.py archive 00-bootstrap-guidelines
```

---

## 为什么重要

完成后你将获得：

1. AI 产出更贴合项目风格的代码
2. `/trellis:before-*-dev` 能注入真实上下文
3. `/trellis:check-*` 能基于真实标准做校验
4. 新成员（人类或 AI）能更快上手
