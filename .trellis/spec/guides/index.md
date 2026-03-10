---
stage: mvp
---

# 思考指南

> **目的**：在动手前扩展思考范围，提前发现容易被忽略的问题。

---

## 为什么需要思考指南？

**大多数 bug 和技术债来自“没想到这里”**，而不是能力不足：

- 没考虑层边界会发生什么 → 出现跨层 bug
- 没考虑代码模式重复 → 到处复制粘贴
- 没考虑边界条件 → 运行时错误
- 没考虑后续维护者 → 代码可读性差

这些指南帮助你在编码前先问对问题。

---

## 可用指南

| 指南 | 目的 | 何时使用 |
|-------|---------|-------------|
| [策略选择指南](./strategy-selection-guide.md) | 判断 fast/strict 策略 | 任务开始前 |
| [验证检查清单](./verification-checklist.md) | Success/Failure/Boundary 验证模板 | 提交前验证 |
| [上线就绪检查清单](./release-readiness-checklist.md) | 发布前质量/契约/回滚检查 | 合并前 |
| [契约验收清单](./contract-verification-checklist.md) | API/Action contract 稳定性验证 | contract 变更后 |
| [可观测性验收规范](./observability-verification.md) | 日志/指标/告警验收 | 发布前 |
| [验证证据规范](./verification-evidence-standard.md) | 证据格式与复现要求 | 验收文档编写时 |
| [模块边界规范](./module-boundary-guidelines.md) | 分层依赖方向与禁止导入 | 设计与评审时 |
| [风险预演指南](./risk-preflight-guide.md) | 变更前风险识别与缓解 | 实施前 |
| [注释规范（含单元测试）](./comment-guidelines.md) | 统一详细注释与测试注释模板 | 新增/修改代码与测试时 |
| [ADR Lite 模板](./adr-lite-template.md) | 关键决策最小记录模板 | 涉及重要取舍时 |
| [代码复用思考指南](./code-reuse-thinking-guide.md) | 识别可复用模式，减少重复 | 发现重复模式时 |
| [跨层思考指南](./cross-layer-thinking-guide.md) | 梳理跨层数据流 | 功能跨越多个层时 |
| [双语文档同步模板](../meta/bilingual-doc-sync-template.md) | 双语文档命名与同步约定 | 维护中英双语规范时 |
| [规范质量标准](../meta/spec-quality-standard.md) | 统一规范文档写法与验收标准 | 编写或更新任意规范时 |

---

## 快速触发清单

### 何时进行跨层思考

- [ ] 功能触达 3 层以上（API、Service、Component、Database）
- [ ] 数据格式在层之间发生变化
- [ ] 同一份数据有多个消费者
- [ ] 你不确定某段逻辑该放在哪一层

→ 阅读 [跨层思考指南](./cross-layer-thinking-guide.md)

### 何时进行代码复用思考

- [ ] 你在写与已有逻辑相似的代码
- [ ] 你看到同一模式重复了 3 次以上
- [ ] 你在多个地方同时新增同一字段
- [ ] **你要修改任何常量或配置**
- [ ] **你要新增 utility/helper 函数** ← 先搜索！

→ 阅读 [代码复用思考指南](./code-reuse-thinking-guide.md)

### 何时应用注释规范

- [ ] 新增或修改导出函数/类/复杂私有方法
- [ ] 新增或修改单元测试文件
- [ ] 你在评审中无法快速看出“为什么这样实现/这样断言”

→ 阅读 [注释规范（含单元测试）](./comment-guidelines.md)

---

## 修改前规则（关键）

> **改任何值之前，先全局搜索。**

```bash
# 搜索你即将修改的值
grep -r "value_to_change" .
```

这个习惯能显著减少“漏改 X 位置”一类问题。

---

## 如何使用本目录

1. **编码前**：快速浏览相关指南。
2. **编码中**：如果感觉重复或复杂度上升，回到指南对照检查。
3. **问题后**：把新踩坑经验补充到对应指南。

---

## 贡献方式

如果你遇到新的“没想到这里”场景，请补充到对应指南。

---

**核心原则**：30 分钟前置思考，通常可省下 3 小时排错时间。
