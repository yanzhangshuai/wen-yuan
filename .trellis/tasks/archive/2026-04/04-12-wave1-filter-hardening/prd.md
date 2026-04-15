# Wave1: 垃圾过滤强化 — 泛称/关系词/历史人物/短语

> **收敛修订 2026-04-13**: 本任务已根据 D1-D13 决策全面修订。所有数据来源改为 DB，不再使用硬编码常量。

## Goal

在 PersonaResolver 中集成 `FullRuntimeKnowledge`，通过知识库驱动的 6 类规则过滤器，消除审计报告中 A/B/C/D 类共 202 个错误 profile。**所有词表/规则数据从 DB 加载（D2），不使用硬编码常量。**

## 前置文档

- `docs/角色解析准确率审计报告-儒林3.md` — 审计数据
- `docs/Sequential-准确率提升整体优化方案.md` — Wave1 章节
- `docs/spec/persona-parse-merge-rules.md` — 解析与合并规则规范
- `docs/spec/unified-parsing-rules.md` — 统一解析规则口径

## 验收标准

- [ ] 儒林-3 重新解析后，泛称/关系词类 persona ≤ 15 个（当前 75 个）
- [ ] 历史人物类 persona ≤ 5 个（当前 69 个）
- [ ] 描述性短语类 persona ≤ 5 个（当前 40 个）
- [ ] 家族名类 persona ≤ 2 个（当前 18 个）
- [ ] PersonaResolver 完全依赖 `runtimeKnowledge`，无硬编码常量引用
- [ ] 已有单元测试全部通过
- [ ] 新增 ≥ 20 个 PersonaResolver 单元测试覆盖新过滤规则

## R1: 扩充泛称词表（D2: 全部通过 DB）

**数据写入**: DB `generic_title_entries` 表（通过 `scripts/init-knowledge-phase7.ts` 种子脚本）  
**代码引用**: `runtimeKnowledge.lexiconConfig.safetyGenericTitles` / `defaultGenericTitles`

> **D2 已确认**: 不再修改 `lexicon.ts` 硬编码常量。硬编码将被直接删除。

tier=SAFETY 新增写入 DB:
```
管家, 差人, 长随, 番子, 门斗, 嫖客, 猎户, 斋公, 幕客, 典史,
舵工, 朝奉, 樵夫, 养娘, 使女, 府尊, 盐捕分府, 学师,
船家, 东家, 太保公, 挑粪桶的, 火工道人, 看茶的, 卖草的,
卖人参的, 掌舵的, 报子上的老爷们
```

tier=DEFAULT 新增写入 DB:
```
番酋, 两位都督, 和尚, 道士, 道人, 小和尚, 贫僧, 僧宫老爷,
首座, 知客, 老师父, 总兵, 总督, 府尹, 守备, 参将, 宗师
```

## R2: 关系词过滤（D2: 数据来自 DB）

**文件**: `src/server/modules/analysis/services/PersonaResolver.ts`

> **D2 已确认**: 关系词列表从 DB `relational_term_entries` 表加载，不使用硬编码 Set。

在 `resolve()` 函数中，safety_generic 检查之后新增:

```typescript
// relationalTerms 来自 runtimeKnowledge.relationalTerms (Set<string>)
if (runtimeKnowledge.relationalTerms.has(rawName)) {
  if (!aliasBinding) {
    return { status: "hallucinated", confidence: 0.9, reason: "relational_term" };
  }
}
```

初始数据（~80 条）通过 `scripts/init-knowledge-phase7.ts` 写入 `RelationalTermEntry` 表。

## R3: 历史人物标记库检查（D13: 非黑名单，标记库）

> **D13 已确认**: 历史人物不是简单黑名单。命中后需判断"书内是否有实际参与"。  
> **D2 已确认**: 不新建代码常量文件，直接使用 DB `HistoricalFigureEntry` 表。

在 `PersonaResolver.resolve()` 中检查:
```typescript
// historicalFigures 来自 runtimeKnowledge.historicalFigures (Set<string>)
if (runtimeKnowledge.historicalFigures.has(rawName)) {
  const participation = assessHistoricalParticipation(rawName, chunkContext);
  if (participation === 'ACTIVE') {
    // 有书内行为/对话/事件 → 保留，用真名建 Persona
    return { status: "resolved", persona: { name: trueName }, reason: "historical_active" };
  } else {
    // 纯提及/典故 → 不提取
    return { status: "hallucinated", confidence: 0.95, reason: "historical_mention" };
  }
}
```

初始数据（~100 条，后续 LLM 扩充到 500+）通过 `scripts/init-knowledge-phase7.ts` 写入 DB。

**标记**: **修复后开启** — 历史人物标记库过滤需待数据就绪后启用。

## R4: 描述性短语检测

**文件**: `src/server/modules/analysis/services/PersonaResolver.ts`

新增 `isDescriptivePhrase(name: string): boolean`:
- 含 `的` 且长度 > 3 → true
- 含 `之` 且长度 > 3 → true
- 匹配 `人名+亲属词` 模式 → true
- 含 `其余` → true

命中时 `hallucinated` + `reason: "descriptive_phrase"`。

## R5: 家族名过滤

新增 `isFamilyHouseName(name: string): boolean`:
- 匹配 `X家` / `X府` (1-2 字姓氏 + 家/府) → true
- 匹配 `X氏` 且长度 ≤ 3 → true

命中时 `hallucinated` + `reason: "family_house_name"`。

## R6: 长度阈值收紧

将 `name_too_long` 阈值从 10 字改为 **8 字**。

## 依赖

- Task 1.1（Prisma Schema 新增 3 张表）
- Task 1.3（种子数据初始化脚本）
- Task 2.1（`loadFullRuntimeKnowledge()` 实现）
- Task 2.2（硬编码删除）

## 标记

**修复后开启**: 除 name_too_long 阈值调整外，新增的 6 类过滤规则在 DB 数据就绪、评估管线验证无退化后再逐项启用。

## 测试文件

- `src/server/modules/analysis/services/__tests__/PersonaResolver.test.ts`
- 新增: mock `runtimeKnowledge` 测试每个过滤规则的命中/放行边界
- 新增: D13 历史人物上下文判断测试（ACTIVE vs MENTION）
