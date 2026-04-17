# char-ext-10-booktype-system · feat: BookType 系统与按类型 Prompt/阈值装配

## Goal

让人物解析管线具备"按中国古典小说体裁（BookType）自适应"的能力：同一套三阶段架构、同一批 baseline Prompt，在解析水浒（HEROIC）/三国（HISTORICAL）/西游（MYTHOLOGICAL）/红楼（DOMESTIC）/儒林（SATIRICAL）时自动注入该类型专属的 specialRules、fewShots 与阈值，使多种体裁都能达到 ≥85% precision@top100。

## Requirements

1. **Schema（依赖 T1）**
   - `Book` 新增 `type BookType` 字段，默认 `GENERIC`
   - `BookType` enum: SATIRICAL / HEROIC / HISTORICAL / MYTHOLOGICAL / DOMESTIC / ROMANTIC / DETECTIVE / NOTE_STYLE / GENERIC
   - 新表 `PromptTemplateVariant(id, templateSlug, bookType, specialRules text, fewShotsJson json, createdAt, updatedAt)` unique(templateSlug, bookType)

2. **运行时装配**
   - `src/server/modules/knowledge/prompt-templates.ts` `resolvePromptTemplate(...)` 扩展参数 `bookType?: BookType`
   - 查询 `PromptTemplateVariant where templateSlug=? AND bookType=?`（兜底 GENERIC）
   - 把 `specialRules` 拼到 `{{bookTypeSpecialRules}}` 占位符；`{{bookTypeFewShots}}` 由 T11 的 BookTypeExample 提供，本任务只保留占位符插槽

3. **阈值注入**
   - 新建 `src/server/modules/analysis/config/pipeline-by-booktype.ts`，导出 `thresholdsByBookType: Record<BookType, Partial<PipelineThresholds>>`（spec §3.8 给出映射）
   - `StageBResolver` 在执行前读取 `book.type` 并 merge 阈值（base = pipeline.ts 默认值；overlay = thresholdsByBookType[book.type]）

4. **Admin 界面**
   - 书籍编辑表单新增 BookType 下拉（9 选 1）
   - 改 type 后提示"需要 re-run 才能生效"，不自动触发

5. **AI 辅助分类（可选）**
   - 新接口 `POST /api/admin/books/:id/auto-classify-type`
   - 读取目录 + 前 2 章摘要送 LLM，返回推荐 BookType + 理由；admin 确认后写入
   - 非本任务阻塞点；若时间紧张，手动选择已足够

6. **Seed 初始数据**
   - `prisma/seed.ts` 为 SATIRICAL/HEROIC/HISTORICAL/MYTHOLOGICAL/DOMESTIC 5 种 BookType × (STAGE_A/STAGE_B/STAGE_C/STAGE_D) 4 stage 各预置 PromptTemplateVariant 记录（specialRules 内容见 spec §3.8/§4 中每种 BookType 的规则片段）
   - 《儒林外史》(bookId 7d822600-9107-4711-95b5-e87b3e768125) 写入 `type=SATIRICAL`

## Acceptance Criteria

- [ ] `prisma migrate dev` 成功，Book.type 默认值 GENERIC 在所有既有书上生效
- [ ] PromptTemplateVariant 至少 20 条 seed（5 BookType × 4 stage）
- [ ] `resolvePromptTemplate({ slug: "stage-a-extract-mentions", bookType: "SATIRICAL" })` 的返回文本中包含 SATIRICAL 专属 specialRules 段落
- [ ] `getEffectiveThresholds(book)` 单元测试：对 HEROIC 返回 sameSurnameDefaultSplit=false；对 HISTORICAL 返回 sameSurnameDefaultSplit=true
- [ ] Admin UI 可以切换 BookType 并持久化
- [ ] pnpm lint / type-check / test 全绿

## Definition of Done

- schema + seed + 运行时装配闭环；与 T11 配合后可供 T4/T5 使用
- 该任务完成后，不同 BookType 的书走同一三阶段 pipeline 但行为差异可见于 LLM 日志 / threshold 快照

## References

- spec §3.1 (BookType enum), §3.7 (新表), §3.8 (阈值), §4 (占位符)
- 依赖 T1 schema-migration 先合入

---

## §0-FINAL 对齐补丁（最终契约 · 以此为准 · 覆盖前文冲突项）

> 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-FINAL（§0-F.1 ~ §0-F.5）。
> 两轮反审结论 + 用户"不区分 MVP 全量做"决策。

### 覆盖 / 新增（对齐 §0-12 §0-15 §0-F.1）

- [ ] **本任务保留进入最终图**（用户"都做"决策覆盖原 §0-12 MVP 禁令）
- [ ] `src/server/modules/booktype/thresholdsByBookType.ts` 映射：
  ```ts
  {
    SATIRICAL: { confirmedMentionCount: 2, confirmedChapterCount: 2, mergeConfidenceFloor: 0.85 },
    HEROIC:    { confirmedMentionCount: 3, confirmedChapterCount: 2, mergeConfidenceFloor: 0.85 },
    MYTHOLOGICAL: { confirmedMentionCount: 2, confirmedChapterCount: 2, mergeConfidenceFloor: 0.88 },
    DOMESTIC:  { confirmedMentionCount: 2, confirmedChapterCount: 2, mergeConfidenceFloor: 0.85 },
    HISTORICAL:{ confirmedMentionCount: 3, confirmedChapterCount: 3, mergeConfidenceFloor: 0.85 },
    GENERIC:   { confirmedMentionCount: 2, confirmedChapterCount: 2, mergeConfidenceFloor: 0.85 }
  }
  ```
- [ ] `Book.type BookType default GENERIC`（T01 已落）；导入向导 UI 增加 BookType 选择
- [ ] `PromptTemplateVariant` 表查询逻辑：`resolveWithVariant(slug, bookTypeId)` → 有变体用变体，无则 baseline
- [ ] 所有 Stage A/B/C 调用点接收 `bookType` 参数，阈值、Prompt 变体均按此参数取
- [ ] Stage B 合并置信度下限从 `thresholdsByBookType[bookType].mergeConfidenceFloor` 取，默认 GENERIC

### DoD 追加
- [ ] 为每个 BookType 至少一个 BookType 上跑过一次 fixtures（与 T08 联动）
