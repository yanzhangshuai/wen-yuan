# MYTHOLOGICAL_NOVEL · 变化 / 法号场景

**BookTypeCode**: `MYTHOLOGICAL_NOVEL`
**场景主线**: 修道之士丁士变化为书生戊某，取法号"无尘"，下界济民。

## 规则层回归断言点

| 场景点 | evidenceRawSpan | 预期 override 规则 |
|---|---|---|
| 戊某引入句主语（变化身份在 DIALOGUE 自述） | `戊某答道` | `DIALOGUE_SELF_PRESERVED`（IMPERSONATING 在引入句位置不被强改 QUOTED） |
| 丁士背景介绍（COMMENTARY，"话说"起首） | `丁士修炼多年` | `COMMENTARY_FORCE_REPORTED` |
| 丁士发愿出行（NARRATIVE） | `丁士欲往人间游历` | 无覆写 |
| 法号"无尘"在引号内被他人念及 | `“无尘”` | `DIALOGUE_QUOTED_THIRD_PARTY`（SELF→QUOTED） |
| 戊某变化后在 NARRATIVE 施法 | `戊某微微一笑` | 无覆写（IMPERSONATING 在 NARRATIVE 保持不变） |

## 手工验证 checklist

- [ ] Stage B 应把 `戊某` 识别为 `丁士` 的 `IMPERSONATED_IDENTITY`（本 fixture 不直接断言，交后续 scenarios）
- [ ] "无尘" 的 aliasType 预期为 NICKNAME / 或法号类别（Stage B 决定）
