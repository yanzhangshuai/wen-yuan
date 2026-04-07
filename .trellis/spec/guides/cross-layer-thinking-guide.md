---
stage: mvp
---

# 跨层思考指南

> **目的**：在实现前先梳理跨层数据流，减少边界问题。

---

## 问题本质

**大多数 bug 出现在层边界，而不是层内部。**

常见跨层问题：
- API 返回格式 A，frontend 期望格式 B
- Database 存储 X，service 转成 Y 时丢失数据
- 多层对同一逻辑各自实现，行为不一致

---

## 实现跨层功能前

### 第一步：画清数据流

先画出数据如何流转：

```
Source → Transform → Store → Retrieve → Transform → Display
```

对每个箭头都问：
- 数据当前是什么格式？
- 可能出什么问题？
- 校验责任归属哪一层？

### 第二步：识别边界

| 边界 | 常见问题 |
|----------|---------------|
| API ↔ Service | 类型不匹配、字段缺失 |
| Service ↔ Database | 格式转换、null 处理 |
| Backend ↔ Frontend | 序列化、日期格式 |
| Component ↔ Component | Props 结构变化 |

### 第三步：定义契约

对每个边界明确：
- 精确输入格式是什么？
- 精确输出格式是什么？
- 可能抛出哪些错误？

---

## 常见跨层错误

### 错误 1：隐式格式假设

**反例**：默认日期格式正确，不做确认

**正例**：在边界处做显式格式转换

### 错误 2：校验分散

**反例**：同一校验在多层重复实现

**正例**：在入口点校验一次，并向下传递已验证数据

### 错误 3：抽象泄漏

**反例**：Component 直接感知 database schema

**正例**：每层只依赖相邻层契约

代码示例：
```ts
// 反例：frontend 直接感知 DB 字段
type UserRow = { user_name: string; created_at: string };

// 正例：在 service 层转换，再向前端暴露契约
type UserView = { name: string; createdAt: string };
```

原因：
- 边界转换集中在 service 层，可避免 schema 变更直接击穿 UI。
- 契约稳定后，跨层协作时变更影响面更可控。

### 错误 4：浏览器解析语义与 React Hydration 语义不一致

**反例**：`Link` 包 `Button`（实际渲染为 `<a><button /></a>`）

**正例**：使用 `Button asChild`，让 `Link` 成为最终交互节点

```tsx
// 反例
<Link href="/admin">
  <Button>进入</Button>
</Link>

// 正例
<Button asChild>
  <Link href="/admin">进入</Link>
</Button>
```

原因：
- 这是“浏览器 HTML 解析层”与“React 客户端 hydration 层”的跨层契约问题。
- 浏览器会修正无效嵌套，导致 SSR HTML 与客户端首帧树不一致。
- 报错位置常在后续兄弟节点，不一定在真实根因位置，排障时需先检查上游 DOM 合法性。

### 错误 5：服务端首帧与浏览器本地状态契约不一致

**反例**：首帧直接用 `theme`/`localStorage` 决定 `aria-pressed`、`className`

**正例**：使用 mounted 门控，保证 SSR 和客户端首帧同值，再在挂载后应用本地状态

```tsx
// 反例
const { theme } = useTheme();
<button aria-pressed={theme === "suya"} />

// 正例
const { theme } = useTheme();
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
const selectedTheme = mounted ? theme : null;
<button aria-pressed={selectedTheme === "suya"} />
```

原因：
- 这是“服务端渲染层（无浏览器上下文）”与“客户端状态层（有本地持久化）”的契约缺口。
- 该类 warning 常为“属性不一致且不会被自动修补”，会长期污染控制台并掩盖真实问题。

### 错误 5.1：把服务端 Promise 直接透传给 Client Component 并在客户端 `use()`，导致 Hydration/Suspense 边界不稳定

**反例**：页面层创建 `modelsPromise`，通过 props 传给 client 组件，再在 client 内 `use(modelsPromise)`，外层再包一层 `Suspense`。

**正例**：在 Server Component（`page.tsx`）先 `await` 数据，传递普通可序列化数据给 client 组件。

```tsx
// 反例（page.tsx）
const modelsPromise = listAdminModels();
<Suspense fallback={<Skeleton />}>
  <ModelManager initialModelsPromise={modelsPromise} />
</Suspense>

// 正例（page.tsx）
const initialModels = await listAdminModels();
<ModelManager initialModels={initialModels} />
```

