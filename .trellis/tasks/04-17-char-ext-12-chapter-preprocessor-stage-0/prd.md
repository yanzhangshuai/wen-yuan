# feat: Stage 0 章节预处理器（四区段切分 + 覆盖率自白 + 死亡标记）

## Goal
在 LLM 介入之前，用规则层对每章原文做结构化切分，输出可审计的区段标注 + 覆盖率自白 + 死亡标记词主语候选。这是整个三阶段管线的准确率前提——把可靠规则能做的事从 LLM 手里夺回来。

## 契约
- `docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-FINAL §0-2 §0-4 §0-5

## 前置依赖
- T01 schema-migration（需要 `preprocessorConfidence` / `narrativeRegionType` / `deathChapterNo` 字段）

## Requirements

### 1. 模块结构
- 新建 `src/server/modules/analysis/preprocessor/ChapterPreprocessor.ts`
- 新建 `src/server/modules/analysis/preprocessor/deathMarkers.ts`
- 新建 `src/server/modules/analysis/preprocessor/types.ts`（输出 `ChapterPreprocessResult` 类型）

### 2. 四区段切分规则
| 区段 | 识别规则 |
|------|--------|
| POEM | `有诗为证\|有词为证\|诗曰\|词曰` 起始至下一空行或"此诗\|此词" 结束 |
| DIALOGUE | `[""「『]` 内容 + 引入句 (`XX 道`/`XX 说`/`XX 答道`/`XX 笑道`/`XX 怒道` 等) |
| COMMENTARY | `却说\|话说\|看官听说\|且说\|按\|诸君试看\|原来` 起首的议论段（至下一 DIALOGUE 或段落转折） |
| NARRATIVE | 未被以上匹配的剩余正叙 |
| (unclassified) | 多规则冲突或未匹配段落；用于覆盖率自白 |

> 注：重叠优先级 POEM > DIALOGUE > COMMENTARY > NARRATIVE。

### 3. 覆盖率自白（§0-4）
- 输出 `{ narrative, poem, dialogue, commentary, unclassified }` 五段**字符占比**（0-1 浮点）
- `unclassified > 0.10` → `preprocessorConfidence = 'LOW'`；否则 `HIGH`
- 写入 `analysis_job_logs` 或新增 `chapter_preprocess_results` 表（按 T01 schema 落地）

### 4. 死亡标记词抽主语（§0-2）
- 标记词正则（完整列表）：`病逝|病故|故去|故了|归天|一命呜呼|无常|云亡|殒|殒命|殁|卒|薨|死于|死在|圆寂|羽化|殉|毙|夭亡`
- 命中后向前扫描 30 字内最近的**中文人名 token**（2-4 字），作为主语候选
- 对每个匹配产出 `{ chapterNo, marker, subjectCandidate, spanStart, spanEnd, rawSpan }`
- 写入 `persona.deathChapterNo` 候选源；冲突时以 Stage 0 为准（§0-2）

### 5. 与 Stage A 的接口
- 暴露 `preprocessChapter(chapterText, chapterNo): ChapterPreprocessResult`
- Stage A 启动前必跑；`regionMap` 作为 Stage A `enforceRegionOverride` 的输入（§0-5）

## TDD 测试清单

- [ ] 单元：纯正叙章节 → unclassified < 10% AND HIGH
- [ ] 单元：含 3 首诗词 → POEM 占比正确，不被 NARRATIVE 吞
- [ ] 单元：`却说` 引入的议论段 → COMMENTARY
- [ ] 单元：`王冕道："..."` → DIALOGUE 区段 + 引入句主语"王冕"可被 Stage A 识别为 SELF 候选
- [ ] 单元：死亡标记词 11 个全部命中 + 主语抽取正确率 ≥ 90%（手工 fixture）
- [ ] 单元：LOW confidence 章节（混乱拼接文本）正确打标
- [ ] 集成：儒林外史 55 回完整跑一遍，所有章节 preprocessorConfidence 分布统计 + unclassified 均值记录

## Definition of Done

- [ ] `pnpm test -- preprocessor` 全绿，覆盖率 ≥ 90%
- [ ] 儒林外史第 20 回（牛布衣病逝章）→ 死亡标记"病逝"命中，主语"牛布衣"抽出，deathChapterNo=20 候选写入
- [ ] `pnpm lint` + `pnpm type-check` 干净
- [ ] 产出 `.trellis/workspace/reports/preprocessor-rulin-coverage.md`（55 回覆盖率分布表）
- [ ] 代码注释中文为主，遵循 AGENTS.md 风格
