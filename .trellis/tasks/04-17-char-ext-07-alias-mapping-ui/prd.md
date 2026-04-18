# feat: AliasMapping 审核 UI 支持冒名/误认卡片

## Goal

Admin 别名审核页升级：支持新 aliasType（IMPERSONATED_IDENTITY / MISIDENTIFIED_AS），显示双 persona（真身 + 被冒名者/被误认者）、章节区间、evidence。批准/驳回/降级。

## Requirements

### 1. API
- `listAliasMappings({ bookId, status, aliasType? })`：扩展返 target_persona 嵌套对象 + evidenceChapterNos + chapterStart/End
- `approveAliasMapping(id)` / `rejectAliasMapping(id)` / `convertAliasMappingType({ id, newType })`

### 2. UI
- `/admin/books/[id]/review` 加 "别名/冒名" Tab
- 卡片样式按 aliasType 分色：
  - NAMED/COURTESY_NAME/TITLE/NICKNAME：普通灰
  - IMPERSONATED_IDENTITY：红底 "A 冒充 B" 双 persona 显示
  - MISIDENTIFIED_AS：橙底 "A 被误认为 B"
- 显示章节区间徽章（例：第 21-24 回）
- 显示 evidenceChapterNos 前 3 条 rawSpan
- 批量操作按钮：全部批准 / 全部驳回（仅对选中项）

### 3. 图谱视觉提示
- 图谱页面 persona 悬停 tooltip：若存在 IMPERSONATED_IDENTITY 出边，显示"曾冒充 XXX（第 A-B 回）"
- MISIDENTIFIED_AS 同理

## Acceptance Criteria

- [ ] 牛浦 persona 详情页显示"冒充：牛布衣（第 21-24 回）"
- [ ] 审核员批准后 status=APPROVED，拒绝后 status=REJECTED
- [ ] 批准不会改变 biography_records（事件已正确归属真身）
- [ ] E2E：建一个冒名映射 → 审核批准 → 图谱 tooltip 更新

## Definition of Done

- [ ] UI 文案中文为主
- [ ] 4 套主题通过视觉审阅
- [ ] 单元 + E2E 测试覆盖

---

## §0-FINAL 对齐补丁（最终契约 · 以此为准 · 覆盖前文冲突项）

> 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-FINAL（§0-F.1 ~ §0-F.5）。
> 两轮反审结论 + 用户"不区分 MVP 全量做"决策。

### ⚠️ 任务重写（对齐 §0-9 §0-14）

**原 alias 映射 UI 目标被合并到本任务**，主焦点改为冒名/合并建议审核中心。

- [ ] 新页面 `src/app/admin/books/[id]/review/page.tsx`（Tab 化）
- [ ] **Tab 1：合并建议队列**（source=* status=PENDING）
  - 列表：两边 persona 摘要 + evidence 节选 + confidence + 来源（stage-b 规则 / stage-c 反馈 / B.5 IMPERSONATION_CANDIDATE）
  - 动作：ACCEPT（事务：persona 合并 + mention 重指 + biography 重指 + 写审计日志）/ REJECT（标记 status=REJECTED + 写拒绝原因）
- [ ] **Tab 2：冒名关系图**
  - 查 `alias_mappings` WHERE `aliasType=IMPERSONATED_IDENTITY`
  - D3 图可视化：真身 persona → 冒用身份 persona
- [ ] **Tab 3：Stage C 反馈队列**（source=STAGE_C_FEEDBACK）
  - 独立展示，方便定位 Stage B 漏判
- [ ] 审计表：`review_audit_logs (id, reviewerId, action, targetType, targetId, beforeSnapshot, afterSnapshot, reason, createdAt)`
- [ ] API 事务性：合并操作必须 Prisma `$transaction`

### DoD 追加
- [ ] 合并事务失败时完整回滚（单元测试覆盖）
- [ ] 牛浦/牛布衣冒名关系能在 Tab 2 正确显示为 IMPERSONATED_IDENTITY 而非 alias
