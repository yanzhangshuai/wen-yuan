---
stage: mature
---

# 上线就绪检查清单

> 合并前确认“可发布、可观测、可回滚”。

---

## 必须遵守

- 代码质量：`pnpm lint`、必要构建与核心路径手工验证通过。
- 单元测试：测试有效性达标，且每次执行覆盖率四项门禁都必须满足（Statements >= 85%、Branches >= 85%、Functions >= 85%、Lines >= 85%）；任一未达标不得交付。
- 合同稳定：API/Action contract 变更已记录并验证。
- 观测完整：关键路径日志、错误码、requestId 可追踪。
- 回滚可行：明确回滚策略、命令与触发阈值。

---

## 代码/命令案例

反例：
```bash
# 只跑了 dev，本地能点开就合并
npm run dev
```

正例：
```bash
pnpm lint
# 运行项目约定的单测+覆盖率命令并留存结果
pnpm test:unit
cat .trellis/tasks/<task>/verification.md
# 如含 DB 变更：先验证回滚 SQL / migration 回滚路径
```

---

## 原因

- “能跑”不等于“可发布”，上线风险主要来自合同、观测和回滚缺失。
- 先确认回滚路径可避免故障时被动扩散。

---

## 验收清单

- [ ] 质量检查通过并有证据
- [ ] 单元测试有效，覆盖率四项（Statements/Branches/Functions/Lines）均 >= 85% 且有证据
- [ ] 合同变更已验证且文档化
- [ ] 观测字段满足排障最小集
- [ ] 回滚路径已演练或可执行
