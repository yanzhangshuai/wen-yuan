# brainstorm: 关系类型知识库

## Goal

设计一套独立的关系类型知识库，用于统一管理角色之间的结构性关系类型，为角色资料关系设置、前台关系图谱、反向称谓推断、AI 抽取归一化和后台录入标准化提供基础字典。

## What I already know

* 关系类型只收“结构性关系”，例如父子、岳婿、师生、主仆、同僚、上下级、同盟、敌对。
* 关系档案事件不进入关系类型知识库；轻视、奉承、训斥、求助、背叛、和解等应作为档案事件标签。
* 关系类型不适合纯字符串，也不适合数据库硬枚举；推荐使用可配置知识库字典，数据库引用稳定 `code/key`。
* 系统需要能根据关系类型配置做反向推断，例如胡屠户 -> 范进显示“岳父”，范进 -> 胡屠户显示“女婿”，图谱边显示“岳婿”。
* 已创建父任务 `.trellis/tasks/04-30-character-relation-entry-design`，该任务继续负责角色资料关系设置和关系档案设计；本任务单独负责关系类型知识库。

## Requirements

* 知识库必须支持新增、编辑、启用、停用关系类型。
* 关系类型必须有稳定唯一 `code`，角色关系记录引用 `code`，不直接引用中文名。
* 关系类型必须支持大类分组，例如血缘、姻亲、师承、社会身份、权力关系、利益关系、情感关系、对立关系。
* 关系类型必须支持方向模式：`SYMMETRIC`、`INVERSE`、`DIRECTED`。
* `INVERSE` 关系必须配置正反向称谓，用于系统反向推断。
* 知识库必须支持别名/同义词，用于搜索、录入提示和 AI 抽取归一化。
* 前端配置页必须提供反向预览，帮助管理员验证关系方向和图谱展示。
* 被角色关系引用的关系类型不能硬删除，只能停用。
* 角色资料新增关系时，只能引用启用状态的关系类型；找不到合适类型时走“申请新增关系类型”流程。
* 关系类型知识库不得收录行为/态度标签，避免与关系档案事件混淆。

## Acceptance Criteria

* [ ] 管理员能在知识库中按分组、方向模式、状态、关键词查询关系类型。
* [ ] 管理员能新增和编辑关系类型，包括 code、名称、分组、方向模式、正反向称谓、边标签、别名、说明和状态。
* [ ] 管理员配置关系类型时能看到 A/B 两个示例角色的正向、反向和图谱边预览。
* [ ] 系统能阻止重复 `code`、冲突名称、冲突别名。
* [ ] 系统能阻止配置不完整的 `INVERSE` 关系类型保存。
* [ ] 已被引用的关系类型只能停用，不能硬删除。
* [ ] 角色关系记录能引用关系类型 `code`，并根据 source/target 和方向模式推断当前视角称谓。
* [ ] 前台关系图谱能从关系类型知识库读取边标签、分组和基础展示信息。

## Proposed Model

### RelationshipTypeDefinition

推荐新增 `RelationshipTypeDefinition`，或在现有知识库体系中增加等价实体：

* `id`：内部主键。
* `code`：稳定唯一 key，例如 `kinship_father_son`、`marriage_father_in_law_son_in_law`。
* `name`：标准关系名称，例如“父子”“岳婿”“师生”。
* `group`：关系大类，例如血缘、姻亲、师承、社会身份、权力关系、利益关系、情感关系、对立关系。
* `directionMode`：方向模式，取值 `SYMMETRIC`、`INVERSE`、`DIRECTED`。
* `sourceRoleLabel`：source 在该关系中的身份称谓，例如“岳父”“师父”“主人”。
* `targetRoleLabel`：target 在该关系中的身份称谓，例如“女婿”“徒弟”“仆人”。
* `edgeLabel`：图谱边摘要，例如“岳婿”“师生”“主仆”。
* `reverseEdgeLabel`：可选，反向边摘要；多数情况可为空。
* `aliases`：字符串数组，存同义词、俗称、古典称谓。
* `description`：定义说明。
* `usageNotes`：使用说明，特别说明和行为标签的边界。
* `examples`：典型例子，帮助录入人员判断。
* `color`：图谱颜色，MVP 可选。
* `sortOrder`：排序。
* `status`：`ACTIVE`、`INACTIVE`、`PENDING_REVIEW`。
* `createdAt`、`updatedAt`：审计字段。

