# 开发工作流

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/workflow.md
> 镜像文档：.trellis/workflow.zh.md
> 最后同步：2026-03-03
> 同步人：codex

> 目标：让每次开发都有一致的上下文、步骤、质量检查和会话记录。

---

## 目录

1. [快速开始（先做这三件事）](#快速开始先做这三件事)
2. [整体流程总览](#整体流程总览)
3. [会话开始流程](#会话开始流程)
4. [开发与提交流程](#开发与提交流程)
5. [会话结束流程](#会话结束流程)
6. [文件与目录说明](#文件与目录说明)
7. [最佳实践](#最佳实践)
8. [Spec-Kit 快速卡片](#spec-kit-快速卡片)

---

## 快速开始（先做这三件事）

### 0）初始化开发者身份（首次）

```bash
python3 ./.trellis/scripts/get_developer.py
python3 ./.trellis/scripts/init_developer.py <your-name>
```

这会创建：
- `.trellis/.developer`：当前身份（gitignore）
- `.trellis/workspace/<your-name>/`：个人工作区

命名建议：
- 人类开发者：`your-name`
- Codex：`codex-agent`
- Gemini：`gemini-agent`
- Claude Code：`claude-agent`

### 1）读取当前上下文

```bash
python3 ./.trellis/scripts/get_context.py
python3 ./.trellis/scripts/task.py list
git status
```

### 2）先读规范，再写代码

```bash
# 前端任务
cat .trellis/spec/frontend/index.md

# 后端任务
cat .trellis/spec/backend/index.md

# 跨层任务
cat .trellis/spec/guides/cross-layer-thinking-guide.md
```

---

## 整体流程总览

核心原则：

1. **先读后写**：先搞清上下文和规范。
2. **按规范执行**：实现时严格对齐 `.trellis/spec/`。
3. **任务化推进**：一次聚焦一个任务，减少上下文污染。
4. **及时记录**：完成后立即记录会话与决策。
5. **可追溯交付**：文档、任务、验证结果可回放。

---

## 会话开始流程

### Step 1：拿到上下文

```bash
python3 ./.trellis/scripts/get_context.py
# JSON 形式
python3 ./.trellis/scripts/get_context.py --json
```

### Step 2：选择并激活任务

```bash
python3 ./.trellis/scripts/task.py list
python3 ./.trellis/scripts/task.py create "<title>" --slug <task-name>
python3 ./.trellis/scripts/task.py start <task-dir>
```

### Step 3：确认本次工作范围

- 明确是 `flow-feature` / `flow-lite` / `flow-bug`
- 明确分支策略：新分支 or 当前分支
- 明确验收标准：success / failure / boundary

---

## 开发与提交流程

### 标准开发循环

1. 依据规范与任务实现代码
2. 本地执行 lint / typecheck / tests
3. 回填任务状态与检查结论
4. 运行 `$finish-work` 做收尾检查

### 建议命令

```bash
# 任务上下文检查
python3 ./.trellis/scripts/task.py list-context <task-dir>

# 任务文档门禁（flow-feature）
python3 ./.trellis/scripts/task.py flow-guard --verify
```

---

## 会话结束流程

### 记录会话

```bash
python3 ./.trellis/scripts/add_session.py \
  --title "本次标题" \
  --commit "abc1234" \
  --summary "本次变更摘要"
```

### 结束前清单

- [ ] 代码已验证（lint/typecheck/tests）
- [ ] 关键决策已落文档
- [ ] `flow-feature` 已通过 `flow-guard --verify`
- [ ] 已执行 `$finish-work`
- [ ] 已询问并按确认执行 `$record-session`

---

## 文件与目录说明

### `.trellis/workspace/`

用途：记录每次会话产出（日志、摘要、历史）。

### `.trellis/tasks/`

用途：按任务目录管理 `task.json` 与相关文档。

常用命令：

```bash
python3 ./.trellis/scripts/task.py create "<title>"
python3 ./.trellis/scripts/task.py list
python3 ./.trellis/scripts/task.py archive <task-name>
```

### `.trellis/spec/`

用途：存放前端/后端/跨层规范与思考指南。

---

## 最佳实践

### 应该做（DO）

1. 会话开始先跑 `get_context.py`。
2. 编码前先读对应规范文档。
3. 复杂改动按 Spec-Kit 完整链路执行。
4. 遇到中途变更先改文档再继续编码。
5. 每次交付都留有可追溯记录。

### 不要做（DON'T）

1. 不要跳过规范阅读。
2. 不要多任务并行混改无关需求。
3. 不要在未验证情况下提交结果。
4. 不要忽略会话记录与任务文档更新。

---

## Spec-Kit 快速卡片

建议使用对话触发词：`ff-fast+n`、`ff-fast=c`、`ff-full+n`、`ff-full=c`、`ff-fast`、`ff-full`、`ff+n`、`ff=c`、`ff`、`fl+n`、`fl`、`fb+n`、`fb`。

- `ff-fast: <需求>`：强制走速度策略（必要检查）
- `ff-full: <需求>`：强制走严格策略（证明完整 + 全量检查）
- `ff-fast+n: <需求>`：速度策略 + 新分支
- `ff-fast=c: <需求>`：速度策略 + 当前分支
- `ff-full+n: <需求>`：严格策略 + 新分支
- `ff-full=c: <需求>`：严格策略 + 当前分支

如果没有后缀（`ff` / `fl` / `fb`），先询问“新建分支还是当前分支”。

### flow-feature 双策略流程（默认：速度策略）

#### 速度策略（Speed Strategy，必要检查）

```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy fast "<需求>" [task-dir] [--stack "<技术栈>"] [--req-doc <需求文档>] [--stack-doc <技术栈文档>]
python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8
# 等待用户输入：执行 / 修改：...
/speckit.implement
# 必要检查：success + failure + boundary
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
# 先询问是否执行 $record-session，用户确认后再执行
```

#### 严格策略（Strict Strategy，证明完整）

```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy strict "<需求>" [task-dir] [--stack "<技术栈>"] [--req-doc <需求文档>] [--stack-doc <技术栈文档>]
/speckit.specify
/speckit.clarify
/speckit.plan
/speckit.tasks
python3 ./.trellis/scripts/task.py flow-confirm
/speckit.implement
# 完整检查（含 check-phase）
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
```

兼容写法（非默认）：`"<需求> || <技术栈>"` 一条输入也可用。

### 升级规则（速度策略自动回严格策略）

若出现任一情况，必须切回完整流程：

- 需求存在歧义，验收标准不清晰
- 跨层契约变化（API/Action/DB 签名、载荷、环境变量）
- 风险升高（高影响改动、回滚困难、未知依赖）

切回严格策略命令模板：

```text
/trellis:start
bash .trellis/scripts/flow_feature_upgrade_docs.sh [task-dir]
/speckit.specify
/speckit.clarify
/speckit.plan
/speckit.tasks
python3 ./.trellis/scripts/task.py flow-confirm
/speckit.implement
```

### flow-lite 最短卡片

```text
/trellis:start
/speckit.implement
# lint / typecheck（按需）
$finish-work
# 先询问是否执行 $record-session，用户确认后再执行
```

### flow-bug 最短卡片

```text
/trellis:start
/speckit.specify
/speckit.clarify
/speckit.tasks
python3 ./.trellis/scripts/task.py flow-confirm
/speckit.implement
/trellis:break-loop
$finish-work
# 先询问是否执行 $record-session，用户确认后再执行
```

### 强制门禁

- 实现前：`flow-feature` 必须先通过 `flow-confirm`。
- finish/archive 前：必须通过 `python3 ./.trellis/scripts/task.py flow-guard --verify`。
- 中途变更需求：先更新 `spec/clarify/plan/tasks`，再重新 `flow-confirm --approve`。
- 终端菜单脚本已废弃，统一使用对话确认（`执行` / `修改：...`）。
