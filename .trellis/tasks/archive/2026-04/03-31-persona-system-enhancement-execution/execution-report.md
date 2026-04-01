# 人物解析识别系统增强执行报告（基于 PRD v2.0）

## 文档核心内容总结

### 1) 项目目标
- 目标1：实现别名/称号/封号识别与真名回填，减少伪实体（见《一、需求理解》+《三》）。
- 目标2：新增自检 Agent，输出结构化问题与修正建议（见《四》）。
- 目标3：在“不降准确率”前提下提升吞吐与成本效率（见《五》）。

### 2) 核心功能点
- 解析流程从 5 阶段扩展到 6 阶段，新增 Phase 6 全书自检（见《二》）。
- 新增别名映射持久化：`alias_mappings`（见《3.1》）。
- 新增自检报告持久化：`validation_reports`（见《4.2》）。
- PersonaResolver 插入 Step 2.5：别名注册表查询（见《3.3》）。
- `runAnalysisJob` 增加每 5 章增量溯源 + 全书自检（见《4.6》《八 Step12》）。

### 3) 增强项/优化项
- 别名识别增强：Phase 1 Prompt 扩展 aliasType/contextHint/suggestedRealName（见《3.4》）。
- 规则防误并：置信度阈值 + 章节窗口 + 共现校验 + 人工兜底（见《3.5》）。
- 性能增强：BookPersonaCache、活跃人物上下文裁剪、Provider 并发度（见《5.1》《八 Step14-16》）。

### 4) 输入输出要求
- 输入：章节原文、Known Entities、历史 profile、关系/mention 数据（见《4.4》《八 Step10-12》）。
- 关键输出：
  - `ChapterRosterEntry[]`（增强字段）
  - `AliasMappingResult[]`
  - `ValidationIssue[]/ValidationSummary`
  - API 返回 alias mappings / validation reports（见《七》《八 Step13》）。

### 5) 业务规则
- 别名映射 `confidence < 0.7` 不自动归并（见《3.5》）。
- 高置信（≥0.9）允许自动确认/自动修正；中置信待审（见《3.5》《4.5》《八 Step10》）。
- 自检失败不阻塞主流程（见《4.5》《八 Step12》）。
- FULL_BOOK 完成后执行终极溯源与全书自检（见《4.6》《八 Step12》）。

### 6) 技术约束
- 不改变现有 API 外部契约（见《九 假设4》）。
- 别名映射按“书籍维度”隔离，不跨书共享（见《九 假设2》）。
- 依赖 Prisma schema 变更与 migration（见《八 Step1-2》）。

### 7) 性能要求
- DB 查询降低 50%-70%（缓存优化目标，见《5.1A》）。
- token 消耗下降 30%-50%（上下文裁剪目标，见《5.1C》）。
- Provider 并发度按模型动态调整（见《5.1B》《八 Step16》）。

### 8) 验收标准
- 以《十、验收标准》8 条为主验收；并以《八 Step1-17》每步验证项为子验收。

### 9) 风险与依赖
- 风险：自检幻觉、过度修正、规则误匹配、性能优化导致上下文缺失（见《4.5》《5.2》《5.3》）。
- 依赖：Prisma/DB 可用、AI Provider 稳定、mergePersonas 服务、API 鉴权方案明确。

---

## 任务拆解表