## Direction Rules

1. **`SYMMETRIC` 对称关系**
   * 适用：夫妻、同僚、朋友、同盟、敌对。
   * source 与 target 对调后，关系名称不变。
   * 可只要求 `name` 和 `edgeLabel`，source/target 称谓可选。

2. **`INVERSE` 互逆关系**
   * 适用：父子、母子、师生、主仆、岳婿、上下级。
   * source 与 target 对调后，展示称谓自动切换。
   * 必须填写 `sourceRoleLabel` 和 `targetRoleLabel`。

3. **`DIRECTED` 单向关系**
   * 适用：保护者、债主、恩主、荐举者、依附者。
   * 关系语义主要从 source 指向 target。
   * 至少填写 source 侧称谓；target 侧称谓建议填写，否则前台使用通用反向文案或提示补充。

## Reverse Inference Contract

系统反向推断不做自然语言猜测，只依赖关系类型配置：

* 正向视角：基于 `sourcePersonaId -> targetPersonaId` 展示 `sourceRoleLabel` 与 `targetRoleLabel`。
* 反向视角：交换 source/target 后自动切换称谓。
* 图谱边：优先显示 `edgeLabel`，必要时按视角使用 `reverseEdgeLabel`。
* 配置不完整时，关系类型不能保存，不把问题留到角色资料录入阶段。

## Frontend Admin UX

### 关系类型列表

* 支持按大类、方向模式、状态筛选。
* 支持搜索 `name`、`code`、`aliases`、`description`。
* 列表字段：名称、大类、方向模式、正向称谓、反向称谓、边标签、别名、状态、引用数量。

### 新增/编辑抽屉

* 基础信息：名称、code、大类、描述、使用说明。
* 方向规则：方向模式、source 称谓、target 称谓、边标签、反向边标签。
* 归一化：别名列表。
* 图谱配置：颜色、排序。
* 状态管理：启用、停用、待审核。

### 反向预览

* 输入或使用默认占位角色 A/B。
* 实时展示：
  * A 对 B 的显示。
  * B 对 A 的显示。
  * 图谱边显示。
  * 角色资料卡片显示。

### 校验与冲突提示

* `code` 唯一。
* 启用状态下 `name` 不重复，或至少提示重复风险。
* `aliases` 不得与其他启用关系类型的 `name/aliases` 冲突。
* `INVERSE` 必须有双向称谓。
* 被引用的关系类型不能硬删除，只能停用。

## Role Relationship Usage

角色资料设置结构关系时，只引用关系类型知识库：

* 选择对方角色。
* 搜索选择启用状态的关系类型。
* 根据预览确认方向。
* 选择确认章节。
* 录入原文证据。
* 保存结构关系。

找不到合适类型时：

* 不允许自由输入成为正式关系类型。
* 提供“申请新增关系类型”。
* 申请内容包含建议名称、分组、方向说明、原文例证。
* 管理员审核通过后进入知识库，再被角色资料引用。

## Frontend Graph Usage

* 边标签使用 `edgeLabel`。
* 边颜色可来自 `group` 或 `color`。
* 筛选器可按 `group` 过滤。
* 点击边详情时，根据当前视角显示 source/target 称谓。
* 关系档案事件不改变边标签，只影响详情摘要和时间线。

## AI Extraction Usage

AI 解析书籍角色关系时，应把关系类型知识库作为“可选标准答案集”，而不是自由生成关系类型。

### Extraction Principles

* AI 只能输出已存在的 `relationshipTypeCode` 作为正式结构关系。
* AI 不得把轻视、奉承、训斥、求助、背叛、和解等行为词写入关系类型。
* AI 如果发现知识库没有合适关系类型，应输出“关系类型候选申请”，进入人工审核，不直接写入正式关系。
* AI 抽取结果默认是草稿或待审核状态，不能直接标记为人工确认。
* 每个结构关系和档案事件都必须带章节、证据片段和置信度。

### Suggested Pipeline

1. **角色识别**
   * 识别章节中出现的角色和别名。
   * 将别名归一到已有角色；无法归一的输出候选角色。

2. **关系类型匹配**
   * 从原文中识别结构性关系线索，例如父子、师生、主仆、姻亲、同僚。
   * 用关系类型知识库的 `name + aliases + description + examples` 做匹配。
   * 输出 `relationshipTypeCode`、source/target、方向、证据、置信度。

