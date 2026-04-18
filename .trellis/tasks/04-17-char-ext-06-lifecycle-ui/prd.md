# feat: Persona lifecycle 过滤与 CANDIDATE 审核 Tab

## Goal

新 lifecycle 字段的 UI/API 落地：公开端仅展示 CONFIRMED；Admin 审核页新增 CANDIDATE Tab 供人工一键晋级；MERGED_INTO 不暴露。

## Spec

见 spec §2（lifecycle 规则）、§4.7（后处理规则）。

## Requirements

### 1. Server DTO
- `listPersonas` / `getBookById.personasCount` / viewer graph 查询：默认只返 `lifecycle_status='CONFIRMED'`
- 新接口 `listCandidatePersonas({ bookId, pagination })`：返 lifecycle_status='CANDIDATE' 的 persona 列表 + 聚合指标（mentionCount/distinctChapterCount/sampleMentionRawSpan）
- 新 mutation `promotePersonaToConfirmed({ personaId })` / `demotePersona({ personaId, reason })` / `mergePersona({ sourceId, targetId })`（后者把 source 置 MERGED_INTO 并迁移 mentions+biography）

### 2. Admin UI
- `/admin/books/[id]/review` 新 Tab：CANDIDATE (右上角红点显示数量)
- 每张候选卡片：名字 / mentionCount / distinctChapterCount / biographyCount / 样本证据片段 / [晋级] [驳回] [合并到...] 三按钮
- 合并到：打开 Combobox 选其他 CONFIRMED persona

### 3. Viewer / 图谱
- 图谱 D3 节点数据源改为 CONFIRMED-only
- 若图谱 edge 引用了 MERGED_INTO 的 persona，自动跳到 merged_into_id 的 CONFIRMED persona

### 4. 兼容 API 字段
- 如有前端直接读 `persona.aliases: string[]`，由 server 层 JOIN alias_mappings 生成兼容字段（见 T01 说明）

## Acceptance Criteria

- [ ] Admin CANDIDATE Tab 可见候选人物并可晋级
- [ ] 公开 viewer 图谱人物数与 CONFIRMED 数一致
- [ ] 合并操作将源 persona 置 MERGED_INTO，并迁移 mentions/biography 到目标
- [ ] 晋级/驳回操作有审计日志（可复用现有 review log 表，或加字段）
- [ ] E2E 测试覆盖晋级 + 合并

## Definition of Done

- [ ] UI 响应 4 套主题
- [ ] TypeScript 严格模式通过
- [ ] 不再有任何 API 暴露 MERGED_INTO / NOISE 状态的 persona

---

## §0-FINAL 对齐补丁（最终契约 · 以此为准 · 覆盖前文冲突项）

> 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-FINAL（§0-F.1 ~ §0-F.5）。
> 两轮反审结论 + 用户"不区分 MVP 全量做"决策。

### ⚠️ 任务重写（对齐 §0-11）

**原任务目标被废弃**，改为 CANDIDATE 桶**只读**列表页（无晋级交互）。理由：§0-11 要求 CANDIDATE 桶规模 KPI 作为管线合格门槛，应由人工审 `/admin/books/:id/review`（见 T07 重写）做晋级，本页仅展示。

- [ ] 新页面 `src/app/admin/books/[id]/candidates/page.tsx`（路由分组：admin）
- [ ] 列表字段：surfaceForm / mentionCount / distinctChapterCount / biographyCount / evidence 预览（首条 rawSpan 截断）/ "未通过门槛原因"（§0-7 判定说明）
- [ ] 分页（默认 50/页）、按章节过滤、按门槛原因筛选
- [ ] **只读**：不提供 promote / demote / merge 按钮
- [ ] API：`GET /api/admin/books/:id/candidates`（viewer 返回 403）
- [ ] `/trellis:before-dev` 注入的 Next.js / shadcn/ui 规范严格遵守

### DoD 追加
- [ ] 管理员访问通过，viewer 403
- [ ] 列表对 300+ candidate 分页正常无卡顿
- [ ] 测试：筛选 + 分页边界
