# 子任务 B：AI 关系/事件双段写入协议与 Prompt 升级

> **父任务**：[04-30-character-relation-entry-design](../04-30-character-relation-entry-design/prd.md)
> **依赖**：子任务 A（schema 必须就位）
> **验收点映射**：父 §7.2、§7.3、§7.4、§7.5、§7.10
> **不在范围内**：schema 与 service 层 CRUD（→ A）、mergePersonas（→ C）、聚合 API（→ D）、前端（→ E）

---

## 1. 目标

1. 升级 `CHAPTER_ANALYSIS` Prompt baseline，输出 `relationships`（结构）+ `relationshipEvents`（事件）双段。
2. 重构 [ChapterAnalysisService.ts](../../../src/server/modules/analysis/services/ChapterAnalysisService.ts) 行 ~559 的 `tx.relationship.createMany` 写入路径：解析双段 → canonicalize → 字典 gate → upsert Relationship + createMany Event。
3. 强约束：AI 产出的所有结构关系一律 `recordSource = DRAFT_AI` + `status = PENDING`；不命中字典或不在 ACTIVE 状态的一律落 DRAFT 字典审核队列（不写入 `relationships`）。
4. 兼容 sequential 与 twopass 两套 pipeline（仅做回归验证）。

---

## 2. Prompt baseline 升级

**文件**：[src/server/modules/knowledge/prompt-template-baselines.ts](../../../src/server/modules/knowledge/prompt-template-baselines.ts) `case "CHAPTER_ANALYSIS"`（行 129-156）。

### 2.1 新 JSON 协议

```json
{
  "biographies": [{ "personaName": "...", "category": "...", "event": "...", "title": "...", "location": "...", "virtualYear": "...", "ironyNote": "" }],
  "mentions":    [{ "personaName": "...", "rawText": "...", "summary": "...", "paraIndex": 0 }],
  "relationships": [
    {
      "sourceName":           "标准名",
      "targetName":           "标准名",
      "relationshipTypeCode": "PARENT_CHILD",
      "evidence":             "可选，原文片段"
    }
  ],
  "relationshipEvents": [
    {
      "sourceName":           "标准名",
      "targetName":           "标准名",
      "relationshipTypeCode": "PARENT_CHILD",
      "summary":              "本章互动事件摘要",
      "evidence":             "原文证据片段",
      "attitudeTags":         ["感激", "资助"],
      "paraIndex":            12,
      "confidence":           0.85
    }
  ]
}
```

**协议契约**：
- `relationshipTypeCode` 必须从「已知关系类型字典」段落中选取；未列出的不要发明。
- `relationships` 段只声明结构身份（如「父子」「师生」），不含章节/态度。
- `relationshipEvents` 段每条事件必须能唯一对应到 `relationships` 中一条（通过 `sourceName + targetName + relationshipTypeCode`），允许同 Pair 同章节多事件。
- `attitudeTags` 最多 3 个，必须来自三大维度示例库；信号不足时输出 `[]`。

### 2.2 systemPrompt 改写

```
你是通用叙事文学结构化提取专家，精准识别复杂文本中的实体轨迹与社交网络。
重点 1：优先将称谓映射到已知人物，避免重复创建同一角色。
重点 2：关系分两层。结构关系（relationships）描述身份事实（父子/师生/同僚），全书唯一；
       关系事件（relationshipEvents）描述本章互动（资助/背叛/赔礼），可多次发生。
重点 3：relationshipTypeCode 必须从字典挑选，不要自创。
```

### 2.3 userPrompt 新增段落

在 `## Rules` 之后插入：

```
## 已知关系类型字典
{relationshipTypeDictionary}

## attitudeTags 三分类引导（每条事件最多 3 个，必须来自下列示例库）
【情感态度】感激 / 怨恨 / 倾慕 / 厌恶 / 愧疚 / 惧怕
【行为倾向】资助 / 提携 / 排挤 / 背叛 / 庇护
【关系演化】疏远 / 决裂 / 修好 / 公开 / 隐瞒 / 利用
若文本无明确态度信号，输出 []。
```

`{relationshipTypeDictionary}` 占位符由 [prompt-templates.ts](../../../src/server/modules/knowledge/prompt-templates.ts) 调用方负责注入：从 `RelationshipTypeDefinition` 表读取 `status='ACTIVE'` 全部条目，按 `group` 分组渲染为列表（`code · name · directionMode`）。

### 2.4 baseline 元数据

不变（`isActive: true`），通过 `pnpm db:seed` 生成新 `PromptTemplateVersion`，自动激活；旧版本在 `prompt_template_versions` 表保留供回溯。

---

## 3. ChapterAnalysisService 写入路径重构

**文件**：[src/server/modules/analysis/services/ChapterAnalysisService.ts](../../../src/server/modules/analysis/services/ChapterAnalysisService.ts)。

