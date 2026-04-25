# 审核中心页面重构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把"角色"提升为审核中心三页（matrix / relations / time）共用导航中枢，重构布局并增加键盘、进度、合并候选、跨页持久、a11y 等增强。

**Architecture:** 新增共享 client 组件 `<ReviewWorkbenchShell>`（顶栏 BookSelector + ReviewModeNav，左侧 PersonaSidebar，主区 children）。三页 server page 各自传入主审核组件作为 children；selected/focus 状态在 shell 内部管理并 URL 同步。不引入新 API，关系/时间页 server 多并行拉一次 `getPersonaChapterMatrix` 仅取 personas 维度。

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui (Switch, Popover, Command, Sonner) · Vitest + jsdom + @testing-library/react · pnpm · ESLint flat config + `@stylistic`

**对齐设计文档：** `docs/superpowers/specs/2026-04-25-review-center-redesign-design.md`

**验证书籍：** 《儒林外史》`bookId = 05562920-129d-49b6-bdd4-22f03bdd6bf1`

---

## 阶段总览

| Phase | 主题 | 关键产物 |
|---|---|---|
| 1 | 纯函数：persona-list-summary | build / sort / filter / nextPending / progress |
| 2 | 原子组件：PersonaCard / FocusOnlySwitch / BookSelector | 受控组件 + 单测 |
| 3 | 复合组件：PersonaSidebar / ReviewWorkbenchShell | 键盘、URL 同步、sessionStorage 兜底 |
| 4 | 矩阵页接入 | 高亮/筛选模式 + 工具栏改造 |
| 5 | 关系页接入 | 高亮/筛选 pair list |
| 6 | 时间页接入 | 列高亮 + 滚动 |
| 7 | 收尾打磨 | 面包屑、a11y、memoize、跨页持久 |

每阶段独立可上线、可回滚；阶段内任务遵循 Red→Green→Commit。

---

## Phase 1：纯函数 `persona-list-summary`

### Task 1.1：定义类型与 `buildPersonaListItems`

**Files:**
- Create: `src/components/review/shared/persona-list-summary.ts`
- Test:   `src/components/review/shared/persona-list-summary.test.ts`

- [ ] **Step 1：写失败测试**

```ts
// src/components/review/shared/persona-list-summary.test.ts
import { describe, expect, it } from "vitest";
import { buildPersonaListItems } from "./persona-list-summary";
import { type PersonaChapterMatrixDto } from "@/lib/services/review-matrix";

function makeMatrix(overrides: Partial<PersonaChapterMatrixDto> = {}): PersonaChapterMatrixDto {
  return {
    bookId       : "b1",
    chapters     : [{ chapterId: "c1", chapterNo: 1, title: "第一回" }],
    personas     : [
      {
        personaId                : "p1",
        displayName              : "周进",
        aliases                  : ["字蒙夜", "周老爹"],
        firstChapterNo           : 2,
        primaryPersonaCandidateId: "pc1",
        personaCandidateIds      : ["pc1"],
        totalEventCount          : 24,
        totalRelationCount       : 8,
        totalConflictCount       : 1,
      },
    ],
    cells        : [
      {
        personaId         : "p1",
        chapterId         : "c1",
        eventCount        : 5,
        relationCount     : 2,
        conflictCount     : 1,
        reviewStateSummary: {
          PENDING   : { NONE: 3, CONFLICTED: 1 },
          ACCEPTED  : { NONE: 1, CONFLICTED: 0 },
          REJECTED  : { NONE: 0, CONFLICTED: 0 },
          SUPERSEDED: { NONE: 0, CONFLICTED: 0 },
        },
      },
    ],
    ...overrides,
  } as PersonaChapterMatrixDto;
}

describe("buildPersonaListItems", () => {
  it("把 matrix.personas 平铺成 PersonaListItem，并按 cells 聚合 pendingClaimCount", () => {
    const items = buildPersonaListItems(makeMatrix());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      personaId         : "p1",
      displayName       : "周进",
      aliases           : ["字蒙夜", "周老爹"],
      firstChapterNo    : 2,
      totalEventCount   : 24,
      totalRelationCount: 8,
      totalConflictCount: 1,
      pendingClaimCount : 4,
    });
  });

  it("当某 persona 在 cells 中无记录时 pendingClaimCount 为 0", () => {
    const matrix = makeMatrix({ cells: [] });
    const [item] = buildPersonaListItems(matrix);
    expect(item.pendingClaimCount).toBe(0);
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm vitest run src/components/review/shared/persona-list-summary.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3：实现最小代码**

```ts
// src/components/review/shared/persona-list-summary.ts
import {
  type PersonaChapterMatrixDto,
  type PersonaChapterMatrixPersona,
} from "@/lib/services/review-matrix";

export interface PersonaListItem {
  personaId          : string;
  displayName        : string;
  aliases            : string[];
  firstChapterNo     : number | null;
  totalEventCount    : number;
  totalRelationCount : number;
  totalConflictCount : number;
  pendingClaimCount  : number;
  personaCandidateIds: string[];
}