| 任务名称 | 任务背景 | 任务目标 | 执行内容 | 前置依赖 | 输入材料 | 输出结果 | 优先级 | 负责人建议 | 验收标准 |
|---|---|---|---|---|---|---|---|---|---|
| T1 基础设施 Schema 变更 | PRD 要求新增别名与自检存储 | 完成 Alias/Validation 数据模型落地 | 改 `schema.prisma`，补关系字段，`prisma validate` | 数据库连接、Prisma 环境 | PRD《3.1》《4.2》《八Step1》 | 可用 schema | P0 | 后端工程师 | validate 通过 |
| T2 Migration 与 Client 生成 | Schema 变更后需固化数据库 | 生成迁移并更新 client | `prisma migrate dev` + `prisma generate` | T1 完成 | PRD《八Step2》 | migration 文件 + 新 client | P0 | 后端工程师 | migrate/generate 成功 |
| T3 类型层扩展 | 服务层依赖新类型 | 新增 validation 类型、扩展 analysis 类型 | 新建 `src/types/validation.ts`，更新 `src/types/analysis.ts` | T1 完成 | PRD《3.1》《4.2》《八Step3》 | 可编译类型定义 | P0 | 后端工程师 | `tsc --noEmit` 通过 |
| T4 AliasRegistryService 实现 | 别名归一核心能力 | 提供查、注册、缓存、待审列表 | 新建 service + 单测 | T2/T3 完成 | PRD《3.2》《八Step4》 | AliasRegistryService + tests | P0 | 后端工程师 | 单测覆盖 5 类场景 |
| T5 PersonaResolver 增强 | 现有 resolver 缺别名注册路径 | 插入 Step2.5，支持 chapterNo | 改 resolver 签名与逻辑，增加测试 | T4 完成 | PRD《3.3》《八Step6》 | resolver 增强代码 | P0 | 后端工程师 | 旧测通过+新增用例通过 |
| T6 Prompt 与 Phase1 解析增强 | Phase1 需输出别名线索 | 扩展 Prompt + 解析兼容 | 改 `prompts.ts` 与 `analysis.ts` parser，补快照/解析测试 | T3 完成 | PRD《3.4》《八Step7-8》 | 新 Prompt 与解析能力 | P0 | AI/后端工程师 | snapshot+parser 测试通过 |
| T7 ChapterAnalysisService 集成 | 别名闭环需接入主流程 | 接入 alias 注册、resolve 传 chapterNo、溯源持久化 | 改 `ChapterAnalysisService.ts` + 集成测试 | T4/T5/T6 完成 | PRD《八Step9》 | 章节流程增强 | P0 | 后端工程师 | 现有+新增集成测试通过 |
| T8 ValidationAgentService 实现 | 新增全书质量校验能力 | 实现章节/全书校验与自动修正 | 新建 service + prompt parser + 单测 | T2/T3 完成 | PRD《4.3》《4.4》《八Step10-11》 | Validation 能力闭环 | P1 | 后端工程师 | 单测通过、过滤/校验生效 |
| T9 作业流程接入自检与增量溯源 | 调度层需触发 Phase6 | runAnalysisJob 增量溯源与全书自检 | 改 runner + mock 测试 | T7/T8 完成 | PRD《4.6》《八Step12》 | 调度集成代码 | P1 | 后端工程师 | 失败不阻塞主流程 |
| T10 API 路由交付 | 需要查询/审核入口 | 提供 alias/validation 查询与操作 API | 新增 4 组路由 + 测试 | T4/T8 完成 | PRD《八Step13》 | 可调用 API | P1 | 后端+接口工程师 | happy path 可测通过 |
| T11 性能优化批次 | 吞吐与成本目标 | cache + 活跃上下文 + provider 并发 | 改 service/runner，补测试 | T7 完成 | PRD《5》《八Step14-16》 | 性能优化实现 | P1 | 后端工程师 | 准确率不降、性能指标改进 |
| T12 集成测试与验收 | 需端到端验证 | 覆盖别名归一与自检修正链路 | 新增 integration tests，执行全量验证 | T1-T11 基本完成 | PRD《八Step17》《十》 | 验证证据与结果报告 | P0 | QA+后端工程师 | 通过《十》全部验收项 |

---

## 任务逐项执行记录

### T1 基础设施 Schema 变更
- 执行依据：PRD《3.1》《4.2》《八 Step1》
- 执行过程：已核对当前仓库 `prisma/schema.prisma`，确认新增模型与枚举尚未存在；明确变更落点。
- 执行结果：完成“可执行设计确认”，代码改动未开始。
- 是否满足要求：部分满足（设计就绪，开发未执行）。
- 遗留问题：等待人工确认歧义项 A1/A2/A3 后执行。

