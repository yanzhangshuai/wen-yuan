# 文渊 PRD 与代码对齐分析 v1.1

> 目标：基于当前仓库真实实现，判断 PRD 哪些已经有基础、哪些部分对齐、哪些尚未开工，以及哪些地方存在明确偏移。  
> 日期：2026-03-24

---

## 一、结论先行

当前仓库更接近“数据模型 + 章节级 AI 解析底座 + 基础鉴权能力 + Neo4j 连接预埋”的阶段，还没有进入 PRD 所定义的完整产品阶段。

可以直接下的判断：

1. **主 PRD 应继续以** [prd.md](/home/mwjz/code/wen-yuan/.trellis/tasks/03-23-wen-yuan-prd/prd.md) **为准**，因为它已经保留了完整产品表达，并补了可执行拆解。
2. **当前代码并未实现书库、导入、全书解析任务、图谱页面、审核后台这些核心产品面。**
3. **现有代码与 PRD 的最大价值对齐点在“数据模型方向”与“AI 解析问题域”上，而不是页面和业务闭环上。**
4. **3D 书架、沉浸式图谱、Neo4j 路径查找不能从 PRD 中删除。** 当前代码只是尚未实现，不代表需求降级。

---

## 二、主 PRD 基线

当前更适合作为实施基线的文档：

- [prd.md](/home/mwjz/code/wen-yuan/.trellis/tasks/03-23-wen-yuan-prd/prd.md)

原因：

- 它保留了首页书库、导入流程、图谱页、审核系统、模型设置、主题系统、登录等完整产品定义。
- 它已经补入你明确要求新增的能力：
  - 原文阅读 / 高亮回跳
  - 合并建议队列
  - 重解析粒度定义
  - 模型设置联通性测试与脱敏展示
  - 书库卡片数据来源说明
- 它额外给出了 MVP v1 主链路、阶段拆解、API 概览、验收标准。

`docs/PRD.md` 仍然有参考价值，但更偏概念愿景和早期方向，不适合作为直接开工基线。

---

## 三、当前代码处于什么阶段

从仓库结构看，当前主要落地的是以下几层：

- 页面壳层很少，只有 [page.tsx](/home/mwjz/code/wen-yuan/src/app/page.tsx)，且文件内明确写了“首页暂时作为后台 UI 基础能力的演示页”。
- 数据模型较完整，已定义 `Book`、`Chapter`、`Persona`、`Profile`、`BiographyRecord`、`Mention`、`Relationship`、`AnalysisJob`、`AiModel` 等核心表，见 [schema.prisma](/home/mwjz/code/wen-yuan/prisma/schema.prisma)。
- AI 解析服务已经具备章节级抽取与落库基础，见 [ChapterAnalysisService.ts](/home/mwjz/code/wen-yuan/src/server/modules/analysis/services/ChapterAnalysisService.ts)。
- 人物对齐已经有初版实现，见 [PersonaResolver.ts](/home/mwjz/code/wen-yuan/src/server/modules/analysis/services/PersonaResolver.ts)。
- 默认模型种子、管理员账号、示例书和示例章节已有基础，见 [seed.ts](/home/mwjz/code/wen-yuan/prisma/seed.ts)。
- Neo4j 连接已预埋，但目前仍是基础设施，不是用户可用能力，见 [neo4j.ts](/home/mwjz/code/wen-yuan/src/server/db/neo4j.ts)。

因此，当前代码阶段可以定义为：

`后端文学解析底座已起步，产品主界面与业务流程尚未落成`

---

## 四、对齐矩阵

### 4.1 已对齐

这些能力已经有明确基础，方向与 PRD 基本一致：

| 领域 | 对齐情况 | 证据 |
| --- | --- | --- |
| 数据核心实体 | 已对齐 | [schema.prisma](/home/mwjz/code/wen-yuan/prisma/schema.prisma) 已有 `Book`、`Chapter`、`Persona`、`Profile`、`BiographyRecord`、`Mention`、`Relationship`、`AnalysisJob` |
| 模型配置基础 | 已对齐 | `AiModel` 表已存在，且种子预置 DeepSeek / 通义 / 豆包 / Gemini，见 [schema.prisma](/home/mwjz/code/wen-yuan/prisma/schema.prisma)、[seed.ts](/home/mwjz/code/wen-yuan/prisma/seed.ts) |
| 章节级 AI 解析 | 已对齐 | [ChapterAnalysisService.ts](/home/mwjz/code/wen-yuan/src/server/modules/analysis/services/ChapterAnalysisService.ts) 已支持读章、分段、调用 AI、事务写库 |
| 基础登录能力方向 | 已对齐 | 已有密码模块和管理员 seed，见 [password.ts](/home/mwjz/code/wen-yuan/src/server/modules/auth/password.ts)、[seed.ts](/home/mwjz/code/wen-yuan/prisma/seed.ts) |
| Neo4j 技术路径 | 已对齐 | [neo4j.ts](/home/mwjz/code/wen-yuan/src/server/db/neo4j.ts) 已存在，说明 PRD 中的路径查找方向不是空想 |

