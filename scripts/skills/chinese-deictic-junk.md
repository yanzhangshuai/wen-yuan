---
slug: chinese-deictic-junk
name: 中文虚指代词
description: 虚指/泛指代词名单（guardrail 过滤用）
scope: GLOBAL
---

# 中文虚指代词

虚指/泛指代词不指向任何具体实体，提取时应作为 junk 过滤，不建立实体、不产出关系/事实。

| 词项 | 说明 |
|------|------|
| 众人 | 泛指在场所有人，非特指 |
| 那人 | 指代不明，依赖上下文且无法唯一锚定 |
| 此人 | 近指代，通常指前文某人，但本身非专名 |
| 老者 | 泛指老年人，不具名 |
| 百姓 | 泛指民众 |
| 人们 | 泛指人群 |

要点：

- 单字虚指规则：单字符名称（如“某”“一”）按字符数过滤，不在此名单内（见 `src/server/modules/extraction/nameAuthority.ts`）；
- 此名单作为 GLOBAL skill 契约，guardrail 从装载上下文读取；契约缺失时代码留空兜底。
