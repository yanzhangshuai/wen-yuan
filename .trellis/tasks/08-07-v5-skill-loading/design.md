# 技术设计：v5 Skill 装载重构

> 文档基线：`docs/architecture/13-agent-architecture-v5.md`
> 关联任务：`08-06-v5-data-model`（schema 现状）、`08-06-v5-extraction`（schema.ts/guardrails 现状）

## 0. 设计原则

- **本体（universal/结构性）留在 schema/代码**；**知识（genre/内容性）进 skill**。`FactType`/`EventCategory`/`FACT_TYPES`/`PAYLOAD_SHAPES` 是本体，不动；`relationshipCodes`/虚指名单是知识，进 skill 契约。
- **模型选择权全部交给 AI，代码只留确定性骨架**：skill 选择是唯一"配置决策"，其余管线阶段确定性执行。
- **参照 Claude Code 记忆系统**：目录 = frontmatter-only 索引、选择器 = 廉价模型只回 slug 列表、选中后加载全文。（版本陈旧检测/书级持久化暂不需要，见 §3.2）

## 1. 数据模型变更（schema.prisma + 迁移）

### 删除（表）

| 表 | 依据 |
|---|---|
| `BookType`（`book_types`） | 书型间接层 |
| `BookTypeSkill`（`book_type_skills`） | 书型↔skill 关联 |
| `RelationshipType`（`relationship_types`） | 关系码权威表（契约入 skill） |
| `ModelStrategyConfig`（`model_strategy_configs`） | v4 阶段模型策略（功能点模型替代） |
| `TextChunk`（`text_chunks`） | 0 引用（RAG 是 v4），连带删 GIN/HNSW 索引 |
| `FactEvidence`（`fact_evidences`） | 0 引用（证据锚定只写 `Fact.evidence`） |

### 删除（字段）

| 模型.字段 | 依据 |
|---|---|
| `Book.bookTypeId` | 书型外键 |
| `Book.parseProgress` / `parseStage` | 只写 0/文本清洗从不推进；进度改从 `AnalysisJob` + `analysis_phase_logs` 推导 |
| `SkillVersion.bookTypeId` | 书型级激活版（激活版=全局激活版） |
| `Chapter.isAbstract` | 只写不读（PRELUDE 已表达） |
| `Entity.birthYear` / `deathYear` | 0 引用（v4 人物简历） |
| `EntityProfile.moralTier` | 0 引用 |
| `Alias.contextHash` | 仅类型定义 |
| `Fact.paraIndex` | 0 引用（提取恒写 null，证据定位走文本） |
| `Mention.summary` | 0 引用 |
| `AiModel.supportsTools` | 0 引用（v5 无工具循环） |
| `AnalysisJob.experimentTag` / `architecture` | 0 引用 / v4 多架构（v5 单管线） |

> **review 域字段本任务不动**（由 v4 roleWorkbench/review UI 消费，归 v5-review 重写时定夺）：`Chapter.parseStatus`、`Entity.gender/hometown`、`EntityProfile.officialTitle/ironyIndex`、`Fact.virtualYear/location/title/attitudeTags/reviewedAt/reviewedBy`、`ChapterBiographyVerification` 表。
>
> 进度机制简化：`parseProgress/parseStage` 删列后，`getBookStatus` 从 `AnalysisJob` 状态 + `analysis_phase_logs` 推导 progress/stage（前端读 API，字段名不变）；`Chapter.parseStatus` 保留（pipeline 写入、前端面板消费）。

### 新增

| 模型/字段 | 设计 |
|---|---|
| `Skill.isEnabled Boolean @default(true)` | **每个 skill 各自的启停开关**；`false` = 该 skill 全局不可用（目录不可见 / AI 不可选 / 不装载） |

> 不加分组/打标：AI 选择靠 description + category（现有 `SkillCategory`），分组/打标是纯元数据，目录膨胀时再补（YAGNI）。
| `FeatureModelConfig`（`feature_models`）：featureKey(String @id)/modelId/updatedAt | 功能点→模型 全局映射 |

### 保留不动

- `Skill` / `SkillVersion` 骨架（versionNo/isActive/isBaseline 机制）
- `SkillStatus`（DRAFT/ACTIVE 生命周期）+ `SkillSource`/`SkillCategory`/`SkillScope`
- `Fact` / `Relationship` 等运行表（`relationships.relationshipTypeCode` 本就是无 FK 字符串，删表无需迁移）

## 2. Skill 契约（frontmatter 扩展）

`content-schema.ts` 的 `skillFrontmatterSchema` 增加两个可选字段：

