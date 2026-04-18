# feat: Stage A 章节硬提取服务

## Goal

实现三阶段架构的第一阶段：逐章调用 Prompt A 产出 ChapterMention[]，写入 `persona_mention_candidates`；原始 LLM 返回写入 `analysis_llm_raw_outputs`。**禁止任何合并/去重/推断**。

## Spec

见 spec §2（Stage A 段落）、§3.6（两张新表）、§4.1（Prompt A）。

## Requirements

### 1. 新文件 `src/server/modules/analysis/pipelines/threestage/StageAExtractor.ts`
- 入口 `extractChapter({ bookId, chapterId, jobId, content, chapterNo, chapterTitle, bookTitle }): Promise<ChapterMention[]>`
- 步骤：
  1. `resolvePromptTemplate({ slug: 'STAGE_A_EXTRACT_MENTIONS', replacements: ... })`
  2. 调用 AI provider（走现有 `providers/ai`），**非流式**
  3. 解析返回 JSON，对每条 mention 做：
     - 字段校验（surfaceForm 非空 + ≤12字；rawSpan ≤120字；aliasType/identityClaim 是合法 enum）
     - 丢弃纯地名/纯数量词（硬规则一层兜底）
     - 保留未通过的 mention 进 discardReasons 日志
  4. 写 persona_mention_candidates（**按 chapterId 幂等**：同 jobId+chapterId 重跑先 DELETE 再 INSERT）
  5. 写 analysis_llm_raw_outputs（`stage='STAGE_A'`）

### 2. 类型定义 `src/server/modules/analysis/types/three-stage.ts`
```ts
export type ChapterMention = {
  surfaceForm: string;
  aliasType: AliasType | 'UNSURE';
  identityClaim: IdentityClaim;
  actionVerb: string | null;
  rawSpan: string;
  contextHint: string | null;
  confidence: number;
};
```

### 3. 单测 `StageAExtractor.test.ts`
- 喂一段儒林外史第 21 回节选（含"偷看牛布衣诗稿，到郭铁笔店刻图书，谎称牛布衣"）
- 断言产出包含：
  - surfaceForm="牛浦", identityClaim="SELF"
  - surfaceForm="牛布衣", identityClaim="IMPERSONATING"
- LLM 使用 mock（`providers/ai/__mocks__`）；返回预设 JSON

### 4. 配置
- `config/pipeline.ts` 加 `stageA: { batchSize, temperature, maxRetries }`

## Acceptance Criteria

- [ ] 单章测试通过
- [ ] 幂等：同 (jobId, chapterId) 重跑 candidate 数量不变
- [ ] 原始返回完整落 analysis_llm_raw_outputs
- [ ] 非法 JSON 返回时抛 `StageAExtractionError` 并记录 rawResponse
- [ ] `pnpm lint && pnpm type-check && pnpm test src/server/modules/analysis/pipelines/threestage/` 全绿

## Definition of Done

- [ ] 新代码 ≥ 90% 行覆盖
- [ ] 所有 Prompt 调用都带有 `promptHash` 审计
- [ ] Stage A 不直接写 personas / mentions / biography_records（严格隔离）

---

## §0-FINAL 对齐补丁（最终契约 · 以此为准 · 覆盖前文冲突项）

> 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-FINAL（§0-F.1 ~ §0-F.5）。
> 两轮反审结论 + 用户"不区分 MVP 全量做"决策。

### 覆盖 / 新增（对齐 §0-5 §0-8 REV-1 + 依赖 T12）

- [ ] **前置依赖**：T12 chapter-preprocessor-stage-0 必须先完成
- [ ] 新增 `src/server/modules/analysis/pipelines/threestage/StageAExtractor.ts`
- [ ] 规则层 `enforceRegionOverride(mentions, regionMap)`：
  - POEM 区段 mention → identityClaim = HISTORICAL 或 POEM_ALLUSION（强制）
  - COMMENTARY 区段 mention → REPORTED（强制）
  - DIALOGUE 区段 mention：
    - 引入句主语 → 保持 SELF（REV-1）
    - 引号内被提及第三方 → QUOTED（强制）
    - 引号内自称 → 允许 SELF，但 evidence 必须覆盖引入句主语
- [ ] 输入 Stage 0 ChapterPreprocessResult + 原文；输出写 `mentions` 表（含 suspectedResolvesTo / identityClaim / narrativeRegionType / chapterNo）
- [ ] TDD：先写 6 个区段覆写测试用例再实现
- [ ] 单元测试 ≥ 90% 覆盖率

### DoD 追加
- [ ] 测试文件 StageAExtractor.test.ts 含"引入句主语 SELF 保留"反校准用例
- [ ] Stage A 对单章原文处理耗时 < 3s（不含 LLM 调用）
