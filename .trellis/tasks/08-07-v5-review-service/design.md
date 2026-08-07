# 技术设计：Pass4 审核流 service

> 文档基线：`docs/architecture/13-agent-architecture-v5.md` §7
> 父任务调研：`08-06-v5-review/research/role-workbench-audit.md` §5

## 0. 设计原则

- **审核量 = 真实歧义量**：默认接受 + 人工只看异常。自动接受依赖**可验证客观信号**（证据锚定/登记表 HIGH/提及数/扫描干净/校验通过），不靠模型自报置信度。
- **校验只检测，修复走人审/非破坏自动**：不做模型自修复闭环。
- **跨模型换模型 = 显式传 modelId**：feature_models 已删，不建映射表；跨模型复核由调用方指定模型。

## 1. 新增能力：跨模型换模型（前置缺口）

### 1.1 `models/defaultModel.ts` 新增 `loadModelById`

```ts
/** 按 id 解析可执行模型（含解密密钥）；不存在/停用/缺 Key 时抛 DefaultModelError。 */
export async function loadModelById(
  modelId: string,
  prismaClient: PrismaClient = prisma
): Promise<ResolvedFeatureModel>
```

复用现有 `runtimeModelSelect` + `toResolvedFeatureModel`（defaultModel.ts:90 已通用）。校验：模型存在、`isEnabled`、API Key 可解密。

### 1.2 `AiCallExecutor.execute` 支持 modelId 覆盖

`ExecuteAiCallInput` 加可选 `modelId?: string`：

```ts
export interface ExecuteAiCallInput<TData> {
  stage      : string;
  prompt     : PromptMessageInput;
  jobId      : string;
  modelId?   : string;          // 覆盖默认模型（跨模型复核用）；缺省=系统默认
  chapterId? : string | null;
  chunkIndex?: number | null;
  callFn     : ...;
}
```

`execute` 内部：
```ts
const model = input.modelId
  ? await loadModelById(input.modelId, prismaClient)
  : await loadSystemDefaultModel(prismaClient);
```

`modelSource` 写日志：`modelId` 存在时写 `"CROSS_MODEL"`（区别于 SYSTEM_DEFAULT），供成本/审计区分。

### 1.3 `identity/llm.ts` 新增跨模型入口

`callIdentityLlm` 加 `modelId?` 参数（透传给 execute），或新增 `callIdentityLlmWithModel(modelId, input)`。复用现有 `callJsonLlm`（已统一生成 JSON 调用）。

## 2. 审核流 service（`src/server/modules/review/`）

### 2.1 模块结构

```
review/
├── index.ts          // barrel 导出
├── autoAccept.ts     // R1 自动接受栈
├── reviewQueue.ts    // R2 人审队列
├── ratchet.ts        // R3 棘轮校准
├── hallucinationSample.ts // R4 关系级幻觉定向抽样
├── crossModel.ts     // R5 跨模型复核接口
├── config.ts         // 棘轮/抽样阈值常量（初始保守）
└── errors.ts         // ReviewError 族
```

### 2.2 自动接受栈（autoAccept.ts）

`acceptFactsForJob(jobId)` 主入口，对 job 的 DRAFT facts 逐条判定五条件：

| 条件 | 实现 | 复用 |
|---|---|---|
| ① 证据锚定 | fact 所有名字在本章正文可证 | `runGuardrails` 的 `isNameInText`（guardrails.ts:46） |
| ② 实体登记表 HIGH | fact 涉及的 source/target 实体在登记表 HIGH | `getRegistry` + `ConfidenceTier.HIGH`（registry.ts:90） |
| ③ 提及数 ≥2 | fact 相关实体 mention 数 ≥2 | `prisma.mention.count`（按实体+书聚合） |
| ④ 冲突扫描干净 | 实体无误归属冲突 | `conflictScan`（identity/conflictScan.ts） |
| ⑤ 确定性校验 | 关系码在 skill 契约闭集 + 方向正确 + 不与已有 fact 冲突 | `relationshipCodesFromSnapshot` + `runGuardrails` |

五条件全过 → `fact.update({ status: VERIFIED, recordSource: AUTO_VERIFIED, reviewedAt, reviewedBy })`。
未过 → 保留 DRAFT，按条件归类进人审队列。

**跨片一致只加分不免审**：不做"多片一致→免审"逻辑（同模型错误相关）。

### 2.3 人审队列（reviewQueue.ts）

`listReviewQueue(bookId, filters)` 返回异常类型事实。队列来源：
- 自动接受未过（按缺失条件分类：冲突/低置信新实体/TITLE_ONLY 泛称/校验失败）
- 跨片冲突（同一关系被提取为不同类型）
- 关系级幻觉定向抽样样本
- 棘轮回查抽样

**MERGE/SPLIT 一律人审**：merge 接受路径走 `mergeEntitiesInTransaction`（由 role-workbench-backend 子任务交付），本任务只把人审队列的 merge 建议列出，不做自动。

### 2.4 棘轮校准（ratchet.ts）

`calibrateAutoAccept(sample)`：对自动接受的样本抽样人工回查，度量准确率：
- 准确率 > 阈值 → 放宽（提高置信下限 / 减少抽样）
- 准确率 < 阈值 → 收紧（更多类型进人审）

状态落 `review/config.ts` 的常量（初始保守）。当前为纯函数 + 单测；持久化状态留 v5-pipeline 接入（或本任务简单存 DB）。

### 2.5 关系级幻觉定向抽样（hallucinationSample.ts）

`sampleRelationHallucination(bookId)`：定向抽样
- 双方实体真实但证据单薄的关系边（evidence 短 / mention 少）
- 新实体率高的分片

→ 返回样本进跨模型复核 / 人审。

### 2.6 跨模型复核接口（crossModel.ts）

`crossModelReview(input)`：对定向风险类（同名簇/多候选 TITLE_ONLY/跨卷边界/幻觉样本）复用身份判定原语，**显式传 modelId 换模型**：
```ts
await callIdentityLlmWithModel(modelId, { ...原语 prompt })
```
复用 `runPrimitive` 的判定逻辑（PrimitiveVerdict: resolved/new_entity/ambiguous）。

## 3. 关键边界

| 场景 | 处理 |
|---|---|
| 自动接受未过但非异常 | 保留 DRAFT（不删除），进人审队列 |
| 跨模型复核结果 | 通过 → 可自动；仍歧义 → 人审 |
| 模型 id 不存在/停用 | `loadModelById` 抛 DefaultModelError，调用方处理 |
| 棘轮阈值 | 初始保守（默认多审），纯函数单测覆盖 |
| 管线编排 | 本任务不实现 runAnalysisJob 的 Pass4 调用，只交付 service + 单测 |

## 4. 风险与对策

- **自动接受栈依赖管线数据**（登记表/facts DRAFT）：单测 mock 数据，不依赖真实管线。
- **跨模型能力改动 AiCallExecutor**：向后兼容（modelId 可选，缺省=默认模型），现有调用不受影响。
- **merge 事务由兄弟任务交付**：本任务人审队列的 merge 建议只读列出，接受动作依赖 role-workbench-backend。
- **行覆盖 ≥90%**：review 模块是主战场，逐条件单测。

## 5. 文档同步

- `docs/architecture/13-agent-architecture-v5.md`：§7 已在 v5.3 存在，本任务实现后如有差异微调（版本 v5.4 已在 cost-kb-cleanup 更新，不重复 bump）。