### T2 Migration 与 Client 生成
- 执行依据：PRD《八 Step2》
- 执行过程：检查脚本与命令可用性（`package.json` 包含 prisma 脚本）。
- 执行结果：命令路径确认完成，未实际执行 migration。
- 是否满足要求：未满足（未执行 DB 变更）。
- 遗留问题：需本地 DB 可用与 schema 改动完成后才能执行。

### T3 类型层扩展
- 执行依据：PRD《八 Step3》
- 执行过程：核对 `src/types/analysis.ts` 当前结构，确认需新增 alias 扩展与 `validation.ts` 新文件。
- 执行结果：变更点清单已确定，待开发执行。
- 是否满足要求：部分满足（范围确认完成）。
- 遗留问题：依赖 T1 契约定稿。

### T4 AliasRegistryService 实现
- 执行依据：PRD《3.2》《八 Step4》
- 执行过程：核对当前 services 目录，确认目标文件尚不存在，新增不会与既有文件冲突。
- 执行结果：实施路径与测试范围已定义。
- 是否满足要求：部分满足。
- 遗留问题：需先完成 T1/T3。

### T5 PersonaResolver 增强
- 执行依据：PRD《3.3》《八 Step6》
- 执行过程：核对 `PersonaResolver.ts` 当前流程，确认 Step2 后可插入 Step2.5，且存在 `titleOnlyNames` 机制可复用。
- 执行结果：改造可行性确认完成。
- 是否满足要求：部分满足。
- 遗留问题：依赖 AliasRegistryService 接口先定义。

### T6 Prompt 与 Phase1 解析增强
- 执行依据：PRD《3.4》《八 Step7-8》
- 执行过程：核对 `prompts.ts` 与 `parseChapterRosterResponse`，确认当前未支持 aliasType/contextHint/suggestedRealName/aliasConfidence。
- 执行结果：差异点已明确，向后兼容策略可执行。
- 是否满足要求：部分满足。
- 遗留问题：需明确 `AliasContextHint[]` 是否独立输出（见 A4）。

### T7 ChapterAnalysisService 集成
- 执行依据：PRD《八 Step9》
- 执行过程：核对 `ChapterAnalysisService.ts`，确认有 Phase1 roster、persistResult 与 resolvePersonaTitles 三个插入点。
- 执行结果：集成点已定位。
- 是否满足要求：部分满足。
- 遗留问题：依赖 T4/T5/T6 完成。

### T8 ValidationAgentService 实现
- 执行依据：PRD《4.3》《4.4》《八 Step10-11》
- 执行过程：核对当前无 Validation service 与相关类型，需新增服务文件与 prompt/parser。
- 执行结果：可新建实现，不与现有结构冲突。
- 是否满足要求：部分满足。
- 遗留问题：`自检不修改数据` 与 `applyAutoFixes` 责任边界待决（A1）。

### T9 runAnalysisJob 集成自检与增量溯源
- 执行依据：PRD《4.6》《八 Step12》
- 执行过程：核对 `runAnalysisJob.ts`，当前仅 FULL_BOOK 后执行 orphan + title resolve；可扩展增量溯源与自检分支。
- 执行结果：变更位置已确认。
- 是否满足要求：部分满足。
- 遗留问题：是否启用章节级 validation 的开关字段未定义（A3）。

### T10 API 路由交付
- 执行依据：PRD《八 Step13》
- 执行过程：核对 `src/app/api/books/[id]` 现有路由结构，确认可按项目模式新增 4 组路由与测试。
- 执行结果：路径和模式对齐完成。
- 是否满足要求：部分满足。
- 遗留问题：鉴权是否强制 withAuth 需产品/安全确认（A5）。

### T11 性能优化批次
- 执行依据：PRD《5》《八 Step14-16》
- 执行过程：核对现有固定并发 `AI_CONCURRENCY=3`、无 BookPersonaCache、无活跃人物过滤。
- 执行结果：优化目标与改造点已确认。
- 是否满足要求：部分满足。
- 遗留问题：缺少基线性能数据与测量口径（A6）。

