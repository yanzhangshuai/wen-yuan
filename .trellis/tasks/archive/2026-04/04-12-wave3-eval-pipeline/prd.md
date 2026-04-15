# Wave3: 评估管线与金标准

> **收敛修订 2026-04-13**: 根据 D10 决策修订。金标准数据由开发者手工标注 50-80 条核心角色样本。

## Goal

建立一套可自动运行的评估管线，包含 **开发者手工标注的金标准数据集（D10: 50-80 条核心角色）** 和指标计算脚本，使每次管线改动后能自动度量 precision / recall / F1 / 碎片率，实现质量门禁。

## 前置文档

- `docs/Sequential-准确率提升整体优化方案.md` — Wave 3 第 3 节
- `docs/角色解析准确率审计报告-儒林3.md` — 第 8 节对比分析

## 验收标准

- [ ] `data/eval/goldset-rulin.v1.jsonl` 存在，包含至少 50 个角色条目
- [ ] `scripts/eval/compute-metrics.ts` 能读取 goldset + DB 数据，输出 precision、recall、F1、碎片率
- [ ] `scripts/eval/check-gate.ts` 能根据配置的阈值返回 pass/fail
- [ ] 新增 NPM script: `pnpm eval:metrics` 和 `pnpm eval:gate`
- [ ] 碎片率指标（fragmentation rate）= unique real characters / total personas
- [ ] 已有测试全通过

## R1: 金标准数据格式

文件: `data/eval/goldset-rulin.v1.jsonl`

每行一个 JSON 对象:
```json
{
  "characterId": "char-001",
  "canonicalName": "杜少卿",
  "aliases": ["杜老爷", "少卿"],
  "gender": "male",
  "description": "清代名士，杜府长子",
  "firstAppearChapter": 31,
  "isHistorical": false,
  "isGenericTitle": false
}
```

初始数据来源:
- **D10 已确认**: 开发者基于审计报告手工标注 50-80 条核心角色样本
- 参考 `docs/角色解析准确率审计报告-儒林3.md` 中的命名分析
- 可用现有 `data/eval/goldset.v1.jsonl` 格式为参考（已存在 `data/eval/goldset.schema.json`）
- 标注范围: 主要角色 + 重要次要角色 + 有书内经历的历史人物（D13）

## R2: 指标计算脚本

文件: `scripts/eval/compute-metrics.ts`

```typescript
// 输入: bookId + goldset 文件路径
// 过程:
// 1. 从 DB 读取该 book 的所有 Persona
// 2. 从 goldset 读取标注数据
// 3. 匹配: 对每个 gold character，在 DB personas 中找最佳匹配
//    - 精确 name 匹配
//    - alias 匹配
//    - 模糊匹配作为 fallback
// 4. 计算指标:
//    - Precision = 正确匹配的 DB persona / 总 DB persona 数
//    - Recall = 被匹配的 gold character / 总 gold character 数
//    - F1 = 2 * P * R / (P + R)
//    - FragmentationRate = totalPersonas / matchedGoldCharacters（越接近 1 越好）
//    - DuplicateRate = 重复匹配（多个 persona 匹配同一 gold）/ 总 gold
// 5. 输出到 stdout (JSON) + 写入 docs/eval/metrics.summary.json

export interface MetricsResult {
  bookId: string;
  goldsetPath: string;
  totalGoldCharacters: number;
  totalDbPersonas: number;
  matched: number;
  unmatched: number;
  spurious: number;  // DB 中有但 gold 中无
  precision: number;
  recall: number;
  f1: number;
  fragmentationRate: number;
  duplicateRate: number;
  timestamp: string;
}
```

## R3: 质量门禁脚本

文件: `scripts/eval/check-gate.ts`

```typescript
// 读取 metrics.summary.json
// 对照阈值:
const GATE_THRESHOLDS = {
  precision: 0.70,
  recall: 0.75,
  f1: 0.72,
  fragmentationRate: 2.0,  // persona/character ≤ 2.0
  duplicateRate: 0.10,      // ≤ 10%
};
// 全部通过 → exit 0, 任一失败 → exit 1 + 输出 failure details
```

## R4: NPM Scripts

文件: `package.json`

```json
{
  "scripts": {
    "eval:metrics": "tsx scripts/eval/compute-metrics.ts",
    "eval:gate": "tsx scripts/eval/check-gate.ts"
  }
}
```

## R5: 现有评估脚本兼容

检查 `scripts/eval/` 目录下现有文件:
- `compute-metrics.ts` — 如果已存在，扩展而非覆盖
- `check-gate.ts` — 如果已存在，扩展而非覆盖
- `validate-goldset.ts` — 保持兼容
- `run-stage-ab.ts` — 保持兼容

## 关键文件

- `data/eval/goldset-rulin.v1.jsonl`（新建或扩展）
- `scripts/eval/compute-metrics.ts`（修改或新建）
- `scripts/eval/check-gate.ts`（修改或新建）
- `data/eval/goldset.schema.json`（参考）
- `package.json`