export function buildPersonaListItems(matrix: PersonaChapterMatrixDto): PersonaListItem[] {
  const pendingByPersona = new Map<string, number>();
  for (const cell of matrix.cells) {
    const summary = cell.reviewStateSummary;
    const pending = (summary.PENDING?.NONE ?? 0)
      + (summary.PENDING?.CONFLICTED ?? 0)
      + (summary.ACCEPTED?.CONFLICTED ?? 0);
    pendingByPersona.set(
      cell.personaId,
      (pendingByPersona.get(cell.personaId) ?? 0) + pending,
    );
  }

  return matrix.personas.map((p: PersonaChapterMatrixPersona): PersonaListItem => ({
    personaId          : p.personaId,
    displayName        : p.displayName,
    aliases            : p.aliases ?? [],
    firstChapterNo     : p.firstChapterNo ?? null,
    totalEventCount    : p.totalEventCount,
    totalRelationCount : p.totalRelationCount,
    totalConflictCount : p.totalConflictCount,
    pendingClaimCount  : pendingByPersona.get(p.personaId) ?? 0,
    personaCandidateIds: p.personaCandidateIds ?? [],
  }));
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `pnpm vitest run src/components/review/shared/persona-list-summary.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 5：commit**

```bash
git add src/components/review/shared/persona-list-summary.ts src/components/review/shared/persona-list-summary.test.ts
git commit -m "feat(review): add buildPersonaListItems pure function

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 1.2：sort / filter / nextPending / progress

**Files:**
- Modify: `src/components/review/shared/persona-list-summary.ts`
- Modify: `src/components/review/shared/persona-list-summary.test.ts`

- [ ] **Step 1：写失败测试（追加）**

```ts
import {
  buildPersonaListItems,
  computePersonaProgress,
  filterPersonaListItems,
  findNextPendingPersonaId,
  sortPersonaListItems,
  type PersonaListItem,
} from "./persona-list-summary";

function p(over: Partial<PersonaListItem>): PersonaListItem {
  return {
    personaId          : "x",
    displayName        : "x",
    aliases            : [],
    firstChapterNo     : null,
    totalEventCount    : 0,
    totalRelationCount : 0,
    totalConflictCount : 0,
    pendingClaimCount  : 0,
    personaCandidateIds: [],
    ...over,
  };
}

describe("sortPersonaListItems", () => {
  const items = [
    p({ personaId: "a", firstChapterNo: 5, pendingClaimCount: 1, totalEventCount: 10 }),
    p({ personaId: "b", firstChapterNo: 1, pendingClaimCount: 5, totalEventCount: 3 }),
    p({ personaId: "c", firstChapterNo: null, pendingClaimCount: 0, totalEventCount: 50 }),
  ];

  it("first-chapter 升序，null 排末尾", () => {
    expect(sortPersonaListItems(items, "first-chapter").map(i => i.personaId)).toEqual(["b", "a", "c"]);
  });

  it("pending-desc 把待审最多的排前", () => {
    expect(sortPersonaListItems(items, "pending-desc").map(i => i.personaId)).toEqual(["b", "a", "c"]);
  });

  it("event-desc 按 totalEventCount 降序", () => {
    expect(sortPersonaListItems(items, "event-desc").map(i => i.personaId)).toEqual(["c", "a", "b"]);
  });
});

describe("filterPersonaListItems", () => {
  const items = [
    p({ personaId: "a", displayName: "周进", aliases: ["字蒙夜"], pendingClaimCount: 2, totalConflictCount: 0 }),
    p({ personaId: "b", displayName: "范进", aliases: [],         pendingClaimCount: 0, totalConflictCount: 1 }),
    p({ personaId: "c", displayName: "马二先生", aliases: ["马纯上"], pendingClaimCount: 0, totalConflictCount: 0 }),
  ];

  it("空关键字 + 空 chip → 原样返回", () => {
    expect(filterPersonaListItems(items, "", []).map(i => i.personaId)).toEqual(["a", "b", "c"]);
  });

  it("关键字匹配 displayName 与 aliases，大小写不敏感", () => {
    expect(filterPersonaListItems(items, "纯上", []).map(i => i.personaId)).toEqual(["c"]);
    expect(filterPersonaListItems(items, "周", []).map(i => i.personaId)).toEqual(["a"]);
  });

  it("status chip 多选取并集", () => {
    expect(filterPersonaListItems(items, "", ["pending"]).map(i => i.personaId)).toEqual(["a"]);
    expect(filterPersonaListItems(items, "", ["conflict"]).map(i => i.personaId)).toEqual(["b"]);
    expect(filterPersonaListItems(items, "", ["done"]).map(i => i.personaId)).toEqual(["c"]);
    expect(filterPersonaListItems(items, "", ["pending", "done"]).map(i => i.personaId)).toEqual(["a", "c"]);
  });
});

describe("findNextPendingPersonaId", () => {
  const items = [
    p({ personaId: "a", pendingClaimCount: 1, firstChapterNo: 5 }),
    p({ personaId: "b", pendingClaimCount: 3, firstChapterNo: 2 }),
    p({ personaId: "c", pendingClaimCount: 0, firstChapterNo: 1 }),
  ];

  it("跳过 currentId 选 pending 最多的；平局取 firstChapterNo 最小", () => {
    expect(findNextPendingPersonaId(items, null)).toBe("b");
    expect(findNextPendingPersonaId(items, "b")).toBe("a");
  });

  it("全部 pending=0 时返回 null", () => {
    expect(findNextPendingPersonaId([p({ pendingClaimCount: 0 })], null)).toBeNull();
  });
});

describe("computePersonaProgress", () => {
  it("总计 = sum(eventCount + relationCount)，已审 = 总-pending", () => {
    const items = [
      p({ personaId: "a", totalEventCount: 10, totalRelationCount: 5, pendingClaimCount: 4 }),
      p({ personaId: "b", totalEventCount: 2,  totalRelationCount: 0, pendingClaimCount: 1 }),
    ];
    expect(computePersonaProgress(items)).toEqual({ total: 17, reviewed: 12, ratio: 12 / 17 });
  });

  it("总计为 0 时 ratio 为 1（全部已审）", () => {
    expect(computePersonaProgress([])).toEqual({ total: 0, reviewed: 0, ratio: 1 });
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm vitest run src/components/review/shared/persona-list-summary.test.ts`
Expected: FAIL（4 个新 describe 都未实现）

- [ ] **Step 3：实现**

```ts
// 在 persona-list-summary.ts 追加：
export type PersonaSortKey = "first-chapter" | "pending-desc" | "event-desc";
export type PersonaStatusFilter = "pending" | "conflict" | "done";

export function sortPersonaListItems(
  items: PersonaListItem[],
  by   : PersonaSortKey,
): PersonaListItem[] {
  const arr = [...items];
  if (by === "first-chapter") {
    arr.sort((a, b) => {
      const av = a.firstChapterNo ?? Number.POSITIVE_INFINITY;
      const bv = b.firstChapterNo ?? Number.POSITIVE_INFINITY;
      return av - bv;
    });
  } else if (by === "pending-desc") {
    arr.sort((a, b) => b.pendingClaimCount - a.pendingClaimCount);
  } else if (by === "event-desc") {
    arr.sort((a, b) => b.totalEventCount - a.totalEventCount);
  }
  return arr;
}

export function filterPersonaListItems(
  items        : PersonaListItem[],
  keyword      : string,
  statusFilters: PersonaStatusFilter[],
): PersonaListItem[] {
  const kw = keyword.trim().toLowerCase();
  return items.filter((item) => {
    if (kw) {
      const hay = [item.displayName, ...item.aliases].join(" ").toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    if (statusFilters.length === 0) return true;
    const isPending  = item.pendingClaimCount > 0;
    const isConflict = item.totalConflictCount > 0;
    const isDone     = !isPending && !isConflict;
    return statusFilters.some((f) => {
      if (f === "pending")  return isPending;
      if (f === "conflict") return isConflict;
      if (f === "done")     return isDone;
      return false;
    });
  });
}

export function findNextPendingPersonaId(
  items    : PersonaListItem[],
  currentId: string | null,
): string | null {
  const candidates = items
    .filter((i) => i.personaId !== currentId && i.pendingClaimCount > 0)
    .sort((a, b) => {
      if (b.pendingClaimCount !== a.pendingClaimCount) {
        return b.pendingClaimCount - a.pendingClaimCount;
      }
      const av = a.firstChapterNo ?? Number.POSITIVE_INFINITY;
      const bv = b.firstChapterNo ?? Number.POSITIVE_INFINITY;
      return av - bv;
    });
  return candidates[0]?.personaId ?? null;
}

export interface PersonaProgress {
  total   : number;
  reviewed: number;
  ratio   : number;
}

export function computePersonaProgress(items: PersonaListItem[]): PersonaProgress {
  let total   = 0;
  let pending = 0;
  for (const it of items) {
    total   += it.totalEventCount + it.totalRelationCount;
    pending += it.pendingClaimCount;
  }
  if (total === 0) return { total: 0, reviewed: 0, ratio: 1 };
  const reviewed = total - pending;
  return { total, reviewed, ratio: reviewed / total };
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `pnpm vitest run src/components/review/shared/persona-list-summary.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5：commit**

```bash
git add src/components/review/shared/persona-list-summary.ts src/components/review/shared/persona-list-summary.test.ts
git commit -m "feat(review): add sort/filter/nextPending/progress helpers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 2：原子组件

### Task 2.1：`PersonaCard`

**Files:**
- Create: `src/components/review/shared/persona-card.tsx`
- Create: `src/components/review/shared/persona-card.test.tsx`

- [ ] **Step 1：写失败测试**

```tsx
/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PersonaCard } from "./persona-card";
import { type PersonaListItem } from "./persona-list-summary";

