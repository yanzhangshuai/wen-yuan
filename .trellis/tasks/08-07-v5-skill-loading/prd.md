# PRD: v5 Skill 装载重构

> 目标基线：`docs/architecture/13-agent-architecture-v5.md` §3（skills 域）+ §5（模型策略）

## 背景

v4 的"书籍类型 + 知识库"体系已被 v5 skills 取代：

- `book_types` / `book_type_skills` / `book.bookTypeId` 是"书 → 一个类型 → 间接映射一组 skills"的间接层，知识库已删，只剩这一层冗余；
- `relationship_types` 是关系码权威表，与 relationship-type skill 内的教学码表重复；
- 模型策略仍按 v4 的 9 阶段矩阵（`PipelineStage`）配置，v5 管线中这些阶段一个都不存在。

目标：**解析前由 AI 按"书 + skill 目录"动态选 skill**；**关系码作为 skill 契约**；**模型按功能点指定**。选择权全部交给模型，代码只留确定性骨架。

## 需求

| # | 需求 | 说明 |
|---|------|------|
| R1 | Skill 独立启停 | 每个 skill 各自的 `Skill.isEnabled` 开关（非总闸）；关闭 = 该 skill 全局不可用：目录不可见 / AI 不可选 / 不装载 |
| R2 | schema 精简 | 删 6 表 `book_types`/`book_type_skills`/`relationship_types`/`model_strategy_configs`/`text_chunks`/`fact_evidences` + 14 死字段（Book.parseProgress/parseStage、Chapter.isAbstract、Entity.birthYear/deathYear、EntityProfile.moralTier、Alias.contextHash、Fact.paraIndex、Mention.summary、AiModel.supportsTools、AnalysisJob.experimentTag/architecture）；进度改从任务推导；**review 域字段（Chapter.parseStatus、Entity.gender/hometown、EntityProfile.officialTitle/ironyIndex、Fact.virtualYear/location/title/attitudeTags/reviewedAt/reviewedBy、ChapterBiographyVerification 表）归 v5-review，本任务不动** |
| R3 | 关系码契约入 skill | `relationshipCodes`（code/direction/category/aliases 闭集）进 relationship-type skill frontmatter；schema / guardrail / 图谱从契约取码 |
| R4 | AI 动态 skill 选择 | 每次任务启动：书（全文/超长抽样）+ frontmatter-only 目录 → SKILL_SELECTOR 廉价模型 → `{skillSlugs, inferredType, reasons}` → zod 校验 → 快照进 `AnalysisJob.skillsSnapshot`（不做书级持久化） |
| R5 | AI 目录元数据 | 目录清单 = `slug + name + description + category`（复用现有 `SkillCategory`）；**不加**分组/打标（YAGNI，目录膨胀时再补） |
| R6 | isDeicticJunk 外置 | 虚指代词名单从代码移到 GLOBAL skill 契约（guardrail 读契约，代码留空兜底） |
| R7 | 模型策略重构 | 9 阶段矩阵 → 功能点模型 `feature_models`（featureKey → modelId；SKILL_SELECTOR / PIPELINE_MAIN / REVIEW） |
| R8 | 管理端适配 | 新建 skills 管理页（开关 + 码契约只读）；book 导入/详情去 bookTypeId；**删** book-types 页与其余死页面 |

## 验收标准

- **AC1**：`src/` 无 `relationship_type` / `bookType` / `bookTypeId` 残留引用（grep 校验），模型策略无 `PipelineStage` 9 阶段残留。
- **AC2**：解析装载链路正确：skill 选择 → 契约解析 → 快照进任务 → 提取从任务快照装载。
- **AC3**：关系码受所选 skill 契约闭集约束，非法码被 guardrail 拒绝（`invalid_code`），无码来源时提取不产出关系。
- **AC4**：AiCallExecutor 按 `featureKey` 解析模型，无 fallback 断链；`feature_models` 管理端可维护。
- **AC5**：管理端可切换每个 skill 的启停开关、只读查看 relationshipCodes 契约；无分组/打标与书级推断展示。
- **AC6**：`pnpm type-check` / `pnpm lint` / `pnpm test` 通过；goldset eval gate（`node scripts/eval/run-eval.ts`）F1 不回退。

## 非目标

- 不做 per-book / per-job 模型覆盖（功能点模型为全局映射，未来按需扩展）。
- 不做书级 skill 选择持久化 / 版本陈旧检测 / 手动重测（`book.skillProfile`），选择结果只快照进任务；未来如需跨任务稳定再补。
- 不新增 skill 编辑的富文本界面（skills 仍以 `scripts/skills/*.md` + seed 为唯一内容源；管理端只读展示 + 开关）。
- 不改事实类型本体（`FactType` / `EventCategory` / `FACT_TYPES` / `PAYLOAD_SHAPES` 属本体契约，留在代码/schema）。
