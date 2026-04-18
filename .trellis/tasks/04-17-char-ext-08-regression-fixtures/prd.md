# feat: 儒林外史冒名场景回归 fixture

## Goal

为三阶段架构建立《儒林外史》专项回归测试：覆盖牛浦冒名、张铁臂化名、严监生/严贡生同姓、娄府四兄弟、匡超人 5 个核心场景。断言 DB 落库结果严格正确。

## Requirements

### 1. 测试数据 `__fixtures__/liurun/`
- `chapter-21-excerpt.txt` 牛浦第 21 回偷诗稿至刻图书节选
- `chapter-22-excerpt.txt` 牛浦冒名赴扬州
- `chapter-12-13-zhang-tiebi.txt` 张铁臂 / 张俊民
- `chapter-5-6-yan.txt` 严监生 / 严贡生
- `chapter-8-12-lou.txt` 娄三 / 娄四 / 娄中堂 / 娄太爷
- `chapter-15-20-kuang.txt` 匡超人

### 2. LLM Mock
- 预录 Stage A/B/C 三阶段的合规 JSON 返回，放在 `__fixtures__/liurun/llm-responses/`
- Vitest mock provider 根据 promptHash 匹配返回

### 3. 测试文件 `liurun-regression.integration.test.ts`
- 运行全流水线（threestage），针对每场景断言：

**场景 1 · 牛浦/牛布衣**
- `personas.count(lifecycle=CONFIRMED, name='牛浦')=1`
- `personas.count(lifecycle=CONFIRMED, name='牛布衣')=1`
- `牛布衣.lastSeenChapter=20`
- `biography_records.where(personaId=牛浦.id AND chapterNo BETWEEN 21 AND 24).count ≥ 5`
- 其中 `actorRole=IMPERSONATING AND actor_used_identity_id=牛布衣.id` 至少 3 条
- `alias_mappings.where(personaId=牛浦.id AND alias='牛布衣' AND aliasType='IMPERSONATED_IDENTITY' AND target_persona_id=牛布衣.id).count=1`
- 牛布衣 persona 关联别名（JOIN alias_mappings NAMED/COURTESY_NAME 等）不含 "牛浦/牛浦郎/浦郎"

**场景 2 · 张铁臂/张俊民**：单 persona（真身张铁臂）+ 一条 alias_mapping（aliasType 按情节为 NAMED 或 IMPERSONATED_IDENTITY）

**场景 3 · 严监生/严贡生**：两个独立 persona，无 MergeSuggestion 把二者当同一人

**场景 4 · 娄府**：娄三公子 / 娄四公子 / 娄中堂 / 娄太爷 四个独立 CONFIRMED persona

**场景 5 · 匡超人**：单 CONFIRMED persona；别名数组（JOIN）仅含真名别称，不含他人名字

## Acceptance Criteria

- [ ] 5 场景全绿
- [ ] 任一断言失败时错误信息清晰（带 personaId + 查询片段）
- [ ] 测试运行时间 ≤ 30s（使用 mock，不真实调 LLM）

## Definition of Done

- [ ] CI 集成
- [ ] 失败时 dump DB 快照用于 debug

## 追加要求（通用化 · 覆盖 5 种 BookType）

不再只针对儒林外史。必须新增以下 fixture（每种至少 1 条），断言按 spec §6.3：

- [ ] **SATIRICAL（儒林外史）**：原有 5 条保留
- [ ] **HEROIC（水浒传）**：
  - 宋江=及时雨=公明（NAMED + NICKNAME + COURTESY_NAME 合并）+ PersonaEpoch（押司/落草/招安 3 阶段）
  - 武松=行者武松（TRANSFORMATION alias）
  - 王英/王庆/王伦三独立 persona（同姓 SPLIT）
- [ ] **HISTORICAL（三国演义）**：
  - 刘备=玄德=刘豫州（合并）；刘备/刘表/刘璋三独立
  - 关羽=云长=关公=关圣（POSTHUMOUS_TITLE 合并）
- [ ] **MYTHOLOGICAL（西游记）**：
  - 孙悟空=行者=齐天大圣=美猴王（4 alias 合并 + PersonaEpoch）
  - 白骨精三变（单主体 + 3 条 TRANSFORMATION alias，narrativeLens=TRANSFORMED）
- [ ] **DOMESTIC（红楼梦）**：
  - "二爷" sceneContextHint 消歧：宝玉房中=贾宝玉；琏二奶奶面前=贾琏
  - 林黛玉=潇湘妃子=颦儿（PEN_NAME + NICKNAME 合并）
  - 贾母=老祖宗=史太君（TITLE + POSTHUMOUS_TITLE 合并）
- [ ] 每个 fixture 都要断言 precision@top100 ≥ 0.85（若 fixture 规模小则退化为全量 precision）
- [ ] fixture 不依赖 LLM 真实调用，提供 mock 的 Stage A/B/C 原始输出以便 CI 稳定运行

---

## §0-FINAL 对齐补丁（最终契约 · 以此为准 · 覆盖前文冲突项）

> 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-FINAL（§0-F.1 ~ §0-F.5）。
> 两轮反审结论 + 用户"不区分 MVP 全量做"决策。

### 覆盖 / 新增（对齐 §0-12 §0-1）

- [ ] 目录结构 `fixtures/regression/` 按五 BookType：
  - satirical-rulin / heroic-shuihu / mythological-xiyou / domestic-hongloumeng / historical-sanguo
- [ ] 每 BookType 3–5 个场景（1 个场景 = 1 个章节 sample + expected JSON）：
  - satirical-rulin：牛浦冒牛布衣 / 严贡生讹诈 / 杜少卿散财
  - heroic-shuihu：阮氏三雄同姓族 / 宋江+宋清 / 鲁智深法名俗名
  - mythological-xiyou：孙悟空 72 变 / 六耳猕猴真假美猴王 / 法名-俗名对映
  - domestic-hongloumeng：宝黛钗主线 / 甄贾宝玉 / 刘姥姥三进
  - historical-sanguo：诸葛亮多尊称 / 关羽字号 / 董卓刺杀
- [ ] Expected JSON schema：`{ personas: [...], biographies: [...], aliasMappings: [...], impersonationCandidates: [...] }`
- [ ] **严禁泄漏答案给 Prompt**（§0-1）：fixtures 内容不得复制到 `prompt-template-baselines.ts` 或 `BookTypeExample` 表；T11 seed 的 few-shot 必须使用**其他**章节/人物
- [ ] 测试入口：`pnpm test -- regression/<book-type>`；每场景通过率独立统计

### DoD 追加
- [ ] 白名单脚本跑 `scripts/check-prompt-whitelist.ts` 对 baselines + BookTypeExample 记录均 pass
- [ ] 每 BookType 生成 `.trellis/workspace/reports/regression-<type>.md` 基线数字
