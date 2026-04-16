# refactor: 移除硬编码 Prompt fallback，统一走 DB 模板

## Goal

消除分析管线中 Prompt 的"双轨"机制——当前运行时既有 DB 模板路径又有硬编码 fallback 路径，导致维护负担和漂移风险。重构后，所有 Prompt 统一从数据库读取，DB 无数据时直接报错，不再静默回退到硬编码版本。

## What I already know

### 当前架构

- `src/server/modules/analysis/services/prompts.ts` 有 **8 个硬编码 prompt builder** 函数
- `src/server/modules/knowledge/prompt-template-baselines.ts` 有对应的 **8 套 DB baseline** 种子数据
- `src/server/modules/knowledge/prompt-templates.ts` 中 `resolvePromptTemplateOrFallback()` 实现三层回退：
  1. 测试环境 (`NODE_ENV=test`) → 直接返回 hardcoded fallback，不查 DB
  2. DB 查询成功且有版本 → 用 DB 模板
  3. DB 查询失败或无版本 → 静默 fallback 到硬编码

### 调用路径

**路径 A — 有 jobId（正式分析任务，8 处）：**
- `ChapterAnalysisService.ts` 中 5 处 `*ByStage` 方法的 `if (input.stageContext.jobId)` 分支
- `GlobalEntityResolver.ts` 中 1 处 `ENTITY_RESOLUTION`
- `ValidationAgentService.ts` 中 2 处 `CHAPTER_VALIDATION` / `BOOK_VALIDATION`
- 这些都先 `buildXxxPrompt()` 构造 fallback，再 `resolvePromptTemplateOrFallback({ fallback })` 尝试 DB

**路径 B — 无 jobId（旧兼容路径，5 处）：**
- `ChapterAnalysisService.ts` 中 5 处 `if (!input.stageContext.jobId)` 分支
- 直接通过 `aiClient.ts` 中的 `createChapterAnalysisAiClient()` 调用 `buildXxxPrompt()`
- **完全绕过 DB**，直接使用硬编码 prompt

**路径 C — 测试环境：**
- `shouldBypassRuntimePromptLookup()` 在 `NODE_ENV=test` 时返回 `true`
- 所有测试 mock 了 `resolvePromptTemplateOrFallback` 直接返回 fallback

### 受影响的 8 个 Prompt Slug

| Slug | Builder 函数 | 调用位置 |
|------|-------------|---------|
| `ROSTER_DISCOVERY` | `buildRosterDiscoveryPrompt` | ChapterAnalysisService + aiClient |
| `CHAPTER_ANALYSIS` | `buildChapterAnalysisPrompt` | ChapterAnalysisService + aiClient |
| `INDEPENDENT_EXTRACTION` | `buildIndependentExtractionPrompt` | ChapterAnalysisService |
| `ENTITY_RESOLUTION` | `buildEntityResolutionPrompt` | GlobalEntityResolver |
| `TITLE_RESOLUTION` | `buildTitleResolutionPrompt` | ChapterAnalysisService + aiClient |
| `TITLE_ARBITRATION` | `buildTitleArbitrationPrompt` | ChapterAnalysisService + aiClient |
| `CHAPTER_VALIDATION` | `buildChapterValidationPrompt` | ValidationAgentService |
| `BOOK_VALIDATION` | `buildBookValidationPrompt` | ValidationAgentService |

### 种子数据已就位

种子脚本 (`prisma/seed.ts` → `prompt-template-baselines.ts`) 已经将 8 套 baseline 写入 `prompt_templates` + `prompt_template_versions` 表。用户已确认重新跑过种子数据，DB 中数据完整。

## Requirements

### R1: 移除 `resolvePromptTemplateOrFallback` 的 fallback 机制

- 将 `resolvePromptTemplateOrFallback` 重命名/重构为 `resolvePromptTemplate`
- **移除** `fallback` 参数
- DB 查不到模板时 → **抛出明确错误**（如 `Error: Prompt template "${slug}" not found in database`）
- DB 查询异常时 → **抛出错误**，不静默吞掉
- **移除** `shouldBypassRuntimePromptLookup()` 测试环境绕过逻辑

### R2: 移除 `prompts.ts` 中的 8 个 prompt builder 函数

需要删除的函数：
- `buildRosterDiscoveryPrompt`
- `buildChapterAnalysisPrompt`
- `buildIndependentExtractionPrompt`
- `buildEntityResolutionPrompt`
- `buildTitleResolutionPrompt`
- `buildTitleArbitrationPrompt`
- `buildChapterValidationPrompt`
- `buildBookValidationPrompt`