```ts
relationshipCodes: z.array(z.object({
  code: z.string(), direction: z.enum(["INVERSE","SYMMETRIC"]),
  category: z.string(), aliases: z.array(z.string()).default([])
})).optional()
deicticJunk: z.array(z.string().min(1)).optional()   // 虚指名单
```

- `parseSkillMetadata` 返回 `relationshipCodes` / `deicticJunk`，供装载与契约解析。
- seed 文件 `scripts/skills/classical-relationship-types.md` 把教学码表结构化进 frontmatter；新增 `scripts/skills/chinese-deictic-junk.md`（或并入 `classical-generic-titles.md`）携带 `deicticJunk` 契约。
- `triggers.bookTypeKeys` 移除（书型概念删除），保留 `priority`/`taskTypes`。

## 3. AI 动态 skill 选择（核心）

### 3.1 新服务 `src/server/modules/skills/skillSelector.ts`

```
输入: { bookId, jobId }
1. 读书：元数据（书名/作者/朝代/简介）+ 章节文本（全文；总字符 > 阈值时抽样首/中/末各 ~2K 字）
2. 读目录：全部 active+enabled skills 的 frontmatter-only 摘要
     { slug, name, description, category }   ← 不读正文（对标"只扫前 30 行"）
3. 一次 LLM 调用（featureKey=SKILL_SELECTOR，廉价模型）
   系统：任务契约（"从目录里选出与这本书最相关的技能…"）
   用户：书上下文 + 目录清单
   输出 JSON: { skillSlugs: string[], inferredType: string|null, reasons: string }
4. zod 校验：skillSlugs ⊆ 目录（且 isEnabled=true）
5. 装载集合 = scope=GLOBAL ∪ 选中 skills
6. 返回 { skills, relationshipCodes }，由调用方（runAnalysisJob）快照进
   AnalysisJob.skillsSnapshot / relationshipTypesSnapshot（复用现有字段）
```

### 3.2 触发时机与快照

- **每次任务启动时选择**（runAnalysisJob 起始，属 `08-06-v5-pipeline` 编排），结果快照进该 job，任务内各阶段（身份/提取）从 job 快照读取，任务间互不干扰。
- 不做书级持久化（`book.skillProfile`）、不做陈旧检测、不做手动重测——暂不需要，未来按需补（见非目标）。

### 3.3 装载 `resolveSkillsForBook` 改造

- 不再查 `book.bookTypeId`/`bookTypeLinks`；输入改为 `(jobId)` → 读 job.skillsSnapshot.skillSlugs → 装载 = `status=ACTIVE AND isEnabled=true` 且（`scope=GLOBAL` 或 slug ∈ 快照）。
- `summary` 目录字段：`slug/name/description/category`（供选择器提示与管理端展示）。
- `loadSkill(skillId)`：删 bookType 激活版逻辑，取全局激活版。

## 4. 关系码契约取码

- 新函数 `getRelationshipCodesFromSkills(skills: SkillDocument[])`：并集各 skill frontmatter `relationshipCodes`，去重按 code，输出 `RelationshipCodeInfo[]`（复用现有接口类型）。
- 装载链路：skill 选择后，把契约快照写入 job 快照（`analysis_jobs.relationshipTypesSnapshot` 字段保留复用）→ `buildExtractionSchema` 输入不变。
- `schema.ts` `getRelationshipCodes(bookId)`：改为从当前 job 的 skills 契约快照读取（不经 DB 表）。
- `guardrails.ts` `validCodes`：由契约快照构造，逻辑不变。
- `knowledge/lookupTypeNames.ts`：签名改为 `(bookId, codes)` 或直接吃契约快照；code→name 从契约取（`name ?? code`），缺名回退 code。

## 5. 模型策略：功能点模型

### 5.1 删除（v4 遗产）

- `src/types/pipeline.ts`：`PipelineStage`（9 值）、`BUSINESS_PIPELINE_STAGES`、`StageParams`、`AiUsage` 等阶段相关类型（保留 `AiCallFnResult`/`PromptMessageInput` 等被 AiCallExecutor 用的纯调用类型）。
- `src/server/modules/analysis/dto/modelStrategy.ts`：`stageModelConfigSchema`/`strategyStagesSchema`/`ModelStrategyScope`。
- `src/server/modules/analysis/services/modelStrategyAdminService.ts` + 相关 admin 路由。
- `src/server/modules/analysis/services/ModelStrategyResolver.ts`（按 stage 解析）→ 改按 featureKey。
- `modelStrategyConfig` 表、`startBookAnalysis` 的 `modelStrategy` 入参。
- `config/model-recommendations.v1.json` + `src/lib/model-recommendations.ts` + 前端 `model-strategy-form.tsx`。

### 5.2 新增

