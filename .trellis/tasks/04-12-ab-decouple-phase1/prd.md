# 解析架构 A/B 全解耦 — 总体设计

## 一、历史架构完整溯源

### 1.1 旧架构：按章节顺序解析（ROSTER_DISCOVERY → CHUNK_EXTRACTION）

```
POST /api/books/:id/analyze
  → runAnalysisJobById(jobId)
    → loadChapters (按 chapter.no ASC)
    → for each chapter (concurrency = chapterConcurrency):
        analyzeChapter(chapterId, { jobId })
          │
          ├─ Step 1: discoverRosterWithProtection()
          │   ├─ 构建 profiles（已有人物的 name/aliases/localSummary）
          │   ├─ buildRosterDiscoveryPrompt(bookTitle, chapterNo, profiles, genericTitles)
          │   ├─ AI 返回 EnhancedChapterRosterEntry[]（surfaceForm + entityId 数字编号）
          │   └─ 转换为 rosterMap: Map<surfaceForm, personaId | "GENERIC">
          │       └─ entityIdMap: profiles 按索引 → personaId（1-based 编号映射）
          │
          ├─ Step 2: PersonaResolver.resolve()
          │   ├─ rosterMap 快速路径（confidence: 0.97，无相似度验证）
          │   ├─ AliasRegistry 查询
          │   ├─ 多信号相似度评分（name/alias/description）
          │   └─ 创建新 Persona（如果都不匹配）
          │
          ├─ Step 3: CHUNK_EXTRACTION（分段提取 mentions/bios/relationships）
          │   ├─ 文本切片（maxChunkLength=10000, overlap=800）
          │   ├─ buildChapterAnalysisPrompt(profiles, rosterMap, genericTitles)
          │   ├─ AI 返回 ChapterAnalysisResponse（people/mentions/bios/relationships）
          │   └─ 合并分段结果 → persistResult()
          │
          ├─ Step 4: CHAPTER_VALIDATION（风险门控）
          │   └─ 仅 newPersonas >= 3 或有 hallucination/grayZone 时触发
          │
          └─ Step 5: 增量称号溯源（每 5 章 resolvePersonaTitles）
    
    → 全书收尾：
        ├─ 孤儿人物降权（demoteOrphanPersonas）
        ├─ 全书验证（BOOK_VALIDATION）
        └─ 灰区仲裁（GRAY_ZONE_ARBITRATION）
```

**核心特征：**
- 每章看到前面所有章节积累的 profiles（滚雪球式上下文）
- LLM 通过 entityId 数字索引定位已有人物 → **超过 100 人时编号错误率极高**
- rosterMap 快速路径无条件信任 LLM 返回的 entityId → **级联污染**
- 顺序依赖：章 N+1 的推断依赖章 N 的正确性

**已知缺陷：**
1. entityId 数字编号在长列表下 LLM 选错概率高（实测 220+ 人物时频繁出错）
2. rosterMap 无相似度校验 → "景兰江" 被映射到 "范进" 的 personaId
3. 错误通过 aliases/profile.localName 级联传播到后续所有章节
4. 不可并行（严格顺序依赖）

### 1.2 两遍式架构（INDEPENDENT_EXTRACTION → ENTITY_RESOLUTION → CHUNK_EXTRACTION）

```
POST /api/books/:id/analyze
  → runAnalysisJobById(jobId)
    → loadChapters

    ════ Pass 1: 独立章节实体提取（并行） ════
    → for each chapter (并行 concurrency=chapterConcurrency):
        extractChapterEntities(chapterId)
          ├─ buildIndependentExtractionPrompt(bookTitle, chapterNo, content)
          ├─ AI 返回 { name, description, aliases[], category }[]
          └─ 不注入任何 profiles → 纯文本提取
    → 输出: ChapterEntityList[]

    ════ Pass 2: 全局实体消歧 ════
    → resolveGlobalEntities(bookId, title, chapterEntityLists)
        ├─ collectGlobalDictionary() → 汇总所有章节提取结果
        ├─ buildCandidateGroups() → Union-Find 规则预分组
        │   ├─ 精确名字匹配
        │   ├─ 同姓 + 编辑距离 ≤ 1
        │   ├─ aliases 交集
        │   └─ 知识库匹配（classical-names.ts）
        ├─ resolveCandidateGroupsWithLLM() → 模糊组 LLM 判断
        │   └─ 批次 15 组/次 → buildEntityResolutionPrompt
        ├─ 创建所有 Persona + Profile → DB
        └─ 输出: externalPersonaMap (surfaceForm → personaId)

    ════ Pass 3: 章节详细分析（使用 Pass 2 映射） ════
    → for each chapter (并行):
        analyzeChapter(chapterId, { externalPersonaMap })
          ├─ useExternalMap = true → 跳过 ROSTER_DISCOVERY
          ├─ rosterMap 直接来自 externalPersonaMap
          └─ 后续 CHUNK_EXTRACTION 流程同旧架构
```

