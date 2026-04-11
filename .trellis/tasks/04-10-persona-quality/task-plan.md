# 人物解析质量优化 — 实施任务文档

> **PRD 参考**：`.trellis/tasks/04-10-persona-quality/prd.md`  
> **优先级**：P0（过合并）→ P1（未出场人物）→ P2（无事迹路人）

---

## 一、总体策略

```
问题              解决层              方案
─────────────────────────────────────────────────────────────────────
P0 过合并         Pass 2 提示词         batchLlmDedup 输入增加人物
                  + 候选组规则          所属关系上下文；泛称黑名单阻断
─────────────────────────────────────────────────────────────────────
P1 历史引用人物    Pass 1 提示词         明确"仅提取场景直接参与者"定义；
                                        新增 participationStatus 字段
─────────────────────────────────────────────────────────────────────
P2 无事迹路人      Pass 1 提示词 +       引入 mentionCount 门槛；
                   BOOK_VALIDATION      在 BOOK_VALIDATION 阶段过滤
─────────────────────────────────────────────────────────────────────
```

---

## 二、P0 — 修复过合并

### TASK-Q01: 泛称合并阻断黑名单

**文件**：`src/server/modules/analysis/config/lexicon.ts`（或新增 `rules.ts`）

**改动**：新增 `MERGE_BLOCK_GENERIC_TITLES` 集合，这类称谓**禁止作为两个候选归并到同一人的依据**。

```typescript
/**
 * 不能作为合并依据的泛化称谓。
 * 出现在候选组中时，必须有其他非泛称的共享别名才能合并。
 * 
 * 判断标准：该称谓在同一部书中可指代 2+ 个不同人物的情况极为常见。
 */
export const MERGE_BLOCK_GENERIC_TITLES: ReadonlySet<string> = new Set([
  // 家庭角色泛称
  "老太太", "太太", "奶奶", "姑娘", "小姐", "夫人",
  "老爷", "大爷", "二爷", "三爷", "公子",
  // 职能泛称
  "管家", "姑爷", "姑老爷", "媳妇", "丈人", "老丈", "亲家",
  "先生", "老先生", "相公", "客人",
  // 职业泛称
  "差人", "衙役", "书办", "长随", "家人", "小厮",
  "道人", "和尚", "老和尚", "师父",
]);
```

**修改 `buildCandidateGroups()`**：
- 规则 1（编辑距离 ≤ 1）：如果两个候选的"最具代表性名称"都在 `MERGE_BLOCK_GENERIC_TITLES` 中，**跳过合并**，直接保留为独立人物
- 规则 2（同姓 + 别名交叉）：交叉别名必须包含至少一个**不在** `MERGE_BLOCK_GENERIC_TITLES` 中的别名

**验收**：过合并测试案例（老太太/管家/姑爷）重新解析后不再合并；Goldset F1 不下降。

---

### TASK-Q02: batchLlmDedup 输入增加人际上下文

**文件**：`src/server/modules/analysis/services/GlobalEntityResolver.ts`

**背景**：当前 `batchLlmDedup` 向 LLM 提问时，输入是候选别名集合，没有"此人与谁有关系"的上下文，导致不同家庭的同名角色被错误合并。

**改动**：
1. `collectGlobalDictionary()` 在汇总实体时，同时收集每个实体的**共现人物集合**（同章出现过的其他人物名，取前3个最高频）
2. `batchLlmDedup()` 的输入格式从：
   ```
   候选组 A: ["老太太", "范家老奶奶", "亲家母"] + ["杜老太太", "老娘"]
   ```
   扩展为：
   ```
   候选组 A:
     候选 1: ["老太太", "范家老奶奶"] — 常出现在: [范进, 胡屠户, 范进妻]
     候选 2: ["杜老太太", "老娘"]     — 常出现在: [杜少卿, 杜娘子]
   ```
3. 提示词增加约束：
   ```
   判断规则：
   1. 若两组人物从未在同一场景中共同出现，应视为可能是不同人；
   2. 若两组的共现人物集合完全不重叠，应视为不同人；
   3. 仅当有明确证据（别名体系、字号关系）证明是同一人时，才归并。
   ```

**验收**：重新解析儒林外史，姑爷/管家等过合并条目应拆分为独立人物。

---

## 三、P1 — 过滤未出场的历史/引用人物

### TASK-Q03: Pass 1 提示词增加"出场参与者"严格定义

**文件**：`src/server/modules/analysis/services/prompts.ts`（`buildIndependentExtractionPrompt`）

**改动**：在 System Prompt 中增加明确的出场标准：

```
## 人物提取范围（严格遵守）

【应提取】符合以下任一条件的人物：
- 在本章节的场景中**直接出现**（有行为描述、对话、动作）
- 在本章节中被**其他场景内人物直接呼唤或提及**，且对当前情节有直接影响
- 作者明确介绍其身份、外貌或经历（即使当章不在场）

【不应提取】以下情况：
- 角色在**引经据典、比喻、典故**中提到的历史人物（如"此人有屈原之节"中的屈原）
- 角色在谈话中**追忆的祖先或远古人物**（如尧、舜、孔夫子、孟子等圣贤）
- 书中角色**阅读的书籍/诗文**中出现的虚构人物
- **历史上真实存在**但与当前小说情节无实质关联的人物（如"太祖高皇帝"仅作为历史背景提及）
```

同时，在输出 JSON schema 中增加 `participationStatus` 字段：
```typescript
interface ExtractedEntity {
  name: string;
  aliases: string[];
  participationStatus: "ACTIVE" | "MENTIONED_RELEVANT" | "HISTORICAL_REFERENCE";
  // ACTIVE: 当章直接出场
  // MENTIONED_RELEVANT: 当章被提及且对情节有影响
  // HISTORICAL_REFERENCE: 历史引用/典故，不应进入人物列表
}
```

