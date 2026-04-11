# 开发工作流

> 参考 [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

---

## 目录

1. 快速开始（先做这些）
2. 工作流总览
3. 会话启动流程
4. 开发流程
5. 会话结束
6. 文件说明
7. 最佳实践

---

## 快速开始（先做这些）

### 步骤 0：初始化开发者身份（仅首次）

> **多开发者支持**：每位开发者/Agent 都需要先初始化身份

```bash
# 检查是否已初始化
python3 ./.trellis/scripts/get_developer.py

# 若未初始化，执行：
python3 ./.trellis/scripts/init_developer.py <your-name>
# 示例：python3 ./.trellis/scripts/init_developer.py cursor-agent
```

会创建：
- `.trellis/.developer`：你的身份文件（gitignore，不提交）
- `.trellis/workspace/<your-name>/`：你的个人工作区目录

**命名建议**：
- 人类开发者：使用你的名字，例如 `john-doe`
- Cursor AI：`cursor-agent` 或 `cursor-<task>`
- Claude Code：`claude-agent` 或 `claude-<task>`
- iFlow cli：`iflow-agent` 或 `iflow-<task>`

### 步骤 1：理解当前上下文

```bash
# 一条命令获取完整上下文
python3 ./.trellis/scripts/get_context.py

# 或手动逐项检查：
python3 ./.trellis/scripts/get_developer.py      # 当前身份
python3 ./.trellis/scripts/task.py list          # 活跃任务
git status && git log --oneline -10              # Git 状态
```

### 步骤 2：阅读项目规范 [必做]

**关键要求**：写任何代码前先读规范：

```bash
# 读取共享规范索引（任何代码改动都要看）
cat .trellis/spec/shared/index.md

# 读取前端规范索引（如适用）
cat .trellis/spec/frontend/index.md

# 读取后端规范索引（如适用）
cat .trellis/spec/backend/index.md
```

**为什么前后端都要看？**
- 理解项目整体架构
- 了解全仓统一编码标准
- 明确前后端交互方式
- 对齐整体质量要求

**为什么共享规范也要看？**
- 对齐全仓统一的代码风格、禁用模式与提交质量基线
- 在编码前先确认是否需要复用已有实现、保持最小修改范围

### 步骤 3：编码前阅读对应细则（必需）

按任务类型阅读**详细**规范：

**前端任务**：
```bash
cat .trellis/spec/frontend/hook-guidelines.md      # Hook 规范
cat .trellis/spec/frontend/component-guidelines.md # 组件规范
cat .trellis/spec/frontend/type-safety.md          # 类型规范
```

**后端任务**：
```bash
cat .trellis/spec/backend/database-guidelines.md   # 数据库规范
cat .trellis/spec/backend/type-safety.md           # 类型规范
cat .trellis/spec/backend/logging-guidelines.md    # 日志规范
```

**任何代码改动都必须阅读**：
```bash
cat .trellis/spec/guides/comment-guidelines.md     # 详细注释规范（含单元测试）
```

---

## 工作流总览

### 核心原则

1. **先读后写**：开始前先理解上下文
2. **遵循标准**：[!] **编码前必须阅读 `.trellis/spec/` 规范**
3. **增量开发**：一次只完成一个任务
4. **及时记录**：完成后立即更新跟踪文件
5. **文档上限**：[!] **单个 journal 文档最多 2000 行**

### 文件系统

```text
.trellis/
|-- .developer           # 开发者身份（gitignore）
|-- scripts/
|   |-- __init__.py          # Python 包初始化
|   |-- common/              # 共享工具（Python）
|   |   |-- __init__.py
|   |   |-- paths.py         # 路径工具
|   |   |-- developer.py     # 开发者管理
|   |   +-- git_context.py   # Git 上下文实现
|   |-- multi_agent/         # 多 Agent 流水线脚本
|   |   |-- __init__.py
|   |   |-- start.py         # 启动 worktree agent
|   |   |-- status.py        # 监控 agent 状态
|   |   |-- create_pr.py     # 创建 PR
|   |   +-- cleanup.py       # 清理 worktree
|   |-- init_developer.py    # 初始化开发者身份
|   |-- get_developer.py     # 获取当前开发者名
|   |-- task.py              # 任务管理
|   |-- get_context.py       # 获取会话上下文
|   +-- add_session.py       # 一键记录会话
|-- workspace/           # 开发者工作区
|   |-- index.md         # 工作区索引 + 会话模板
|   +-- {developer}/     # 每位开发者目录
|       |-- index.md     # 个人索引（含 @@@auto 标记）
|       +-- journal-N.md # 会话日志（按序号递增）
|-- tasks/               # 任务跟踪
|   +-- {MM}-{DD}-{name}/
|       +-- task.json
|-- spec/                # [!] 编码前必读
|   |-- frontend/        # 前端规范（如适用）
|   |   |-- index.md               # 入口索引
|   |   +-- *.md                   # 主题规范文档
|   |-- backend/         # 后端规范（如适用）
|   |   |-- index.md               # 入口索引
|   |   +-- *.md                   # 主题规范文档
|   |-- guides/          # 思考指南
|       |-- index.md                      # 指南索引
|       |-- cross-layer-thinking-guide.md # 实现前检查
|       +-- *.md                          # 其他指南
|   +-- meta/            # 规范编写/同步标准
|       |-- spec-quality-standard.md
|       +-- bilingual-doc-sync-template.md
+-- workflow.md          # 本文档
```

---

## 会话启动流程

### 步骤 1：获取会话上下文

使用统一上下文脚本：

```bash
# 一条命令获取全部上下文
python3 ./.trellis/scripts/get_context.py

# 或获取 JSON 格式
python3 ./.trellis/scripts/get_context.py --json
```

### 步骤 2：阅读开发规范 [!] 必做

**[!] 关键要求：写代码前必须先读规范**

按开发内容读取对应文档：

**任何代码改动都必须先读共享规范**：
```bash
cat .trellis/spec/shared/index.md
```

**前端开发**（如适用）：
```bash
# 先读索引，再按任务读细则
cat .trellis/spec/frontend/index.md
```

**后端开发**（如适用）：
```bash
# 先读索引，再按任务读细则
cat .trellis/spec/backend/index.md
```

**跨层功能**：
```bash
# 涉及多层联动时
cat .trellis/spec/guides/cross-layer-thinking-guide.md
```

**规范编写/同步**（编辑规范文档时）：
```bash
cat .trellis/spec/meta/spec-quality-standard.md
cat .trellis/spec/meta/bilingual-doc-sync-template.md
```

### 步骤 3：选择要开发的任务

使用任务管理脚本：

```bash
# 列出活跃任务
python3 ./.trellis/scripts/task.py list

# 新建任务（创建含 task.json 的目录）
python3 ./.trellis/scripts/task.py create "<title>" --slug <task-name>
```

---

## 开发流程

### 任务开发流

```text
1. 创建或选择任务
   --> python3 ./.trellis/scripts/task.py create "<title>" --slug <name> 或 list

2. 按规范写代码
   --> 阅读与你任务相关的 .trellis/spec/ 文档（至少包含 shared/，按需补充 frontend/、backend/、guides/）
   --> 若是跨层变更：阅读 .trellis/spec/guides/

3. 自测
   --> 运行项目 lint/test（见 spec 文档）
   --> 手动验证功能

4. 提交代码
   --> git add <files>
   --> git commit -m "type(scope): description"
       格式：feat/fix/docs/refactor/test/chore

5. 记录会话（单命令）
   --> python3 ./.trellis/scripts/add_session.py --title "Title" --commit "hash"
```

### 代码质量检查清单

**提交前必须通过**：
- [OK] Lint 检查通过（使用项目命令）
- [OK] 类型检查通过（如适用）
- [OK] 单元测试通过，且覆盖率达到成熟团队基线（Line >= 90%，Branch >= 90%，Function >= 90%，Statement >= 90%）
- [OK] 代码与单元测试注释符合注释规范
- [OK] 手动功能验证通过

**项目专用检查**：
- 前端见 `.trellis/spec/frontend/quality-guidelines.md`
- 后端见 `.trellis/spec/backend/quality-guidelines.md`

---

## 会话结束

### 一键记录会话

代码提交后执行：

```bash
python3 ./.trellis/scripts/add_session.py \
  --title "会话标题" \
  --commit "abc1234" \
  --summary "简要摘要"
```

该命令会自动：
1. 检测当前 journal 文件
2. 超过 2000 行时创建新文件
3. 追加会话内容
4. 更新 index.md（会话数、历史表）

### 结束前清单

使用 `/trellis:finish-work` 逐项检查：
1. [OK] 所有代码已提交，commit message 符合约定
2. [OK] 已通过 `add_session.py` 记录会话
3. [OK] 无 lint/test 错误，且覆盖率达到基线
4. [OK] 工作区干净（或明确记录 WIP）
5. [OK] 需要时已更新 spec 文档
6. [OK] 已按注释规范补齐代码与单元测试注释

---

## 文件说明

### 1. workspace/ - 开发者工作区

**用途**：记录每次 AI Agent 会话产出

**结构**（多开发者支持）：
```text
workspace/
|-- index.md              # 主索引（活跃开发者表）
+-- {developer}/          # 开发者目录
    |-- index.md          # 个人索引（含 @@@auto 标记）
    +-- journal-N.md      # 会话日志（1, 2, 3...）
```

**何时更新**：
- [OK] 每次会话结束
- [OK] 完成重要任务
- [OK] 修复重要缺陷

### 2. spec/ - 开发规范

**用途**：沉淀一致开发标准

**结构**（多文档格式）：
```text
spec/
|-- frontend/           # 前端文档（如适用）
|   |-- index.md        # 入口
|   +-- *.md            # 主题文档
|-- backend/            # 后端文档（如适用）
|   |-- index.md        # 入口
|   +-- *.md            # 主题文档
|-- guides/             # 思考指南
|   |-- index.md        # 入口
|   +-- *.md            # 各指南文档
+-- meta/               # 规范编写/同步标准
    |-- spec-quality-standard.md
    +-- bilingual-doc-sync-template.md
```

**何时更新**：
- [OK] 发现新模式
- [OK] 修 bug 发现规范缺口
- [OK] 建立新约定

### 3. tasks/ - 任务跟踪

每个任务目录包含一个 `task.json`：

```text
tasks/
|-- 01-21-my-task/
|   +-- task.json
+-- archive/
    +-- 2026-01/
        +-- 01-15-old-task/
            +-- task.json
```

**常用命令**：
```bash
python3 ./.trellis/scripts/task.py create "<title>" [--slug <name>]   # 创建任务目录
python3 ./.trellis/scripts/task.py archive <name>  # 归档到 archive/{year-month}/
python3 ./.trellis/scripts/task.py list            # 列出活跃任务
python3 ./.trellis/scripts/task.py list-archive    # 列出归档任务
```

---

## 最佳实践

### [OK] 建议执行

1. **会话开始前**：
   - 执行 `python3 ./.trellis/scripts/get_context.py` 获取完整上下文
   - [!] **必须阅读**相关 `.trellis/spec/` 文档

2. **开发过程中**：
   - [!] **严格遵循** `.trellis/spec/` 规范
   - 跨层功能使用 `/trellis:check-cross-layer`
   - 一次只开发一个任务
   - 高频执行 lint 和测试

3. **开发完成后**：
   - 使用 `/trellis:finish-work` 做收尾检查
   - 修复 bug 后使用 `/trellis:break-loop` 做深度复盘
   - 由人类在测试通过后执行提交
   - 使用 `add_session.py` 记录进展

### [X] 禁止事项

1. [!] **不要**跳过 `.trellis/spec/` 规范阅读
2. [!] **不要**让单个 journal 文件超过 2000 行
3. **不要**并行开发多个无关任务
4. **不要**提交带 lint/test 错误的代码
5. **不要**在获得新经验后忘记更新 spec 文档
6. [!] **不要**由 AI 执行 `git commit`

---

## 快速参考

### 开发前必读

| 任务类型 | 必读文档 |
|-----------|-------------------|
| 前端工作 | `frontend/index.md` → 相关细则 |
| 后端工作 | `backend/index.md` → 相关细则 |
| 跨层功能 | `guides/cross-layer-thinking-guide.md` |
| 编辑规范文档 | `meta/spec-quality-standard.md` |

### 提交约定

```bash
git commit -m "type(scope): description"
```

**Type**：feat, fix, docs, refactor, test, chore
**Scope**：模块名（例如 auth、api、ui）

### 常用命令

```bash
# 会话管理
python3 ./.trellis/scripts/get_context.py    # 获取完整上下文
python3 ./.trellis/scripts/add_session.py    # 记录会话

# 任务管理
python3 ./.trellis/scripts/task.py list      # 查看任务
python3 ./.trellis/scripts/task.py create "<title>" # 创建任务

# 斜杠命令
/trellis:finish-work          # 提交前检查
/trellis:break-loop           # 调试后复盘
/trellis:check-cross-layer    # 跨层验证
```

---

## 总结

遵循本工作流可确保：
- [OK] 多会话协作连续性
- [OK] 稳定一致的代码质量
- [OK] 可追踪的开发进度
- [OK] 在 spec 文档中持续沉淀知识
- [OK] 团队协作透明可审计

**核心理念**：先读后写、遵循标准、及时记录、沉淀经验