**优势：**
- 消除 entityId 数字编号问题（Pass 1 不传 profiles）
- 全书级视角消歧（而非逐章累积）
- 可并行（Pass 1 各章独立，Pass 3 各章独立）
- 成本更低（实测 ¥2.34 vs ¥4.39，降 46.7%）

**已暴露缺陷（导致被禁用）：**
1. Pass 1 无 profiles 上下文 → 过度提取（通称、地名、家族名、历史人物都被提取）
2. Pass 2 规则分组不足以覆盖中文复杂称谓体系（编辑距离 ≤1 对 2-3 字中文名效果差）
3. Pass 2 **创建所有未分组实体为 Persona**，无过滤 → 623 个 vs 预期 ~150 个
4. Pass 3 PersonaResolver 对 externalPersonaMap 未命中的名字仍创建新 Persona
5. MENTIONED_ONLY category 未与 PERSON 区分处理

### 1.3 当前状态

- `enableTwoPassArchitecture: false`（pipeline.ts L84-91）
- 两遍式代码仍在 runAnalysisJob.ts 中内联（L605-720），被 config flag 短路
- 3 个两遍式测试被 `it.skip`
- `ROSTER_DISCOVERY` 枚举标记 `@deprecated` 但实际仍在使用
- 两种架构代码深度耦合在同一文件中


## 二、废弃项清单

| 编号 | 位置 | 内容 | 处置方式 |
|------|------|------|----------|
| D1 | `src/types/pipeline.ts:13-15` | `ROSTER_DISCOVERY` @deprecated 注释 | 移除 @deprecated（sequential 架构仍需使用） |
| D2 | `pipeline.ts:84-91` | `enableTwoPassArchitecture: false` + 长注释 | Phase 5 移除整个字段（由路由层决定） |
| D3 | `runAnalysisJob.ts:605-720` | 内联两遍式 Pass 1 + Pass 2 代码块 | Phase 2/3 迁移到独立 Pipeline 类后删除 |
| D4 | `runAnalysisJob.ts:608` | `useTwoPass` 变量与条件判断 | Phase 5 移除 |
| D5 | `runAnalysisJob.test.ts` | 3 个 `it.skip` 测试 | Phase 5 迁移到 `twopass/*.test.ts` |
| D6 | `ChapterAnalysisService.ts:754` | `useExternalMap` 条件分支 | 保留（两种 Pipeline 都通过此服务，但注入方式不同） |


## 三、A/B 双架构全解耦设计

### 3.1 设计原则

1. **代码完全解耦**：A（顺序）和 B（两遍）的编排逻辑在独立文件中
2. **独立目录**：`sequential/` 和 `twopass/` 各自包含完整的 Pipeline 实现
3. **共享服务层**：PersonaResolver、AliasRegistryService、prompts.ts、lexicon.ts 等底层服务共享
4. **导入时选择**：用户在 Step 3 选择解析架构
5. **默认 = 顺序解析**：SequentialPipeline 为默认值

### 3.2 接口抽象

```typescript
// src/server/modules/analysis/pipelines/types.ts

export type AnalysisArchitecture = "sequential" | "twopass";

export interface AnalysisPipelineResult {
  completedChapters: number;
  failedChapters: number;
  totalPersonas: number;
}

/**
 * 统一的解析管线接口。
 * 两种架构实现此接口，由 runAnalysisJob 根据用户选择路由到对应实现。
 */
export interface AnalysisPipeline {
  readonly architecture: AnalysisArchitecture;

  /**
   * 执行完整解析流程（从 Pass 1/ROSTER 到所有章节完成）。
   * 不包含全书收尾（title resolution, gray-zone, book validation）—— 收尾逻辑共享。
   */
  run(params: PipelineRunParams): Promise<AnalysisPipelineResult>;
}

export interface PipelineRunParams {
  jobId: string;
  bookId: string;
  chapters: Array<{ id: string; no: number }>;
  prismaClient: PrismaClient;
  /** 进度回调 */
  onProgress: (progress: number, stage: string) => Promise<void>;
  /** 取消检查 */
  isCanceled: () => Promise<boolean>;
}
```

### 3.3 目录结构

