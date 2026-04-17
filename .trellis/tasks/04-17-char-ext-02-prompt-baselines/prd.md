# feat: Prompt 基线替换为 Stage A/B/C/D 四条

## Goal

在 `prompt-template-baselines.ts` 新增 4 条 baseline 并写入数据库（通过 `pnpm prisma db seed` 或迁移），替代旧 twopass 的 `SINGLE_CHAPTER_EXTRACTION` / `TWOPASS_GLOBAL_MERGE`。

## Spec

四条 Prompt 全文见 `docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §4。

## Requirements

### 新增 baseline slug
- `STAGE_A_EXTRACT_MENTIONS`（章节硬提取，每称呼一条，禁合并）
- `STAGE_B_RESOLVE_ENTITIES`（全书仲裁，强制 evidence, decision=MERGE|SPLIT|UNSURE，IMPERSONATED 必须 SPLIT）
- `STAGE_C_ATTRIBUTE_EVENT`（事件归属，输出 actorTrueIdentityId/actorUsedIdentityId/actorRole）
- `STAGE_D_NOISE_FILTER`（候选晋级判定：CONFIRMED / CANDIDATE / NOISE）

### 每条 baseline 必须包含
- 中文古典小说场景说明
- 明确的 JSON 输出 schema（每字段一行注释）
- **硬约束区**：违反则作废（例如 MERGE 必须 ≥2 不同章节 evidence；IMPERSONATED 必 SPLIT）
- **儒林外史专项提示**（写在 Prompt B 末尾）：牛浦≠牛布衣、严监生≠严贡生、娄府四人独立、张铁臂/张俊民同人

### replacements 占位符
- A: `{{bookTitle}}` `{{chapterNo}}` `{{chapterTitle}}` `{{content}}`
- B: `{{bookTitle}}` `{{candidateGroups}}`
- C: `{{bookTitle}}` `{{chapterNo}}` `{{rawText}}` `{{candidateName}}` `{{candidateId}}` `{{candidatePersonas}}`
- D: `{{candidates}}`

### seed 策略
- `prisma/seed.ts` 新增 `seedPromptBaselines()` 调用点，幂等（slug 存在则 update 到 latest version）
- 编写单测 `prompt-template-baselines.test.ts` 断言 4 个 slug 存在且 body 非空

## Acceptance Criteria

- [ ] `pnpm prisma db seed` 成功写入 4 条 baseline
- [ ] `resolvePromptTemplate({ slug: 'STAGE_A_EXTRACT_MENTIONS', ... })` 可正常返回模板
- [ ] 旧 twopass Prompt slug 标记为 deprecated（不删，留档 6 个月）
- [ ] 4 条 Prompt 手工过一遍 LLM（任一供应商），能返回合法 JSON
- [ ] `pnpm test` 覆盖新增 baseline 的断言

## Definition of Done

- [ ] prompt-template-baselines.ts committed
- [ ] seed 脚本幂等，支持重复运行
- [ ] 4 条 Prompt 文案经人工审阅（包含儒林外史专项提示）

## 追加要求（通用化 · 与 T10/T11 对齐）

- [ ] 4 条 Prompt（Stage A/B/C/D）baseline 末尾**必须包含**两个占位符：
      - `{{bookTypeSpecialRules}}` — 由 PromptTemplateVariant 按 BookType 运行时注入
      - `{{bookTypeFewShots}}` — 由 BookTypeExample 按 bookType+stage 运行时注入
- [ ] baseline 只保留"通用规则"（适用于所有中国古典小说），BookType 专属规则**不写死**在 baseline 里
- [ ] Stage A 输出 schema 新增字段 `sceneContextHint`（≤30 字），KINSHIP/GENERATIONAL 情形必填
- [ ] Stage B members[].role 枚举加入 `TRANSFORMED`；aliasType 枚举扩展至 13 种
- [ ] Stage C 输出字段 actorRole → `narrativeLens`（9 种 enum），新增可选 `epochId` 与必填 `sceneContextHint`
- [ ] 运行时装配函数 `resolvePromptTemplate(...)` 兼容既有调用（bookType/stage 参数为可选，缺省走 GENERIC 兜底）

---

## §0-FINAL 对齐补丁（最终契约 · 以此为准 · 覆盖前文冲突项）

> 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-FINAL（§0-F.1 ~ §0-F.5）。
> 两轮反审结论 + 用户"不区分 MVP 全量做"决策。

### 覆盖 / 新增（对齐 §0-1 §0-8 §0-5 REV-1）

- [ ] **Prompt 白名单校验脚本** `scripts/check-prompt-whitelist.ts`（§0-1）：
  - 扫描 `prompt-template-baselines.ts` 内容；黑名单匹配具名实体（儒林/水浒/西游/红楼/三国主要角色名单）；命中即 exit 1
  - 加入 `package.json` scripts 并在 CI / `pnpm lint` 前跑
- [ ] **三条 baseline**（仅保留 A/B/C，删除 Prompt D · 契约 REJ-3）：
  - `STAGE_A_EXTRACT_MENTIONS`：输出 schema 强制 `suspectedResolvesTo: string | null` (≤8 字)
  - `STAGE_B_RESOLVE_ENTITIES`：输入 mention 集 + AliasEntry 命中列表 → 输出 persona candidates + merge decisions；Prompt 内显式说明"confidence ≥ 0.85 为必要非充分，充分条件由调用方强制"
  - `STAGE_C_ATTRIBUTE_EVENT`：输入章节原文 + 区段标注 + mention 集 → 输出 biography 归属（actor=真身 personaId, usedIdentityId? 冒用对象）
- [ ] **REV-1 DIALOGUE 细分**写进 Prompt A 的分类规则说明：
  - 引入句主语 (`XX 道`) 可判 SELF
  - 引号内被提及第三方 → QUOTED
  - 引号内自称"我是 XX" → SELF，但要求 evidence 覆盖引入句主语
- [ ] Prompt 正文所有例子必须**虚构**（如 `甲 / 乙 / 李无用`），违反 §0-1 即白名单检测挂
- [ ] 三条 baseline 通过 `pnpm seed` 入库

### DoD 追加
- [ ] 白名单脚本 `pnpm check:prompt-whitelist` 退出码 0
- [ ] 新增测试 `resolvePromptTemplate.test.ts` 验证占位符替换