function item(over: Partial<PersonaListItem> = {}): PersonaListItem {
  return {
    personaId          : "p1",
    displayName        : "周进",
    aliases            : ["字蒙夜", "周老爹"],
    firstChapterNo     : 2,
    totalEventCount    : 24,
    totalRelationCount : 8,
    totalConflictCount : 0,
    pendingClaimCount  : 0,
    personaCandidateIds: ["pc1"],
    ...over,
  };
}

describe("PersonaCard", () => {
  it("展示 displayName / aliases / firstChapter / 计数", () => {
    render(<PersonaCard item={item()} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByText("周进")).toBeInTheDocument();
    expect(screen.getByText(/字蒙夜/)).toBeInTheDocument();
    expect(screen.getByText(/第2回/)).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("totalConflictCount > 0 时显示冲突徽标", () => {
    render(<PersonaCard item={item({ totalConflictCount: 3 })} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByLabelText(/冲突 3/)).toBeInTheDocument();
  });

  it("personaCandidateIds 长度 > 1 时显示合并候选徽标", () => {
    render(<PersonaCard item={item({ personaCandidateIds: ["a", "b"] })} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByLabelText(/未消解候选/)).toBeInTheDocument();
  });

  it("点击触发 onSelect(personaId)", async () => {
    const onSelect = vi.fn();
    render(<PersonaCard item={item()} isSelected={false} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("option"));
    expect(onSelect).toHaveBeenCalledWith("p1");
  });

  it("isSelected → role=option 且 aria-selected=true", () => {
    render(<PersonaCard item={item()} isSelected onSelect={vi.fn()} />);
    expect(screen.getByRole("option")).toHaveAttribute("aria-selected", "true");
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm vitest run src/components/review/shared/persona-card.test.tsx`
Expected: FAIL

- [ ] **Step 3：实现**

```tsx
// src/components/review/shared/persona-card.tsx
"use client";

import { AlertTriangle, Users } from "lucide-react";
import { type PersonaListItem } from "./persona-list-summary";
import { cn } from "@/lib/utils";

interface PersonaCardProps {
  item       : PersonaListItem;
  isSelected : boolean;
  onSelect   : (personaId: string) => void;
}

export function PersonaCard({ item, isSelected, onSelect }: PersonaCardProps) {
  const showAliases    = item.aliases.slice(0, 2);
  const aliasOverflow  = item.aliases.length - showAliases.length;
  const hasConflict    = item.totalConflictCount > 0;
  const hasMultiCand   = item.personaCandidateIds.length > 1;
  const reviewedTotal  = item.totalEventCount + item.totalRelationCount;
  const reviewedCount  = Math.max(reviewedTotal - item.pendingClaimCount, 0);
  const progressRatio  = reviewedTotal === 0 ? 1 : reviewedCount / reviewedTotal;

  return (
    <button
      type        ="button"
      role        ="option"
      aria-selected={isSelected}
      onClick     ={() => onSelect(item.personaId)}
      className   ={cn(
        "w-full rounded-lg border bg-card p-3 text-left transition",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected && "ring-2 ring-primary bg-primary/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.displayName}</div>
          {showAliases.length > 0 && (
            <div className="truncate text-xs text-muted-foreground">
              {showAliases.join(" · ")}
              {aliasOverflow > 0 && <span> +{aliasOverflow}</span>}
            </div>
          )}
          {item.firstChapterNo !== null && (
            <div className="mt-0.5 text-xs text-muted-foreground">首章 第{item.firstChapterNo}回</div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasMultiCand && (
            <span
              aria-label="存在未消解候选"
              className ="inline-flex h-5 items-center gap-0.5 rounded bg-purple-100 px-1.5 text-[10px] font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300"
            >
              <Users className="h-3 w-3" />
              {item.personaCandidateIds.length}
            </span>
          )}
          {hasConflict && (
            <span
              aria-label={`冲突 ${item.totalConflictCount}`}
              className ="inline-flex h-5 items-center gap-0.5 rounded bg-amber-100 px-1.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            >
              <AlertTriangle className="h-3 w-3" />
              {item.totalConflictCount}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs tabular-nums">
        <span className="text-muted-foreground">事迹 <span className="text-foreground">{item.totalEventCount}</span></span>
        <span className="text-muted-foreground">关系 <span className="text-foreground">{item.totalRelationCount}</span></span>
        <span className="text-muted-foreground">
          待审 <span className={cn("text-foreground", item.pendingClaimCount > 0 && "text-orange-600 dark:text-orange-400 font-medium")}>{item.pendingClaimCount}</span>
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary/40"
          style    ={{ width: `${Math.round(progressRatio * 100)}%` }}
        />
      </div>
    </button>
  );
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `pnpm vitest run src/components/review/shared/persona-card.test.tsx`
Expected: PASS

- [ ] **Step 5：commit**

```bash
git add src/components/review/shared/persona-card.tsx src/components/review/shared/persona-card.test.tsx
git commit -m "feat(review): add PersonaCard atom component

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2.2：`FocusOnlySwitch`

**Files:**
- Create: `src/components/review/shared/focus-only-switch.tsx`
- Create: `src/components/review/shared/focus-only-switch.test.tsx`

- [ ] **Step 1：写失败测试**

```tsx
/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FocusOnlySwitch } from "./focus-only-switch";

describe("FocusOnlySwitch", () => {
  it("disabled 时不触发回调", async () => {
    const onChange = vi.fn();
    render(<FocusOnlySwitch checked={false} onCheckedChange={onChange} disabled />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("点击切换并触发 onCheckedChange", async () => {
    const onChange = vi.fn();
    render(<FocusOnlySwitch checked={false} onCheckedChange={onChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm vitest run src/components/review/shared/focus-only-switch.test.tsx`
Expected: FAIL

- [ ] **Step 3：实现**

```tsx
// src/components/review/shared/focus-only-switch.tsx
"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface FocusOnlySwitchProps {
  checked          : boolean;
  onCheckedChange  : (next: boolean) => void;
  disabled        ?: boolean;
}

export function FocusOnlySwitch({ checked, onCheckedChange, disabled }: FocusOnlySwitchProps) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        id              ="focus-only-switch"
        checked         ={checked}
        onCheckedChange ={onCheckedChange}
        disabled        ={disabled}
        aria-label      ="只看当前角色相关 claim"
      />
      <Label htmlFor="focus-only-switch" className="cursor-pointer text-sm text-muted-foreground">
        只看当前角色
      </Label>
    </div>
  );
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `pnpm vitest run src/components/review/shared/focus-only-switch.test.tsx`
Expected: PASS

- [ ] **Step 5：commit**

```bash
git add src/components/review/shared/focus-only-switch.tsx src/components/review/shared/focus-only-switch.test.tsx
git commit -m "feat(review): add FocusOnlySwitch atom

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2.3：`BookSelector`

**Files:**
- Create: `src/components/review/shared/book-selector.tsx`
- Create: `src/components/review/shared/book-selector.test.tsx`

- [ ] **Step 1：写失败测试**

```tsx
/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BookSelector, type BookOption } from "./book-selector";

const books: BookOption[] = [
  { id: "b1", title: "儒林外史" },
  { id: "b2", title: "红楼梦" },
];

describe("BookSelector", () => {
  it("默认显示当前书名", () => {
    render(<BookSelector books={books} currentBookId="b1" basePath="/admin/review" />);
    expect(screen.getByRole("button", { name: /儒林外史/ })).toBeInTheDocument();
  });

  it("打开后展示其它书并支持搜索", async () => {
    render(<BookSelector books={books} currentBookId="b1" basePath="/admin/review" />);
    await userEvent.click(screen.getByRole("button", { name: /儒林外史/ }));
    expect(await screen.findByRole("option", { name: /红楼梦/ })).toBeInTheDocument();

    await userEvent.type(screen.getByRole("combobox"), "红");
    expect(screen.queryByRole("option", { name: /儒林外史/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm vitest run src/components/review/shared/book-selector.test.tsx`
Expected: FAIL

- [ ] **Step 3：实现**

```tsx
// src/components/review/shared/book-selector.tsx
"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface BookOption {
  id   : string;
  title: string;
}

interface BookSelectorProps {
  books        : BookOption[];
  currentBookId: string;
  basePath     : string;
}

export function BookSelector({ books, currentBookId, basePath }: BookSelectorProps) {
  const [open, setOpen] = useState(false);
  const current = books.find((b) => b.id === currentBookId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant     ="outline"
          role        ="button"
          aria-expanded={open}
          className   ="w-64 justify-between"
        >
          <span className="truncate">{current?.title ?? "选择书籍"}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="搜索书名…" />
          <CommandList>
            <CommandEmpty>未找到相关书籍</CommandEmpty>
            <CommandGroup>
              {books.map((b) => (
                <CommandItem key={b.id} value={b.title} asChild>
                  <Link
                    href     ={`${basePath}/${b.id}`}
                    className="flex w-full items-center gap-2"
                    onClick  ={() => setOpen(false)}
                  >
                    <Check className={cn("h-4 w-4", b.id === currentBookId ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{b.title}</span>
                  </Link>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `pnpm vitest run src/components/review/shared/book-selector.test.tsx`
Expected: PASS

- [ ] **Step 5：commit**

```bash
git add src/components/review/shared/book-selector.tsx src/components/review/shared/book-selector.test.tsx
git commit -m "feat(review): add BookSelector top-bar dropdown

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 3：复合组件

### Task 3.1：`PersonaSidebar`

**Files:**
- Create: `src/components/review/shared/persona-sidebar.tsx`
- Create: `src/components/review/shared/persona-sidebar.test.tsx`

- [ ] **Step 1：写失败测试**

```tsx
/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PersonaSidebar } from "./persona-sidebar";
import { type PersonaListItem } from "./persona-list-summary";

function p(over: Partial<PersonaListItem>): PersonaListItem {
  return {
    personaId          : over.personaId ?? "x",
    displayName        : over.displayName ?? "x",
    aliases            : over.aliases ?? [],
    firstChapterNo     : over.firstChapterNo ?? null,
    totalEventCount    : over.totalEventCount ?? 0,
    totalRelationCount : over.totalRelationCount ?? 0,
    totalConflictCount : over.totalConflictCount ?? 0,
    pendingClaimCount  : over.pendingClaimCount ?? 0,
    personaCandidateIds: over.personaCandidateIds ?? [],
  };
}

const items = [
  p({ personaId: "a", displayName: "周进", firstChapterNo: 2, pendingClaimCount: 4, totalEventCount: 24 }),
  p({ personaId: "b", displayName: "范进", firstChapterNo: 3, pendingClaimCount: 0, totalEventCount: 30 }),
  p({ personaId: "c", displayName: "马二先生", aliases: ["马纯上"], firstChapterNo: 13, pendingClaimCount: 0, totalConflictCount: 1 }),
];

describe("PersonaSidebar", () => {
  it("默认按 firstChapter 升序渲染所有角色", () => {
    render(<PersonaSidebar items={items} selectedPersonaId={null} onSelect={vi.fn()} />);
    const options = screen.getAllByRole("option");
    expect(options.map((o) => within(o).getByText(/周进|范进|马二先生/).textContent)).toEqual([
      "周进", "范进", "马二先生",
    ]);
  });

  it("搜索框过滤别名", async () => {
    render(<PersonaSidebar items={items} selectedPersonaId={null} onSelect={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText(/搜索/), "纯上");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByText("马二先生")).toBeInTheDocument();
  });

  it("点击角色触发 onSelect", async () => {
    const onSelect = vi.fn();
    render(<PersonaSidebar items={items} selectedPersonaId={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByText("周进"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it('"下一个待审" 按钮跳到 pendingClaimCount 最多的角色', async () => {
    const onSelect = vi.fn();
    render(<PersonaSidebar items={items} selectedPersonaId={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /下一个待审/ }));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("全部已审时按钮 disabled", () => {
    const allDone = items.map((i) => ({ ...i, pendingClaimCount: 0 }));
    render(<PersonaSidebar items={allDone} selectedPersonaId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /全部已审/ })).toBeDisabled();
  });

  it("顶部全书进度展示已审/总", () => {
    render(<PersonaSidebar items={items} selectedPersonaId={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/已审 .* \/ 总/)).toBeInTheDocument();
  });

  it("listbox a11y：role=listbox", () => {
    render(<PersonaSidebar items={items} selectedPersonaId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm vitest run src/components/review/shared/persona-sidebar.test.tsx`
Expected: FAIL

- [ ] **Step 3：实现**

```tsx
// src/components/review/shared/persona-sidebar.tsx
"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { PersonaCard } from "./persona-card";
import {
  computePersonaProgress,
  filterPersonaListItems,
  findNextPendingPersonaId,
  sortPersonaListItems,
  type PersonaListItem,
  type PersonaSortKey,
  type PersonaStatusFilter,
} from "./persona-list-summary";

interface PersonaSidebarProps {
  items            : PersonaListItem[];
  selectedPersonaId: string | null;
  onSelect         : (personaId: string | null) => void;
}

const STATUS_OPTIONS: { value: PersonaStatusFilter; label: string }[] = [
  { value: "pending",  label: "待审核" },
  { value: "conflict", label: "冲突" },
  { value: "done",     label: "已完成" },
];

export function PersonaSidebar({ items, selectedPersonaId, onSelect }: PersonaSidebarProps) {
  const [keyword,       setKeyword]       = useState("");
  const [sortKey,       setSortKey]       = useState<PersonaSortKey>("first-chapter");
  const [statusFilters, setStatusFilters] = useState<PersonaStatusFilter[]>([]);

  const visible = useMemo(() => {
    const filtered = filterPersonaListItems(items, keyword, statusFilters);
    return sortPersonaListItems(filtered, sortKey);
  }, [items, keyword, sortKey, statusFilters]);

  const progress      = useMemo(() => computePersonaProgress(items), [items]);
  const nextPendingId = useMemo(
    () => findNextPendingPersonaId(items, selectedPersonaId),
    [items, selectedPersonaId],
  );

  const toggleStatus = (s: PersonaStatusFilter) => {
    setStatusFilters((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  return (
    <aside className="sticky top-20 flex max-h-[calc(100vh-6rem)] w-72 shrink-0 flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>已审 {progress.reviewed} / 总 {progress.total}</span>
          <span>{Math.round(progress.ratio * 100)}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary/60" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
        </div>
        <Button
          size      ="sm"
          variant   ="outline"
          className ="w-full"
          disabled  ={nextPendingId === null}
          onClick   ={() => nextPendingId && onSelect(nextPendingId)}
        >
          {nextPendingId === null ? "全部已审 ✓" : "下一个待审 →"}
        </Button>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="搜索角色或别名"
          value      ={keyword}
          onChange   ={(e) => setKeyword(e.target.value)}
          className  ="h-8 pl-7 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as PersonaSortKey)}>
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="first-chapter">叙事顺序</SelectItem>
            <SelectItem value="pending-desc">待审优先</SelectItem>
            <SelectItem value="event-desc">事迹最多</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-1">
        {STATUS_OPTIONS.map((opt) => (
          <Toggle
            key       ={opt.value}
            size      ="sm"
            pressed   ={statusFilters.includes(opt.value)}
            onPressedChange={() => toggleStatus(opt.value)}
            className ="h-6 px-2 text-xs"
          >
            {opt.label}
          </Toggle>
        ))}
      </div>
      <div role="listbox" aria-label="角色列表" className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">未匹配到角色</div>
        ) : (
          visible.map((item) => (
            <PersonaCard
              key        ={item.personaId}
              item       ={item}
              isSelected ={item.personaId === selectedPersonaId}
              onSelect   ={onSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
}
```

> 注意：若 `Toggle` 组件不存在则用 `Button variant={pressed ? "default" : "outline"}` 替代；先 `ls src/components/ui/toggle.tsx` 检查，没有则改用 Button。

- [ ] **Step 4：运行测试确认通过**

Run: `pnpm vitest run src/components/review/shared/persona-sidebar.test.tsx`
Expected: PASS

- [ ] **Step 5：commit**

```bash
git add src/components/review/shared/persona-sidebar.tsx src/components/review/shared/persona-sidebar.test.tsx
git commit -m "feat(review): add PersonaSidebar with progress and next-pending

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 3.2：`ReviewWorkbenchShell`（URL 同步 + 键盘 + sessionStorage）

**Files:**
- Create: `src/components/review/shared/review-workbench-shell.tsx`
- Create: `src/components/review/shared/review-workbench-shell.test.tsx`

- [ ] **Step 1：写失败测试**

```tsx
/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewWorkbenchShell } from "./review-workbench-shell";
import { type PersonaListItem } from "./persona-list-summary";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter      : () => ({ replace: replaceMock }),
  usePathname    : () => "/admin/review/b1",
  useSearchParams: () => new URLSearchParams(),
}));

const items: PersonaListItem[] = [
  {
    personaId          : "p1",
    displayName        : "周进",
    aliases            : [],
    firstChapterNo     : 2,
    totalEventCount    : 10,
    totalRelationCount : 5,
    totalConflictCount : 0,
    pendingClaimCount  : 4,
    personaCandidateIds: ["pc1"],
  },
];

describe("ReviewWorkbenchShell", () => {
  beforeEach(() => replaceMock.mockClear());

  it("渲染 BookSelector / PersonaSidebar / ReviewModeNav 与 children", () => {
    render(
      <ReviewWorkbenchShell
        bookId       ="b1"
        bookTitle    ="儒林外史"
        books        ={[{ id: "b1", title: "儒林外史" }]}
        mode         ="matrix"
        personaItems ={items}
        renderMain   ={({ selectedPersonaId, focusOnly }) => (
          <div data-testid="main">
            persona={selectedPersonaId ?? "null"} focus={String(focusOnly)}
          </div>
        )}
      />,
    );
    expect(screen.getByTestId("main")).toHaveTextContent("persona=null focus=false");
    expect(screen.getByText("周进")).toBeInTheDocument();
  });

  it("点击角色后写 URL 并把 selectedPersonaId 传给 main", async () => {
    render(
      <ReviewWorkbenchShell
        bookId       ="b1"
        bookTitle    ="儒林外史"
        books        ={[{ id: "b1", title: "儒林外史" }]}
        mode         ="matrix"
        personaItems ={items}
        renderMain   ={({ selectedPersonaId }) => (
          <div data-testid="main">persona={selectedPersonaId ?? "null"}</div>
        )}
      />,
    );
    await userEvent.click(screen.getByText("周进"));
    expect(screen.getByTestId("main")).toHaveTextContent("persona=p1");
    expect(replaceMock).toHaveBeenCalled();
    expect(replaceMock.mock.calls[0][0]).toContain("personaId=p1");
  });

  it('键盘 "f" 切换 focusOnly', async () => {
    const user = userEvent.setup();
    render(
      <ReviewWorkbenchShell
        bookId       ="b1"
        bookTitle    ="儒林外史"
        books        ={[{ id: "b1", title: "儒林外史" }]}
        mode         ="matrix"
        personaItems ={items}
        initialSelectedPersonaId="p1"
        renderMain   ={({ focusOnly }) => <div data-testid="main">focus={String(focusOnly)}</div>}
      />,
    );
    expect(screen.getByTestId("main")).toHaveTextContent("focus=false");
    await user.keyboard("f");
    expect(screen.getByTestId("main")).toHaveTextContent("focus=true");
  });

  it('键盘 "Escape" 清除选中', async () => {
    const user = userEvent.setup();
    render(
      <ReviewWorkbenchShell
        bookId       ="b1"
        bookTitle    ="儒林外史"
        books        ={[{ id: "b1", title: "儒林外史" }]}
        mode         ="matrix"
        personaItems ={items}
        initialSelectedPersonaId="p1"
        renderMain   ={({ selectedPersonaId }) => (
          <div data-testid="main">persona={selectedPersonaId ?? "null"}</div>
        )}
      />,
    );
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("main")).toHaveTextContent("persona=null");
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm vitest run src/components/review/shared/review-workbench-shell.test.tsx`
Expected: FAIL

- [ ] **Step 3：实现**

```tsx
// src/components/review/shared/review-workbench-shell.tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ReviewModeNav, type ReviewMode } from "./review-mode-nav";
import { BookSelector, type BookOption } from "./book-selector";
import { PersonaSidebar } from "./persona-sidebar";
import { type PersonaListItem } from "./persona-list-summary";

interface ReviewWorkbenchShellProps {
  bookId                   : string;
  bookTitle                : string;
  books                    : BookOption[];
  mode                     : ReviewMode;
  personaItems             : PersonaListItem[];
  renderMain               : (state: { selectedPersonaId: string | null; focusOnly: boolean }) => ReactNode;
  initialSelectedPersonaId ?: string | null;
  initialFocusOnly         ?: boolean;
}

const SS_KEY = (bookId: string) => `reviewWorkbench:lastSelectedPersonaId:${bookId}`;

export function ReviewWorkbenchShell({
  bookId,
  bookTitle,
  books,
  mode,
  personaItems,
  renderMain,
  initialSelectedPersonaId = null,
  initialFocusOnly         = false,
}: ReviewWorkbenchShellProps) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(initialSelectedPersonaId);
  const [focusOnly,         setFocusOnly]         = useState<boolean>(initialFocusOnly);

  useEffect(() => {
    if (initialSelectedPersonaId === null && typeof window !== "undefined") {
      const cached = window.sessionStorage.getItem(SS_KEY(bookId));
      if (cached && personaItems.some((p) => p.personaId === cached)) {
        setSelectedPersonaId(cached);
      }
    }
  }, [bookId, initialSelectedPersonaId, personaItems]);

  const writeUrl = useCallback((nextPersona: string | null, nextFocus: boolean) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (nextPersona) params.set("personaId", nextPersona);
    else             params.delete("personaId");
    if (nextFocus)   params.set("focus", "1");
    else             params.delete("focus");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, router, searchParams]);

  const handleSelect = useCallback((personaId: string | null) => {
    setSelectedPersonaId(personaId);
    if (personaId === null && focusOnly) setFocusOnly(false);
    writeUrl(personaId, personaId === null ? false : focusOnly);
    if (typeof window !== "undefined") {
      if (personaId) window.sessionStorage.setItem(SS_KEY(bookId), personaId);
      else           window.sessionStorage.removeItem(SS_KEY(bookId));
    }
  }, [bookId, focusOnly, writeUrl]);

  const handleToggleFocus = useCallback((next: boolean) => {
    setFocusOnly(next);
    writeUrl(selectedPersonaId, next);
  }, [selectedPersonaId, writeUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "Escape") {
        if (selectedPersonaId) {
          e.preventDefault();
          handleSelect(null);
        }
        return;
      }
      if (isEditable) return;
      if (e.key === "f" || e.key === "F") {
        if (selectedPersonaId) {
          e.preventDefault();
          handleToggleFocus(!focusOnly);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusOnly, handleSelect, handleToggleFocus, selectedPersonaId]);

  const mainState = useMemo(() => ({ selectedPersonaId, focusOnly }), [selectedPersonaId, focusOnly]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <BookSelector books={books} currentBookId={bookId} basePath="/admin/review" />
        <ReviewModeNav bookId={bookId} active={mode} preserveQuery />
      </div>
      <div className="flex gap-4">
        <PersonaSidebar
          items            ={personaItems}
          selectedPersonaId={selectedPersonaId}
          onSelect         ={handleSelect}
        />
        <main className="min-w-0 flex-1">
          {renderMain(mainState)}
          <input type="hidden" data-testid="shell-book-title" value={bookTitle} readOnly />
          {focusOnly && selectedPersonaId && (
            <div className="sr-only" data-testid="focus-banner">已切换到只看当前角色</div>
          )}
        </main>
      </div>
    </div>
  );
}
```

> 关键依赖：`./review-mode-nav` 需新增 `preserveQuery` prop（Phase 7 处理）；现阶段先把 `ReviewModeNav` 直接 re-export 现有 `src/components/review/shared/review-mode-nav.tsx`，并在该文件加 `preserveQuery?: boolean` 参数。注意当前文件已存在，避免覆盖。

- [ ] **Step 4：运行测试确认通过**

Run: `pnpm vitest run src/components/review/shared/review-workbench-shell.test.tsx`
Expected: PASS

- [ ] **Step 5：commit**

```bash
git add src/components/review/shared/review-workbench-shell.tsx src/components/review/shared/review-workbench-shell.test.tsx
git commit -m "feat(review): add ReviewWorkbenchShell with URL sync, keyboard, sessionStorage

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 3.3：`ReviewModeNav` 增加 `preserveQuery`

**Files:**
- Modify: `src/components/review/shared/review-mode-nav.tsx`

- [ ] **Step 1：写测试**

在 `src/components/review/shared/review-mode-nav.test.tsx`（如不存在则新建）增加：

```tsx
/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewModeNav } from "./review-mode-nav";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("personaId=p1&focus=1"),
}));

describe("ReviewModeNav preserveQuery", () => {
  it("preserveQuery=true 时 Tab 链接保留 query", () => {
    render(<ReviewModeNav bookId="b1" active="matrix" preserveQuery />);
    const link = screen.getByRole("link", { name: /关系/ });
    expect(link.getAttribute("href")).toContain("personaId=p1");
    expect(link.getAttribute("href")).toContain("focus=1");
  });
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `pnpm vitest run src/components/review/shared/review-mode-nav.test.tsx`
Expected: FAIL

- [ ] **Step 3：实现修改**

读 `src/components/review/shared/review-mode-nav.tsx` 现有实现，新增 `preserveQuery?: boolean` prop。在生成 `href` 时若 `preserveQuery`，从 `useSearchParams()` 读取并附加到 URL。

- [ ] **Step 4：运行通过**

Run: `pnpm vitest run src/components/review/shared/review-mode-nav.test.tsx`
Expected: PASS

- [ ] **Step 5：commit**

```bash
git add src/components/review/shared/review-mode-nav.tsx src/components/review/shared/review-mode-nav.test.tsx
git commit -m "feat(review): support preserveQuery in ReviewModeNav

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 4：矩阵页接入

### Task 4.1：`filterMatrixByPersonaId` 纯函数

**Files:**
- Modify: `src/components/review/persona-chapter-matrix/persona-chapter-review-page.tsx`（或抽出 helper）
- 推荐 Create：`src/components/review/persona-chapter-matrix/filter-by-persona.ts` + 测试

- [ ] **Step 1：测试**

```ts
// src/components/review/persona-chapter-matrix/filter-by-persona.test.ts
import { describe, expect, it } from "vitest";
import { filterMatrixByPersonaId } from "./filter-by-persona";

describe("filterMatrixByPersonaId", () => {
  it("personaId=null 时原样返回", () => {
    const m = { personas: [{ personaId: "a" }], cells: [{ personaId: "a" }] } as any;
    expect(filterMatrixByPersonaId(m, null)).toBe(m);
  });

  it("仅保留指定 persona 的列与单元格", () => {
    const m = {
      personas: [{ personaId: "a" }, { personaId: "b" }],
      cells   : [{ personaId: "a" }, { personaId: "b" }],
    } as any;
    const r = filterMatrixByPersonaId(m, "a");
    expect(r.personas.map((p: any) => p.personaId)).toEqual(["a"]);
    expect(r.cells.map((c: any) => c.personaId)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2：fail**

Run: `pnpm vitest run src/components/review/persona-chapter-matrix/filter-by-persona.test.ts`

- [ ] **Step 3：实现**

```ts
// src/components/review/persona-chapter-matrix/filter-by-persona.ts
import { type PersonaChapterMatrixDto } from "@/lib/services/review-matrix";

export function filterMatrixByPersonaId(
  matrix   : PersonaChapterMatrixDto,
  personaId: string | null,
): PersonaChapterMatrixDto {
  if (personaId === null) return matrix;
  return {
    ...matrix,
    personas: matrix.personas.filter((p) => p.personaId === personaId),
    cells   : matrix.cells.filter((c) => c.personaId === personaId),
  };
}
```

- [ ] **Step 4：pass**

- [ ] **Step 5：commit**

```bash
git add src/components/review/persona-chapter-matrix/filter-by-persona.ts src/components/review/persona-chapter-matrix/filter-by-persona.test.ts
git commit -m "feat(review): add filterMatrixByPersonaId helper

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4.2：`MatrixGrid` 高亮列与自动滚动

**Files:**
- Modify: `src/components/review/persona-chapter-matrix/matrix-grid.tsx`
- Modify: `src/components/review/persona-chapter-matrix/matrix-grid.test.tsx`（如不存在则新建）

- [ ] **Step 1：测试** —— 渲染时传 `highlightedPersonaId`，对应列头应有 `data-highlighted=true` 与 `bg-primary/10` 类。
- [ ] **Step 2：失败** —— `pnpm vitest run src/components/review/persona-chapter-matrix/matrix-grid.test.tsx`
- [ ] **Step 3：实现** —— 给列头容器加 `data-highlighted={highlightedPersonaId === p.personaId}`、对应 cell 加 `border-x border-primary/30`；`useEffect([highlightedPersonaId])` 计算 `scrollLeft = idx * PERSONA_CHAPTER_MATRIX_COLUMN_WIDTH - viewportPadding` 并写入 scroller ref。
- [ ] **Step 4：通过**
- [ ] **Step 5：commit**

```bash
git add src/components/review/persona-chapter-matrix/matrix-grid.tsx src/components/review/persona-chapter-matrix/matrix-grid.test.tsx
git commit -m "feat(review): highlight selected persona column and auto-scroll matrix

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4.3：`MatrixToolbar` 接入 `FocusOnlySwitch`，移除"搜索人物"

**Files:**
- Modify: `src/components/review/persona-chapter-matrix/matrix-toolbar.tsx`
- Modify: 对应 test

- [ ] **Step 1：测试** —— 不再渲染 placeholder 含"搜索人物"的输入；存在 `<Switch role="switch" aria-label="只看当前角色相关 claim">`；当 `selectedPersonaId=null` 时 disabled。
- [ ] **Step 2：失败**
- [ ] **Step 3：实现** —— 删除 `personaKeyword` 输入框相关 JSX 与 props；新增 `selectedPersonaId / focusOnly / onFocusOnlyChange` props 并放入 `<FocusOnlySwitch>`；focusOnly=true 时上方加橙色提示条 `仅显示「{name}」相关单元格 [清除聚焦]`，按钮调 `onSelectedPersonaChange(null)`。
- [ ] **Step 4：通过**
- [ ] **Step 5：commit**

```bash
git add src/components/review/persona-chapter-matrix/matrix-toolbar.tsx src/components/review/persona-chapter-matrix/matrix-toolbar.test.tsx
git commit -m "feat(review): replace persona search with focus-only switch in matrix toolbar

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4.4：`PersonaChapterReviewPage` 接收新 props

**Files:**
- Modify: `src/components/review/persona-chapter-matrix/persona-chapter-review-page.tsx`
- Modify: `src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx`

- [ ] **Step 1：测试**：覆盖
  - `focusOnly=false, selectedPersonaId="p1"` → 矩阵保留全部 personas，但 grid 收到 `highlightedPersonaId="p1"`
  - `focusOnly=true, selectedPersonaId="p1"` → 矩阵 personas 只剩 1 项（filterMatrixByPersonaId 已应用）
  - 工具栏关闭 focus → 主组件回到全列模式
- [ ] **Step 2：失败**
- [ ] **Step 3：实现** —— 新 props `selectedPersonaId / focusOnly / onFocusOnlyChange`；URL 同步代码迁出到 shell（删除 `useRouter()` 处的 personaId 查询合成，仅保留 chapterId 等矩阵局部 query 写入）；在 `useMemo([rawMatrix, focusOnly, selectedPersonaId])` 内调用 `filterMatrixByPersonaId`。
- [ ] **Step 4：通过**
- [ ] **Step 5：commit**

```bash
git add src/components/review/persona-chapter-matrix/persona-chapter-review-page.tsx src/components/review/persona-chapter-matrix/persona-chapter-review-page.test.tsx
git commit -m "feat(review): wire selected/focus props into PersonaChapterReviewPage

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4.5：矩阵 server page 接入 Shell

**Files:**
- Modify: `src/app/admin/review/[bookId]/page.tsx`

- [ ] **Step 1：手工集成（无单测，server component）** —— 用 `<ReviewWorkbenchShell mode="matrix" ...>` 包裹原有 `<PersonaChapterReviewPage>`；删除内联 `<aside>` 书籍栏；`buildPersonaListItems(matrix)` 计算后传给 shell；解析 `searchParams.personaId / focus`。

```tsx
// 关键片段
const personaItems = buildPersonaListItems(matrix);
const initialSelectedPersonaId = typeof searchParams?.personaId === "string" ? searchParams.personaId : null;
const initialFocusOnly         = searchParams?.focus === "1";

return (
  <PageContainer ...>
    <ReviewWorkbenchShell
      bookId                  ={bookId}
      bookTitle               ={book.title}
      books                   ={books}
      mode                    ="matrix"
      personaItems            ={personaItems}
      initialSelectedPersonaId={initialSelectedPersonaId}
      initialFocusOnly        ={initialFocusOnly}
      renderMain              ={({ selectedPersonaId, focusOnly }) => (
        <PersonaChapterReviewPage
          bookId           ={bookId}
          chapters         ={matrix.chapters}
          rawMatrix        ={matrix}
          selectedPersonaId={selectedPersonaId}
          focusOnly        ={focusOnly}
        />
      )}
    />
  </PageContainer>
);
```

- [ ] **Step 2：手测验收（dev 服务器）**

```bash
pnpm dev
```

打开 `http://localhost:3000/admin/review/05562920-129d-49b6-bdd4-22f03bdd6bf1`，校验：
- 顶部书籍下拉可切换书
- 左侧角色列表显示《儒林外史》全部角色，姓名、别名、首章、计数齐全
- 选中"周进" → 矩阵列高亮，自动横滚
- 开启"只看当前角色" → 矩阵收缩到一列
- 键盘 `f` / `Esc` 生效

- [ ] **Step 3：跑全量测试**

```bash
pnpm lint && pnpm type-check && pnpm vitest run
```

- [ ] **Step 4：commit**

```bash
git add src/app/admin/review/[bookId]/page.tsx
git commit -m "feat(review): integrate ReviewWorkbenchShell into matrix page

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 5：关系页接入

### Task 5.1：`RelationEditorPage` 接收 selected/focus

**Files:**
- Modify: `src/components/review/relation-editor/relation-editor-page.tsx`
- Modify: `src/components/review/relation-editor/relation-pair-list.tsx`
- Modify: 对应 test

- [ ] **Step 1：测试** —— 包含 selectedPersonaId 的 pair 高亮 + scrollIntoView；focusOnly=true 时只渲染相关 pair。
- [ ] **Step 2：失败**
- [ ] **Step 3：实现** —— 新 props；`pairSummaries.filter(p => p.fromPersonaId === id || p.toPersonaId === id)`；高亮 className `bg-primary/5`；`useEffect` 找到第一个匹配 ref 调 `scrollIntoView({ block: "nearest" })`。
- [ ] **Step 4：pass**
- [ ] **Step 5：commit**

```bash
git add src/components/review/relation-editor/
git commit -m "feat(review): wire selected/focus into RelationEditorPage

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 5.2：关系 server page 接入 Shell + 并行拉 matrix

**Files:**
- Modify: `src/app/admin/review/[bookId]/relations/page.tsx`

- [ ] **Step 1：实现**

```tsx
const [book, books, relations, matrix] = await Promise.all([
  getBook({ id: bookId }),
  listBooksForSelector(),
  reviewQueryService.getRelationEditorView({ bookId }),
  reviewQueryService.getPersonaChapterMatrix({ bookId }),
]);
const personaItems = buildPersonaListItems(matrix);
```

将原 `<aside>` 删除，改用 `<ReviewWorkbenchShell mode="relations">` 包裹 `<RelationEditorPage>`。

- [ ] **Step 2：手测**：
  - 打开 `/admin/review/05562920-129d-49b6-bdd4-22f03bdd6bf1/relations`，sidebar 显示同一组角色
  - 选中"周进"，pair list 滚动到第一个相关 pair 并高亮
  - "只看当前角色" 收缩到只显示周进相关 pair
  - 切回"人物 × 章节" Tab，selectedPersonaId 仍是周进（preserveQuery）

- [ ] **Step 3：lint+type+test**
- [ ] **Step 4：commit**

```bash
git add src/app/admin/review/[bookId]/relations/page.tsx
git commit -m "feat(review): integrate ReviewWorkbenchShell into relations page

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 6：时间页接入

### Task 6.1：`PersonaTimeReviewPage` 接收 selected/focus

**Files:**
- Modify: `src/components/review/persona-time-matrix/persona-time-review-page.tsx`
- Modify: `src/components/review/persona-time-matrix/time-matrix-grid.tsx`
- Modify: 测试

- [ ] **Step 1-5**：与 matrix 同模式（高亮列、scrollLeft、focusOnly 时 personas 单列保留）

```bash
git commit -m "feat(review): wire selected/focus into PersonaTimeReviewPage"
```

### Task 6.2：时间 server page 接入

**Files:**
- Modify: `src/app/admin/review/[bookId]/time/page.tsx`

- [ ] 同 5.2，并行拉 matrix → buildPersonaListItems → `<ReviewWorkbenchShell mode="time">`

- [ ] 手测书 `05562920-129d-49b6-bdd4-22f03bdd6bf1`，三页 selectedPersonaId 持久化、Esc 清除

- [ ] commit

---

## Phase 7：收尾打磨

### Task 7.1：面包屑深链 persona 段

**Files:**
- 找到 `<PageContainer>`/breadcrumb 实现处 `grep -rn "面包屑\|Breadcrumb\|breadcrumb" src/components/layout`
- Modify shell：把当前 selectedPersonaId 对应名字传给 PageContainer 或在 shell 内渲染额外面包屑段

- [ ] **Step 1**：测试 —— 选中角色后页面顶端出现 `儒林外史 / 审核中心 / 周进` 末段，点击末段调 `onSelect(null)`
- [ ] **Step 2**：实现 —— shell 在 `selectedPersonaId` 非 null 时渲染 `<nav aria-label="面包屑补充">` 一行：`审核中心 / [persona name] [×]`
- [ ] **Step 3-5**：pass + commit

### Task 7.2：a11y 与对比度复核

**Files:**
- Modify: `persona-card.tsx`（焦点环 `focus-visible:ring-ring`，避免与选中态 `ring-primary` 视觉冲突）
- Modify: `matrix-grid.tsx` 列高亮 `bg-primary/15`（若对比度不足）
- 手工 dark mode 检查

- [ ] **Step 1-3**：眼检 + 调色 + commit

```bash
git commit -m "chore(review): a11y polish for contrast and focus rings"
```

### Task 7.3：memoize 性能

**Files:**
- 父组件（shell）`buildPersonaListItems` 已在 server 完成；client 端 `sortPersonaListItems` / `filterPersonaListItems` 已用 `useMemo`
- `PersonaCard` 加 `React.memo`

- [ ] commit

```bash
git commit -m "perf(review): memoize PersonaCard"
```

### Task 7.4：最终全量验证

- [ ] **Step 1**：

```bash
pnpm lint
pnpm type-check
pnpm vitest run --coverage
```

确认全绿、行覆盖率 ≥ 90%。

- [ ] **Step 2**：手测书 `05562920-129d-49b6-bdd4-22f03bdd6bf1` 三页全部场景，对照 spec §13 DoD 逐条勾选。

- [ ] **Step 3**：合并到主分支前的 final commit / push。

```bash
git push origin dev_2
```

---

## 验证标准回顾（来自 spec §13）

完整 DoD 清单：

- 三页都展示左侧角色列表，且角色卡片包含别名、首章、计数、待审/冲突状态 ✅ Phase 1-3
- 顶部书籍选择器替代旧 w-44 书籍栏 ✅ Phase 2.3 / 4.5 / 5.2 / 6.2
- 选中角色：默认列高亮+滚动；"只看当前角色"开关切换为单列 ✅ Phase 4.2 / 4.4
- 角色搜索/排序/状态 chip 与 URL `?personaId=&focus=` 同步 ✅ Phase 3
- 既有矩阵单元格 / 关系编辑 / 时间钻取交互保持向后兼容 ✅ Phase 4-6（不动 children 内部）
- 键盘 ↑↓/Enter/F///Esc 一致 ✅ Phase 3.2（F/Esc 已实现，↑↓/Enter 在 PersonaSidebar listbox 默认行为；如需自实现追加任务）
- Sidebar 顶部全书进度与 PersonaCard 进度条 ✅ Phase 1.2 / 2.1 / 3.1
- "下一个待审角色"按钮 ✅ Phase 3.1
- 合并候选徽标 ✅ Phase 2.1
- 切换 Tab 时 selectedPersonaId / focusOnly 保留 ✅ Phase 3.3 (preserveQuery)
- 面包屑追加角色段，可点击清除 ✅ Phase 7.1
- listbox / option a11y ✅ Phase 2.1 / 3.1 / 7.2
- pnpm lint + type-check + test 全绿 ✅ Phase 7.4

---

## 可能的延后项（spec §12 Future Work，本计划不实现）

- 角色 sparkline / `lastChapterNo` / 别名 tooltip 完整展开
- Sidebar 折叠模式
- 拖拽批量审核
- 关系/时间页 sidebar Suspense skeleton