### 4.2 部分对齐

这些能力已经有一部分基础，但距离 PRD 还差一层产品化或契约闭环：

| 领域 | 当前状态 | 与 PRD 的差距 |
| --- | --- | --- |
| 解析任务 | `AnalysisJob` 表已存在 | 还没有全书任务编排、状态流转、失败摘要展示、重解析策略落地 |
| 原文证据 | `Mention.paraIndex`、`Relationship.evidence`、`BiographyRecord.ironyNote` 等字段已存在基础 | 实际分析类型和落库流程没有完整带上“关系证据 + 置信度 + 回跳锚点” |
| 实体对齐 | 已有 `PersonaResolver` | 目前更像相似名归并，不足以支撑 PRD 的别名消歧、`TITLE_ONLY`、合并建议队列 |
| 模型设置 | Schema 与默认模型存在 | 还没有设置页、Key 脱敏返回、联通性测试接口 |
| 图谱能力 | Schema 足以支撑图数据 | 还没有 `/books/:id/graph` 页面、图谱接口、详情面板、章节时间轴 |

### 4.3 尚未对齐

这些是 PRD 中的明确功能，但当前仓库里还没看到实现落点：

| PRD 能力 | 当前情况 |
| --- | --- |
| 首页 / 书库页面 | 未实现，当前首页仍是 UI demo，见 [page.tsx](/home/mwjz/code/wen-yuan/src/app/page.tsx) |
| 导入向导 | 未实现 |
| `.txt` 上传与元数据确认 | 未实现 |
| 章节切分预览与人工修正 | 未实现 |
| 全书解析任务 | 未实现，当前只有章节级 action，见 [analysis.ts](/home/mwjz/code/wen-yuan/src/server/actions/analysis.ts) |
| 书库列表状态联动 | 未实现 |
| 单书图谱浏览页 | 未实现 |
| 原文阅读 / 高亮回跳界面 | 未实现 |
| 管理审核队列 | 未实现 |
| 合并建议队列 | 未实现 |
| 模型设置页 | 未实现 |
| `/login` 与 `/admin/*` 页面 | 未实现 |
| API 路由层 | 仓库中未见对应业务 API 文件 |

### 4.4 明确偏移

这些不是“还没做”，而是“已经做了，但做法和 PRD / Schema 有偏差”。

#### 1. Prompt 字段名和解析器字段名不一致

- Prompt 里要求模型输出 `traitNote`，见 [prompts.ts](/home/mwjz/code/wen-yuan/src/server/modules/analysis/services/prompts.ts)
- 解析器只接收 `ironyNote`，见 [analysis.ts](/home/mwjz/code/wen-yuan/src/types/analysis.ts)

结果：

- 模型就算按 Prompt 输出成功，这个字段也可能在解析时被丢弃。

#### 2. 别名语义被 `globalTags` 混用

- PRD 已明确 `aliases` 才是别名主字段
- 但当前对齐逻辑把 `globalTags` 当成别名候选来源，见 [PersonaResolver.ts](/home/mwjz/code/wen-yuan/src/server/modules/analysis/services/PersonaResolver.ts)
- 分析上下文也把 `persona.globalTags` 拼进 `aliases`，见 [ChapterAnalysisService.ts](/home/mwjz/code/wen-yuan/src/server/modules/analysis/services/ChapterAnalysisService.ts)

结果：

- “人物标签”和“别名”语义会混淆，影响后续合并建议与审核判断。

#### 3. `TITLE_ONLY` 没有真正进入解析闭环

- Schema 已有 `NameType.TITLE_ONLY`，见 [schema.prisma](/home/mwjz/code/wen-yuan/prisma/schema.prisma)
- 但 `PersonaResolver` 创建新角色时固定写成 `PersonaType.PERSON`，未区分 `nameType`
- PRD 明确要求“仅有称号 / 官职的人物可入库、可审核、可展示”

结果：

- 当前实现还不能稳定支撑“那老翁”“某学道公”这类人物。

#### 4. 关系证据与置信度没有按 Schema 完整落库

- Schema 的 `Relationship` 具备 `evidence` 与 `confidence` 字段，见 [schema.prisma](/home/mwjz/code/wen-yuan/prisma/schema.prisma)
- 但当前 `AiRelationship` 类型没有这两个字段，见 [analysis.ts](/home/mwjz/code/wen-yuan/src/types/analysis.ts)
- `ChapterAnalysisService` 写库时也没有给 `evidence`、`confidence` 赋值，见 [ChapterAnalysisService.ts](/home/mwjz/code/wen-yuan/src/server/modules/analysis/services/ChapterAnalysisService.ts)

