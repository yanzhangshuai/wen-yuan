# GENERIC · 基础叙述 + 对话

**BookTypeCode**: `GENERIC`
**场景主线**: 某甲与某乙久别重逢，于庭前窗下闲谈品茗，傍晚设酒对饮。无冒名、无变化、无诗词、无说书人评述。

## 规则层回归断言点

| 场景点 | evidenceRawSpan | 预期 override 规则 |
|---|---|---|
| 某甲引入句自述（DIALOGUE speaker=某甲） | `某甲道：` | `DIALOGUE_SELF_PRESERVED` |
| 某乙引入句自述（DIALOGUE speaker=某乙） | `某乙答道` | `DIALOGUE_SELF_PRESERVED` |
| 某甲纯叙述（NARRATIVE） | `某甲外出经商` | 无覆写 |
| 某乙纯叙述（NARRATIVE） | `某乙默然良久` | 无覆写 |

## 手工验证 checklist

- [ ] 覆盖率 `narrative + dialogue ≈ 1`；commentary = 0；poem = 0
- [ ] 所有 identityClaim 保持 SELF，无规则层触发（除 DIALOGUE speaker 审计标记）
