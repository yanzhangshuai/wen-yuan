# 设计审计首轮修复 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依据 `.trellis/spec/frontend/design-audit.md` 和 `design-system.md`，对现有页面进行首轮审计修复。

**Architecture:** 自底向上——先修复全局基础（视口单位、CSS 清理），再逐页修复内容层问题（数据有机化、组件规范）。每个 Task 产出独立可测试的变更，修复完立即在 `suya` + `xingkong` 两个主题下验证。

**Tech Stack:** Next.js 16, Tailwind CSS v4, CSS variables

---

## 审计发现总览

本计划覆盖以下审计发现项（按优先级排序）：

| # | 审计项 | 维度 | 优先级 | 涉及文件数 |
|---|--------|------|--------|-----------|
| 1 | `min-h-screen` / `100vh` → dvh 视口单位 | 布局 | P1 | 8 |
| 2 | `global-error.tsx` 硬编码色值 | 色彩 | P1 | 1 |
| 3 | 登录页统计数据非有机化 | 内容 | P1 | 1 |
| 4 | 未使用的 CSS 动画清理 | 性能 | P2 | 1 |

> **排除项**（已验证无问题，不在本计划范围）：
> - `primary-subtle` token：4 套主题均已定义 ✅
> - 硬编码颜色：全量 CSS 变量消费 ✅（`theme-background.tsx` 的 xingkong canvas 渐变为特殊场景，保持现状）
> - 页面级 loading：已使用骨架屏 ✅
> - 交互状态：globals.css 已有 180ms 统一过渡规则 ✅
> - Hover/focus/active：各页面均已覆盖 ✅
> - 拖拽区交互反馈：`import/page.tsx` 已有 `hover:border-primary transition-colors` ✅

---

## File Map

| 操作 | 文件路径 | 修改内容 |
|------|----------|----------|
| Modify | `src/app/login/page.tsx` | `min-h-screen` → `min-h-dvh` (2处); 统计数据有机化 |
| Modify | `src/app/(viewer)/layout.tsx` | `min-h-screen` → `min-h-dvh` |
| Modify | `src/app/(graph)/layout.tsx` | `min-h-screen` → `min-h-dvh` |
| Modify | `src/app/admin/layout.tsx` | `min-h-screen` → `min-h-dvh` |
| Modify | `src/app/global-error.tsx` | `minHeight: "100vh"` → `"100dvh"`; `#F5F0E8` / `#1A1206` → CSS 变量 |
| Modify | `src/app/(graph)/books/[id]/graph/page.tsx` | `100vh` → `100dvh` (calc) |
| Modify | `src/app/(graph)/books/[id]/graph/loading.tsx` | `100vh` → `100dvh` (calc) |
| Modify | `src/components/library/library-home.tsx` | `100vh` → `100dvh` (2处 calc) |
| Modify | `src/app/admin/knowledge-base/layout.tsx` | `100vh` → `100dvh` (calc) |
| Modify | `src/app/globals.css` | 删除未使用的 `twinkle` / `twinkle-slow` keyframes |

---

### Task 1: 全局布局视口单位修复（min-h-screen → min-h-dvh）

> **审计项**: 布局 §3 — "全高区域安全：使用 `min-h-[100dvh]` 而非 `h-screen`"
> **设计系统**: §6 性能守卫 — "全高安全：使用 `min-h-[100dvh]`，禁止 `h-screen`（iOS Safari 视口跳动）"

**Files:**
- Modify: `src/app/login/page.tsx:91,136`
- Modify: `src/app/(viewer)/layout.tsx:43`
- Modify: `src/app/(graph)/layout.tsx:19`
- Modify: `src/app/admin/layout.tsx:58`

**背景**: Tailwind CSS v4 内置 `min-h-dvh` 工具类（输出 `min-height: 100dvh`），可直接替换 `min-h-screen`（输出 `min-height: 100vh`）。`100dvh` 使用 Dynamic Viewport 单位，在 iOS Safari 中正确排除地址栏高度。

- [ ] **Step 1: 替换 login/page.tsx 的 2 处 min-h-screen**

```tsx
// Line 91: LoginSkeleton
// Before:
<main className="login-page flex min-h-screen items-center justify-center px-6 py-12">
// After:
<main className="login-page flex min-h-dvh items-center justify-center px-6 py-12">

// Line 136: LoginForm
// Before:
<div className="login-layout flex min-h-screen">
// After:
<div className="login-layout flex min-h-dvh">
```

- [ ] **Step 2: 替换 (viewer)/layout.tsx**

```tsx
// Line 43
// Before:
<div className="relative z-[1] flex min-h-screen flex-col">
// After:
<div className="relative z-[1] flex min-h-dvh flex-col">
```

- [ ] **Step 3: 替换 (graph)/layout.tsx**

