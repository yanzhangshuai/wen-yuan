---
stage: growth
---

# 模块边界规范

> 明确层间依赖方向，避免循环依赖与抽象泄漏。

---

## 必须遵守

- `src/components/**` 不得直接依赖 `src/server/**`。
- `src/server/**` 可依赖 `src/types/**`，但不得依赖 `src/components/**`。
- 跨层共享结构统一进入 `src/types/**`。
- 边界转换集中在 service/route 层，不在 UI 层拼装 DB 结构。

---

## 代码案例

反例：
```ts
// src/components/BookPanel.tsx
import { prisma } from "@/server/db/prisma";
```

正例：
```ts
// src/components/BookPanel.tsx
import type { BookView } from "@/types/api";

// src/server/modules/project/services/project-service.ts
import { prisma } from "@/server/db/prisma";
```

---

## 原因

- 边界稳定后，层内重构不会跨层爆炸。
- 避免 UI 与 DB 强耦合，可显著降低 schema 改动影响面。

---

## 验收清单

- [ ] 是否存在 components 直连 server/db 导入
- [ ] 是否有跨层共享类型落在 `src/types/**`
- [ ] 边界转换是否只在 service/route 层
- [ ] 是否无循环依赖告警
