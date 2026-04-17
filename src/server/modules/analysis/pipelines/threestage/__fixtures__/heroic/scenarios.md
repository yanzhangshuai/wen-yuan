# HEROIC_NOVEL · 绰号同名场景

**BookTypeCode**: `HEROIC_NOVEL`
**场景主线**: 丙某（字丙公，绰号"黑风"）在江湖行侠；山中另有一伙强人的首领也叫"黑风"，构成同绰号歧义。丙某擒住假黑风，扬清正之名。

## 规则层回归断言点

| 场景点 | evidenceRawSpan | 预期 override 规则 |
|---|---|---|
| 丙某在 DIALOGUE 引入句中自述（speaker=丙某） | `丙某答道` | `DIALOGUE_SELF_PRESERVED` |
| 旁人引号里提到"黑风"绰号（引号内第三方） | `“黑风”` | `DIALOGUE_QUOTED_THIRD_PARTY`（SELF→QUOTED） |
| 纯叙述"丙某行至山道"（NARRATIVE） | `丙某行至山道` | 无覆写 |
| 议论"不敢再冒丙某的名号"（COMMENTARY，"却说"起首） | `不敢再冒丙某的名号` | `COMMENTARY_FORCE_REPORTED` |

## 手工验证 checklist

- [ ] "黑风" 绰号解析为 NICKNAME 而非 NAMED（Stage B 决定，不在本 fixture 断言）
- [ ] 同绰号的假黑风在后续 Stage B 被识别为独立 persona（此 fixture 范围外，由 scenarios 提示）
