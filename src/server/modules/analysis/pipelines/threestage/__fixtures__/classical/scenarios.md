# CLASSICAL_NOVEL · 冒名场景

**BookTypeCode**: `CLASSICAL_NOVEL`
**场景主线**: 甲某私取亡者乙公的衣冠印信，冒名进京赶考，终被识破。

## 规则层回归断言点

| 场景点 | evidenceRawSpan | 预期 override 规则 |
|---|---|---|
| 甲某在 DIALOGUE 引入句中自述（speaker=甲某） | `甲某笑道：` | `DIALOGUE_SELF_PRESERVED`（REV-1，SELF 保留） |
| 主考官接到的"乙公"投文（引号内第三方名） | `“乙公”` | `DIALOGUE_QUOTED_THIRD_PARTY`（SELF→QUOTED） |
| 说书人议论"原来乙公昔日文名甚盛"（COMMENTARY） | `原来乙公昔日文名甚盛` | `COMMENTARY_FORCE_REPORTED` |
| 纯叙述"甲某一时语塞"（NARRATIVE） | `甲某一时语塞` | 无覆写（SELF 保留） |
| 说书人议论"甲某守孝三日"（COMMENTARY 里的 IMPERSONATING） | `甲某守孝三日` | `COMMENTARY_FORCE_REPORTED`（即便 LLM 标 IMPERSONATING 也被硬覆写） |

## 手工验证 checklist（可选）

- [ ] `preprocessChapter` 输出 `deathMarkerCandidates ≥ 1`（乙公卒）
- [ ] 全文 `confidence=HIGH`、unclassified ≤ 10%
- [ ] COMMENTARY 占比最高（"话说/却说/且说/原来/看官听说"起首覆盖多段）
