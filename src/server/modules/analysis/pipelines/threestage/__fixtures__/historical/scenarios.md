# HISTORICAL_NOVEL · POEM 引用与纪年叙述

**BookTypeCode**: `HISTORICAL_NOVEL`
**场景主线**: 戊公奉命巡察诸郡，途中忆及前朝贤人某戊，感怀作诗；夜间披阅纪年文书，草拟奏章。

## 规则层回归断言点

| 场景点 | evidenceRawSpan | 预期 override 规则 |
|---|---|---|
| 戊公在 NARRATIVE 中出场 | `戊公至一郡城` | 无覆写（SELF） |
| 说书人追溯前朝贤人（COMMENTARY） | `贤人某戊治郡` | `COMMENTARY_FORCE_REPORTED` |
| 诗中提到古人（POEM 区段） | `贤人今不在` | `POEM_FORCE_HISTORICAL`（任何 identityClaim → HISTORICAL） |
| 引入句主语（DIALOGUE speaker=有一丁公） | `有一丁公答道` | `DIALOGUE_SELF_PRESERVED` |
| "且说"起首的评述段（COMMENTARY） | `且说戊公连日奔劳` | `COMMENTARY_FORCE_REPORTED` |

## 手工验证 checklist

- [ ] POEM 区段覆盖 `有诗为证：…此诗一出，满座动容。`；triggers = `有诗为证`，closer = `此诗`
- [ ] 纪年叙述"去岁秋后…今岁入春…"位于 COMMENTARY（"且说"起首），LLM 若误标 SELF 会被硬覆写为 REPORTED
