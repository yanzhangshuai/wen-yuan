---
stage: growth
---

# 策略选择指南

> [SYNC-NOTE]
> 角色：事实基准
> 主文档：.trellis/spec/guides/strategy-selection-guide.md
> 镜像文档：.trellis/spec/guides/strategy-selection-guide.zh.md
> 最近同步：2026-03-04
> 同步负责人：system

## 快速决策树

```text
这是一个极小修复吗（错字、日志、注释）？
├─ 是 → 使用轻量流程（直接修复）
└─ 否 → 继续

是否会改 API/Action/DB schema 或 env 配置？
├─ 是 → 使用 STRICT 策略
└─ 否 → 继续

是否影响多层（UI + API + DB）？
├─ 是 → 使用 STRICT 策略
└─ 否 → 继续

需求是否含糊或需要澄清？
├─ 是 → 使用 STRICT 策略
└─ 否 → 继续

这是需求清晰的新功能吗？
├─ 是 → 使用 FAST 策略
└─ 否 → 使用 STRICT 策略
```

## 策略对比

| 维度 | Fast 策略 | Strict 策略 |
|----------|--------------|-----------------|
| **文档产出** | 最小集（目标/验收标准/风险） | 完整集（PRD + 设计 + 任务拆解 + 验证计划） |
| **评审闸门** | 最小范围人工确认 | 完整评审后再实现 |
| **适用场景** | - 仅 UI 变更<br>- 单层逻辑<br>- 需求清晰 | - 跨层变更<br>- API/DB schema 变更<br>- 需求含糊 |
| **验证范围** | Success + Failure + Boundary | Success + Failure + Boundary + Integration |
| **时间成本** | 低 | 中-高 |
| **风险等级** | 低-中 | 中-高 |

## 必须使用 STRICT 的场景

以下情况必须使用 strict：

1. **契约变更**
   - API endpoint 签名变更
   - Server Action 输入/输出变更
   - Database schema 修改
   - Environment variable 新增或修改

2. **跨层影响**
   - 同时改 UI + API + DB
   - 共享类型定义被修改
   - 鉴权/授权逻辑变更

3. **需求含糊**
   - 用户故事缺少验收标准
   - 存在多个可行实现路径
   - 业务规则不清晰

4. **高风险变更**
   - 支付/计费逻辑
   - 数据迁移脚本
   - 安全敏感代码
   - 性能关键路径

## 升级触发条件

出现以下情况时，立即从 FAST 升级到 STRICT：

- 实施中发现需求不清晰
- 发现跨层依赖
- 必须变更契约
- 交付风险上升（复杂度、未知项）

升级命令：
```bash
# 将当前任务从 fast 升级为 strict：补齐需求、设计、任务拆解与验证计划
# 并在 task.json / prd.md 中同步更新策略与风险说明
```

## 示例

### ✅ FAST 策略示例

- 给按钮新增 loading spinner
- 更新 UI 文案/标签
- 增加前端表单校验
- 重构单个组件
- 新增纯前端页面

### ✅ STRICT 策略示例

- 新增带 DB 写入的 API endpoint
- 修改认证流程
- 修改 Prisma schema
- 新增 UI + API + DB 一体功能
- 实现支付处理
- 新增环境配置

## AI 助手检查清单

选择策略前，请确认：

- [ ] 是否已完整阅读需求？
- [ ] 是否明确全部验收标准？
- [ ] 是否检查过跨层依赖？
- [ ] 是否识别出契约变更？
- [ ] 需求是否存在歧义？

任一项不确定 → 使用 STRICT。

## 代码案例与原因

反例：
```text
# 涉及 API + DB 变更仍使用 fast
仅写一句需求就直接实现
```

正例：
```text
# 涉及 contract 变更切换 strict
创建 task + PRD，补齐风险与验证计划后再实施
```

原因：
- contract/跨层变更若用 fast，遗漏设计与验证的概率显著增大。
- strict 流程能把风险显式化，降低返工与线上回滚成本。