同时删除相关的辅助函数（仅被上述 builder 使用的）：
- `buildEntityContextLines`
- `buildRosterDiscoveryRulesText`
- `buildChapterAnalysisRulesText`
- `buildIndependentExtractionRulesText`

**保留** `prompts.ts` 中不属于 prompt builder 的内容：
- 所有 `interface` / `type` 定义（`BuildPromptInput`, `RosterDiscoveryInput` 等）— 仍被 replacements 构造逻辑使用
- `parseValidationResponse` 函数 — 用于解析 AI 返回结果，与 prompt 构造无关
- `VALIDATION_ISSUE_TYPES` / `VALIDATION_SEVERITIES` / `VALIDATION_ACTIONS` 枚举常量 — 用于解析逻辑

### R3: 重构所有调用站点

**路径 A（有 jobId，8 处）：**
- 移除 `buildXxxPrompt()` 调用
- 直接调用新的 `resolvePromptTemplate({ slug, replacements })`
- replacements 构造逻辑保留在调用点（已有现成代码）

**路径 B（无 jobId，5 处 + aiClient.ts）：**
- `aiClient.ts` 中的 `createChapterAnalysisAiClient` 也改为走 DB 模板
- 方案：`createChapterAnalysisAiClient` 接口方法签名保持不变，但内部改为接收 `resolvePromptTemplate` 函数注入（或直接调用）
- 或者更简单：**如果无 jobId 路径已不再使用**，考虑直接移除该分支

### R4: 更新测试

- 移除 `prompts.test.ts` 中针对 8 个 builder 函数的单测（或转为对 DB baseline 内容的集成测试）
- 更新 `ChapterAnalysisService.test.ts`、`ValidationAgentService.test.ts`、`GlobalEntityResolver.test.ts` 中的 mock
  - 不再 mock `resolvePromptTemplateOrFallback` 为返回 fallback
  - 改为 mock 新的 `resolvePromptTemplate` 返回 DB 模板结构
- `prompt-templates.test.ts` 更新测试用例，验证无模板时抛错行为

### R5: 保留 prompt-template-baselines.ts

- `prompt-template-baselines.ts` 作为种子数据源保留，不受影响
- 它只在 `prisma/seed.ts` 中被导入，用于初始化 DB 数据

## Acceptance Criteria

- [ ] `resolvePromptTemplateOrFallback` 被替换为 `resolvePromptTemplate`，无 fallback 参数
- [ ] DB 中模板不存在时，抛出包含 slug 名称的明确错误
- [ ] DB 查询异常时，错误向上传播，不静默吞掉
- [ ] `prompts.ts` 中 8 个 `build*Prompt` 函数及其专属辅助函数被移除
- [ ] `prompts.ts` 保留类型定义和 `parseValidationResponse`
- [ ] `ChapterAnalysisService` 中 8 处调用点全部改为直接使用 `resolvePromptTemplate`
- [ ] `GlobalEntityResolver` 中 1 处调用点改为直接使用 `resolvePromptTemplate`
- [ ] `ValidationAgentService` 中 2 处调用点改为直接使用 `resolvePromptTemplate`
- [ ] `aiClient.ts` 的 `createChapterAnalysisAiClient` 不再直接调用硬编码 prompt builder
- [ ] 测试环境不再绕过 DB 查询（移除 `shouldBypassRuntimePromptLookup`）
- [ ] 所有现有测试更新并通过
- [ ] TypeScript 编译无错误
- [ ] `prompt-template-baselines.ts` 保持不变

## Definition of Done

- Tests added/updated (unit where appropriate)
- Lint / typecheck / CI green
- 无运行时 fallback 路径残留

## Out of Scope

- `pipeline.ts` 中的管线阈值参数 DB 化 — 另案处理
- `data/knowledge-base/*.json` 种子文件清理 — 种子源保留合理
- 知识生成工具的 prompt（`generateSurnames.ts` 等）— 管理后台工具，非分析链路
- Prompt 模板的 UI 编辑/版本管理功能改进
- `prompt-template-metadata.ts` UI 元数据 — 属于前端展示，合理在代码中

## Technical Approach

### 阶段 1: 重构 `prompt-templates.ts`

```
resolvePromptTemplateOrFallback({ slug, replacements, fallback })
↓ 变为
resolvePromptTemplate({ slug, bookTypeId?, replacements })
```