3. **关系档案事件抽取**
   * 识别章节中的互动行为、态度变化、冲突、帮助、利益往来。
   * 输出事件 `category + tags + effect + description + evidence`。
   * 行为词只进入事件 tags，不进入关系类型。

4. **候选与审核**
   * 高置信结构关系进入待审核关系列表。
   * 高置信档案事件进入待审核事件列表。
   * 匹配不到关系类型时，生成知识库候选申请，包括建议名称、方向说明、证据和理由。
   * 人工审核通过后，结构关系才进入正式图谱。

### AI Output Shape

AI 输出建议拆成三类，避免混淆：

* `relationships`：结构关系，必须引用 `relationshipTypeCode`。
* `relationshipEvents`：关系档案事件，使用 `category + tags`。
* `relationshipTypeCandidates`：知识库中不存在的新关系类型候选。

### Review UX Requirements

* 审核界面应把“结构关系”和“关系事件”分开展示。
* 结构关系审核卡片显示：角色 A、角色 B、关系类型、方向预览、章节、证据、置信度。
* 关系事件审核卡片显示：角色对、章节、类别、标签、事件作用、描述、证据、置信度。
* 新关系类型候选不能直接进入角色关系，应先进入知识库审核流程。

## AI Generation For Common Relationship Types

关系类型知识库应参照现有知识库的“模型生成候选”模式，提供一个由 AI 批量生成常用关系类型的入口。该能力用于初始化或补齐知识库，不用于解析书籍时自动写入正式关系。

### UX Entry

在关系类型知识库列表页提供“模型生成”按钮，打开生成弹框：

* 生成模型：复用后台已启用模型列表。
* 目标条数：默认 30，可配置上限，例如 100。
* 参考范围：可选择不指定、参考题材、参考书籍。
* 目标分组：可选全部分组，也可指定血缘、姻亲、师承、社会身份、权力关系、利益关系、情感关系、对立关系。
* 补充要求：自由文本，例如“优先补充明清小说常见亲属和官场关系”。
* 操作：预览提示词、开始预审。

### Generation Contract

AI 生成的是“候选关系类型”，不是正式启用数据。输出字段建议包括：

* `name`：标准名称，例如“岳婿”。
* `group`：关系大类。
* `directionMode`：`SYMMETRIC`、`INVERSE`、`DIRECTED`。
* `sourceRoleLabel`：source 侧称谓。
* `targetRoleLabel`：target 侧称谓。
* `edgeLabel`：图谱边摘要。
* `aliases`：别名/俗称/古典称谓。
* `description`：关系定义。
* `usageNotes`：使用边界，尤其说明不要与行为标签混淆。
* `examples`：典型文学场景示例。
* `confidence`：置信度。

AI 不输出正式 `code`。`code` 应在管理员确认保存时由系统自动生成，避免模型生成不稳定英文 key。

### Review Flow

生成流程应和现有知识库保持一致：

1. **预览提示词**
   * 展示 system/user prompt，不调用模型，不落库。

2. **开始预审**
   * 后端创建生成 job，前端用 `jobId` 轮询状态。
   * 模型输出候选后，后端做 schema 校验、去重、冲突检测和默认推荐动作计算。

3. **审核生成结果**
   * 展示候选列表，默认选中高置信且无冲突候选。
   * 管理员可逐条选择、取消、编辑候选字段。
   * 每条候选展示正反向预览，避免方向配置错误。

4. **保存候选**
   * 保存时系统为每条候选自动生成稳定 `code`。
   * 推荐保存为 `PENDING_REVIEW` 或提供“保存为待审核 / 保存并启用”两种操作。
   * 保存后记录知识库审计日志。

### Candidate Validation

候选进入审核前需要做预审：

* 名称为空、分组非法、方向模式非法：拒绝。
* `INVERSE` 缺少 source/target 称谓：拒绝。
* 与现有启用类型的 `name` 或 `aliases` 冲突：默认不选中，并提示冲突对象。
* 置信度低于 0.5：默认不选中。
* 输出行为词，如轻视、奉承、训斥、求助、背叛、和解：默认拒绝，并提示“应进入关系档案事件标签”。
* 边界类型如敌对、同盟、恋慕、恩义：允许进入候选，但必须有 usageNotes 说明稳定关系边界。

### Suggested Prompt Rules

生成提示词必须明确：