原因：
- 这是“RSC 数据边界”与“客户端 hydration 边界”的契约问题。
- 当 Promise 解析时机与流式边界切换不稳定时，容易出现 `main`/`Suspense` 首帧树不一致。
- 对首屏必需数据，优先在 server `await` 后下发稳定快照；客户端组件只做交互与局部增量请求。

### 错误 6：前端展示指标与后端运行时数据契约脱节

**反例**：前端用静态评分表（hardcode）展示“速度/评分/费用”，后端已经有运行日志却未接入。

**正例**：后端输出统一 `performance snapshot`，前端只消费该契约，不再维护静态评分副本。

```ts
// 反例：UI 本地静态映射
const MODEL_RATINGS = { "gpt-4o": { speed: 3, cost: 3 } };

// 正例：后端契约（示意）
type PerformanceSnapshot = {
  callCount: number;
  successRate: number | null;
  ratings: { speed: number; stability: number; cost: number };
};
```

原因：
- 这是“分析日志层”→“模型服务层”→“前端展示层”的三层契约问题。
- 静态映射与真实运行时数据分叉后，UI 会长期显示过期信息，误导运营判断。
- 契约应明确 null 语义（无样本时为 null/0）和评分来源（由后端计算并下发）。

### 错误 6.1：模型评分口径未声明“相对分”与“样本语义”

**反例**：把 5 分当成“绝对快/绝对便宜”，或把 0 分误解为“最差模型”。

**正例**：在跨层契约里明确评分公式与边界语义（后端统一计算，前端只展示）。

```ts
// speed: 延迟越低分越高（相对当前模型集合）
speed = avgLatencyMs === null
  ? 0
  : toInverseRangeRating(avgLatencyMs, latencyMin, latencyMax);

// stability: 成功率线性映射到 1~5
stability = successRate === null
  ? 0
  : clamp(successRate * 4 + 1);

// cost: token 越少分越高（相对当前模型集合）
cost = avgTotalTokens === null
  ? 0
  : toInverseRangeRating(avgTotalTokens, tokenMin, tokenMax);
```

关键语义（必须写入文档并在 UI 提示中体现）：
- `0` 分 = 当前无样本（`callCount=0` 或无成功调用均值），不是“性能最差”。
- `1~5` 是相对分，由当前模型集合的 min/max 归一化得到，不是跨时间、跨环境可直接比较的绝对分。
- 当 `max=min`（样本方差为 0）时，反向归一化退化为中位分 `3`，避免误导性极值。
- 评分输入来自 `analysis_phase_log` 聚合，新增日志会改变 min/max，分数会随运行数据动态变化。

原因：
- 这是“分析日志层”→“评分计算层”→“前端展示层”的跨层契约清晰度问题。
- 如果不显式声明“相对分/无样本”语义，业务方会把运营看板读成错误结论，导致错误决策。

### 错误 7：HTTP 成功与业务成功语义混淆

**反例**：路由层统一返回 `200 + { success: true, data }`，前端仅根据 HTTP/外层 `success` 就弹“测试成功”。

**正例**：明确两层语义：
- 传输层：HTTP/外层 `success` 仅代表“接口调用成功”；
- 业务层：`data.success` 才代表“模型连通性成功”。

```ts
// 反例
const result = await testModel(id);
toast.success("测试成功");

// 正例
const result = await testModel(id);
if (result.success) toast.success("测试成功");
else toast.error(result.errorMessage ?? result.detail);
```

原因：
- 这是“API 包装层契约”与“业务结果契约”的跨层分层问题。
- 如果不区分语义层，任何业务失败都可能被 UI 误报为成功。

### 错误 8：连通性探针仅看 HTTP 状态，未做语义校验

**反例**：第三方返回 HTTP 200，但 body 内含 `error` 或缺少 `choices`，仍认定探活成功。

**正例**：对 OpenAI-compatible provider 增加“最小语义契约”校验：
- body 不含 `error`；
- 存在 `choices[0].message.content`（或等价可读文本）。

原因：
- 这是“供应商协议层”与“平台探针层”的契约缺口。
- 仅看状态码会漏掉鉴权失败、模型不可用、协议不兼容等软失败。

