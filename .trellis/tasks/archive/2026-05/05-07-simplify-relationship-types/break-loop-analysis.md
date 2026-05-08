# Bug Analysis: Prisma Schema 变更后的死代码传播

## 1. Root Cause Category

- **Category**: C + D — Change Propagation Failure + Test Coverage Gap
- **Specific Cause**: 删除 Prisma model（`RelationshipEvent`、`UnknownRelationshipTypeDraft`、`UnknownRelationshipTypeOccurrence`、`SurnameRule`）后，`prisma generate` 不再产出这些模型的 TypeScript 类型，但仓库中残留了大量引用这些已删除类型的代码。这些代码之所以能通过 `tsc --noEmit`，是因为 Vitest 测试中广泛使用了 `as never` 模式来 mock Prisma client——`as never` 将 mock 对象强制转换为目标类型，完全绕过了 TypeScript 的类型检查：

```ts
// 典型模式：hoisted mock 使用 as never 绕过类型检查
const hoisted = vi.hoisted(() => ({
  prisma: {
    relationshipEvent: { create: vi.fn(), findMany: vi.fn() }  // ← 模型已删除
  }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: hoisted.prisma as never  // ← 类型断言吞掉了所有错误
}));
```

结果是：**类型系统无法保护 Schema 变更的传播完整性**。删除 schema 模型后，必须依赖人工记忆和 grep 来发现残留引用。

## 2. Why Fixes Failed

本任务中没有修复失败，因为采用了系统性的多轮清理策略：

1. **第一轮**：删除 3 张核心表 + schema 变更 → 类型检查通过（`as never` 掩盖了残留）
2. **第二轮**：用户追问"姓氏词库是否清理干净"→ 发现 SurnameRule 表及相关全链路代码 → 全部清理
3. **第三轮**：主动分析 trellis 任务 → 发现 P0（死文件）/ P1（analysis.ts 残留）/ P2（prompt 残留）
4. **第四轮**：用户追问"还有需要清理的吗" → 发现 2 处过期注释

关键洞察：每一轮清理都依赖**人工代码审查**而非编译器报错，因为 `as never` 让编译器静默了。

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|----------|-----------|-----------------|--------|
| P0 | Test pattern | 禁止在 mock Prisma client 时使用 `as never`，改用 `vi.mocked()` 或显式类型 | TODO |
| P0 | CI check | Schema 变更后跑 `tsc --noEmit` 时不依赖 mock 文件（或添加无 mock 的类型检查步骤） | TODO |
| P1 | Architecture | 添加 dead code 检测脚本：`ts-prune` 或 `knip` 配置 | TODO |
| P1 | Documentation | 在 spec 中记录 Schema 变更的跨层清理清单 | DONE (via this analysis) |
| P2 | Code Review | Schema 变更 PR checklist：每删一个 model，grep 全仓检查其引用 | TODO |

## 4. Systematic Expansion

- **Similar Issues**: 任何使用 `as never` 的类型断言位置都有同样的风险。当前仓库中 `as never` 广泛用于 mock Prisma、mock service 返回值等场景。未来任何 Prisma schema 变更（改字段名、删字段、改类型）都会面临同样的"编译器不报错"风险。
- **Design Improvement**: 理想方案是让 Prisma mock 的类型安全。可以考虑：创建 typesafe mock factory（从 Prisma client 类型推导 mock 对象类型），或使用 `satisfies` 替代 `as never`。
- **Process Improvement**: Schema 变更后的清理应该以"每个被删除的 model name 在全仓 grep 无残留引用"作为完成标准，而不是以"tsc 通过"为标准。

## 5. Knowledge Capture

- [x] Update `.trellis/spec/backend/relationship-structure.md` to new single-table model
- [x] Add error entry to `.trellis/spec/guides/cross-layer-thinking-guide.md` about Prisma schema change propagation
- [ ] Create issue for `as never` → typesafe mock migration (optional, project-level decision)
- [ ] Add `knip` or `ts-prune` dead code detection to CI (optional)
