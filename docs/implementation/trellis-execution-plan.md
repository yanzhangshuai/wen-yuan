# Trellis 执行导航 · 人物解析三阶段重设计

> **任务文档本体在 `.trellis/tasks/04-17-char-ext-*/`**。本文件只是导航索引 + 依赖图 + Wave 分批说明。
> 每个 Task 的完整 DoD / 测试清单 / 契约引用见对应 `prd.md`。

**契约源（唯一事实）：** `docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md` §0-FINAL
**对等文档：** `docs/superpowers/plans/2026-04-17-character-extraction-plan.md`（Superpowers 独立可执行版本）
**伞任务：** `.trellis/tasks/04-17-char-ext-00-umbrella/`（children × 17）
**Book ID：** `7d822600-9107-4711-95b5-e87b3e768125` 《儒林外史》

---

## 1. 任务清单（17 个）

| # | Slug | 类型 | 优先级 | 契约条 | 依赖 |
|---|------|------|--------|--------|------|
| T01 | `04-17-char-ext-01-schema-migration` | feat | P0 | §0-12 §0-15 | — |
| T02 | `04-17-char-ext-02-prompt-baselines` | feat | P0 | §0-1 §0-8 REV-1 | T01 |
| T03 | `04-17-char-ext-03-stage-a-extractor` | feat | P0 | §0-5 §0-8 REV-1 | T02 T12 T14 |
| T04 | `04-17-char-ext-04-stage-b-resolver` | feat | P0 | §0-7 §0-9 §0-4 | T03 T13 T15 |
| T05 | `04-17-char-ext-05-stage-c-attribution` | feat | P0 | §0-5 §0-2 §0-6 §0-14 | T04 |
| T06 | `04-17-char-ext-06-lifecycle-ui` | feat | P1 | — | T05 |
| T07 | `04-17-char-ext-07-alias-mapping-ui` | feat | P0 | — | T05 |
| T08 | `04-17-char-ext-08-regression-fixtures` | test | P0 | §0-1 | T16 |
| T09 | `04-17-char-ext-09-rerun-and-verify` | chore | P0 | §0-11 §0-13 | T06 T07 T08 T16 T17 |
| T10 | `04-17-char-ext-10-booktype-system` | feat | P1 | §0-12 | T01 |
| T11 | `04-17-char-ext-11-universal-fewshot` | feat | P1 | §0-1 | T10 |
| T12 | `04-17-char-ext-12-chapter-preprocessor-stage-0` | feat | P0 | §0-2 §0-4 §0-5 | T01 |
| T13 | `04-17-char-ext-13-stage-b5-temporal-consistency` | feat | P0 | §0-3(a) §0-14 | T03 T12 (T17) |
| T14 | `04-17-char-ext-14-twopass-baseline` | chore | P1 | §0-16 | — |
| T15 | `04-17-char-ext-15-alias-entry-audit-seed` | chore | P0 | §0-17 | — |
| T16 | `04-17-char-ext-16-gold-set-annotation` | chore | P0 | §0-10 | T14 |
| T17 | `04-17-char-ext-17-cross-location-extraction` | feat | P1 | §0-3(b) REV-2 | T12 |

---

## 2. 依赖图（ASCII）

```
           ┌─────────── T14 twopass-baseline ──────────┐
           │                                            │
           └────────────────────┐                       ▼
 T15 alias-entry-seed ──┐       │                   T16 gold-set ──┐
                        │       │                                   │
                        ▼       ▼                                   │
 T01 schema ──┬──► T12 preprocessor ──► T17 cross-location          │
              │            │                    │                   │
              │            └────► T13 B.5 temporal ──┐              │
              │                                       │              │
              ├─► T02 prompts ──► T03 stage-A ────────┤              │
              │                                       ▼              │
              ├─► T10 booktype ──► T11 fewshot       T04 stage-B ─► T05 stage-C ─┬─► T06 candidate-ui
              │                                                                   │
              │                                                                   └─► T07 review-ui ─┐
              │                                                                                      │
              └──────────────────────────────────────────────────────────────────────────────────────┤
                                                                                                     ▼
                                                                         T08 fixtures ─► T09 rerun-and-verify
```

**关键路径**（8 步）：T01 → T02 → T03 → T13 → T04 → T05 → T07 → T09

---

## 3. Wave 分批执行建议

| Wave | Tasks | 并行性 |
|------|-------|--------|
| 1 | T14, T15 | 并行，**独立启动** |
| 2 | T01, T12, T17 | T01 完成后 T12/T17 并行 |
| 3 | T02, T10, T11 | T02/T10 并行；T11 等 T10 |
| 4 | T03 → T13 → T04 → T05 | 串行（核心管线） |
| 5 | T06, T07 | 并行 |
| 6 | T16 → T08 → T09 | 串行（验收） |

---

## 4. 使用 Trellis 执行

### 4.1 启动单个任务
```bash
# 对 T01 开始完整 6 阶段（brainstorm → research → implement → check → update-spec → record-session）
/trellis:start 04-17-char-ext-01-schema-migration
```

### 4.2 查看伞任务进度
```bash
cat .trellis/tasks/04-17-char-ext-00-umbrella/task.json | jq '.children'
# 或
ls .trellis/tasks/04-17-char-ext-*/
```

### 4.3 推荐执行顺序（个人开发者 · 串行执行）
```
T14 → T15 → T01 → T12 → T17 → T02 → T10 → T11
    → T03 → T13 → T04 → T05 → T06 → T07
    → T16 → T08 → T09
```

### 4.4 PR 拆分（§0-13）
- **PR-1 写路径（默认 flag 仍 twopass）**：T01 + T10 + T11 + T12 + T02 + T03 + T13 + T04 + T05 + T15
- **PR-2 读路径（切换默认到 threestage）**：T06 + T07 + T08 + T09 + T14 + T16 + T17
- PR-2 合并条件 = T09 六项硬门槛全绿

---

## 5. 契约号 ↔ 任务交叉索引

| 契约条 | 涉及 Task |
|--------|---------|
| §0-1 Prompt 白名单 | T02, T08, T11 |
| §0-2 deathChapterNo 双源 | T05, T12 |
| §0-3(a) 死后行动 | T13 |
| §0-3(b) 跨地点 | T17 |
| §0-4 覆盖率自白 | T04, T12 |
| §0-5 区段判定权收回 | T02, T03, T05, T12 |
| §0-6 biographyCount 口径 | T05 |
| §0-7 CONFIRMED 门槛 | T04 |
| §0-8 suspectedResolvesTo | T02, T04 |
| §0-9 MERGE 充要 | T04 |
| §0-10 Gold set 350 | T16 |
| §0-11 CANDIDATE ≤ 200 | T09 |
| §0-12 BookType 全量做 | T01, T10 |
| §0-13 Feature flag 两次 PR | T01, T09 |
| §0-14 反馈通道非回环 | T04, T05, T13 |
| §0-15 枚举裁剪终版 | T01 |
| §0-16 T14 独立启动 | T14 |
| §0-17 AliasEntry 审计前置 | T15 |
| REV-1 DIALOGUE 引入句 SELF | T02, T03, T05 |
| REV-2 跨地点独立任务 | T13, T17 |
| REJ-1 PersonaEpoch 不建 | T01 |
| REJ-3 Prompt D 不做 | T02 |

---

## 6. 完成标志

- 17 份 `prd.md` DoD 全部勾完
- T09 报告六门槛全绿
- 两份 PR 合入 dev
- `docs/superpowers/reports/threestage-rerun-verification.md` 归档
- 伞任务 `04-17-char-ext-00-umbrella` `status=done`