### 错误 9：模型可选参数在策略层配置了，但调用层未透传

**反例**：策略里有 `enableThinking/reasoningEffort`，但执行阶段 `toGenerateOptions` 或 provider 请求体丢失字段。

**正例**：建立“策略 DTO → resolver params → service generate options → provider payload”的全链路透传，并加单测锁定。

原因：
- 这是典型的“变更传播失败（C）+ 跨层契约（B）”叠加问题。
- 参数链路中任何一层漏传，功能都会“配置看似生效、运行实际无效”。

### 错误 10：把“通用参数名”误当成“跨 provider 通用协议”

**反例**：所有模型统一发送 `enable_thinking` / `reasoning_effort`，假设各厂商都兼容。

**正例**：引入 provider 参数能力矩阵，并在 provider 层做映射或降级：
- DeepSeek：`thinking: { type: "enabled" | "disabled" }`
- OpenAI-compatible（如 Qwen）：按兼容参数发送（并关注厂商文档是否忽略/限制）
- 不支持的 provider：显式忽略并记录日志（或在配置层禁用）

原因：
- 这是“平台策略参数层”与“厂商协议层”的契约错位。
- 统一抽象只能统一语义，不能假设底层字段名和行为也统一。
- 若无能力矩阵，最常见后果是“配置成功但运行无效”或“仅部分模型报错”。

### 错误 11：推荐模型匹配规则写在 UI，导致默认推荐语义漂移

**反例**：推荐默认在 UI 里按 `provider/modelId` 写硬编码判断，或者配置侧允许多套命中规则并在页面拼接。

**正例**：推荐默认只使用 `aliasKey`。由 `model-recommendations` 统一解析并提供匹配函数；UI 仅消费统一 helper。

```ts
// 反例：UI 私有兼容逻辑
if (provider === "deepseek") return DEEPSEEK_IDS.has(modelId);

// 正例：配置驱动 + 统一库函数
pickRecommendedEnabledModel(recommendation, availableModels);
isRecommendedModelMatch(recommendation, model);
```

原因：
- 这是“推荐配置层”→“解析库层”→“页面展示层”的跨层契约分裂。
- `aliasKey` 才是推荐语义键；`providerModelId` 是供应商协议字段，不应用于默认推荐命中。
- 推荐命中规则必须在单一模块集中实现，禁止在页面组件写 provider 特判。

### 错误 12：把“阶段策略主键”和“推荐默认键”混为一谈，导致 UI 与执行链路判断不一致

**反例**：
- 阶段策略（可执行配置）与推荐默认（运维建议）都用同一种键，或在推荐匹配时回退到 `providerModelId`。
- 结果是“推荐显示命中”，但实际并非该 alias 对应的模型实体。

**正例**：统一跨层标识职责（双轨但不混用）：
- 阶段策略层（DTO/API/前端表单/Resolver）只传并解析 `modelId(UUID)`。
- 推荐默认层（`model-recommendations.v1.json`）只传 `stageDefaults.*.aliasKey`。
- 推荐命中规则按 `aliasKey` 判断；`providerModelId` 只保留在 alias 元数据中用于展示/运维说明。
- 运行层（provider 调用）只使用模型实体里的 `provider + modelId`（供应商协议字段）。

```ts
// 阶段策略：可执行主键
stages: { CHUNK_EXTRACTION: { modelId: "11111111-1111-4111-8111-111111111111" } }

// 推荐默认：语义别名
stageDefaults: { CHUNK_EXTRACTION: { aliasKey: "deepseek-v3-stable" } }
```

原因：
- 这是“策略执行层”与“推荐展示层”的契约边界问题。
- `modelId(UUID)` 适合稳定引用具体模型实体；`aliasKey` 适合表达“默认推荐语义”。
- 若推荐再回退到 `providerModelId`，会把“供应商协议字段”误当业务语义键，导致默认判定漂移。

### 错误 13：模型状态排序规则分散在页面渲染里，导致展示顺序与业务状态契约漂移

**反例**：只按 `isDefault` 排序，启用/未启用/未配置混排；或在多个组件各自实现排序分支。

**正例**：把排序规则集中为单一 helper（示意）：
- `0`: 默认模型
- `1`: 启用模型
- `2`: 未启用但已配置
- `3`: 未配置

