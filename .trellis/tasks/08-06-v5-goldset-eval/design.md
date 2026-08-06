# goldset-eval 技术设计：评测先行

## 1. 目标

在写提取代码前建立质量锚：goldset 跨段取样 + 冷门书对照 + eval gate（entityF1/relationF1）+ Pass0 A/B 校准表。所有下游子任务的质量验收依赖本任务产出。

## 2. goldset 标注规范

### 2.1 取样范围（儒林外史，跨段 ≥4 章）

| 段 | 建议章 | 理由 |
|---|---|---|
| 首段 | 第 1 回（王冕楔子） | 人物稀疏，传记为主，测基本提取 |
| 中段·科举 | 第 2-3 回（周进 / 范进中举） | **歧义密度最高**：范进/范老爷/范举人，周学道/周进，张静斋等 |
| 中段·世情 | 第 11 回附近（庄绍光 / 杜少卿登场前后） | 多人物交互，关系密集 |
| 尾段 | 第 1 回偏后期（如 第四十六回 三山门） | 检验长程指代（前文人物在后期重提） |

正文来源：`docs/books/儒林外史.txt`。

### 2.2 标注对象与格式

JSON，每章一个文件：`scripts/goldset/儒林外史/ch01.json`（受版本管理）。

```jsonc
{
  "book": "儒林外史", "chapterNo": 3,
  "entities": [
    {
      "canonical": "范进", "type": "PERSON",
      "aliases": ["范老爷", "范举人", "范学道"],
      "firstAppearancePara": 12, "activeChapters": [3]
    }
  ],
  "relations": [
    {
      "typeCode": "师生", "sourceCanonical": "周进", "targetCanonical": "范进",
      "evidence": "周学道拔范进中了秀才", "chapterNo": 3, "paraIndex": 41
    }
  ],
  "bioFacts": [
    { "category": "EXAM", "subjectCanonical": "范进",
      "summary": "中举", "evidence": "报录人报范进中了举人", "chapterNo": 3, "paraIndex": 55 }
  ]
}
```

标注规范文档：`scripts/goldset/标注规范.md`（canonical 选取、别名判定、关系方向、证据截取规则）。

### 2.3 冷门书对照（≥2 章）

- 候选：**《歧路灯》（李绿园，108 回）**——明清白话世情小说，几乎不进教材，模型预训练覆盖弱。备选：《镜花缘》。
- 正文来源：公版（Wikisource/Gutenberg），入库 `docs/books/歧路灯.txt`（或脚本下载，标注后仅留 goldset 文件）。
- 取样：第 1-2 回（人物引入）即可，不要求跨段。

## 3. eval gate 设计

- 命令：`pnpm eval:gate` → `scripts/eval-gate.ts`。
- 计算：goldset 为标准，对提取结果（entities/relations/bioFacts）做召回/精确率：
  - entityF1：canonical 或别名命中 + 类型一致（string 匹配 + 归一化）。
  - relationF1：双方实体命中 + typeCode 命中（方向 INVERSE/SYMMETRIC 归一化后比较）。
- 门禁阈值：entityF1≥0.74 / relationF1≥0.68（D15）。PR 前必须过。
- CI 集成：`pnpm eval:gate` 入 CI 门禁。

## 4. Pass0 A/B 校准表

- 实验：对 goldset 章所属书跑"全书一遍"vs"分卷两遍"，对比**中段实体召回**（attention 覆盖指标）。
- 输出：`scripts/eval/ab-calibration.json` → `{ model: { bookSizeBand: "path" } }`，如 `"deepseek-v3": { "<400K": "single-pass", "400K-1M": "volume" }`。
- 定位：**离线校准，非每书两遍**；生产任务查表选 Pass0 路径；模型升级或异常书时重跑。

## 5. 输出物

- goldset 数据文件（儒林外史 4-6 章 + 冷门书 2-3 章）
- 标注规范文档
- `pnpm eval:gate` 脚本（F1 计算 + 门禁）
- A/B 校准表 + 校准报告（记录中段召回数字，供后续对比）

## 6. 风险

- 人工标注是主要投入（4-6 章 ≈ 半天）；标注规范不清晰会导致 goldset 本身噪声 → 规范先行，标注后抽检一致性（可 2 人互检首章）。
- 冷门书获取可能需下载公版文本，若不可得则选《镜花缘》备选。