```
src/server/modules/analysis/
├── config/                          # 共享配置（不变）
│   ├── pipeline.ts
│   ├── lexicon.ts
│   └── classical-names.ts
├── dto/                             # 共享 DTO（不变）
│   └── modelStrategy.ts
├── services/                        # 共享服务层（不变）
│   ├── AiCallExecutor.ts
│   ├── AliasRegistryService.ts
│   ├── BookPersonaCache.ts
│   ├── ChapterAnalysisService.ts    # 保留，两种 Pipeline 都调用
│   ├── ModelStrategyResolver.ts
│   ├── PersonaResolver.ts
│   ├── ValidationAgentService.ts
│   ├── aiClient.ts
│   ├── modelStrategyAdminService.ts
│   └── prompts.ts                   # 保留所有 prompt，按需引用
├── pipelines/                       # ★ 新增：管线抽象与实现
│   ├── types.ts                     # AnalysisPipeline 接口
│   ├── factory.ts                   # createPipeline(architecture) 工厂
│   ├── sequential/                  # ★ A 架构：按章节顺序解析
│   │   ├── SequentialPipeline.ts    # 实现 AnalysisPipeline
│   │   └── SequentialPipeline.test.ts
│   └── twopass/                     # ★ B 架构：两遍式
│       ├── TwoPassPipeline.ts       # 实现 AnalysisPipeline
│       ├── GlobalEntityResolver.ts  # 从 services/ 移入（仅 twopass 使用）
│       ├── GlobalEntityResolver.test.ts
│       └── TwoPassPipeline.test.ts
└── jobs/
    ├── runAnalysisJob.ts            # 瘦身：只做生命周期管理 + 路由到 Pipeline
    └── runAnalysisJob.test.ts       # 瘦身后的测试
```

### 3.4 关键代码流变更

#### runAnalysisJob.ts 瘦身后的核心逻辑：

```typescript
// 获取用户选择的架构（从 AnalysisJob 记录或 API 参数）
const architecture: AnalysisArchitecture = runningJob.architecture ?? "sequential";
const pipeline = createPipeline(architecture, { analyzer, prismaClient, strategyResolver });

const result = await pipeline.run({
  jobId: runningJob.id,
  bookId: runningJob.bookId,
  chapters,
  prismaClient,
  onProgress: (progress, stage) => updateBookProgressSafely(...),
  isCanceled: () => isJobCanceled(prismaClient, runningJob.id),
});

// ===== 共享收尾流程（两种架构共用）=====
await demoteOrphanPersonas(...);
await resolvePersonaTitles(...);
await runGrayZoneArbitration(...);
await runBookValidation(...);
```

#### SequentialPipeline.run() 内部：

```typescript
async run(params) {
  for each chapter (concurrency = chapterConcurrency):
    await analyzer.analyzeChapter(chapter.id, { jobId });
    // 增量称号溯源
    if (doneCount % resolveInterval === 0) await resolvePersonaTitles();
    // 风险门控 CHAPTER_VALIDATION
    if (isHighRisk(result)) await runChapterValidation();
    onProgress(...)
}
```

#### TwoPassPipeline.run() 内部：

```typescript
async run(params) {
  // Pass 1
  const entityLists = await parallelExtract(chapters);
  onProgress(35, "独立实体提取完成");

  // Pass 2
  const { globalPersonaMap } = await globalResolver.resolveGlobalEntities(...);
  onProgress(40, "全局消歧完成");

  // Pass 3
  for each chapter (concurrency):
    await analyzer.analyzeChapter(chapter.id, { externalPersonaMap: globalPersonaMap });
    onProgress(...)
}
```

### 3.5 数据模型变更

```prisma
model AnalysisJob {
  // 新增字段
  architecture String @default("sequential") // "sequential" | "twopass"
}
```

### 3.6 API 变更

```
POST /api/books/:id/analyze
{
  "scope": "FULL_BOOK",
  "architecture": "sequential",   // ← 新增，默认 "sequential"
  "modelStrategy": { ... }
}
```


## 四、导入 UI 架构选择机制

在 `/admin/books/import` Step 3 页面中：

```
┌──────────────────────────────────┐
│  解析配置                         │
│                                  │
│  解析架构：                       │
│  ○ 按章节顺序解析 (推荐)          │
│    逐章积累人物上下文，准确率高     │
│  ○ 两遍式并行解析                 │
│    先提取后消歧，速度快成本低       │
│                                  │
│  解析范围：[全书解析 ▾]            │
│                                  │
│  模型策略：[展开配置...]           │
└──────────────────────────────────┘
```

- 默认选中"按章节顺序解析"
- 选择会作为 `architecture` 字段传入 analyze API
- 重新解析时也可切换架构


## 五、迁移影响分析

### 5.1 文件变更矩阵