- `FeatureKey` 枚举：`SKILL_SELECTOR | PIPELINE_MAIN | REVIEW`（放 `src/types/pipeline.ts` 或独立 `feature-key.ts`）。
- `feature_models` 表 + `src/server/modules/skills`（或 `models` 域）的服务：`getFeatureModel(featureKey)` / `upsertFeatureModel` / `listFeatureModels`，带 AiModel 存在性校验。
- `AiCallExecutor.execute`：`stage` 参数改为 `featureKey`（+ 可选 `stageLabel` 写日志，缺省=featureKey）；内部模型解析改走 `feature_models`，保留重试/回退机制。
- `identity/llm.ts`、extraction 调用：`stage: PipelineStage.X` → `featureKey: FeatureKey.PIPELINE_MAIN`（身份/提取）与 `SKILL_SELECTOR`（选择）。
- 管理端 model 页新增"功能点模型"区（每 featureKey → 模型下拉，默认值可选）。

### 5.3 降级语义

- 某 featureKey 未配置 → 回退到 AiModel 默认（如 isActive 的第一个或 book 当前模型）；选择器未配置 → 回退主流程模型并告警。

## 6. isDeicticJunk 外置

- `extraction/nameAuthority.ts` 删除硬编码名单，改为 `isDeicticJunk(name, junkList)`；`junkList` 来自装载上下文（GLOBAL 契约 skill 的 `deicticJunk`）。
- `guardrails.ts`/`aliasResolver.ts`：从 ResolvedSkillContext 取契约名单，缺省空名单（单字规则仍按字符数保留，可配置）。
- seed 新增契约数据。

## 7. 管理端与死代码清理

- **新建** `src/app/admin/skills/`：列表（slug/name/description/category/scope/isEnabled toggle）+ 详情（relationshipCodes 契约只读展示）。
- **删除** `book-types` 页（书型概念删除，无替代页）。
- **改造** book 导入/详情：删 bookTypeId 单选（无书级 skill 选择持久化，book 页不展示推断结果）。
- **删除** `knowledge-base/` 下死页面：relationship-types / title-filters / alias-packs / extraction-rules / prompt-templates；`knowledge/index.ts` 收敛为只保留 change-logs/audit（或随 R2 一并收敛）。
- **删除** 死前端 clients：`lib/services/{book-types,title-filters,alias-packs,book-knowledge-packs,knowledge,model-recommendations}.ts`。
- **删除** 死 API：`api/admin/knowledge/book-types`（若改 skill-groups 则迁）、model-strategy 相关路由。

## 8. seed 与文档

- `scripts/seed-skill-baselines.ts`：frontmatter 增加 relationshipCodes/deicticJunk 解析；`seedSkillBaselines` 幂等（内容变→新版本）。
- `scripts/skills/*.md`：`classical-relationship-types.md` 补 frontmatter 契约；新增 `chinese-deictic-junk.md`。
- `docs/architecture/13-agent-architecture-v5.md`：§3 skills 装载、§5 模型策略改为功能点模型，更新 pipeline 图。

## 9. 关键边界

| 场景 | 处理 |
|---|---|
| AI 选到未启用 skill | zod 目录过滤拦截，强制重试 1 次（提示仅可选目录内项） |
| 契约码为空 | schema 的 relationshipTypeCodes=[]，guardrail 跳过码校验，提取提示"无关系码"不产出关系 |
| 书超长 | skill 选择抽样首/中/末；提取本身按片 |
| 关系码并集冲突（同 code 不同 direction） | 先到先得 + warn（seed 保证唯一） |

## 10. 风险与对策

- **goldset 回归**：改装载后重跑 `node scripts/eval/run-eval.ts`，F1 回退即停。
- **选择非确定性**：每次任务现选 → 同书多次解析可能 skill 集不同；靠 zod 目录校验 + GLOBAL 常驻兜底控制，成本每任务 ~2-4K token。未来如要稳定再补书级持久化。
- **闭集校验丢失**：关系码契约保留闭集（父子/师生/同年 是封闭本体），区别于称谓开放域。
- **迁移面大**：dev 库重建；本任务 commit 前先 `pnpm type-check` 清零类型错误（当前 v4 残留 94 个，其中 graph/roleWorkbench 归 v5-review，本任务不动）。

## 11. 关联任务边界

- `08-06-v5-pipeline`：runAnalysisJob 起始调用本任务产出的 skill 选择 + 契约快照（写 AnalysisJob.skillsSnapshot / relationshipTypesSnapshot）；`AgentRun.runType` 枚举对齐 v5 阶段（SKILL_SELECT/REVIEW/GRAPH_SYNC 等）归 pipeline 任务，不在本任务动。
- `08-06-v5-review`：Pass4 审核用 `featureKey=REVIEW` 模型槽，本任务只建槽位不实现审核逻辑。