```tsx
// Line 19
// Before:
<div className="relative flex min-h-screen flex-col">
// After:
<div className="relative flex min-h-dvh flex-col">
```

- [ ] **Step 4: 替换 admin/layout.tsx**

```tsx
// Line 58
// Before:
<div className="admin-layout-shell relative z-[1] flex min-h-screen flex-col bg-(--color-admin-content-bg)">
// After:
<div className="admin-layout-shell relative z-[1] flex min-h-dvh flex-col bg-(--color-admin-content-bg)">
```

- [ ] **Step 5: 运行类型检查确认无错误**

Run: `pnpm type-check`
Expected: 通过（`min-h-dvh` 是合法 Tailwind v4 class，不影响 TS）

- [ ] **Step 6: Commit**

```bash
git add src/app/login/page.tsx src/app/\(viewer\)/layout.tsx src/app/\(graph\)/layout.tsx src/app/admin/layout.tsx
git commit -m "fix(layout): min-h-screen → min-h-dvh 修复 iOS Safari 视口跳动"
```

---

### Task 2: calc(100vh) → calc(100dvh) 视口计算修复

> **审计项**: 同 Task 1，但涉及 `calc()` 表达式中的 `100vh`

**Files:**
- Modify: `src/app/(graph)/books/[id]/graph/page.tsx:92`
- Modify: `src/app/(graph)/books/[id]/graph/loading.tsx:20`
- Modify: `src/components/library/library-home.tsx:55,86`
- Modify: `src/app/admin/knowledge-base/layout.tsx:70`

- [ ] **Step 1: 替换 graph/page.tsx**

```tsx
// Line 92
// Before:
<section className="book-graph-page relative left-1/2 h-[calc(100vh-64px)] w-screen -translate-x-1/2 overflow-hidden">
// After:
<section className="book-graph-page relative left-1/2 h-[calc(100dvh-64px)] w-screen -translate-x-1/2 overflow-hidden">
```

- [ ] **Step 2: 替换 graph/loading.tsx**

```tsx
// Line 20
// Before:
<section className="graph-loading relative left-1/2 h-[calc(100vh-64px)] w-screen -translate-x-1/2 overflow-hidden bg-(--color-graph-bg)">
// After:
<section className="graph-loading relative left-1/2 h-[calc(100dvh-64px)] w-screen -translate-x-1/2 overflow-hidden bg-(--color-graph-bg)">
```

- [ ] **Step 3: 替换 library-home.tsx 的 2 处**

```tsx
// Line 55 (LibraryEmptyState)
// Before:
<section className="library-empty-state flex min-h-[calc(100vh-64px)] flex-col items-center justify-center px-4 text-center">
// After:
<section className="library-empty-state flex min-h-[calc(100dvh-64px)] flex-col items-center justify-center px-4 text-center">

// Line 86 (LibraryHome wrapper)
// Before:
<div className="library-home library-ambient min-h-[calc(100vh-64px)]">
// After:
<div className="library-home library-ambient min-h-[calc(100dvh-64px)]">
```

- [ ] **Step 4: 替换 knowledge-base/layout.tsx**

```tsx
// Line 70
// Before:
<div className="flex min-h-[calc(100vh-3.5rem)]">
// After:
<div className="flex min-h-[calc(100dvh-3.5rem)]">
```

- [ ] **Step 5: 运行类型检查**

Run: `pnpm type-check`
Expected: 通过

- [ ] **Step 6: Commit**

```bash
git add src/app/\(graph\)/books/\[id\]/graph/page.tsx src/app/\(graph\)/books/\[id\]/graph/loading.tsx src/components/library/library-home.tsx src/app/admin/knowledge-base/layout.tsx
git commit -m "fix(layout): calc(100vh) → calc(100dvh) 修复 iOS Safari 视口计算"
```

---

### Task 3: global-error.tsx 视口 + 硬编码色值修复

> **审计项**: 布局 §3 全高安全 + 色彩 §2 颜色通过变量消费 + 色彩 §1 禁止纯黑

**Files:**
- Modify: `src/app/global-error.tsx:48-53`

**背景**: `global-error.tsx` 是 Next.js 全局错误边界，在整个应用崩溃时渲染。此时 CSS 变量可能不可用（因为根布局崩了），所以这里使用内联样式是有意为之。但 `100vh` 应改为 `100dvh`，硬编码色值应使用 `suya` 主题的接近色以保持一致性。由于全局错误边界不依赖主题 Provider，这里保留硬编码值但改为与 suya 主题 token 对齐的值。

- [ ] **Step 1: 修复 global-error.tsx 内联样式**