### 3.1 LLM 输出解析

新增 Zod schema（同文件或新建 `dto.ts`）：

```ts
const llmRelationshipSchema = z.object({
  sourceName          : z.string().min(1),
  targetName          : z.string().min(1),
  relationshipTypeCode: z.string().min(1),
  evidence            : z.string().optional()
});

const llmRelationshipEventSchema = z.object({
  sourceName          : z.string().min(1),
  targetName          : z.string().min(1),
  relationshipTypeCode: z.string().min(1),
  summary             : z.string().min(1),
  evidence            : z.string().optional(),
  attitudeTags        : z.array(z.string()).max(3).default([]),
  paraIndex           : z.number().int().min(0).optional(),
  confidence          : z.number().min(0).max(1).default(0.8)
});

const llmChapterOutputSchema = z.object({
  biographies        : z.array(...),
  mentions           : z.array(...),
  relationships      : z.array(llmRelationshipSchema).default([]),
  relationshipEvents : z.array(llmRelationshipEventSchema).default([])
});
```

### 3.2 写入流程（事务内）

替换原 `tx.relationship.createMany({ data: relationData })` 单点写入，改为以下三步：

#### Step 1：解析 + 字典 gate

```ts
// 1) 加载 ACTIVE 字典快照（事务开始时一次性查询）
const activeTypes = await tx.relationshipTypeDefinition.findMany({
  where : { status: "ACTIVE", deletedAt: null },
  select: { code: true, directionMode: true }
});
const activeTypeMap = new Map(activeTypes.map((t) => [t.code, t]));

// 2) 名字映射到 personaId（已有 mentionData 阶段建好的映射表 personaByName）
function resolvePair(sourceName, targetName, typeCode) {
  const sourceId = personaByName.get(sourceName);
  const targetId = personaByName.get(targetName);
  if (!sourceId || !targetId || sourceId === targetId) return null;

  const typeDef = activeTypeMap.get(typeCode);
  if (!typeDef) return null;            // 字典 miss → 进 DRAFT 字典审核队列

  // 3) SYMMETRIC canonicalize
  if (typeDef.directionMode === "SYMMETRIC" && sourceId > targetId) {
    return { sourceId: targetId, targetId: sourceId, typeCode };
  }
  return { sourceId, targetId, typeCode };
}
```

#### Step 2：upsert Relationships

```ts
const relationshipIdByKey = new Map<string, string>();   // key = `${sourceId}|${targetId}|${typeCode}`

for (const rel of llmOutput.relationships) {
  const canonical = resolvePair(rel.sourceName, rel.targetName, rel.relationshipTypeCode);
  if (!canonical) {
    draftDictionaryQueue.push({ /* 进字典审核队列，本任务不实现该队列写入 */ });
    continue;
  }

  const key = `${canonical.sourceId}|${canonical.targetId}|${canonical.typeCode}`;
  if (relationshipIdByKey.has(key)) continue;

  // upsert：仅当不存在或现存为 DRAFT_AI 时写入；若现存 AI/MANUAL 则保留
  const existing = await tx.relationship.findUnique({
    where: { bookId_sourceId_targetId_relationshipTypeCode: {
      bookId, sourceId: canonical.sourceId, targetId: canonical.targetId,
      relationshipTypeCode: canonical.typeCode
    }}
  });

  let relationshipId: string;
  if (!existing) {
    const created = await tx.relationship.create({
      data: {
        bookId,
        sourceId            : canonical.sourceId,
        targetId            : canonical.targetId,
        relationshipTypeCode: canonical.typeCode,
        recordSource        : RecordSource.DRAFT_AI,
        status              : ProcessingStatus.PENDING
      }
    });
    relationshipId = created.id;
  } else {
    relationshipId = existing.id;
    // 不升级 recordSource（AI 写入只能产出 DRAFT_AI；MANUAL/AI 保留不变）
  }
  relationshipIdByKey.set(key, relationshipId);
}
```

#### Step 3：批量 createMany Events

```ts
const eventData = [];
for (const evt of llmOutput.relationshipEvents) {
  const canonical = resolvePair(evt.sourceName, evt.targetName, evt.relationshipTypeCode);
  if (!canonical) {
    draftDictionaryQueue.push(...);
    continue;
  }
  const key = `${canonical.sourceId}|${canonical.targetId}|${canonical.typeCode}`;
  let relationshipId = relationshipIdByKey.get(key);

  // 事件能找到对应 Relationship 才写入；找不到 → 进 DRAFT 字典审核队列（不隐式 upsert，父 §9 风险表已要求）
  if (!relationshipId) {
    draftDictionaryQueue.push(...);
    continue;
  }

  eventData.push({
    relationshipId,
    bookId,
    chapterId,
    chapterNo,
    sourceId    : canonical.sourceId,
    targetId    : canonical.targetId,
    summary     : evt.summary,
    evidence    : evt.evidence ?? null,
    attitudeTags: dedupNormalize(evt.attitudeTags),    // trim + 去重
    paraIndex   : evt.paraIndex ?? null,
    confidence  : evt.confidence,
    recordSource: RecordSource.DRAFT_AI,
    status      : ProcessingStatus.PENDING
  });
}
if (eventData.length > 0) {
  await tx.relationshipEvent.createMany({ data: eventData });
}
```