- 删除 `fallback` 参数
- 删除 `shouldBypassRuntimePromptLookup()`
- `findRuntimePromptVersion` 返回 null 时 → `throw new Error(...)`
- catch 块不再吞异常 → 让错误冒泡

### 阶段 2: 重构调用站点（有 jobId 路径）

每个 `*ByStage` 函数中：
- 删除 `const fallbackPrompt = buildXxxPrompt(input);`
- `resolvePromptTemplate({ slug: "XXX", replacements: { ... } })` 直接获取 prompt
- replacements 构造代码**已经存在**于当前代码中，只需移除外层 fallback 包装

### 阶段 3: 重构 `aiClient.ts`（无 jobId 路径）

两种方案：

**方案 A（推荐 — 最简单）**：让 `createChapterAnalysisAiClient` 也注入 `resolvePromptTemplate`
- 工厂函数签名改为 `createChapterAnalysisAiClient(providerClient, promptResolver)`
- 每个方法内部调用 `promptResolver({ slug, replacements })` 获取 prompt
- 调用方（`getRuntimeAiClient`）传入 `resolvePromptTemplate`

**方案 B**：移除无 jobId 路径
- 如果无 jobId 场景已不再使用，直接删除 `!jobId` 分支代码
- 简化 `*ByStage` 函数，去掉分支判断

→ 需确认：无 jobId 路径是否仍在使用？如果仅测试用，方案 A 更安全。

### 阶段 4: 更新测试

- `prompts.test.ts`：删除 8 个 builder 的测试用例，保留 `parseValidationResponse` 测试
- 各 service test：mock `resolvePromptTemplate` 返回 `{ system, user }` 结构
- `prompt-templates.test.ts`：新增"无模板时抛错"测试用例

### 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/server/modules/knowledge/prompt-templates.ts` | **重构** | 移除 fallback 机制，新增 `resolvePromptTemplate` |
| `src/server/modules/analysis/services/prompts.ts` | **大幅删减** | 删除 8 个 builder + 辅助函数，保留类型和解析器 |
| `src/server/modules/analysis/services/aiClient.ts` | **重构** | 注入 prompt resolver 或移除硬编码路径 |
| `src/server/modules/analysis/services/ChapterAnalysisService.ts` | **重构** | 8 处调用点改用 `resolvePromptTemplate` |
| `src/server/modules/analysis/pipelines/twopass/GlobalEntityResolver.ts` | **重构** | 1 处调用点 |
| `src/server/modules/analysis/services/ValidationAgentService.ts` | **重构** | 2 处调用点 |
| `src/server/modules/analysis/services/prompts.test.ts` | **删减** | 删除 builder 测试 |
| `src/server/modules/analysis/services/ChapterAnalysisService.test.ts` | **更新** | 更新 mock |
| `src/server/modules/analysis/services/ValidationAgentService.test.ts` | **更新** | 更新 mock |
| `src/server/modules/analysis/pipelines/twopass/GlobalEntityResolver.test.ts` | **更新** | 更新 mock |
| `src/server/modules/knowledge/prompt-templates.test.ts` | **更新** | 新增抛错测试 |

## Technical Notes

### 关键约束

- `prompts.ts` 中的 `interface` 类型（如 `BuildPromptInput`）被 `aiClient.ts` 和调用方广泛使用，**必须保留**
- `parseValidationResponse` 用于解析 AI 返回的校验结果，与 prompt 构造无关，**必须保留**
- DB baseline 种子数据中的占位符（`{bookTitle}` 等）与当前 replacements 构造逻辑一致，无需额外适配
- `formatRulesSection` 在 `lexicon.ts` 中，被 replacements 构造逻辑使用，保留不变

### replacements 构造

当前每个 `*ByStage` 函数已有完整的 `replacements` 对象构造代码。重构时只需：
1. 移除 `const fallbackPrompt = buildXxxPrompt(input);`
2. 将 `resolvePromptTemplateOrFallback({ ..., fallback: fallbackPrompt })` 改为 `resolvePromptTemplate({ slug, replacements })`

replacements 代码已存在，零新增逻辑。

### 参考文件

- 种子数据: `src/server/modules/knowledge/prompt-template-baselines.ts`
- DB schema: `prisma/schema.prisma` L733-L785 (`PromptTemplate` + `PromptTemplateVersion`)
- 运行时知识加载: `src/server/modules/knowledge/load-book-knowledge.ts`