### T12 集成测试与验收
- 执行依据：PRD《八 Step17》《十》
- 执行过程：核对测试目录，analysis services 当前以 `*.test.ts` 并列方式组织，无 `__tests__/integration` 目录。
- 执行结果：测试组织策略可执行，需决定是否沿用现有风格或引入新目录。
- 是否满足要求：部分满足。
- 遗留问题：测试目录约定待统一（A7）。

### 已实际落地的任务管理动作（本次会话已执行）
- 创建主任务：`03-31-persona-system-enhancement-execution`
- 创建并关联子任务：
  - `03-31-persona-enh-base-infra`
  - `03-31-persona-enh-alias-resolver`
  - `03-31-persona-enh-validation-agent`
  - `03-31-persona-enh-performance`
- 主任务已初始化 context 并设为 current task。

---

## 风险与问题清单

### A1（需人工决策，已暂停自动推进）
- 问题：PRD《4.1》定义“自检 Agent 不修改数据”，但《4.3》《八 Step10/12》又要求 `applyAutoFixes` 自动修正。
- 影响：服务边界不清，容易导致职责漂移与审计风险。
- 建议决策：
  - 方案A：ValidationAgent 只产出建议；AutoFix 独立为 `ValidationFixService`。
  - 方案B：保留 `applyAutoFixes` 在 ValidationAgent，但明确“非 Agent 推理阶段”的执行边界。

### A2（需人工决策，已暂停自动推进）
- 问题：PRD《3.5》同时出现“所有自动映射初始 PENDING”与“≥0.9 自动确认”。
- 影响：状态机冲突，影响 API 与审核流实现。
- 建议决策：定义唯一状态流：`PENDING -> CONFIRMED/REJECTED`，并明确自动确认是否绕过 PENDING。

### A3（缺少执行前提，已暂停相关实现）
- 问题：PRD《4.5》提到 `analysis_jobs.enableValidation` 开关，但 Step1 schema 未包含该字段。
- 影响：章节级自检可选开关无法实现。
- 建议决策：在 Step1 增加该字段，或改用系统配置表。

### A4（文档要求不明确）
- 问题：PRD《二》写 Phase1 输出 `ChapterRosterEntry[] + AliasContextHint[]`，但《八 Step8》要求在 roster parser 扩展字段（单一结构）。
- 影响：解析器契约不唯一。
- 建议决策：统一为“单结构扩展字段”或“双结构并行输出”。

### A5（文档要求不明确）
- 问题：PRD《八 Step13》路由鉴权写“withAuth（如需要）”。
- 影响：安全边界不一致。
- 建议决策：按环境统一：生产强制鉴权，开发可配置放开。

### A6（缺少执行前提）
- 问题：PRD 性能目标给出百分比，但未定义基线数据集、测量窗口、统计口径。
- 影响：验收无法客观判定。
- 建议决策：先建立 baseline run（固定书籍+章节范围+模型）。

### A7（实现依赖）
- 问题：集成测试目录建议为 `__tests__/integration`，但当前仓库以并列 `*.test.ts` 为主。
- 影响：测试组织可能与现有规范冲突。
- 建议决策：遵循现有风格，或先补一条测试目录规范。

---

## 最终结论与后续建议

### 结论
- 文档解析、任务拆解、任务系统创建与执行前提核查已完成，可直接进入开发阶段。
- 当前不宜直接自动编码推进，需先完成 A1/A2/A3 三项关键决策，否则后续实现会产生返工。

### 后续建议（执行顺序）
1. 先完成 A1/A2/A3 的人工决策（半天内）。
2. 按子任务顺序推进：`base-infra -> alias-resolver -> validation-agent -> performance`。
3. 每个子任务完成后立刻跑：`prisma validate`、`tsc --noEmit`、相关 unit/integration tests。
4. 以 PRD《十》8 条作为最终验收 gate，形成可追溯验收记录。
