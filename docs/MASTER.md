# 文渊 — 主任务文档 (Master Task Document)

> **版本**: 2026-04-13 | **状态**: 待实施 | **决策基线**: D1-D13 全部锁定

---

## 1. 关联文档索引

| 文档 | 用途 |
|------|------|
| `docs/待确认项汇总.md` | **决策基线** — D1-D13 全部锁定，所有实施必须遵守 |
| `docs/全局知识库服务化重构设计.md` | 知识库服务化完整设计（数据模型 + 接口设计） |
| `docs/Sequential-准确率提升整体优化方案.md` | Wave1/2/3 改进方案 + 预期效果 |
| `docs/角色解析准确率审计报告-儒林3.md` | 错误分析基线（6 类 337+ 垃圾 profile） |
| `docs/人物解析链路审计报告-v2.md` | 架构审计基线（Sequential vs TwoPass） |
| `.trellis/tasks/04-13-04-13-convergence-revision/prd.md` | **完整规则口径** — 第 5~8 节为核心规范与任务规格 |
| `.trellis/tasks/04-13-master-implementation-execution/prd.md` | **执行计划** — 分阶段 Trellis 任务编排（Codex 用） |
| `.trellis/tasks/04-13-acceptance-execution/prd.md` | **验收文档** — 可执行验收项（Codex 用） |

---

## 2. 架构改造摘要

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| 数据来源 | 硬编码 + DB 双轨 | DB 唯一数据源（D2/D11） |
| Book.genre | 存在，驱动解析配置 | 直接删除（D8） |
| 过滤层 | 仅 ~60 条泛称，2 类检查 | 泛称 + 关系词 + 历史人物 + 名字规则 6 类检查 |
| AliasMapping | 0 条记录（管线未写入） | 修复写入，驱动实体消歧 |
| 合并策略 | conf≥0.85 自动合并 | 仅 conf=1.0 自动合并，其余 PENDING（D3） |
| 缓存策略 | 按需查 DB | 任务启动一次加载，传入整个 pipeline（D12） |
| 评估 | 无自动化 | 金标准 + `pnpm eval:metrics` + `pnpm eval:gate` |

---

## 3. 分阶段执行计划

### P0: 基础层（必须最先完成，无可省略项）

| 编号 | 任务 | Trellis 任务 ID | 产物 | 完成标准 |
|------|------|----------------|------|----------|
| P0-1 | DB Schema — 新增 3 张知识库表 | `04-12-wave2-kb-schema-extend` | `prisma schema` + migration | `pnpm prisma:migrate` 成功，3 张新表存在 |
| P0-2 | Book.genre 完全移除 | `04-12-deprecate-classical-names`（前期） | schema 改动 + 代码替换 | `grep book.genre src/` 返回 0 条，编译通过 |
| P0-3 | 种子数据初始化脚本 | `04-12-wave1-filter-hardening`（数据部分） | `scripts/init-knowledge-phase7.ts` + 7 个 JSON | 各表数据量达标（见执行计划） |
| P0-4 | `loadFullRuntimeKnowledge()` 实现 | `04-12-wave2-resolver-kb-integration`（前期） | `load-book-knowledge.ts` | 全类型加载 + 缓存 + D9 正则校验 |
| P0-5 | 删除全部硬编码常量 | `04-12-deprecate-classical-names`（后期） | `lexicon.ts`/`classical-names.ts`/`GENRE_PRESETS` 清除 | 编译通过，无硬编码引用 |

**依赖关系**: P0-1 → P0-3 → P0-4 → P0-5；P0-2 可与 P0-1 并行。

### P1: 核心解析链路（P0 全部完成后开始）

| 编号 | 任务 | Trellis 任务 ID | 产物 | 完成标准 |
|------|------|----------------|------|----------|
| P1-1 | PersonaResolver 接入 runtimeKnowledge | `04-12-wave2-resolver-kb-integration` | `PersonaResolver.ts` 改造 | 6 个过滤检查点，≥20 测试 |
| P1-2 | AliasMapping 写入管线修复 | `04-12-wave2-alias-mapping-fix` | `AliasRegistryService.ts` | 重解析后 alias_mappings ≥ 50 条 |
| P1-3 | PostAnalysisMerger 实现 | `04-12-wave2-post-merge` | `PostAnalysisMerger.ts`（新建） | D3 严格执行，merge_suggestions ≥ 30 条 |
| P1-4 | Pipeline runtimeKnowledge 集成 | `04-12-wave2-resolver-kb-integration`（后期） | `SequentialPipeline.ts` + `TwoPassPipeline.ts` | Pipeline 零硬编码，强制刷新机制 |
| P1-5 | Wave1 过滤器激活 | `04-12-wave1-filter-hardening` | PersonaResolver 6 类过滤链 | 垃圾 profile 减少 ≥ 80% |
| P1-6 | 历史人物 CRUD + 批量导入 API | （新建，见执行计划 P1-6） | `admin/knowledge/historical-figures/` | 全部端点可用，含批量导入 |
| P1-7 | 关系词 + 名字规则 CRUD API | （新建，见执行计划 P1-7） | `admin/knowledge/relational-terms/` + `name-patterns/` | 含 D9 正则安全校验，test 端点 |
| P1-8 | 金标准数据集（50-80 条） | `04-12-wave3-eval-pipeline` | `data/eval/goldset-rulin.v1.jsonl` | ≥50 条，格式符合 schema |
| P1-9 | 评估管线脚本 | `04-12-wave3-eval-pipeline` | `compute-metrics.ts` + `check-gate.ts` | `pnpm eval:gate` 可执行 |

