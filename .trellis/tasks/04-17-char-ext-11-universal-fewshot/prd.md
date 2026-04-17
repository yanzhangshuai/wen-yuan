# char-ext-11-universal-fewshot · feat: 通用 Few-shot 示例库与运行时拼接

## Goal

给每种 BookType × stage 预置高质量 few-shot，保证 Stage A/B/C/D 的 LLM 调用在该体裁下有"可直接模仿"的样例，减小抽取召回/精度漂移。

## Requirements

1. **Schema（依赖 T1）**
   - 新表 `BookTypeExample`:
     - `id string PK`
     - `bookType BookType`
     - `stage string`（STAGE_A / STAGE_B / STAGE_C / STAGE_D）
     - `label string`（人可读标签，如"宋江-绰号-字-名三合一"）
     - `exampleInput text`（原文片段 + 上下文，≤800 字）
     - `exampleOutput text`（期望 JSON 输出片段）
     - `verified boolean default false`
     - `priority int default 0`（越高越优先被选）
     - `createdAt / updatedAt`
   - index(bookType, stage, priority)

2. **Seed 数据（最低）**
   - 5 种 BookType × 3 stage × 至少 3 条 = 45 条
   - 覆盖的 BookType: SATIRICAL / HEROIC / HISTORICAL / MYTHOLOGICAL / DOMESTIC
   - 每条 fewshot 必须基于真实原著片段（不虚构）
   - **STAGE_A 必含**：牛浦冒名 / 宋江绰号/ 刘备+玄德 / 孙悟空=行者 / 贾宝玉="二爷"
   - **STAGE_B 必含**：同姓族 SPLIT / 冒名识别 / 变化 TRANSFORMATION / GENERATIONAL 消歧 / 绰号合并
   - **STAGE_C 必含**：冒名事件归属 / 转述 QUOTED / 梦境 DREAM / 同名消歧

3. **运行时装配**
   - `resolvePromptTemplate(...)` 增加 `stage: string` 形参
   - 查 `BookTypeExample where bookType=? AND stage=? AND verified=true order by priority desc limit 3`
   - 格式化为 markdown 片段插入 `{{bookTypeFewShots}}` 占位符

4. **Admin UI（最小可用）**
   - `/admin/knowledge/fewshots` 列表 + 按 bookType/stage 筛选
   - 支持增/改/删 + 切换 verified 标志
   - 非 verified 的 fewshot 不会被运行时选中

5. **质量守门**
   - seed 文件入库前 reviewer ≥2 人审阅（PR 中的 review）
   - 每条 fewshot 必须能直接放入 Prompt 执行且产出不崩

## Acceptance Criteria

- [ ] migration 生效；至少 45 条 verified=true fewshot seed 入库
- [ ] 单元测试：调用 `resolvePromptTemplate({ slug:"stage-a-extract-mentions", bookType:"HEROIC", stage:"STAGE_A" })` 返回的文本包含至少 1 段标注"宋江"的 fewshot
- [ ] admin UI 可见 fewshot 列表，可切换 verified
- [ ] pnpm lint / type-check / test 全绿

## Definition of Done

- BookTypeExample 能在 T3/T4/T5 运行时稳定被拉取
- `{{bookTypeFewShots}}` 占位符在 prompt baseline 中就位（与 T2 对齐）
- 与 T10 BookType 系统配合后形成闭环

## References

- spec §3.7 (BookTypeExample), §4 (占位符), §6.2 (多 BookType 验收)
- 依赖 T1（schema）/ T2（baseline 占位符）/ T10（bookType 传参）

---

## §0-FINAL 对齐补丁（最终契约 · 以此为准 · 覆盖前文冲突项）

> 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-FINAL（§0-F.1 ~ §0-F.5）。
> 两轮反审结论 + 用户"不区分 MVP 全量做"决策。

### 覆盖 / 新增（对齐 §0-1 §0-12）

- [ ] **本任务保留**（用户"都做"决策）
- [ ] 表：`BookTypeExample { id, bookTypeId, stage: A|B|C, promptSlug, exampleInput String, exampleOutput String, createdAt, updatedAt }` unique(bookTypeId, stage, promptSlug, position)
- [ ] seed：每 BookType × 每 stage ≥ 3 条 few-shot
- [ ] **关键约束（§0-1）**：儒林外史的 few-shot example **不得**使用 T08 regression fixture 中出现的章节/人物；其他四 BookType 同理
- [ ] 注入函数：`resolveWithExamples(slug, bookTypeId, stage)` 拼接 baseline + few-shot 后返回；few-shot 数量上限 5（token 预算）
- [ ] 运行时：Stage A/B/C 调用前走 `resolveWithExamples`

### DoD 追加
- [ ] 白名单脚本对 BookTypeExample seed 也跑 check（防具名实体泄漏，与 fixture 交叉验证）
- [ ] 相同 slug 不同 bookTypeId 返回不同 few-shot（测试）
