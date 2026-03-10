---
stage: mvp
---

# 规范分层激活机制

> 让项目模板的规范按需加载，新项目不被全量规范淹没。

---

## 核心概念

所有规范文件始终保留在模板中，但通过 **stage（阶段）** 控制哪些规范对 AI agent 可见。

| 阶段 | 激活数量 | 适用场景 |
|------|----------|----------|
| `mvp` | ~11 个 | 项目初期，专注核心开发 |
| `growth` | ~25 个 | 多人协作，代码量增长 |
| `mature` | 全部 35 个 | 上线运营，需要完整流程 |

阶段是**累进的**：`growth` 包含所有 `mvp` 的规范，`mature` 包含所有规范。

---

## 快速开始

### 查看当前阶段

```bash
python3 .trellis/scripts/get_stage.py
```

输出：
```
Current stage: mvp (11/35 specs active)
```

### 查看各阶段包含哪些规范

```bash
python3 .trellis/scripts/get_stage.py --list
```

输出：
```
Current stage: mvp

mvp (current):
  ✓ .trellis/spec/frontend/component-guidelines.md
  ✓ .trellis/spec/frontend/directory-structure.md
  ...

growth:  (unlock with: set_stage.py growth)
  ○ .trellis/spec/frontend/hook-guidelines.md
  ○ .trellis/spec/backend/security-guidelines.md
  ...

mature:  (unlock with: set_stage.py mature)
  ○ .trellis/spec/backend/api-versioning-guidelines.md
  ○ .trellis/spec/guides/release-readiness-checklist.md
  ...
```

### 升级阶段

```bash
python3 .trellis/scripts/set_stage.py growth
```

输出：
```
Stage updated: mvp → growth (25/35 specs active)
```

---

## 命令参考

### get_stage.py

```bash
python3 .trellis/scripts/get_stage.py           # 摘要
python3 .trellis/scripts/get_stage.py --list     # 按阶段分组列出所有规范
python3 .trellis/scripts/get_stage.py --json     # JSON 输出
```

### set_stage.py

```bash
python3 .trellis/scripts/set_stage.py mvp        # 设为 MVP 阶段
python3 .trellis/scripts/set_stage.py growth      # 设为 Growth 阶段
python3 .trellis/scripts/set_stage.py mature      # 设为 Mature 阶段（全部激活）
```

### list_specs.py

```bash
python3 .trellis/scripts/list_specs.py                    # 列出当前激活的规范
python3 .trellis/scripts/list_specs.py --type frontend     # 只看前端
python3 .trellis/scripts/list_specs.py --type backend      # 只看后端
python3 .trellis/scripts/list_specs.py --type guides       # 只看思考指南
python3 .trellis/scripts/list_specs.py --all               # 包含未激活的规范
```

---

## 阶段划分明细

### mvp（11 个）— 项目初期必备

**前端：**
- `index.md` — 前端规范入口
- `directory-structure.md` — 目录结构
- `component-guidelines.md` — 组件规范
- `react-guidelines.md` — React 规范
- `type-safety.md` — 类型安全

**后端：**
- `index.md` — 后端规范入口
- `api-response-standard.md` — API 响应契约
- `database-guidelines.md` — 数据库规范
- `type-safety.md` — 类型安全

**指南：**
- `index.md` — 指南入口
- `comment-guidelines.md` — 注释规范

### growth（+14 个）— 项目增长期

**前端：**
- `hook-guidelines.md` — 自定义 Hook
- `state-management.md` — 状态管理
- `zustand-store-template.md` — Zustand 模板
- `quality-guidelines.md` — 质量规范

**后端：**
- `comment-template.md` — 注释模板
- `logging-guidelines.md` — 日志规范
- `security-guidelines.md` — 安全规范
- `quality-guidelines.md` — 质量规范

**指南：**
- `cross-layer-thinking-guide.md` — 跨层思考
- `code-reuse-thinking-guide.md` — 代码复用
- `module-boundary-guidelines.md` — 模块边界
- `strategy-selection-guide.md` — 策略选择
- `verification-checklist.md` — 验证清单

**元规范：**
- `spec-quality-standard.md` — 规范质量标准

### mature（+10 个）— 上线运营期

**前端：**
- `performance-guidelines.md` — 性能规范

**后端：**
- `api-versioning-guidelines.md` — API 版本兼容
- `migration-guidelines.md` — 数据迁移

**指南：**
- `adr-lite-template.md` — 架构决策记录
- `contract-verification-checklist.md` — 契约验收
- `observability-verification.md` — 可观测性验收
- `release-readiness-checklist.md` — 上线检查
- `risk-preflight-guide.md` — 风险预演
- `verification-evidence-standard.md` — 验证证据

**元规范：**
- `bilingual-doc-sync-template.md` — 双语同步模板

---

## 工作原理

### 1. 配置文件

阶段存储在 `.trellis/config.json`：

```json
{
  "stage": "mvp"
}
```

### 2. 规范文件 frontmatter

每个 `.md` 规范文件头部有 stage 标记：

```markdown
---
stage: mvp
---

# 组件规范
...
```

### 3. 自动过滤

`get_context.py` 输出会自动按阶段过滤，只在 `ACTIVE SPECS` 中显示当前阶段激活的规范。AI agent 只需关注激活的规范文件。

---

## 何时升级阶段

| 信号 | 建议动作 |
|------|----------|
| 开始写自定义 Hook 或使用 Zustand | `set_stage.py growth` |
| 多人协作、代码量超过 50 个文件 | `set_stage.py growth` |
| 准备上线、需要 CI/CD 流程 | `set_stage.py mature` |
| 需要 API 版本管理或数据迁移 | `set_stage.py mature` |

---

## 给规范文件设置阶段

新增规范文件时，在头部加 frontmatter：

```markdown
---
stage: growth
---

# 你的新规范标题
...
```

没有 frontmatter 的文件默认归为 `mvp` 阶段。
