# goldset-eval 执行计划

> 目标是"先建裁判"。标注是人工工作，脚本与规范是代码工作。

## 1. 准备工作

- [ ] 确认正文：儒林外史从 `docs/books/儒林外史.txt` 取第 1、2、3、11、46 回（或标注者选定的 4-6 章），落 `scripts/goldset/儒林外史/*.txt` 片源
- [ ] 获取冷门书正文：歧路灯（备选镜花缘），落 `scripts/goldset/歧路灯/*.txt`（或 `docs/books/`）

## 2. 标注规范

- [ ] 写 `scripts/goldset/标注规范.md`：canonical 选取、别名判定（含 TITLE_ONLY）、关系方向、证据截取规则、类型映射
- [ ] 定义 goldset JSON schema（entities/relations/bioFacts 三集合，见 design §2.2），可选加 zod 校验器

## 3. 人工标注

- [ ] 标注儒林外史首章（第 1 回）作为校准样本；2 人互检一次，统一规范口径
- [ ] 标注科举段（第 2-3 回）——歧义密度最高，最易暴露实体/别名链接错误
- [ ] 标注世情段（第 11 回附近）与尾段（第 46 回附近）
- [ ] 标注冷门书 2-3 章

**验证**：每章 JSON 通过 schema 校验器
**门禁**：儒林外史 ≥4 章 + 冷门书 ≥2 章全部通过校验

## 4. eval gate 脚本

- [ ] 实现 `scripts/eval-gate.ts`：读 goldset + 提取结果 → entityF1/relationF1（归一化后对比）
- [ ] 接入 `package.json`：`"eval:gate": "tsx scripts/eval-gate.ts"`
- [ ] 门禁阈值：entityF1≥0.74 / relationF1≥0.68（未达标时输出详细差项，不静默失败）
- [ ] 单测：F1 计算的边界（空集、别名命中、SYMMETRIC 方向归一）

**验证**：`pnpm eval:gate` 可跑；`pnpm test` 单测通过
**门禁**：脚本在无提取结果时输出明确报错而非 NaN

## 5. A/B 校准

- [ ] 写 `scripts/eval/ab-calibration.ts`：对目标模型跑"全书一遍 vs 分卷两遍"，对比中段实体召回
- [ ] 产出 `ab-calibration.json`（模型 × 书大小分档 → 路径）+ 校准报告（记录数字）
- [ ] 校准结果回写父任务 design C 契约 / v5 文档 §8.3（若路径结论有意外）

**验证**：校准表可被 Pass0 读取；报告含中段召回数字
**门禁**：校准跑完一次（即使只是目标模型），数字有记录

## 6. 收尾

- [ ] `pnpm type-check` / `pnpm lint` 通过
- [ ] `git add scripts/goldset scripts/eval package.json` + commit
- [ ] 通知下游（data-model）goldset 就绪，可引用

**回滚**：git 回退本任务 commit；goldset 文件受版本管理，标注错误可修订重标。
