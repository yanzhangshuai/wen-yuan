# Eval Gate 运行手册（v5 端到端 F1 门禁）

> 目的：v5 管线 + goldset 评测门禁（entityF1≥0.74 / relationF1≥0.68）的一键运行流程。
> 前置：管线代码已就绪（runAnalysisJob Pass0-5 编排）；本手册完成"环境就绪后跑通门禁"的最后一步。

## 背景

v5 架构的提取链路（runAnalysisJob）与评测链路（goldset + eval gate）均已实现，但 `scripts/eval/results/` 需要**真实管线运行的提取结果**才能算 F1。本手册从零配置环境并跑通端到端。

## 前置条件

- 已启动开发环境（PostgreSQL + 可选 Neo4j + Next.js dev server）
- 管理员账号可用

## 步骤

### 1. 配置 AI 模型

按 `docs/model-config-bootstrap.md` 在 `/admin/model` 添加首个模型（如 DeepSeek），连接测试通过后启用并设为默认。

验证：
```bash
# 应有 1 行启用模型
psql "postgresql://plotweaver:plotweaver@127.0.0.1:5432/wen_yuan" -c "SELECT name, is_default, is_enabled FROM ai_models;"
```

### 2. 导入评测书

goldset 覆盖两本书（`scripts/goldset/儒林外史` + `scripts/goldset/歧路灯`），需导入到系统：

1. 在 `/admin/books` 上传 `docs/books/儒林外史.txt`（书名须为"儒林外史"，eval 按书名匹配）
2. 冷门书对照：上传《歧路灯》原文（书名"歧路灯"）
3. 确认章节拆分完成（每本书章节数正常）

> 书名必须与 `scripts/goldset/` 目录名一致（eval 的 loadExtraction 按 `results/<书名>/<文件>` 读）。

### 3. 运行分析管线

对每本书点击"开始分析"（`POST /api/books/:id/analyze`），等待任务 SUCCEEDED：

```bash
# 任务列表确认状态
psql ... -c "SELECT id, book_id, status, scope FROM analysis_jobs ORDER BY created_at DESC LIMIT 5;"
```

关键点：
- 管线启动时 `selectSkillsForJob` 做 AI 动态 skill 选择（需默认模型可用）
- Pass0 身份解析 + Pass1 分片提取会写 facts/mentions/aliases
- 失败时查 `error_log` 排查

### 4. 导出提取结果

管线落库 facts 后，导出为 eval-gate 输入：

```bash
npx ts-node scripts/eval/export-extraction.ts 儒林外史 歧路灯
```

产出 `scripts/eval/results/儒林外史/ch01.json` 等（与 goldset 同名对齐）。

### 5. 跑 eval gate

```bash
node scripts/eval/run-eval.ts
```

预期输出：
```
📚 goldset: 6 章（2 本书）
── 聚合（跨章微平均）──────────────────────────────
  entityF1: xx.x%  relationF1: xx.x%  bioFactF1: xx.x%
```

**门禁**：entityF1≥0.74 且 relationF1≥0.68。

### 6. 不达标时

按架构 §8 棘轮法调整（不无脑加确定性约束）：
- 检查 goldset 标注质量（是否标注过严/漏标）
- 检查提取失败模式（漏实体/多实体/漏关系），定位到 Pass 缺陷
- 针对性修提取/身份逻辑，重跑第 3-5 步

## 故障排查

| 症状 | 处理 |
|---|---|
| `❌ 未找到 goldset 章节` | `scripts/goldset/<书>/*.json` 缺失，先标注 |
| `⚠️ 缺提取结果: 儒林外史/ch01.json` | 该书没跑完管线 / 导出器没跑 |
| `⚠️ 数据库无此书` | 书未导入，或书名与 goldset 目录名不一致 |
| 任务 FAILED | 查 `analysis_jobs.error_log` + `analysis_phase_logs` |
| 无 AI 调用 | 确认默认模型启用（`/admin/model`） |

## 相关

- 架构：`docs/architecture/13-agent-architecture-v5.md` §8（评测与质量门禁）
- 模型配置：`docs/model-config-bootstrap.md`
- 管线编排：`src/server/modules/analysis/jobs/runAnalysisJob.ts`
- 导出器：`scripts/eval/export-extraction.ts`
- 评测：`scripts/eval/run-eval.ts`