**依赖关系**: P1-1 和 P1-2 可并行；P1-3 依赖 P1-1+P1-2；P1-4 依赖 P1-1；P1-6/7/8 可与解析链路并行；P1-9 依赖 P1-8。

### P2: 质量提升（修复后开启，P1 全部完成 + eval:gate pass 为前置）

| 编号 | 任务 | Trellis 任务 ID | 产物 | 完成标准 |
|------|------|----------------|------|----------|
| P2-1 | 称谓动态解析开启 | `04-12-wave3-title-resolution` | `dynamicTitleResolutionEnabled = true` | eval:gate 通过，无退化 |
| P2-2 | LLM 灰区仲裁开启 | `04-12-wave3-title-resolution` | `llmTitleArbitrationEnabled = true` | 频率限制生效，eval:gate 通过 |

---

## 4. Trellis 任务索引

| Trellis 任务 ID | 对应阶段 | PRD 位置 | 状态 |
|----------------|---------|----------|------|
| `04-12-wave1-filter-hardening` | P0-3, P1-5 | `.trellis/tasks/04-12-wave1-filter-hardening/prd.md` | planning |
| `04-12-wave2-kb-schema-extend` | P0-1 | `.trellis/tasks/04-12-wave2-kb-schema-extend/prd.md` | planning |
| `04-12-wave2-alias-mapping-fix` | P1-2 | `.trellis/tasks/04-12-wave2-alias-mapping-fix/prd.md` | planning |
| `04-12-wave2-post-merge` | P1-3 | `.trellis/tasks/04-12-wave2-post-merge/prd.md` | planning |
| `04-12-wave2-resolver-kb-integration` | P0-4, P1-1, P1-4 | `.trellis/tasks/04-12-wave2-resolver-kb-integration/prd.md` | planning |
| `04-12-wave3-title-resolution` | P2-1, P2-2 | `.trellis/tasks/04-12-wave3-title-resolution/prd.md` | planning |
| `04-12-wave3-eval-pipeline` | P1-8, P1-9 | `.trellis/tasks/04-12-wave3-eval-pipeline/prd.md` | planning |
| `04-12-deprecate-classical-names` | P0-2, P0-5 | `.trellis/tasks/04-12-deprecate-classical-names/prd.md` | planning |

---

## 5. 整体完成标准（Definition of Done）

1. **编译**: `pnpm type-check` + `pnpm lint` 均通过，0 error
2. **测试**: `pnpm test` 全通过，覆盖率不低于改造前
3. **无硬编码**: 全局无 `GENRE_PRESETS`、`RULIN_NAMES`、`SANGUO_NAMES`、`classical-names.ts` 引用
4. **无 genre**: 全局无 `book.genre` 引用，`prisma schema` 中 Book 无 `genre` 字段
5. **DB 完整**: 3 张新表存在，种子数据量达标
6. **评估达标**: `pnpm eval:gate` 返回 exit 0（precision≥0.70, recall≥0.75, F1≥0.72）
7. **合并策略**: 只有 conf=1.0 自动合并，其余全部 PENDING（D3）
8. **人物规则**: 牛布衣与牛浦郎是两个独立 Persona，有 `IMPERSONATION` alias 记录（D1）

---

## 6. 关键决策速查（D1-D13）

| # | 决策 | 核心结论 | 详见 |
|---|------|----------|------|
| D1 | 牛浦归属 | 牛布衣与牛浦郎独立；冒充经历归属牛浦郎 | `docs/待确认项汇总.md` |
| D2 | 泛称存储 | 全部进 DB，硬编码全删，无 fallback | 同上 |
| D3 | 自动合并 | 仅 conf=1.0 自动合并，其余人工确认 | 同上 |
| D4 | 历史人物库 | 通用中国历史人物库（500+ 条），6 类 | 同上 |
| D7 | 开启时机 | 所有新能力统一"修复后开启" | 同上 |
| D8 | Book.genre | 直接删除，不做迁移 | 同上 |
| D9 | 正则安全 | 100ms 超时 + ≤200 字符 + 禁嵌套量词 | 同上 |
| D11 | 旧结构处理 | 直接删除（不留 fallback） | 同上 |
| D12 | 缓存策略 | 任务启动加载一次，不热更新 | 同上 |
| D13 | 历史人物提取 | 书内有经历→提取；纯提及→不提取 | 同上 |

---

## 7. 验收入口

实施完成后，交由 Codex 执行 `.trellis/tasks/04-13-acceptance-execution/prd.md` 中的验收检查。