并在页面中统一调用该 helper，避免重复实现。

```ts
function resolveSortBucket(model: AdminModelItem, draft?: ModelDraftState) {
  if (model.isDefault) return 0;
  if (draft?.isEnabled ?? model.isEnabled) return 1;
  if (model.isConfigured || Boolean(draft?.apiKey.trim())) return 2;
  return 3;
}
```

原因：
- 这是“模型状态语义层”→“管理台展示层”的跨层契约问题。
- 排序规则如果散落在 JSX 条件分支中，新增状态（例如“未配置”）时很容易漏改，导致 UI 与运营认知不一致。
- 规则集中后可复用、可测试，并能稳定支持二级排序（如 `name`）以减少列表抖动。

### 错误 14：高密度设置页没有按任务流分区，导致“配置”与“策略”操作互相干扰

**反例**：模型配置、默认模型、解析策略全部在同一长页面连续堆叠，用户很难聚焦当前任务。

**正例**：按任务流切成清晰的 Tab 边界：
- Tab A：模型配置 + 默认模型（偏资源与接入管理）
- Tab B：解析策略（偏业务策略编排）

原因：
- 这是“信息架构层”与“交互任务层”的契约问题。
- 当页面同时承载“接入配置”和“策略编排”两类任务时，不分区会放大误操作概率，也增加回归测试范围。
- 使用稳定 Tab 边界能把状态变更影响面收敛到当前上下文，提高可维护性。

### 错误 15：复用同一状态值承载“未开始”和“待复核”两种语义，导致书级与章级状态冲突

**反例**：
- 章节已解析但需人工复核时，仍写入 `PENDING`；
- 书级状态显示 `COMPLETED`（100%），章节却展示“等待中”，形成“完成但未开始”的矛盾。

**正例**：
- 为“已解析但需人工复核”定义独立状态（如 `REVIEW_PENDING`）；
- 保持跨层一致传播：`job runner` 写入状态、`status service` 返回状态、UI 文案与可操作按钮同步支持；
- 对历史数据提供兼容映射（如按最近成功任务范围将遗留 `PENDING` 映射为 `REVIEW_PENDING`）。

```ts
// 反例：同一个状态承载两种语义
parseStatus = needsReview ? "PENDING" : "SUCCEEDED";

// 正例：语义拆分
parseStatus = needsReview ? "REVIEW_PENDING" : "SUCCEEDED";
```

原因：
- 这是“任务执行层”→“状态查询层”→“前端展示层”的跨层契约歧义。
- 状态枚举一旦承载多重语义，任何一层都会按自己的理解渲染，最终出现互相矛盾的状态展示。
- 修复必须覆盖全链路，并显式定义历史数据迁移/兼容策略，否则线上旧数据会持续误导用户。

### 错误 16：把“任务临时策略（JOB）”当成“书籍常驻策略（BOOK）”展示，导致“详情未设置但运行已生效”

**反例**：
- 导入页在“启动解析”时传入阶段模型策略，后端按 `scope=JOB` 落库（任务级覆盖）。
- 书籍详情页“模型策略”面板只读取 `scope=BOOK` 接口，结果显示“未设置”。
- 用户据此误判“导入时每阶段模型没有生效”。

**正例**：
- 明确并文档化三类策略语义：`JOB=本次任务临时覆盖`，`BOOK=该书后续任务默认`，`GLOBAL=全局默认`。
- UI 分开展示“书籍级配置”与“最近任务覆盖（可选）”，或在导入流程显式提供“同时保存为书籍策略”选项。
- 路由/服务层对外返回时附带 `scope` 语义，避免前端把不同作用域当成同一概念。

```ts
// 任务启动：仅写 JOB（单次生效）
await modelStrategyConfig.create({
  data: { scope: "JOB", jobId, stages }
});

// 详情页面板：仅读 BOOK（长期配置）
GET /api/admin/books/:id/model-strategy
```

原因：
- 这是“导入向导层”→“任务创建层”→“策略管理展示层”的跨层契约错位。
- 运行时解析器按 `JOB > BOOK > GLOBAL > SYSTEM_DEFAULT` 生效，因此任务可正确使用导入时模型，但 BOOK 面板仍可能为空。
- 若不显式区分“写入作用域”与“展示作用域”，就会持续出现“看起来未配置、实际已生效”的认知冲突。

