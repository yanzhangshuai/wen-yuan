# 人物增强-基础设施与数据结构

## Goal
完成别名映射与自检报告的数据层与类型层基础建设，为后续服务实现提供稳定契约。

## Requirements
- 更新 Prisma schema: AliasType, AliasMappingStatus, AliasMapping, ValidationReport
- 补齐 Book/Persona/AnalysisJob 关系
- 生成 migration 与 client
- 新增 `src/types/validation.ts`
- 扩展 `src/types/analysis.ts` 的别名相关类型

## Acceptance Criteria
- [ ] `npx prisma validate` 通过
- [ ] migration 文件生成
- [ ] `npx prisma generate` 成功
- [ ] `npx tsc --noEmit` 通过