**后处理**：`collectGlobalDictionary()` 中，`participationStatus === "HISTORICAL_REFERENCE"` 的实体不纳入候选池。

**验收**：孔夫子、苏轼、屈原、尧舜等不再出现在最终解析结果中。

---

### TASK-Q04: 历史人物关键词黑名单（兜底）

**文件**：`src/server/modules/analysis/config/lexicon.ts`

作为 TASK-Q03 的补充兜底，维护一个"永远不应出现在古典小说解析结果中"的人物黑名单：

```typescript
/**
 * 历史/神话人物黑名单。
 * 这些名字在古典小说中几乎只以典故形式出现，不是小说内的角色。
 * 用于 BOOK_VALIDATION 阶段的后置过滤。
 */
export const HISTORICAL_FIGURE_BLOCKLIST: ReadonlySet<string> = new Set([
  // 先秦圣贤
  "孔子", "孔夫子", "孟子", "曾子", "颜回", "子路", "屈原", "管仲",
  "尧", "舜", "禹", "汤", "文王", "武王", "周公", "尧舜",
  // 汉唐文人
  "司马迁", "李白", "李太白", "杜甫", "苏轼", "苏东坡", "东坡",
  "陶渊明", "王羲之", "欧阳修", "韩愈",
  // 明清史人（在明清小说中频繁被引用）
  "朱熹", "王阳明", "王守仁",
  // 神话人物（非神魔小说类型时）
  "太上老君", "玉皇大帝", "观音菩萨",
]);
```

**注意**：该黑名单只在 **非神魔小说** 类型的书籍中启用（神魔小说中这些是出场角色）。

---

## 四、P2 — 过滤无具体事迹的路人/背景角色

### TASK-Q05: Pass 1 提示词增加"重要性"字段

**文件**：`src/server/modules/analysis/services/prompts.ts`（`buildIndependentExtractionPrompt`）

在输出 schema 中增加 `significance` 字段（在 TASK-Q03 修改基础上叠加）：

```typescript
interface ExtractedEntity {
  // ...（已有字段）
  participationStatus: "ACTIVE" | "MENTIONED_RELEVANT" | "HISTORICAL_REFERENCE";
  significance: "MAJOR" | "MINOR" | "BACKGROUND";
  // MAJOR:      有独立完整事迹，对情节有显著推动作用
  // MINOR:      有少量台词/行为，是配角
  // BACKGROUND: 场景中出场但无名无姓或仅有一句话
}
```

**后处理规则**：
- `significance === "BACKGROUND"` 且 `participationStatus !== "ACTIVE"` → 不纳入候选池
- `significance === "BACKGROUND"` 且该章节累计出现 < 2 次 → 标记为 `nameType = ANONYMOUS_MINOR`（可在前端过滤）

---

### TASK-Q06: BOOK_VALIDATION 阶段增加低重要性过滤

**文件**：`src/server/modules/analysis/services/BookValidationService.ts`（或当前等效文件）

在 BOOK_VALIDATION 之后，增加一个后处理步骤 `filterNoisyPersonas()`：

**过滤条件（满足任一即标记为 NOISE）**：

| 条件 | 说明 |
|------|------|
| `mentionCount <= 1` 且 `name` 全为泛称（仅由称谓词组成） | 典型路人如"看茶的"、"走堂的" |
| `name` 在 `MERGE_BLOCK_GENERIC_TITLES` 中 且无其他非泛称别名 | 未被识别出真实姓名的泛称人物 |
| `name` 完全匹配 `HISTORICAL_FIGURE_BLOCKLIST`（上下文非神魔小说） | 历史引用未被 P1 过滤的漏网之鱼 |
| `aliases` 全部为泛化角色词（全在 `SAFETY_GENERIC_TITLES` 中） | 如"乌龟"（骂人的词被误识别为人物名） |

**处理策略**：不删除，设置 `status = "FILTERED"` 或 `confidence < 0.1`，前端默认不展示但可通过"显示隐藏人物"查看。

**验收**：儒林外史中"乌龟/看茶的/孔夫子"等不在默认列表中。

---

## 五、实施顺序与依赖关系

```
TASK-Q03 (Pass 1 提示词: participationStatus + significance)
  └── TASK-Q01 (泛称黑名单) — 可并行
  └── TASK-Q05 (Pass 1: significance 字段) — 与 Q03 同文件，合并修改
        └── TASK-Q06 (BOOK_VALIDATION 后过滤) — 依赖 Q05
TASK-Q02 (batchLlmDedup 上下文增强) — 独立，可并行
TASK-Q04 (历史人物黑名单) — 独立兜底，可最后添加
```

**推荐执行顺序**：Q03+Q05（合并修改提示词）→ Q01 → Q06 → Q02 → Q04

---

## 六、验收标准

| 任务 | 验收命令/方法 |
|------|-------------|
| Q01/Q02 过合并修复 | 重新解析儒林外史，检查"姑爷/老太太/管家"条目 |
| Q03/Q04 历史人物过滤 | 解析结果中搜索"孔夫子/屈原/苏轼"应为空 |
| Q05/Q06 路人过滤 | 解析结果中"看茶的/走堂的/乌龟"不在默认视图 |
| 综合 | 过滤条件全部通过（见 PRD 验收标准）；Goldset F1 不低于修改前 |

---

## 七、回归测试要求

所有修改完成后须运行：
```bash
# 1. 单元测试（PersonaResolver + buildCandidateGroups）
pnpm test src/server/modules/analysis/

# 2. 金标集评估（确认 F1 不降）
npx tsx scripts/eval/compute-metrics.ts --book=儒林外史

# 3. 门控检查
npx tsx scripts/eval/check-gate.ts
```
