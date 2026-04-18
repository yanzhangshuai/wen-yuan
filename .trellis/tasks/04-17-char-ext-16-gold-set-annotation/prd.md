# chore: 儒林外史 Gold Set 标注（350 条 · §0-10）

## Goal
产出双人独立标注的 350 条黄金数据集，作为 T09 rerun-and-verify 的 `precision@top100` 统计依据。不做这一步，所有"准确率 ≥ 85%"的数字都是空口号。

## 契约
- §0-10：≥ 350 条 = 150 真角色 + 150 噪声 + 50 边缘歧义；Stage A identityClaim 五类各 ≥ 20 条

## 前置依赖
- T14 twopass-baseline（需要 twopass 跑出的 persona 候选池作为抽样源）
- 或独立跑 Stage A 的"干抽"版本，只为抽样

## Requirements

### 1. 抽样设计
- **150 条真角色候选**：从 twopass 产出的 persona 按 mentionCount 降序取 top 200 中人工筛 150 条可信者
- **150 条噪声候选**：
  - mentionCount = 1 → 抽 50
  - 只出现在 POEM / COMMENTARY → 抽 50
  - 称谓碎片（老爷 / 先生 / 相公等单独入库） → 抽 50
- **50 条边缘歧义**：KINSHIP（某某兄/叔）/ 同姓族（严贡生 vs 严监生 vs 严老大）/ 冒名候选（牛布衣相关）/ 梦境/引文边界

### 2. Stage A identityClaim 分层（§0-10）
从上述 350 条**之外或交叉**，另抽 ≥ 100 条 Stage A mention 级标注：
- SELF ≥ 20
- IMPERSONATING ≥ 20
- QUOTED ≥ 20
- REPORTED ≥ 20
- HISTORICAL ≥ 20
（若书中 IMPERSONATING 自然分布不足，**强制过采样**牛浦相关章节）

### 3. 标注 schema
```json
{
  "id": "gold-001",
  "surfaceForm": "牛浦",
  "chapterNos": [20, 21, 22],
  "trueLabel": "TRUE_ROLE | NOISE | ALIAS_DUP | EDGE",
  "trueCanonicalPersonaName": "牛浦",
  "trueIdentityClaim": "SELF | IMPERSONATING | QUOTED | REPORTED | HISTORICAL",
  "evidence": ["...rawSpan..."],
  "notes": "牛浦冒充牛布衣行走江湖，事迹应归牛浦"
}
```

### 4. 双人独立标注
- 标注员 A + 标注员 B 独立完成
- 交叉对比 → 计算 Cohen's kappa
- **kappa < 0.75 → 标注手册需修订，重新标分歧条目**
- 分歧条目第三方裁决

### 5. 交付物
- `fixtures/gold/rulin-350.json`（主 gold set）
- `fixtures/gold/rulin-identity-claim-100.json`（Stage A 分层抽样）
- `docs/gold-annotation-guide.md`（标注手册：判定规则、边界案例、示例）
- `docs/superpowers/reports/gold-set-annotation-log.md`（标注过程 + kappa 数字 + 分歧解决记录）

## Definition of Done

- [ ] 双人 kappa ≥ 0.75
- [ ] 350 条各类别数量达标（150/150/50）
- [ ] identityClaim 分层 100 条五类各 ≥ 20
- [ ] fixtures 可被 `pnpm test -- gold` 正常加载
- [ ] 标注手册有 ≥ 20 个边界案例示例