### 错误 17：别名“审核状态”与“解析消费状态”绑定在同一字段，导致同一人物被拆成多个 persona

**反例**：
- Phase 1 已抽取到高置信别名线索（如“马二先生”→“马纯上”），但因为置信度未达人工确认阈值，只写入 `PENDING`。
- Resolver 查询别名时仅消费 `CONFIRMED/LLM_INFERRED`，`PENDING` 不参与命中。
- 跨章节再次出现该称谓时，系统走“相似度/新建”路径，最终产生重复人物。

**正例**：
- 拆分两条语义，不再复用一个字段承载两种职责：
  - `reviewStatus`：`PENDING/CONFIRMED/REJECTED`（给审核台）
  - `resolverStatus`：`ACTIVE/BLOCKED`（给解析器）
- 对“有已知 persona + 高置信 + 有上下文证据”的别名，可设置 `reviewStatus=PENDING` 但 `resolverStatus=ACTIVE`，允许解析先复用实体。
- 发生冲突证据时自动降级为 `resolverStatus=BLOCKED` 并进入人工审核，避免错误扩散。
- 全书校验与自动合并（`DUPLICATE_PERSONA -> MERGE`）只作为兜底，不应承担主防线职责。

```ts
// 反例：一个状态同时承载“审核语义”和“解析可用语义”
status = confidence >= 0.9 ? "CONFIRMED" : "PENDING";
resolverConsumes = status in ["CONFIRMED", "LLM_INFERRED"];

// 正例：语义拆分
reviewStatus = confidence >= 0.9 ? "CONFIRMED" : "PENDING";
resolverStatus = confidence >= 0.85 && hasPersonaId && hasEvidence ? "ACTIVE" : "BLOCKED";
```

原因：
- 这是“Phase 1 名册抽取层”→“AliasRegistry 存储层”→“PersonaResolver 命中层”的三层契约错位。
- 审核阈值与在线解析阈值本质不同：前者强调可解释与可追责，后者强调召回稳定与重复实体预防。
- 不拆分语义会导致“已发现线索但不能被解析器使用”，最终把问题推迟到后置合并阶段，增加治理成本。

### 错误 18：并发 worker 在短事务里竞争同一聚合行（hot row），触发 Prisma 事务超时

**反例**：
- 章节并发处理时，每章完成都执行 `chapter.update + book.update(parseProgress)` 同一事务；
- 多个 worker 同时抢占同一本书的 `book` 行锁，队列等待超过 Prisma 默认事务超时（5s），报错 `expired transaction`。

**正例**：
- 把“章节终态写入”与“书籍进度写入”解耦：
  - `chapter.parseStatus` 保持强一致（失败则中断）；
  - `book.parseProgress/parseStage` 改为幂等、单调递增、可降级（写失败记日志，不中断主任务）。
- 对聚合进度使用单调保护，避免并发乱序回退。

```ts
// 章节终态：强一致
await prisma.chapter.update({ where: { id: chapterId }, data: { parseStatus } });

// 书籍进度：单调 + 幂等（并发安全）
await prisma.book.updateMany({
  where: { id: bookId, parseProgress: { lt: progress } },
  data : { parseProgress: progress, parseStage: completedText }
});
```

原因：
- 这是“任务并发执行层”→“数据库事务层”→“进度展示层”的跨层契约问题。
- `parseProgress` 属于高频聚合写，不应与章节终态绑定在同一短事务里反复争用锁。
- 对“可重算的进度字段”采用幂等单调写，可以把一致性要求与可用性要求分层处理，避免因进度写入抖动拖垮主流程。

### 错误 19：把“触发动作”误当“业务成功”，导致面板提前关闭且失败静默

**反例**：
- Toolbar 的 `onPathFind` 定义为 `void`，点击后立即关闭面板；
- Graph 层失败分支（姓名未匹配/无路径/异常）只清空高亮，不给可见反馈；
- 用户感知为“点了没反应”，且输入上下文丢失。

**正例**：
- 把跨组件回调契约升级为结果语义（`Promise<boolean>`）；
- 仅在 `true`（业务成功）时关闭面板；
- `false`（未命中/无路径/异常）保留面板，并提供明确反馈（toast 或 inline error）。