结果：

- PRD 中“证据链”“高亮回跳”“低置信度提示”目前没有数据闭环。

#### 5. 当前只有“单章解析 action”，与 PRD 的“全书解析任务”不一致

- 当前 action 是 `startChapterAnalysis(chapterId)`，见 [analysis.ts](/home/mwjz/code/wen-yuan/src/server/actions/analysis.ts)
- PRD 主链路要求的是“整本书入库后发起全书解析任务，并显示任务进度 / 失败摘要 / 重解析”

结果：

- 当前实现适合作为底层 worker，不足以直接支撑产品主流程。

#### 6. 章节类型语义和种子数据不完全一致

- Schema 中已经定义了 `PRELUDE / CHAPTER / POSTLUDE`，见 [schema.prisma](/home/mwjz/code/wen-yuan/prisma/schema.prisma)
- 但种子和现有逻辑仍更偏向用 `CHAPTER + isAbstract` 表示特殊章节，见 [seed.ts](/home/mwjz/code/wen-yuan/prisma/seed.ts)

结果：

- 章节切分预览与时间轴渲染时，容易出现“楔子 / 序 / 后记”的判定口径不统一。

---

## 五、高优先级不对齐项

如果要按照 PRD v1.1 直接开工，优先级最高的是以下 8 项：

1. 补全业务页面骨架：
   - `/`
   - `/login`
   - `/admin/review`
   - `/admin/model`
   - `/books/:id/graph`

2. 建立导入主链路：
   - `.txt` 上传
   - 元数据确认
   - 章节切分预览
   - 入库确认

3. 把“单章解析服务”提升为“全书解析任务编排”

4. 统一 AI 输出契约：
   - `traitNote` / `ironyNote`
   - 关系 `evidence`
   - 关系 `confidence`
   - 原文锚点字段

5. 把别名与标签彻底拆开：
   - `aliases`
   - `globalTags`
   - `localTags`

6. 增补 `TITLE_ONLY` 与合并建议的真实数据闭环

7. 做审核页与原文高亮回跳

8. 把模型设置页和密钥脱敏 / 联通性测试接起来

---

## 六、建议的实施理解

为了避免后续再次出现“收敛 = 删除需求”的误解，建议统一按下面的口径推进：

- **完整产品需求**：以 [prd.md](/home/mwjz/code/wen-yuan/.trellis/tasks/03-23-wen-yuan-prd/prd.md) 的 `4.1` 到 `4.7` 为准。
- **MVP v1 主链路**：先打通 `txt 导入 -> 元数据确认 -> 章节切分预览 -> 全书解析任务 -> 书库列表 -> 单书图谱浏览 -> 原文回跳 -> 管理审核队列`。
- **本版增强能力顺序**：3D 书架、沉浸式图谱、Neo4j 路径查找、图谱内联校对、完整手动人物管理继续保留为本版正式需求，只是在工程排期上可以稍后落位。

这意味着：

- 这些能力**不从 PRD 中删除**
- 但实现时我们先做能形成闭环的主链路
- 然后再继续把视觉与高级交互补齐

---

## 七、下一步最适合产出的文档

如果你要继续往“开工态”推进，最值得立刻补的 3 份文档是：

1. API 合同表
   - 把 `GET /api/books`、`POST /api/books`、`POST /api/books/:id/analyze`、`GET /api/books/:id/graph` 等请求与响应字段定死

2. Schema 差异清单
   - 专门列出 `MergeSuggestion`、分析任务覆盖策略、版本策略、证据锚点字段是否需要补表或补字段

3. Phase 1-Phase 3 工单拆分
   - 直接落成 issue 粒度，方便一项项开做

---

## 八、证据文件

- [page.tsx](/home/mwjz/code/wen-yuan/src/app/page.tsx)
- [analysis.ts](/home/mwjz/code/wen-yuan/src/server/actions/analysis.ts)
- [ChapterAnalysisService.ts](/home/mwjz/code/wen-yuan/src/server/modules/analysis/services/ChapterAnalysisService.ts)
- [PersonaResolver.ts](/home/mwjz/code/wen-yuan/src/server/modules/analysis/services/PersonaResolver.ts)
- [prompts.ts](/home/mwjz/code/wen-yuan/src/server/modules/analysis/services/prompts.ts)
- [analysis.ts](/home/mwjz/code/wen-yuan/src/types/analysis.ts)
- [schema.prisma](/home/mwjz/code/wen-yuan/prisma/schema.prisma)
- [seed.ts](/home/mwjz/code/wen-yuan/prisma/seed.ts)
- [neo4j.ts](/home/mwjz/code/wen-yuan/src/server/db/neo4j.ts)