| 文件 | 变更类型 | 影响范围 |
|------|----------|----------|
| `runAnalysisJob.ts` | 重构（大幅瘦身） | 移除 ~120 行内联两遍代码 |
| `runAnalysisJob.test.ts` | 重构 | 移除 it.skip 测试，新增路由测试 |
| `GlobalEntityResolver.ts` | 移动 | services/ → pipelines/twopass/ |
| `GlobalEntityResolver.test.ts` | 移动 | 同上 |
| `ChapterAnalysisService.ts` | 微调 | 保留，extractChapterEntities 移至 twopass 引用 |
| `src/types/pipeline.ts` | 微调 | 移除 @deprecated 注释 |
| `pipeline.ts (config)` | 微调 | 移除 enableTwoPassArchitecture 字段 |
| `prisma/schema.prisma` | 新增字段 | AnalysisJob.architecture |
| `analyze/route.ts` | 微调 | 解析 architecture 参数 |
| `import/page.tsx` | 新增 UI | 架构选择器 RadioGroup |
| `books.ts (service)` | 微调 | StartAnalysisBody 增加 architecture |
| `model-strategy-form.tsx` | 条件隐藏 | 两遍式独有阶段仅在选择 twopass 时显示 |

### 5.2 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| SequentialPipeline 提取后行为与当前不一致 | 高 | 先写对比测试，确保输出一致 |
| GlobalEntityResolver 移动后 import 路径断裂 | 中 | tsconfig alias + 批量替换 |
| DB migration 在生产环境失败 | 低 | 字段有默认值 "sequential"，不影响现有数据 |
| 两种架构共享 ChapterAnalysisService 导致隐式耦合 | 中 | 通过接口注入而非直接 import |


## 六、Trellis 任务拆分

### Phase 1: 接口抽象与目录拆分 [P0]
- **目标**：建立 `pipelines/` 目录，定义 `AnalysisPipeline` 接口与工厂函数
- **交付**：types.ts + factory.ts + 空壳 SequentialPipeline/TwoPassPipeline
- **模块**：`src/server/modules/analysis/pipelines/`
- **依赖**：无
- **预期产出**：编译通过，接口定义清晰，工厂函数可根据 architecture 返回对应实例
- **风险**：接口设计不完整需返工

### Phase 2: 顺序解析独立实现 [P0]
- **目标**：将 runAnalysisJob.ts 中的"Legacy 章节详细分析"循环逻辑提取到 SequentialPipeline
- **交付**：SequentialPipeline.ts + 测试 + runAnalysisJob 瘦身
- **模块**：`pipelines/sequential/`
- **依赖**：Phase 1
- **预期产出**：现有全部测试通过（behavior parity），runAnalysisJob 减少 ~80 行
- **风险**：提取过程中遗漏边界逻辑

### Phase 3: 两遍式独立实现 [P1]
- **目标**：将内联两遍代码 + GlobalEntityResolver 迁移到 TwoPassPipeline
- **交付**：TwoPassPipeline.ts + GlobalEntityResolver (移动) + 测试
- **模块**：`pipelines/twopass/`
- **依赖**：Phase 1
- **预期产出**：两遍式测试从 it.skip 转为正常运行（使用新路径）
- **风险**：GlobalEntityResolver 移动后 import 断裂

### Phase 4: 导入 UI 架构选择器 [P1]
- **目标**：前端 + API + DB schema 支持用户选择解析架构
- **交付**：UI RadioGroup + API 参数 + Prisma migration + runAnalysisJob 路由
- **模块**：前端导入页 + API route + prisma schema + jobs/
- **依赖**：Phase 2 + Phase 3
- **预期产出**：用户可在导入时选择架构，默认顺序解析
- **风险**：DB migration 需 review

### Phase 5: 废弃清理 [P2]
- **目标**：移除所有临时开关、废弃标记、内联残留代码
- **交付**：清理 enableTwoPassArchitecture、@deprecated、it.skip、useTwoPass
- **模块**：全链路
- **依赖**：Phase 4
- **预期产出**：零废弃标记，零 it.skip，代码库干净
- **风险**：遗漏某处引用


## 七、优先执行顺序

```
Phase 1 (P0) ─────→ Phase 2 (P0) ─────→ Phase 4 (P1)
    │                                        ↑
    └──────→ Phase 3 (P1) ──────────────────┘
                                              │
                                              └──→ Phase 5 (P2)
```

Phase 2 和 Phase 3 可并行开发（都只依赖 Phase 1 的接口定义）。
Phase 4 需要两者都完成后才能集成。
Phase 5 最后执行，确保所有功能就绪后再清理。