```ts
// 反例：fire-and-forget，UI 无法区分成功与失败
type OnPathFind = (sourceName: string, targetName: string) => void;
onPathFind(source, target);
setActivePanel(null);

// 正例：结果语义回传，UI 可据此决定是否收起
type OnPathFind = (sourceName: string, targetName: string) => Promise<boolean>;
const found = await onPathFind(source, target);
if (found) setActivePanel(null);
```

原因：
- 这是“交互编排层（Toolbar）”→“业务查询层（Graph Service）”→“反馈层（Toast/面板状态）”的跨层契约缺口。
- `void` 回调只能表达“事件发起”，不能表达“业务是否成功”，UI 只能盲目推进状态，造成体验错误。
- 将“成功/失败/可重试”语义纳入回调契约，可同时避免状态误推进与失败静默。

---

## 跨层功能检查清单

实现前：
- [ ] 已绘制完整数据流
- [ ] 已识别所有层边界
- [ ] 已定义每个边界的数据格式
- [ ] 已明确校验发生位置

实现后：
- [ ] 已覆盖边界值测试（null、空值、非法值）
- [ ] 已验证各边界错误处理
- [ ] 已确认数据往返后不丢失关键信息
- [ ] 涉及 UI 结构时，已确认 SSR HTML 在浏览器解析后不会因无效嵌套被重排（特别是交互元素嵌套）
- [ ] 涉及浏览器本地状态时，已确认 SSR/CSR 首帧关键属性一致（必要时 mounted 门控）
- [ ] 页面首屏关键数据优先在 Server Component `await`，避免 Promise 透传到 Client `use()` 形成不稳定 hydration 边界
- [ ] 涉及统计/评分展示时，已确认前端只消费后端快照契约（无静态副本）并覆盖“无样本”语义测试
- [ ] 涉及统计/评分展示时，已声明评分是“相对分/绝对分”口径，并覆盖 `max=min` 与“无样本=0”语义测试
- [ ] 使用统一 API 响应包装时，已区分“传输层 success”与“业务层 success”
- [ ] 模型探活已验证响应语义（不只看 HTTP 状态码）
- [ ] 新增模型参数（如 thinking/reasoning）已完成“策略->执行->provider”全链路透传测试
- [ ] 新增模型参数已声明 provider 能力矩阵（支持/映射/忽略策略）并有对应测试
- [ ] 阶段策略跨层契约已统一为 `modelId(UUID)`（DTO/API/UI/Resolver）
- [ ] 推荐默认跨层契约已统一为 `stageDefaults.*.aliasKey`（配置/UI 展示）
- [ ] 状态型列表（默认/启用/未启用/未配置）排序规则已集中在单一 helper，并有明确次级排序规则
- [ ] 高密度设置页已按任务流进行信息分区（如 Tab），避免“资源配置”与“策略编排”混杂
- [ ] 状态新增语义已覆盖“写入层/查询层/UI层”全链路；避免复用旧状态值承载新语义，并确认历史数据兼容策略
- [ ] 涉及多作用域策略（JOB/BOOK/GLOBAL）时，已声明“写入作用域”与“展示作用域”映射，并覆盖“详情展示与运行生效”一致性验证
- [ ] 别名映射已区分“审核状态”和“解析消费状态”，避免高置信 `PENDING` 线索无法复用而重复建人
- [ ] 同一别名跨章节出现冲突时，已定义自动降级与人工复核回路（先停用解析消费，再审核）
- [ ] 并发 worker 涉及同一聚合行（如书籍进度）时，已避免“每项一次多语句事务”写法，改为幂等单调更新或批量刷写
- [ ] Prisma 事务中未包含高竞争热点写；对可重算字段已设计降级路径（写失败日志告警，不阻断主流程）
- [ ] 异步交互回调已声明结果语义（如 `Promise<boolean>`），避免仅凭“事件触发”推进 UI 状态
- [ ] 失败路径（未命中/空结果/异常）均有可见反馈，并保留可继续操作的上下文（不应立即收起输入面板）

---

## 何时需要单独写流转文档

出现以下情况建议写详细流转文档：
- 功能跨越 3 层以上
- 多团队协作
- 数据格式复杂
- 该功能历史上反复出问题