### 3.3 返回值

`processChapter` 的返回 stat 结构追加 `relationshipEvents` 计数：

```ts
return {
  ...,
  created: {
    personas, mentions, biographies,
    relationships     : relationshipIdByKey.size,
    relationshipEvents: eventData.length
  }
};
```

---

## 4. Prompt 占位符注入

**文件**：调用 `resolvePromptTemplate({ slug: "CHAPTER_ANALYSIS", replacements })` 的位置（在 ChapterAnalysisService 内 prompt 装配段，约文件前 1/3 处）。

新增 `replacements.relationshipTypeDictionary` 注入：

```ts
const dictRows = await prisma.relationshipTypeDefinition.findMany({
  where  : { status: "ACTIVE", deletedAt: null },
  orderBy: [{ group: "asc" }, { code: "asc" }],
  select : { code: true, name: true, directionMode: true, group: true }
});
const grouped = groupBy(dictRows, "group");
const dictText = Object.entries(grouped).map(([group, items]) =>
  `### ${group}\n` + items.map((t) => `- \`${t.code}\` · ${t.name} · ${t.directionMode}`).join("\n")
).join("\n\n");
replacements.relationshipTypeDictionary = dictText;
```

---

## 5. 双 pipeline 兼容回归

- [SequentialPipeline.ts](../../../src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts)：调用 `ChapterAnalysisService.processChapter` 是唯一接触点，无需修改；本任务在该入口的单测已覆盖。
- [TwoPassPipeline.ts](../../../src/server/modules/analysis/pipelines/twopass/TwoPassPipeline.ts) + [GlobalEntityResolver.ts](../../../src/server/modules/analysis/pipelines/twopass/GlobalEntityResolver.ts)：同上；新增端到端集成测试用 mock LLM 双段输出走通完整 twopass 一遍。

---

## 6. 单元测试

| 文件 | 必须新增的用例 |
| ---- | ---- |
| `src/server/modules/analysis/services/ChapterAnalysisService.test.ts`（**已有则补**） | 1) 双段输出正常写入；2) 字典 miss → 不写入 relationships；3) SYMMETRIC canonicalize；4) 同章节同 Pair 多事件全部写入；5) 事件找不到对应 Relationship → 跳过；6) 现存 MANUAL 不被 AI 覆盖；7) 现存 DRAFT_AI 被新 AI 输出更新（保持 DRAFT_AI）；8) self-loop 跳过；9) attitudeTags 超 3 个被 trim |
| `src/server/modules/analysis/pipelines/twopass/TwoPassPipeline.test.ts` | 1) 完整 twopass 一遍能产出关系+事件，关系唯一键无冲突 |

行覆盖率 ≥ 90%（writer 函数本身 ≥ 95%）。

---

## 7. 评测集回归

- 在 [data/eval/](../../../data/eval/) 上跑一次 sequential + twopass，对比关系召回率。
- 新协议关系召回不应低于旧协议 -10pp；如下降超阈值，回滚 baseline `isActive=false`。

---

## 8. 验收清单

- [ ] `pnpm db:seed` 后，新版本 `CHAPTER_ANALYSIS` 在 `prompt_template_versions` 表中可见且 `isActive=true`。
- [ ] mock LLM 输出含 `relationshipTypeCode = "PARENT_CHILD"` 双段，`processChapter` 写入：1 行 Relationship + N 行 Event；幂等再跑不重复创建关系。
- [ ] mock LLM 输出含未知 typeCode：不写入 relationships，事件不写入。
- [ ] 现存 MANUAL 关系存在时，AI 第二轮跑过来不会改 `recordSource`。
- [ ] `pnpm test` 全绿，覆盖率 ≥ 90%。
- [ ] 评测集召回率不退化超过 10pp（输出报告附在 implement.jsonl）。

---

## 9. 风险与回退

- **召回退化**：先回滚 baseline 版本，schema 不动。
- **字典 miss 风暴**：日志计数 + 在 ChapterAnalysisService 输出 `dictionaryMissCount`，超阈值告警。
- **`relationshipTypeDictionary` 注入超 token 上限**：当前预计 30~50 条字典约 1~2K token，可控；若超出在调用前按 `group` 截断（保留 ACTIVE）。
