# v5-identity 技术设计：身份解析域（Pass0 + 登记表）

> 架构依据：`docs/architecture/13-agent-architecture-v5.md` §2.3（双 tier 承重墙）。本任务从零建身份解析域——现有代码无 entity/alias/mention 服务（v4 未建）。

## 1. 模块结构

```
src/server/modules/identity/
├── index.ts                 # 导出
├── registry.ts              # 登记表派生视图 + 单例缓存
├── identityService.ts       # 单一写路径（四路回写 + agent_write_audits）
├── primitive.ts             # 身份判定原语（HIGH 组合规则）
├── conflictScan.ts          # 分布式冲突扫描（按章分布）
├── tier1.ts                 # Tier1 全书一遍草稿登记表
├── tier2.ts                 # Tier2 残余候选（分层采样 + 原语）
├── reconcile.ts             # reconcile（Pass1 后 Pass3 前）
├── prompts.ts               # 身份解析 LLM prompt（极简）
└── *.test.ts                # 各文件单测
```

## 2. 登记表派生视图（registry.ts）

**无新表**——从 entities/aliases/mentions/entity_profiles 物化查询。

### 2.1 数据来源与分类规则

| 数据 | 用途 |
|---|---|
| `entities`（canonical, entityType, confidence, recordSource） | 实体主表 |
| `aliases`（entityId, bookId, alias, status, confidence, chapterStart/End） | 别名 + 身份置信载体 |
| `mentions`（entityId, chapterId, rawText） | 活跃章区 + 提及数 |
| `entity_profiles`（entityId, bookId, status） | 书级档案状态 |

**HIGH/MEDIUM/LOW 派生分类**（不落库，查询时推导）：
- **HIGH**：alias 有 CONFIRMED 或 evidence 锚定，且活跃章区 ≥1，且分布式扫描无冲突
- **MEDIUM**：有 mentions 但 alias 状态 PENDING/LLM_INFERRED
- **LOW**：仅提及 ≤1 次 或 TITLE_ONLY 无溯源

### 2.2 查询接口

```ts
interface RegistryEntry {
  entityId: string;
  canonical: string;
  type: EntityType;
  aliases: string[];
  confidenceTier: "HIGH" | "MEDIUM" | "LOW";
  activeChapters: number[];   // 从 mentions 推导
  firstAppearanceChapter: number | null;
}

async function getRegistry(bookId: string): Promise<RegistryEntry[]>;
async function getRegistryEntity(bookId: string, name: string): Promise<RegistryEntry | null>; // 名字命中（canonical/alias）
```

实现：单查询聚合（books→entities→aliases→mentions 分组），内存组装；书级缓存 + 失效。

## 3. 身份判定原语（primitive.ts）

### 3.1 输入/输出

```ts
interface PrimitiveInput {
  surfaceForm: string;              // 待判表面形式
  windows: MentionWindow[];         // 分层采样 ≤15 窗口（按章）
  registry: RegistryEntry[];        // 当前登记表（全局记忆）
  bookSummary: string;              // 全书 1-2K 摘要
  skills: string[];                 // 相关 skill 全文（按书型）
}

interface PrimitiveOutput {
  verdict: "resolved" | "new_entity" | "ambiguous";
  resolvedEntityId?: string;        // resolved 时
  evidenceAnchors: { chapterNo: number; paraIndex?: number }[];
  note?: string;
}
```

### 3.2 HIGH 组合规则（写死）

```
HIGH = LLM 判定 resolved（带证据锚点）
     ∧ 提及数 ≥ 2（窗口数 ≥ 2）
     ∧ 分布式冲突扫描干净（活跃章区不指向他实体）
     ∧ 采样窗口语义一致
否则 → MEDIUM / ambiguous → 人审或跨模型
原则：置信参与，绝不独裁（模型自报置信只是弱输入）。
```

### 3.3 LLM 调用

复用 `AiCallExecutor.executeChat`（analysis 模块，468 行，含 retry/fallback/usage 日志）。prompt 极简（`prompts.ts`）：目标 + 输出 JSON Schema + 证据锚定判据 + 上下文（窗口+登记表+摘要+skill）。**无工具循环**。

## 4. 分布式冲突扫描（conflictScan.ts）

按章分布，非邻近窗口重叠：

```ts
// 别名 a 的活跃章区（由 mentions 推导）与候选实体 X/Y 的活跃章区比对：
//   只与 Y 重合、从不与 X 重合 → 重归属 Y
//   与 X、Y 均重合 → 正常同场共现，不标记
function scanMisattribution(bookId: string, alias: string, candidateIds: string[]): MisattributionFlag[];
```

**同一代码路径跑两次**：Tier2 候选级（残余集）+ Pass3 全量终扫（捕跨候选交互）。

## 5. Tier1 全书一遍草稿登记表（tier1.ts）

- 输入：全书正文（模型上下文 ≥ 书）+ 确定性预扫描候选（Pass0 统计）
- 输出：草稿登记表候选 `{ canonical, type, aliases[], evidenceAnchors[] }`
- 路径：A/B 校准表选单遍 or 分卷（分卷 = 相邻卷重叠 + 原语卷级合并）
- 输出过大 → 按人物/地点/组织拆 2-3 次调用，各带全书，确定性合并
- 落库：走 identityService（写 entities + aliases + mentions + agent_write_audits）

## 6. Tier2 残余候选（tier2.ts）

- 跑：冲突标记 / 低置信 / 漏网高频 / 跨卷边界 / 风险集中类
- 每候选：分层采样窗口（≤15，按章取样）→ 原语 → 回写

## 7. reconcile（reconcile.ts）

- 时序：位于 Pass1 与 Pass3 之间（必需，父任务 C6 强制）
- 触发：DB 扫"提及数≥N 不在登记表"的表面形式（确定性穷举）
- 判定：原语（同模型二次看）
- 边界：只补覆盖缺失；系统误判靠跨模型/人审（不补）

## 8. 与 AiCallExecutor / 审计对接

- 每次原语/Tier1/Tier2 调用 = 一次 `agent_runs`（runType=IDENTITY）+ `agent_write_audits`（写审计）
- 复用 `@/server/modules/analysis/services/AiCallExecutor`
- prompt 走 `prompts.ts`（systemPrompt ≤300-500 token，无分步/CRITICAL/few-shot）

## 9. 权衡与边界

| 决策 | 理由 |
|---|---|
| 登记表派生视图非新表 | 单一写入口哲学，与 facts/relationships 一致 |
| HIGH 组合规则四条件 | 防"模型自报置信 1.0"独裁（D10） |
| 分布式扫描非邻近 | 防范老爷/范进同场共现海量误报（D11） |
| Tier2 注入登记表 | 局部窗口 + 全局记忆，残余候选仍可跨引用 |
| reconcile 只补覆盖 | 同模型二次看，系统误判交跨模型/人审 |
