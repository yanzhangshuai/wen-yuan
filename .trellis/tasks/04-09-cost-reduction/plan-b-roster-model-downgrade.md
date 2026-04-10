# Plan B: ROSTER_DISCOVERY 模型降级（Qwen Max → Qwen Plus）

> 状态：**待验证** — 本文档记录代码修改方案和预估收益，需 A/B 对比验证后才可合入主线。

## 概述

将 ROSTER_DISCOVERY 阶段的默认模型从 Qwen Max（¥2.4/6.0 每百万 token）降级到 Qwen Plus（¥0.8/2.0），以大幅降低该阶段成本。

## 当前成本基线（ROSTER_DISCOVERY 阶段）

| 指标 | 值 |
|------|-----|
| 调用次数 | 56 次/书（1:1 章节比） |
| 平均输入 token | ~9.8K/次（549K ÷ 56） |
| 平均输出 token | ~1.25K/次（70K ÷ 56） |
| 当前模型 | Qwen Max（input ¥2.4/M, output ¥6.0/M） |
| 阶段成本 | ¥2.04（549K×2.4 + 70K×6.0）÷ 1M |
| 占总成本比例 | ~29%（¥2.04 / ¥7.09） |

## 降级后预估成本

| 指标 | 降级前（Qwen Max） | 降级后（Qwen Plus） | 差额 |
|------|-------------------|-------------------|------|
| Input 单价 | ¥2.4/M | ¥0.8/M | -67% |
| Output 单价 | ¥6.0/M | ¥2.0/M | -67% |
| Input 费用 | ¥1.32 | ¥0.44 | -¥0.88 |
| Output 费用 | ¥0.42 | ¥0.14 | -¥0.28 |
| 阶段总费用 | ¥1.74 | ¥0.58 | **-¥1.16** |

> **ROSTER 阶段降本约 67%，全书总降本约 16%**（¥1.16 / ¥7.09）
>
> 与已实施的 A+C+D+E 方案叠加后，总降本有望达到 50-65%。

## 风险评估

### 核心风险：NER（命名实体识别）能力下降

ROSTER_DISCOVERY 是整条管线的**源头阶段**，负责识别每章所有人物称谓。如果漏识别：

1. **直接影响**：后续 CHUNK_EXTRACTION 的 Known Entities 列表不完整
2. **级联影响**：profiles 注入过滤（Plan C）依赖 roster 结果，roster 漏人物 → profile 被过滤 → chunk 分析也漏
3. **修复成本高**：需要 Chapter Validation 或 Book Validation 发现并补救

### 风险等级：**中-高**

Qwen Plus 是通用语言模型，在古典中文 NER（特别是文言文中的官衔、谥号、别名识别）上可能不如 Qwen Max。需要 A/B 对比验证。

### 缓解措施

- A/B 对比时以 goldset F1 为门禁，F1 下降 > 2% 则不合入
- 可考虑折中方案：Qwen Plus + 增强 prompt（补充更多 few-shot 示例），部分弥补模型能力差距
- 可考虑混合策略：前 N 章（人物密集）用 Max，后续章节用 Plus

## 代码修改方案

### 方式一：修改推荐配置文件（最简单）

**文件：`config/model-recommendations.v1.json`**

```diff
  "stageAliases": {
-   "ROSTER_DISCOVERY": "qwen-max-stable",
+   "ROSTER_DISCOVERY": "qwen-plus-stable",
    "CHUNK_EXTRACTION": "deepseek-v3-stable",
    "CHAPTER_VALIDATION": "qwen-plus-stable",
    "TITLE_RESOLUTION": "qwen-max-stable",
    "GRAY_ZONE_ARBITRATION": "qwen-plus-stable",
    "BOOK_VALIDATION": "qwen-max-stable",
    "FALLBACK": "qwen-plus-stable"
  }
```

> **注意**：此文件仅影响 UI 推荐默认值和新任务创建时的默认选择。如果已有 GLOBAL 策略覆盖，还需修改数据库中的策略配置。

### 方式二：通过 Admin API 更新全局策略

```bash
# 1. 查询 Qwen Plus 模型 UUID
curl -s GET /api/admin/ai-models | jq '.[] | select(.aliasKey == "qwen-plus-stable") | .id'

# 2. 更新全局策略（仅改 ROSTER_DISCOVERY 阶段）
curl -X PUT /api/admin/model-strategy/global \
  -H "Content-Type: application/json" \
  -d '{
    "stages": {
      "ROSTER_DISCOVERY": {
        "modelId": "<qwen-plus-uuid>",
        "temperature": 0.2,
        "maxOutputTokens": 8192,
        "topP": 1.0,
        "maxRetries": 2,
        "retryBaseMs": 600
      }
    }
  }'
```

