# 实施计划

顺序：R2（schema 迁移）→ R1（文案）→ R3（schema 迁移 + 管线）→ R4（管线）→ 验证。

## 实施清单

- [ ] 1. R2：schema 删 aliasKey + R3：schema 加 currentStage，一次生成迁移并执行；`pnpm prisma:generate`
- [ ] 2. R2：models/index.ts + _shared.ts + admin-adapters.ts + services/models.ts + model-form.tsx + model-card.tsx 删 aliasKey
- [ ] 3. R2：更新受影响的测试 + bootstrap 文档
- [ ] 4. R1：model-form.tsx / model-manager.tsx / 相关注释文案修正
- [ ] 5. R3：runAnalysisJob.ts 写 currentStage；getBookStatus.ts 阶段→进度映射；更新测试
- [ ] 6. R4：tier1.ts 分片决策；AiCallExecutor.ts 重试分类 + 文案；更新测试
- [ ] 7. 验证：`pnpm type-check`、`pnpm lint`、`pnpm test`、`next build`
- [ ] 8. 提交（含迁移）

## 验证命令

```bash
pnpm type-check
pnpm lint
pnpm test
pnpm build
```

## 风险/回滚点

- R2 改动面最大，回滚点：`git checkout -- prisma/schema.prisma src/server/modules/models` 等。
- 迁移前确认无存量数据依赖 aliasKey（DB 已重建，实际为空）。
- R4 分片会改变 Tier1 调用形态，最终以重跑儒林外史 Pass0 通过为准（需要真实 API Key 环境）。
