# feat: KB v2 统一知识对象基础

## Goal

重建知识库为 review-native 的 KB v2，统一知识对象、作用域、审核状态、负向知识、版本化和 claim 回流通道，让知识库从“抽取辅助配置”升级为新架构的正式知识底座。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §9, §9.1, §9.2, §9.3, §9.4, §9.5, §13.1

## Files

- Create: `src/server/modules/knowledge-v2/**`
- Modify: `prisma/schema.prisma`
- Create: `src/server/modules/knowledge-v2/*.test.ts`

## Requirements

### 1. Unified knowledge object

- 至少统一：
  - `scopeType`
  - `scopeId`
  - `knowledgeType`
  - `payload`
  - `source`
  - `reviewState`
  - `confidence`
  - `effectiveFrom`
  - `effectiveTo`
  - `promotedFromClaimId`
  - `supersedesKnowledgeId`
  - `version`
- 不再让别名包、时间规则、关系规则、禁合并规则各自维护完全不同的主语义

### 2. Review-native behavior

- 知识对象需要统一审核状态机：`PENDING / VERIFIED / REJECTED / DISABLED`
- 支持 `GLOBAL / BOOK_TYPE / BOOK / RUN` 四级作用域
- 负向知识必须是一等公民，包括禁合并、禁关系、禁时间归一等
- 保留来源追踪与变更审计

### 3. Claim promotion path

- 允许高复用价值的审核结论从 claim 提升为知识条目
- 运行时装载与后台管理必须映射到同一知识对象契约
- KB v2 只能影响候选生成、排序、校验和冲突提示，不能直接写正式 projection

## Acceptance Criteria

- [ ] KB v2 形成统一知识对象与统一状态机
- [ ] 作用域、版本、失效、来源追踪可以在同一对象模型中表达
- [ ] 负向知识得到正式建模
- [ ] Stage A+ 与后续关系目录可直接复用 KB v2 基础

## Definition of Done

- [ ] schema、仓储、装载与测试落地
- [ ] 明确替代旧“运行时统一、管理时分裂”的过渡式知识设计
- [ ] 不再把知识库仅视为 prompt 辅助配置