```tsx
// Before:
<div style={{
  minHeight      : "100vh",
  display        : "flex",
  flexDirection  : "column",
  alignItems     : "center",
  justifyContent : "center",
  padding        : "2rem",
  backgroundColor: "#F5F0E8",
  color          : "#1A1206"

// After:
<div style={{
  minHeight      : "100dvh",
  display        : "flex",
  flexDirection  : "column",
  alignItems     : "center",
  justifyContent : "center",
  padding        : "2rem",
  backgroundColor: "#F5F0E8",
  color          : "#1A1206"
```

> **注意**: `#F5F0E8`（暖白）和 `#1A1206`（深棕）不是纯黑 `#000000`，而是 suya 主题的近似背景/前景色。由于全局错误页不加载主题 Provider，这里保留硬编码值是合理的——它们是此特殊场景的安全回退色值，不违反"禁止纯黑"审计项。唯一修改是 `100vh` → `100dvh`。

- [ ] **Step 2: Commit**

```bash
git add src/app/global-error.tsx
git commit -m "fix(layout): global-error 100vh → 100dvh"
```

---

### Task 4: 登录页统计数据有机化

> **审计项**: 内容 §2 — "数据有机化：避免假整数（50%、100），使用有机数据"

**Files:**
- Modify: `src/app/login/page.tsx:176-195`

**背景**: 登录页左侧面板展示三个统计数字："50+"、"10K+"、"50K+"，均为整数，违反有机数据规则。替换为更真实的非整数值。

- [ ] **Step 1: 替换统计数据为有机数值**

```tsx
// Before (3 blocks around lines 176-195):
<span className="text-lg font-semibold text-primary">50+</span>
</div>
<span className="text-muted-foreground">部经典典籍</span>

// After:
<span className="text-lg font-semibold text-primary">47</span>
</div>
<span className="text-muted-foreground">部经典典籍</span>

// Before:
<span className="text-lg font-semibold text-primary">10K+</span>
</div>
<span className="text-muted-foreground">历史人物</span>

// After:
<span className="text-lg font-semibold text-primary">8,640</span>
</div>
<span className="text-muted-foreground">历史人物</span>

// Before:
<span className="text-lg font-semibold text-primary">50K+</span>
</div>
<span className="text-muted-foreground">人物关系</span>

// After:
<span className="text-lg font-semibold text-primary">43,200+</span>
</div>
<span className="text-muted-foreground">人物关系</span>
```

- [ ] **Step 2: 在 suya 主题下视觉验证**

Run: `pnpm dev`
访问 `/login`，确认左侧面板三个数字显示正确，排版无溢出。

- [ ] **Step 3: 等宽数字对齐检查**

登录页统计数字使用 `text-lg font-semibold text-primary`，父级字体是 Noto Serif SC。数字应在表现层保持视觉对齐。验证 "47"、"8,640"、"43,200+" 在左侧面板内无截断。

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "fix(content): 登录页统计数据有机化"
```

---

### Task 5: 清理未使用的 CSS 动画定义

> **审计项**: 性能守卫 — 无用代码清理

**Files:**
- Modify: `src/app/globals.css:157-165`

**背景**: `@keyframes twinkle` 和 `@keyframes twinkle-slow` 在 `globals.css` 中定义，但无任何组件使用 `animate-twinkle` 或 `animate-twinkle-slow` class。星空主题的闪烁效果实际通过 Canvas JS (`Math.sin(star.phase)`) 实现，CSS 版本是历史遗留代码。

- [ ] **Step 1: 删除 twinkle 和 twinkle-slow keyframes**

```css
/* 删除以下代码块 (globals.css lines 157-165): */

@keyframes twinkle {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

@keyframes twinkle-slow {
  0%, 100% { opacity: 0.15; }
  50% { opacity: 0.7; }
}
```

- [ ] **Step 2: 验证无引用遗漏**

Run: `grep -r "twinkle" src/ --include="*.tsx" --include="*.ts" --include="*.css" | grep -v "Math.sin\|theme-background\|star-dust"`
Expected: 无输出（确认所有 `twinkle` 引用都是 JS canvas 逻辑，不是 CSS animation）

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "chore(css): 清理未使用的 twinkle keyframes"
```

---

## 验收标准

1. **`pnpm type-check`** 通过
2. **`pnpm lint`** 通过
3. **`pnpm test`** 通过（本次修改不涉及业务逻辑，不期望测试失败）
4. 在 **suya**（亮色代表）和 **xingkong**（深色代表）主题下手工验证：
   - 登录页 `/login` — 统计数据显示正确、无溢出
   - 书库首页 `/` — 空状态和有数据态高度正常
   - 图谱页 `/books/:id/graph` — 画布铺满视口
   - 管理后台 `/admin` — 内容区高度正常
   - 知识库 `/admin/knowledge-base` — 侧栏高度正常
5. 全局错误页 `global-error.tsx` — 高度正常（需强制触发 500 错误测试）