### 方式三：通过数据库直接修改

```sql
-- 查询 qwen-plus-stable 的 UUID
SELECT id FROM ai_models
WHERE alias_key = 'qwen-plus-stable' AND is_enabled = true
LIMIT 1;

-- 更新全局策略中 ROSTER_DISCOVERY 的 modelId
UPDATE model_strategy_configs
SET stages = jsonb_set(
  stages,
  '{ROSTER_DISCOVERY,modelId}',
  to_jsonb('<qwen-plus-uuid>'::text)
),
updated_at = NOW()
WHERE scope = 'GLOBAL';
```

### 方式四：Book 级别 A/B 测试（推荐首选）

不修改全局配置，而是为特定书籍创建 BOOK 级别策略覆盖：

```bash
# 为测试书籍（如儒林外史）创建 BOOK 级别策略
curl -X PUT /api/admin/books/<book-id>/model-strategy \
  -H "Content-Type: application/json" \
  -d '{
    "stages": {
      "ROSTER_DISCOVERY": {
        "modelId": "<qwen-plus-uuid>",
        "temperature": 0.2,
        "maxOutputTokens": 8192,
        "maxRetries": 2,
        "retryBaseMs": 600
      }
    }
  }'
```

优先级链：JOB > BOOK > GLOBAL > SYSTEM_DEFAULT，所以 BOOK 级别会覆盖 GLOBAL 的 ROSTER 配置，而其他阶段仍走 GLOBAL 默认。

## A/B 验证方案

### 测试设计

| 维度 | 对照组（Control） | 实验组（Treatment） |
|------|------------------|-------------------|
| ROSTER 模型 | Qwen Max | Qwen Plus |
| 其他阶段 | 不变 | 不变 |
| 测试书籍 | 儒林外史 56 回 | 同 |
| 评估指标 | goldset F1、成本、耗时 | 同 |

### 步骤

1. 以当前 A+C+D+E 优化后的配置，运行 Control 组（ROSTER = Qwen Max），记录成本和 F1
2. 创建 BOOK 级别策略覆盖，ROSTER → Qwen Plus，运行 Treatment 组
3. 对比两组的：
   - **人物 F1**（roster 完整性、准确性）
   - **关系 F1**（级联影响）
   - **成本**（总费用和各阶段费用）
   - **JSON 成功率**（结构化输出稳定性）

### 门禁标准

| 指标 | 门禁 |
|------|------|
| 人物 F1 下降 | ≤ 2% |
| 关系 F1 下降 | ≤ 3% |
| JSON 成功率 | 不低于 baseline |
| 成本降低 | ≥ 10%（否则不值得冒险） |

### 预期结果

- **乐观**：Qwen Plus NER 能力足够，F1 波动 < 1%，成本额外降低 ~16%
- **中性**：F1 下降 1-2%，可考虑混合策略（前 10 章 Max + 其余 Plus）
- **悲观**：F1 下降 > 3%，放弃此方案

## 与已实施方案的叠加效果

| 方案 | 独立降本预估 | 叠加后增量 |
|------|------------|-----------|
| [A] Chunk 10K（已实施） | -15~25% CHUNK 调用 | 基线 |
| [C] Profiles 过滤（已实施） | -15~20% input token | 基线 |
| [D] 条件化 Validation（已实施） | -50% VALIDATION | 基线 |
| [E] Prompt 精简（已实施） | -8~12% token | 基线 |
| **[B] ROSTER 降级（本方案）** | **-67% ROSTER 成本** | **额外 -16%** |

> A+C+D+E 预估降本 38~50% → 叠加 B 后预估降本 **54~66%**

## 相关文件

| 文件 | 说明 |
|------|------|
| `config/model-recommendations.v1.json` | 阶段推荐模型别名映射 |
| `src/server/modules/analysis/services/ModelStrategyResolver.ts` | 运行时模型策略解析器 |
| `src/server/modules/analysis/services/modelStrategyAdminService.ts` | 策略管理 Admin 服务 |
| `src/app/api/admin/model-strategy/global/route.ts` | 全局策略 API |
| `src/app/api/admin/books/[id]/model-strategy/route.ts` | 书籍级策略 API |
| `prisma/schema.prisma` | `model_strategy_configs` 表定义 |
