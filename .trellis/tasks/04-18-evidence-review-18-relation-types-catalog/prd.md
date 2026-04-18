# feat: 关系类型目录与治理层

## Goal

建立 `relation_types` 目录或等价知识对象，作为关系类型的治理层，统一管理字符串 key、显示名、同义标签、作用域、方向建议、系统预设与自定义关系提升流程。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.2, §7.3, §8.3, §9.4, §9.5, §9.6, §13.2

## Files

- Create: `src/server/modules/knowledge-v2/relation-types/**`
- Modify: `prisma/schema.prisma`
- Create: `src/server/modules/knowledge-v2/relation-types/*.test.ts`

## Requirements

### 1. Catalog contract

- 目录层至少管理：
  - `key`
  - 默认显示名
  - 同义标签映射
  - 作用域
  - 推荐方向性
  - 是否系统预设
  - 是否启用
- `relationTypeKey` 底层仍为字符串，不改成数据库 enum

### 2. Preset plus custom governance

- 提供内置常用关系种子
- 允许用户自定义关系先以 claim 形式保存，再后置提升为目录项
- 支持把高频且稳定的自定义关系提升为 `BOOK` 或 `BOOK_TYPE` 级目录知识
- 支持同义关系归一建议，但不能静默改写原始 `relationLabel`

### 3. Runtime integration

- Stage A+ 可读取目录生成关系归一建议
- 审核 API 和关系编辑器可读取目录作为快捷选择与治理信息
- 目录治理与 claim 保存解耦，避免“先建目录才能审核”

## Acceptance Criteria

- [ ] `relationTypeKey` 字符串策略与目录治理层共存
- [ ] 预设关系、自定义关系、提升为目录项的流程清晰可执行
- [ ] 关系同义词与方向建议可被运行时与审核端复用
- [ ] 不再需要数据库 migration 才能新增业务关系类型

## Definition of Done

- [ ] schema、seed、目录服务与测试落地
- [ ] 与 T07、T14、T21 契约打通
- [ ] 关系类型治理从代码预设过渡为“代码种子 + 数据目录”模型