* 只生成结构性角色关系类型。
* 不生成章节行为、态度、动作或事件标签。
* 优先生成中国古典文学常见关系。
* 必须给出方向模式和正反向称谓。
* `SYMMETRIC` 关系双方称谓可一致。
* `INVERSE` 关系必须有明确互逆称谓。
* `DIRECTED` 关系必须说明方向语义。
* 输出严格 JSON 数组，不输出 Markdown。

### Implementation Parity With Existing Knowledge Generation

实现时应复用现有知识库生成模式：

* service 层提供 `previewRelationshipTypeGenerationPrompt`。
* service 层提供 `generateRelationshipTypes`，返回 jobId。
* API 路由提供 `/api/admin/knowledge/relationship-types/generate/preview-prompt`。
* API 路由提供 `/api/admin/knowledge/relationship-types/generate`，支持提交与轮询。
* 前端弹框复用“模型选择、目标条数、参考书籍、补充要求、提示词预览、job 轮询、审核生成结果”的交互。
* 保存候选时走普通新增接口，并记录审计日志。

## Initial Seed Set

* 血缘：父子、母子、兄弟、姐妹、祖孙、叔侄。
* 姻亲：夫妻、岳婿、翁媳、妯娌、连襟。
* 师承：师生、同门、师兄弟。
* 社会身份：主仆、同僚、上下级、乡邻、同窗。
* 权力关系：君臣、官民、审判者与被审者。
* 利益关系：债务、主顾、雇佣、荐举、资助。
* 情感关系：朋友、知己、恋慕、恩义。
* 对立关系：敌对、竞争、仇怨。

## MVP Scope

第一阶段建议实现：

* 关系类型列表、新增、编辑、启用、停用。
* 方向模式与反向预览。
* code/name/alias 冲突校验。
* 模型生成常用关系类型候选：提示词预览、job 轮询、候选审核、保存为待审核/启用。
* 角色关系引用关系类型 code。
* 前台图谱边读取 `edgeLabel` 和分组。

暂缓：

* 多语言称谓。
* 复杂本体继承关系。
* 自动合并相似关系类型。
* 精细图谱样式配置。
* AI 自动绕过审核新增正式知识库类型。

## Design Hardening Notes

当前关系类型知识库方向是可行的，但实现前需要守住以下约束，避免后续数据语义混乱：

1. **区分图谱边标签与视角称谓**
   * `edgeLabel` 表示两人之间的关系摘要，例如“岳婿”“师生”“主仆”。
   * `sourceRoleLabel` / `targetRoleLabel` 表示某一方向下双方各自身份，例如“岳父”“女婿”。
   * 前台主图优先使用 `edgeLabel`，人物详情和关系档案才使用视角称谓。

2. **关系类型只收相对稳定的结构关系**
   * “父子、岳婿、师生、主仆、同僚、上下级”适合作为关系类型。
   * “轻视、奉承、训斥、求助、背叛、和解”必须进入关系档案事件。
   * “敌对、同盟、恋慕、恩义”属于边界类型：只有当它们表达一段相对稳定状态时才进入关系类型；若只是某章行为或情绪，应进入关系档案事件。

3. **不要让 AI 直接扩展正式知识库**
   * AI 只能匹配已有 `relationshipTypeCode`。
   * 匹配不到时生成候选申请，由人工补齐方向模式、正反向称谓、别名和边界说明。

4. **不要过早做复杂本体**
   * MVP 只需要一层 `group` 和一层 `relationshipType`。
   * 暂不做继承关系、推理链、多语言、多朝代称谓差异。
   * 古典称谓差异先通过 `aliases` 和 `usageNotes` 解决。

5. **保留人工兜底说明**
   * 每个关系类型需要 `usageNotes`，说明什么时候该用、什么时候不该用。
   * 边界关系需要示例，降低录入人员误选概率。

## Out of Scope

* 不设计关系档案事件标签库。
* 不实现章节互动事件录入工作台。
* 不处理角色关系档案时间线。
* 不重构图谱布局算法。

## Technical Notes

* 父任务：`.trellis/tasks/04-30-character-relation-entry-design`
* 当前项目已有 `Relationship.type` 字符串字段，后续实现时需要评估迁移到 `relationshipTypeCode` 或兼容两者的过渡方案。
* 角色关系录入和图谱展示应依赖本任务产出的关系类型字典。
