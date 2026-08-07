---
slug: classical-relationship-types
name: 古典关系类型
category: RELATIONSHIP_TYPE
description: 古典文学核心关系类型（家庭 / 教育 / 官场 / 社交），关系码必须取自本表
scope: GLOBAL
kind: RELATIONSHIP_TYPE
triggers:
  priority: 996
relationshipCodes:
  - code: 父子
    direction: INVERSE
    category: 家庭
    aliases: [父与子, 父子关系]
  - code: 母子
    direction: INVERSE
    category: 家庭
    aliases: [母与子, 母子关系]
  - code: 兄弟
    direction: SYMMETRIC
    category: 家庭
    aliases: [手足, 弟兄]
  - code: 夫妻
    direction: SYMMETRIC
    category: 家庭
    aliases: [夫妇, 两口子]
  - code: 师生
    direction: INVERSE
    category: 教育
    aliases: [受业, 门生, 座师]
  - code: 同年
    direction: SYMMETRIC
    category: 教育
    aliases: [同科]
  - code: 同僚
    direction: SYMMETRIC
    category: 官场
    aliases: [同寅]
  - code: 主仆
    direction: INVERSE
    category: 官场
    aliases: [主家, 仆人]
  - code: 朋友
    direction: SYMMETRIC
    category: 社交
    aliases: [好友, 故交]
  - code: 仇敌
    direction: SYMMETRIC
    category: 社交
    aliases: [仇家, 死对头]
---

# 古典关系类型

关系事实的 relationshipTypeCode 必须取自本 frontmatter 的 relationshipCodes 闭集；口语化关系先经别名映射到规范码。

| code | 方向 | 别名 | 示例 |
|------|------|------|------|
| 父子 | INVERSE | 父与子 | 严监生是严大位的父亲 |
| 母子 | INVERSE | — | — |
| 兄弟 | SYMMETRIC | 手足 / 弟兄 | 娄三公子与娄四公子是兄弟 |
| 夫妻 | SYMMETRIC | 夫妇 / 两口子 | — |
| 师生 | INVERSE | 受业 / 门生 / 座师 | 范进拜周学道为座师 |
| 同年 | SYMMETRIC | 同科 | 汤奉与范进同年 |
| 同僚 | SYMMETRIC | 同寅 | — |
| 主仆 | INVERSE | 主家 / 仆人 | — |
| 朋友 | SYMMETRIC | 好友 / 故交 | — |
| 仇敌 | SYMMETRIC | 仇家 / 死对头 | — |

方向说明：

- **INVERSE**（方向性）：source → target 有方向，如 师生 = 学生(source) → 师(target)
- **SYMMETRIC**（对称性）：双向，方向可互换
