# 文渊 — 前端任务文档

> **执行角色**：前端 AI 模型  
> **协作约定**：后端 AI 模型同步执行 `task-backend.md`，双方共享本文 §8 API 合约（以 `task-backend.md` 为权威源）
> **文档版本**：基于 PRD v1.2（2026-03-25）拆分

---

## 一、项目概览

**文渊**是一个 AI 驱动的中国古典文学人物关系图谱系统。前端负责：

- 书库首页（可视化书架）
- 人物图谱页（D3.js 力导向图，交互式）
- 管理后台 UI（书籍导入向导、审核看板、模型设置）
- 全局主题系统（四套主题，CSS Design Token 驱动）
- 登录页 UI
- 原文阅读面板

---

## 二、技术栈（前端部分）

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 框架 | Next.js 16 (App Router) + React 19 | 服务端组件 + 客户端组件混合 |
| 样式 | Tailwind CSS v4 | 原子化 CSS |
| 组件库 | shadcn/ui（Radix UI 原语） | 基础 UI 组件 |
| 图标 | `lucide-react` | **唯一**图标库，禁止引入其他 |
| 动画 | Framer Motion | 页面切换、卡片动效 |
| 图谱渲染 | D3.js force-directed graph | Phase 3 起，先 SVG，后 Canvas |
| 主题管理 | next-themes | `data-theme` 属性注入 |
| 校验 | Zod（表单客户端校验） | 与后端共用 schema 定义 |
| 测试 | Vitest + @testing-library/react | 组件单元测试 |
| 数据请求 | `use()` + Suspense（渲染期）/ Server Actions（写操作）/ SWR `refreshInterval`（客户端轮询）| SWR 仅限轮询场景，**禁止**用于首屏数据加载；不引入 TanStack Query |
| 全局状态 | 本地 `useState` / Context 优先，Zustand 按需引入 | 见 `.trellis/spec/frontend/state-management.md` |

---

## 三、设计系统（完整规范）

### 3.1 布局与断点

- **目标设备**：PC 桌面优先，最小支持宽度 `1280px`
- 书库网格列数：`≥1536px` → 6 列；`1280–1535px` → 5 列；`<1280px` → 不做适配
- 内容区最大宽度：`1440px`（居中）

### 3.2 主题系统（四套）

支持“可扩展主题体系”，内置**四套主题**（含两套完整暗色模式）。所有视觉差异只写在主题 token 层，**业务组件不感知主题**。

#### CSS Design Token 架构

> **原则**：基础色（bg/fg/primary）写确定值定调性，派生色用推导规则，实际开发可在 CSS 文件中微调。

**基础色（确定值）**

| Token | danqing 丹青 | suya 素雅 | diancang 典藏 | xingkong 星空 |
| --- | --- | --- | --- | --- |
| `--color-bg` | `#1C1612` 紫檀深褐 | `#F7F5F0` 暖象牙纸 | `#1A1714` 深胡桃黑 | `#08090F` 深邃宇宙黑 |
| `--color-fg` | `#E5D9C8` 暖象牙 | `#33312C` 暖近黑 | `#E8E0D4` 暖米白 | `#C8CED8` 冷银白 |
| `--color-primary` | `#D95445` 明亮朱砂 | `#5E7452` 竹青（WCAG AA 5:1 on bg）| `#C8A86E` 黄铜金 | `#7B90AF` 星辉银蓝 |
| `--color-primary-fg` | `#FFFFFF` | `#FFFFFF` | `#1A1714` 深色 | `#08090F` 深色 |
| `--color-muted` | `#2E241C` 深木色 | `#C4BFB5` 暖灰 | `#352F29` | `#161B28` |
| `--color-muted-fg` | `#A0917E` 暖灰 | `#8A8478` 暖中灰 | `#A09488` | `#7A8494` |
| `--color-border` | `#3A2E24` | `#E0DCD4` 暖浅边框 | `#3A3228` | `#181D2A` |
| `--color-card-bg` | `#241E18` | `#FEFDFB` 近白 | `#221F1A` | `#0E1018` |
| `--color-graph-bg` | `#15110D` 旧纸深底 | `#F0EDE7` 暖纸底 | `#12100D` 展厅深底 | `#050710` 深空 |

**语义状态色（确定值）**

| Token | danqing | suya | diancang | xingkong |
| --- | --- | --- | --- | --- |
| `--color-success` | `#4A9E5C` | `#4A8C5C` | `#5A9E6F` | `#22C55E` |
| `--color-warning` | `#D4A050` | `#B89840` | `#D4A855` | `#EAB308` |
| `--color-danger` | `#C44030` | `#C45040` | `#C95D4F` | `#EF4444` |
| `--color-info` | `#5A8DB8` | `#5A82A8` | `#7AACCB` | `#38BDF8` |

> ❗ danqing danger 与 primary 必须可区分：danger `#C44030` 偏深而平、primary `#D95445` 偏亮而饱和，且危险操作辅以左侧红带或图标强化区分。

**派生色（推导规则，不写死十六进制）**

| Token | 推导规则 |
| --- | --- |
| `--color-primary-hover` | primary darken 10% |
| `--color-primary-active` | primary darken 18% |
| `--color-primary-subtle` | primary 透明度 10%（暗色主题 12%）|
| `--color-primary-fg` | 按钮文字色：亮色 primary 用深色文字，暗色 primary 用 `#FFFFFF`（通过 `@theme` 中 `--color-primary-foreground: var(--color-primary-fg, #FFFFFF)` 实现）|
| `--color-border-strong` | border darken 8% |
| `--color-card-border` | border + 透明度 35%（暗色主题使用 primary 透明度20%）|
| `--shadow-card` | bg 主色调 + 12% 透明（暗色主题取 primary 色调 15%）|
| `--shadow-card-hover` | 同上，模糊半径加倍，透明度 +6% |

**图谱专用色（确定值）**

| Token | danqing | suya | diancang | xingkong |
| --- | --- | --- | --- | --- |
| `--color-graph-node-default` | `#D95445` | `#5E7452` | `#C8A86E` | `#7B90AF` |
| `--color-graph-edge-positive` | `#5A8DB8` | `#5A82A8` | `#7AACCB` | `#5AACB4` |
| `--color-graph-edge-negative` | `#C44030` | `#C45040` | `#C95D4F` | `#C46A5A` |
| `--color-graph-draft` | primary 50% 透明 | muted 50% 透明 | primary 40% 透明 | primary 45% 透明 |
| `--color-graph-verified-glow` | success 35% 透明 | success 35% 透明 | primary 50% 透明 | primary 55% 透明 |
| `--color-graph-focus-dim` | bg 15% 透明 | fg 15% 透明 | bg 25% 透明 | bg 20% 透明 |

**Admin 后台专属（四套主题一致，不跟随前台强调色）**

| Token | 值 |
| --- | --- |
| `--color-admin-sidebar-bg` | `#1C1917` |
| `--color-admin-sidebar-fg` | `#D6D3D1` |
| `--color-admin-sidebar-active` | `#C0392B` |
| `--color-admin-header-bg` | `#292524` |
| `--color-admin-content-bg` | `#FAFAF9` |

#### 主题 1 — 丹青·深色（danqing）

| 调性 | 紫檀深褐底 + 暖象牙文字 + 明亮朱砂强调，古朴大气国潮感 |
| 背景 | `#1C1612`（紫檀深褐）|
| 主强调色 | `#D95445`（明亮朱砂，深底对比 4.6:1）|
| 按钮文字 | `#FFFFFF`（白色 on 朱砂红）|
| 图谱背景 | `#15110D`（旧纸深底）|
| 字体 | Noto Serif SC |

#### 主题 2 — 素雅·暖调浅色（suya）

| 调性 | 暖象牙底 + 竹青绿强调 + 清雅文人气，素净而有韵味 |
| 背景 | `#F7F5F0`（暖象牙纸）|
| 主强调色 | `#5E7452`（竹青绿，WCAG AA on bg ~5:1）|
| 图谱背景 | `#F0EDE7`（暖纸底）|
| 字体 | Noto Serif SC（文人气质） |

#### 主题 3 — 博物馆暗色模式（diancang）

| 调性 | 深胡桃暖黑 + 黄铜金强调 + 博物馆展厅沉浸感 |
| 背景 | `#1A1714`（深胡桃黑，仿博物馆展厅壁面）|
| 主强调色 | `#C8A86E`（黄铜金，仿展品铭牌 / 留金边框）|
| 图谱背景 | `#12100D`（展厅深底，比页面更暗，突出节点聊光感）|
| 字体 | Noto Serif SC（与 danqing 共用，体现典藏气质）|

#### 主题 4 — 星空模式（xingkong）

| 调性 | 深邃宇宙黑 + 星辉银蓝低饱和强调 + 沉浸星空感，不应显蓝 |
| 背景 | `#08090F`（深邃宇宙黑）|
| 主强调色 | `#7B90AF`（星辉银蓝，克制不抢eye）|
| 按钮文字 | `#08090F`（深色 on 银蓝按钮）|
| 图谱背景 | `#050710`（深空）|
| 字体 | Inter（同 suya，科技感）|

#### 主题切换规范

- 切换入口：顶部导航右上角下拉选择器，标签：`丹青 / 素雅 / 典藏 / 星空`
- 切换动画：`transition: color 300ms ease, background-color 300ms ease`
- 持久化：写入 `localStorage`，key 为 `wen-yuan-theme`
- 实现：next-themes `data-theme` 属性，SSR 侧注入初始主题脚本，禁止页面闪烁
- 新增主题：只允许新增 token 变量文件，不允许修改业务组件结构

#### 暗色主题策略

`danqing`（古风）、`diancang`（典藏）和 `xingkong`（星空）均为完整暗色主题，与一套亮色主题（suya 素雅）并列，用户手动选择，**不**自动跟随 `prefers-color-scheme: dark`。

- **danqing 丹青**：紫檀深褐暖底、朱砂红强调、SVG 纹理 + 微光、古朴大气国潮感。字体用 Noto Serif SC。
- **suya 素雅**：暖象牙底、竹青绿强调、无装饰层、清雅文人气息。字体用 Noto Serif SC。
- **diancang 典藏**：暖色调深底、黄铜金强调、展柜聚光灯微光、静谧庄重。字体用 Noto Serif SC。
- **xingkong 星空**：冷色调深黑、星辉银蓝低饱和强调（非荧光蓝/紫）、节点如星辉浮现、深邃沉浸。字体用 Inter。

### 3.3 字体与图标系统

#### 字体加载

在 `src/app/layout.tsx` 的 `<head>` 中：

```html
<!-- Noto Serif SC（danqing / suya / diancang 共用，古风 + 素雅 + 典藏气质）-->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=swap">
<!-- Inter（xingkong 星空科技感）-->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<!-- JetBrains Mono（代码）-->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap">
```

**Fallback 字体栈：**

```css
/* danqing / suya / diancang（古风 + 素雅 + 典藏）*/
font-family: "Noto Serif SC", "Songti SC", "SimSun", "STSong", serif;
/* xingkong（星空）*/
font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif;
/* 代码 */
font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", ui-monospace, monospace;
```

#### 排版比例

| 层级 | 大小 | Weight | 行高 |
| --- | --- | --- | --- |
| `text-4xl` 页面大标题 | 36px | 700 | 1.2 |
| `text-2xl` 卡片标题 | 24px | 600 | 1.3 |
| `text-xl` 二级标题 | 20px | 600 | 1.4 |
| `text-base` 正文 | 16px | 400 | 1.6 |
| `text-sm` 辅助信息 | 14px | 400 | 1.5 |
| `text-xs` 标签 | 12px | 500 | 1.4 |

#### 图标库规范

- **唯一图标库**：`lucide-react`，禁止引入 Font Awesome、iconfont、react-icons
- 尺寸：默认 `size={16}`；工具栏 `size={18}`；页面级 `size={24}`
- 颜色：继承 `currentColor`，不硬编码
- 均需搭配 `aria-label` 或 `title`

### 3.4 间距与圆角

#### 间距（4px 基数）

| Token | 值 | 典型用途 |
| --- | --- | --- |
| `space-1` | 4px | 图标与文字间距 |
| `space-2` | 8px | 行内元素间距 |
| `space-3` | 12px | 小卡片内边距 |
| `space-4` | 16px | 标准内边距 |
| `space-6` | 24px | 卡片内边距 |
| `space-8` | 32px | 大模块间距 |
| `space-12` | 48px | 页面区块间距 |
| `space-16` | 64px | 首屏大留白 |

#### 圆角

| Token | 值 | 用途 |
| --- | --- | --- |
| `rounded-sm` | 4px | 徽章、标签 |
| `rounded` | 6px | 按钮、输入框 |
| `rounded-md` | 8px | 卡片、下拉菜单 |
| `rounded-lg` | 12px | 对话框、Toast |
| `rounded-xl` | 16px | 人物详情侧边栏 |
| `rounded-full` | 9999px | 头像、圆形按钮 |

> danqing 圆角整体比 suya 小 2px（体现方正感），通过 `--radius-base` CSS 变量控制，组件使用 `calc(var(--radius-base) + Npx)`。

### 3.5 动画规范

| 场景 | 方案 | 时长 / 曲线 |
| --- | --- | --- |
| 主题切换 | CSS transition | `300ms ease` |
| 书籍卡片 Hover 抬起 | Framer Motion | `200ms ease-out`，`y: -8px` |
| 书籍卡片 Hover 信息交错显现 | CSS transition + delay | 面板渐显 `200ms`，标题 `delay 75ms`，作者 `delay 100ms`，统计 `delay 150ms`；均 `translate-y-4→0 + opacity 0→1` |
| 星空闪烁 | CSS `@keyframes twinkle` | 明亮星 `4s ease-in-out infinite`，柔和星 `6s ease-in-out infinite` |
| 页面路由切换 | Framer Motion AnimatePresence | `250ms ease-in-out` |
| 图谱节点渐入 | D3 transition | `400ms ease`，opacity 0→1 |
| 对话框滑入 | Framer Motion | `200ms ease-out`，`x: 16px` → 0 |
| 加载骨架屏 | CSS `@keyframes shimmer` | `1.5s linear infinite` |

所有动画在 `prefers-reduced-motion` 时归零（使用 `motion-safe:` 工具类或 `useReducedMotion`）。

### 3.x1 主题文件结构

每套主题的**所有数值**集中在独立文件中管理，实现"添加新主题 = 新增 CSS + TS 文件"：

```
src/theme/
├── index.ts                  # barrel: 常量 + token 工具
├── constants.ts              # THEME_IDS, THEME_OPTIONS, ThemeId
└── tokens/
    ├── index.ts              # ThemeTokens 接口 + THEME_TOKENS + getFactionColorsForTheme
    ├── danqing/              # 丹青 (danqing)
    │   ├── index.css         # [data-theme='danqing'] CSS 自定义属性 + library-ambient
    │   └── index.ts          # 12 色派系配色
    ├── suya/                 # 素雅 (suya)
    │   ├── index.css
    │   └── index.ts
    ├── diancang/             # 典藏 (diancang)
    │   ├── index.css
    │   └── index.ts
    └── xingkong/             # 星空 (xingkong)
        ├── index.css
        └── index.ts

src/components/theme/
├── index.ts                  # barrel: ThemeProvider / ThemeToggle / DecorativeLayer / WenYuanSeal
├── provider.tsx              # ThemeProvider（next-themes 封装）
├── toggle.tsx                # ThemeToggle 下拉选择器
└── decorative/
    ├── decorative-layer.tsx  # 按主题自动选择装饰
    ├── paper-texture.tsx     # danqing 宣纸纹理
    ├── museum-glow.tsx       # diancang 展厅微光
    ├── star-dust.tsx         # xingkong 多层星空（50+ 暗星 + 15 中星 + 11 明亮闪烁星 + 星云辉光）
    └── web-seal.tsx          # 水印印章

src/app/globals.css           # @import per-theme CSS + @theme 桥接 + 基础层 + 动画
```

**导入约定：**
- `@/theme` — 主题常量与数据（THEME_IDS, THEME_OPTIONS, ThemeTokens, getFactionColorsForTheme）
- `@/components/theme` — 主题 UI 组件（ThemeProvider, ThemeToggle, DecorativeLayer, WenYuanSeal）

### 3.x2 书架 CSS 变量

每套主题定义书架视觉 token，用于 BookCard 3D 书架效果和 LibraryHome 底部横档：

| Token | danqing | suya | diancang | xingkong |
| --- | --- | --- | --- | --- |
| `--color-shelf-surface` | `#3A2E22` 红木面 | `#E0D8CA` 桦木面 | `#302A22` 胡桃面 | `#12141C` 金属面 |
| `--color-shelf-edge` | `#2E2218` | `#D0C8BA` | `#241E16` | `#0A0C14` |

书架实现：BookCard 底部 3 层（面板 → 前沿 → 投影），宽度 115%–118% 营造透视感。

### 3.x 氛围装饰层（Decorative Layer）

在主题 Token 层之上叠加一层**文化质感装饰**，让页面有“灵气”而不只是纯色块换肤。

```
┌────────────────────────────────┐
│  业务组件（不感知主题和装饰）      │
├────────────────────────────────┤
│  氛围装饰层（按主题开关）          │  ← 新增
├────────────────────────────────┤
│  主题 Token 层（色值/字体/圆角）      │
└────────────────────────────────┘
```

#### 控制机制

- CSS 变量 `--decorative-enabled: 1 | 0` 控制显隐
- danqing（古风）、diancang（典藏）、xingkong（星空）默认 `1`，suya（素雅）默认 `0`
- 装饰组件放在 `src/components/ui/decorative/`
- 所有装饰元素加 `aria-hidden="true"`；`prefers-reduced-motion` 时装饰动画静止

#### danqing 古风装饰（MVP）

| 效果 | 实现方式 | 位置 | 成本 |
| --- | --- | --- | --- |
| 宣纸背景纹理 | 平铺 SVG noise（≤ 10KB），`background-image` 叠加在深色 `--color-bg` 上，配合暖色朱砂微光 `radial-gradient` | 全局 body / 书库 | 低 |
| 飞白笔触连线 | SVG filter `<feTurbulence>` + `<feDisplacementMap>` 作用于图谱 edge `<path>` | 图谱边 | 中 |
| 墨晕节点 Hover | SVG filter `<feGaussianBlur>` + 径向渐变，墨滴晕染扩散 | 图谱节点 hover | 中 |
| 印章确认标记 | SVG 组件 `<InkStamp>`，替代绿色对勾 | 人物审核确认状态 | 低 |
| 卡片边框毛边 | CSS `border-image` + 手绘风 SVG 9-slice | 书籍卡片 | 低 |

#### diancang 典藏装饰（MVP）

| 效果 | 实现方式 | 位置 | 成本 |
| --- | --- | --- | --- |
| 展厅微光背景 | CSS 径向渐变（顶部暖黄微光→透明），仿罗马柱灯漫射 | 全局 body | 低 |
| 展柜聚光灯节点 | `box-shadow` 暖黄 glow + 轻微 `brightness` 提升 | 图谱节点 hover | 低 |
| 铜边框卡片 | `border: 1px solid rgba(200,168,110,0.25)` + 微光 shadow | 书籍卡片 | 低 |

#### xingkong 星空装饰（MVP）

| 效果 | 实现方式 | 位置 | 成本 |
| --- | --- | --- | --- |
| 星尘粒子背景 | CSS 多层 `radial-gradient`（粒子感微光点） | 全局 body | 低 |
| 星云辉光节点 | SVG filter `<feGaussianBlur>` glow + `drop-shadow` 荧光扩散 | 图谱节点 hover | 中 |
| 星座连线 | 图谱 edge `stroke-dasharray` + 低透明度发光 glow，仿星座连线 | 图谱边 | 低 |

#### suya 素雅

无装饰层（`--decorative-enabled: 0`），保持清雅素净的视觉层次。

#### 延后到 v2（MVP 不做）

| 效果 | 原因 |
| --- | --- |
| 真实毛笔笔触路径（brush stroke）| 需贝塞尔展宽算法，性能影响大 |
| 墨水流体扩散动画 | 需 WebGL / shader，复杂度过高 |

### 3.6 无障碍基线

- WCAG 2.1 AA（正文 4.5:1，大字/图标 3:1）
- 所有可交互元素须有 `:focus-visible` 轮廓
- 图谱中颜色区分的节点/边必须同时提供形状或标签辅助

### 3.7 图谱节点派系配色（12 色循环，`factionIndex % 12`）

#### danqing（古风·深色）

> 深色背景，派系色需适当提亮确保可读性（≥ 4.5:1 on `#1C1612`）

| 序号 | 色值 | 调性 |
| --- | --- | --- |
| 0 | `#D95445` | 朱砂（主角）|
| 1 | `#5A8DB8` | 青花蓝（文官）|
| 2 | `#4A9E5C` | 松绿（山野）|
| 3 | `#D4A050` | 琥珀金（皇族）|
| 4 | `#9B6AB0` | 紫棠（方外）|
| 5 | `#CA7A3E` | 赭石橙（商人）|
| 6 | `#1A8A8A` | 碧玉青（女性群体）|
| 7 | `#884EA0` | 藕荷紫（宫廷女眷）|
| 8 | `#2E4057` | 墨蓝（武将）|
| 9 | `#5D6D7E` | 青灰（小人物）|
| 10 | `#A04000` | 砖红（反派）|
| 11 | `#117A65` | 翠玉绿（隐者）|

#### suya（素雅·暖调）

| 序号 | 色值 | 调性 |
| --- | --- | --- |
| 0 | `#5E7452` | 竹青（主角）|
| 1 | `#5A82A8` | 雨后青（文官）|
| 2 | `#4A8C5C` | 苔绿（山野）|
| 3 | `#B89840` | 秋香（皇族）|
| 4 | `#8B7DA0` | 藤紫（方外）|
| 5 | `#A06758` | 赭石（商人）|
| 6 | `#4A8898` | 湖蓝（女性群体）|
| 7 | `#A06868` | 绛红（宫廷女眷）|
| 8 | `#607080` | 青灰（武将）|
| 9 | `#808070` | 草灰（小人物）|
| 10 | `#C45040` | 红褐（反派）|
| 11 | `#4A7A62` | 翠色（隐者）|

#### diancang（博物馆暗色 · 暖光展柜感）

| 序号 | 色值 | 调性 |
| --- | --- | --- |
| 0 | `#C8A86E` | 黄铜金（主角）|
| 1 | `#7AACCB` | 月石蓝（文官）|
| 2 | `#5A9E6F` | 青瓷绿（山野）|
| 3 | `#D4A855` | 琉璃金（皇族）|
| 4 | `#9B7DB8` | 紫水晶（方外）|
| 5 | `#C9805A` | 红陶橙（商人）|
| 6 | `#6B9E9E` | 青铜绿（女性群体）|
| 7 | `#B07A8A` | 玫瑰褐（宫廷女眷）|
| 8 | `#6A7F8D` | 石板蓝（武将）|
| 9 | `#8C8378` | 暖灰（小人物）|
| 10 | `#C95D4F` | 红珊瑚（反派）|
| 11 | `#5E8A7A` | 翠玉绿（隐者）|

**节点 Hover 规则：**
- danqing / suya：`filter: brightness(1.15)`
- diancang：`filter: brightness(1.2)` + `box-shadow: 0 0 12px rgba(200,168,110,0.35)`（展柜聚光灯效果）
- xingkong：`filter: brightness(1.25)` + `drop-shadow(0 0 8px rgba(123,144,175,0.5))`（星辉微光效果）

#### xingkong（星空 · 低饱和星辉感）

> 弃用高饱和荧光色，改用低饱和银灰色调，体现深空沉浸而非霓虹感。

| 序号 | 色值 | 调性 |
| --- | --- | --- |
| 0 | `#7B90AF` | 星辉银蓝（主角）|
| 1 | `#5AACB4` | 暗青（盟友）|
| 2 | `#6A9E7A` | 暗绿（正义）|
| 3 | `#B08A5A` | 暗金（中立）|
| 4 | `#9080A0` | 暗紫（女性群体）|
| 5 | `#A88070` | 暗橙（权贵）|
| 6 | `#5A9AB0` | 灰蓝（文人）|
| 7 | `#B06A5C` | 暗红（反派）|
| 8 | `#8878A0` | 灰紫（神秘）|
| 9 | `#5A9A7A` | 暗青绿（隐者）|
| 10 | `#6A88B0` | 灰明蓝（朝廷）|
| 11 | `#9A70A0` | 暗紫红（皇室）|

### 3.8 Admin 后台布局规范

```
┌──────────────────────────────────────────────────┐
│  顶部 Header（高度 56px，背景 #292524）            │
│  [文渊Admin Logo]   [书库] [审核] [模型]   [退出]  │
├─────────────────────────────────────────────────  │
│  主内容区（宽 100%，最大 1440px，居中）             │
└──────────────────────────────────────────────────┘
```

| 导航条目 | 路由 | 图标（lucide）|
| --- | --- | --- |
| 文渊Admin | `/admin` | — |
| 书库管理 | `/admin/books` | `Library` |
| 审核中心 | `/admin/review` | `ClipboardCheck` |
| 模型设置 | `/admin/model` | `Settings2` |
| 退出登录 | — | `LogOut` |

- 当前激活项：`border-bottom: 2px solid --color-admin-sidebar-active`
- Admin 仅限桌面端（`<1280px` 显示提示横幅）

### 3.9 书籍封面默认生成

| 属性 | 规则 |
| --- | --- |
| 底色 | 从派系色板 0–5 按书籍 `id` hash 取色（四套主题各自色板）|
| 主文字 | 书名前两字，`font-size: 48px`，白色，bold |
| 副文字 | 作者名，`font-size: 16px`，`rgba(255,255,255,0.75)` |
| 尺寸比例 | `2:3` |
| 实现方式 | 纯 CSS + `div`，无需 Canvas 或服务端 |

---

## 四、页面与功能详述

### 4.1 路由结构

```
/login                           登录页
/                                首页（书库）
/books/:id/graph                 人物图谱页
/admin                           后台入口（跳转默认子页）
/admin/books/import              书籍导入向导（4 步）
/admin/review                    管理审核页
/admin/review/:bookId            指定书籍审核
/admin/model                     模型设置页
```

### 4.2 首页 / 书库（`/`）

**设计基调：** 仿真书架，现代博物馆感

**4.2.1 视觉呈现**

- 书籍卡片以`2:3` 宽高比（含书脊厚度 3D 视觉）展示
- 封面图（主视觉）+ 书名（绝对定位于封面下沿或书脊）
- Hover 信息展开（作者 / 朝代 / 统计信息）
- 书架木纹背景，按"影响力"或"导入时间"排列
- **Hover 效果**：Framer Motion 抬起 `y: -8px` + 阴影扩散

**4.2.2 状态规则**

- 仅 `COMPLETED` 书籍可点击进入图谱页
- 非 `COMPLETED` 书籍：灰度展示，**不可点击**，不显示解析状态 Badge
- 前台不提供导入入口（只读）

**4.2.3 数据说明入口**

卡片上需有"数据说明"入口（Tooltip / Popover / Drawer），展示：
- 章节数来源说明
- 人物数来源说明
- 最近解析时间（含失败任务）
- 当前模型（优先最近任务模型）
- 失败摘要截断显示

**4.2.4 接口调用**

```
GET /api/books → 书籍列表（含状态、统计、封面 URL）
```

**4.2.5 空状态**

前台显示"暂无可阅读书籍"插画，不提供导入 CTA。

### 4.3 前台顶部导航

```
[文渊 Logo（文字占位，bold 主强调色）] [书库] [主题下拉]  [登录/用户名+退出]
```

- 未登录：右上角"管理员登录"按钮
- 已登录：显示"管理员" + "退出登录"
- 主题下拉：`古风 / 素雅 / 典藏 / 星空`

### 4.4 人物图谱页（`/books/:id/graph`）

**设计基调：** 沉浸式力导向图，博物馆级展示

**4.4.1 图谱主题风格策略**

用户选哪套主题，图谱随之切换对应意境：

| 主题 | 图谱背景 | 图谱意境 |
| --- | --- | --- |
| danqing | `#F0EBE0`（旧纸）| 水墨山河图，节点如印章，边如墨迹 |
| suya | `#F4F4F5`（浅灰白）| 极简画布，高对比度蓝节点，清晰辅助功能友好 |
| diancang | `#12100D`（展厅深底）| 博物馆展厅，节点如展品发暖光，铜边框静谧典藏 |
| xingkong | `#06070E`（深空）| 繁星宇宙，荧光节点发光，星座连线沉浸，全屏最佳 |

**4.4.2 节点设计**

| 属性 | 规则 |
| --- | --- |
| 形状 | 圆形（人物）/ 菱形（地点）/ 六边形（组织）|
| 颜色 | 按派系配色（§3.7）|
| 大小 | 与影响力权重（关系数 × 讽刺指数）正相关 |
| 状态样式 | `DRAFT`：半透明虚线边框；`VERIFIED`：实线发光边框 |

**4.4.3 边设计**

| 属性 | 规则 |
| --- | --- |
| 颜色 | 正向（亲属/友好）蓝绿色；负向（敌对/嘲讽）橙红色 |
| 粗细 | 与 `weight`（亲密度）正相关 |
| 标签 | 鼠标悬停显示关系类型 |

**4.4.4 交互**

- **点击节点** → 右侧人物详情面板（Glassmorphism 风格）
- **双击节点** → 聚焦模式：其余无关节点半透明淡出
- **拖拽节点** → 坐标保存至 `visual_config`（调用 `PATCH /api/graphs/:id/layout`）
- **滚轮** → 缩放；**空白拖拽** → 平移
- **右键节点** → 上下文菜单（进入校对模式）

**4.4.5 人物详情面板（右侧）**

- 姓名 + 称谓、性别、状态 Badge（DRAFT/VERIFIED）
- 别名列表、籍贯、生卒年
- 人物小传、标签云、讽刺指数进度条
- 生平时间轴（每条事件可点击 → 跳转原文高亮）
- 直接关系列表（可按类型过滤）
- 底部：`校对此人物` 按钮（切换编辑态）

**4.4.6 章节时间轴**

- 固定在图谱底部：`第1回 ———⊙——— 第56回`
- 拖动滑块 → 图谱动态增减节点（D3 transition 渐入动画）
- 当前回目新增节点/边高亮闪烁

**4.4.7 工具栏（左上角浮动）**

| 按钮 | 功能 |
| --- | --- |
| 筛选 | 按关系类型、派系、状态过滤节点 |
| 搜索 | 高亮指定人物节点 |
| 路径查找 | 输入两人 → 高亮最短关系路径（调用 `POST /api/graph/path`）|
| 布局 | 力导向 / 同心圆 / 层级树 切换 |
| 全屏 | 进入沉浸式全屏模式 |
| 导出 | 导出 PNG / SVG / JSON |

**4.4.8 原文阅读 / 高亮回跳面板**

- 入口：关系证据 / 事件证据 / 审核条目
- 展示方式：右侧抽屉或双栏原文面板
- 展示：章节标题、分段原文、高亮证据片段
- 打开即滚动到目标段落
- 支持"上一处 / 下一处证据"

**4.4.9 D3 Canvas 渲染策略（Phase 3 → Phase 5）**

| 阶段 | 方案 |
| --- | --- |
| Phase 3 | SVG 渲染，上限约 200 节点 |
| Phase 5 | Canvas + 语义缩放 + 视口裁剪 + Web Worker 布局，支持 1000+ 节点 |

**语义缩放层级：**

| 缩放层级 | 显示内容 |
| --- | --- |
| 缩小（鸟瞰）| 派系气泡聚类 |
| 中等缩放 | Top N（默认 80）节点 + 关系 |
| 放大（局部）| 当前视口内全量节点 |

Top N 阈值在工具栏可调（50 / 80 / 150 / 全量），节点坐标计算在 Web Worker 中进行。

### 4.5 书籍导入向导（`/admin/books/import`）

**4 步向导（仅 admin 可访问）**

**Step 1 — 文件上传**
- 拖拽上传 + 点击选择
- 支持：`.txt`（MVP 必须）、`.epub`（Phase 5）
- 大小限制：50MB
- 上传后显示文件名 + 大小

**Step 2 — 基本信息**
- 字段：书名（必填）、作者、朝代、简介（均可选）
- AI 预填识别结果，书名识别失败回退文件名，用户均可修改

**Step 3 — 章节切分预览**
- 自动识别：`第X回`、`第X章`、`楔子`、`后记`、`Chapter X`
- 预览表格：`序号 | 章节类型 | 标题 | 字数`
- 支持手动合并章节、修改标题

**Step 4 — 启动解析**
- 模型卡片选择 UI（每张卡：名称、提供商 Logo、速度评级、古文能力评级、费用等级）
- 解析粒度：全书 / 选定章节
- 点击"开始解析" → 书籍进入 `PROCESSING`

**解析进度（运营端）**

- 轮询 `GET /api/books/:id/status`，间隔 2s
- 进度阶段：`文本清洗 → 章节切分 → 实体提取 → 关系建模 → 完成`
- 失败时展示错误摘要 + `重试` 按钮

### 4.6 管理审核页（`/admin/review`）

**4.6.1 整体布局**

- 左侧书籍选择
- 右侧审核看板（Tab 分区）

**4.6.2 Tab 分区**

| Tab | 内容 |
| --- | --- |
| 人物草稿 | 所有 DRAFT Persona + AI 原文证据 |
| 关系草稿 | 所有 DRAFT Relationship |
| 传记事件 | 所有 DRAFT BiographyRecord |
| 合并建议 | AI 识别的"可能是同一人"建议 |

**4.6.3 每条草稿操作**

- `✓ 确认` / `✗ 拒绝` / `✎ 编辑`（内联编辑）
- 批量操作：全选 + 批量确认 / 拒绝
- 点击任意草稿 → 右侧打开原文面板，高亮 AI 引用段落
- 来源筛选（AI / MANUAL）

**4.6.4 合并建议队列**

每条建议展示：
- 候选 A / 候选 B
- 建议原因、置信度
- 原文证据入口（是否涉及已审核人物）

操作：接受合并 / 拒绝建议 / 稍后处理 / 打开双方详情与原文对照

**4.6.5 实体合并工具**

选中两人物 → 点击"合并" → 选择主记录（关系线全部重定向后更新图谱）

### 4.7 手动人物管理（审核页内）

- 新增人物：填写姓名/别名/性别/籍贯/官职/人物类型，状态直接为 `VERIFIED`
- 编辑人物：修改任意字段
- 删除人物：弹窗提示影响范围，软删除（级联标记关联数据为 `REJECTED`）
- 手动连线：Persona A + B + 关系类型 + 章节
- 删除关系：软删除
- 手动录入传记事件

### 4.8 图谱内联校对

- 右键节点 → 详情面板切换为编辑态
- 可编辑：姓名、别名、籍贯、性别、标签、小传、讽刺指数
- 状态：`确认`（DRAFT→VERIFIED）/ `拒绝`（DRAFT→REJECTED）
- 实体合并：搜索已有 Persona → 合并（关系全部重定向）
- 右键边 → 弹窗编辑关系类型、权重、描述、状态

### 4.9 模型设置页（`/admin/model`）

**4.9.1 AI 模型配置**

每个模型一张配置卡：
- API Key 输入框（密文显示），列表态只展示脱敏值（`sk-****1234`）
- BaseURL（可选，留空使用官方默认）
- 连通性测试按钮 → 显示成功/失败 + 响应延迟 + 错误分类建议
- 启用/禁用开关

**4.9.2 默认模型**

下拉选择导入向导 Step 4 的默认模型（仅已启用模型可选）

**4.9.3 外观设置**

- 主题下拉：`古风 / 素雅 / 典藏 / 星空`（与全局主题状态联动）
- 语言：简体中文（只读展示）

**4.9.4 不包含**

不展示调用统计、用量报表、余额、账单信息

### 4.10 登录页（`/login`）

- 居中卡片：邮箱或用户名 + 密码 + 登录按钮
- 错误提示："账号或密码错误"（不区分具体原因）
- 登录成功 → 跳回 `?redirect` 参数页面，无参数则跳 `/`
- `redirect` 完整保留原始路径与查询参数（编码 / 解码处理）

---

## 五、全局 UI 状态模式

| 状态 | 实现 |
| --- | --- |
| 加载中 | Skeleton 骨架屏（`src/components/ui/skeleton.tsx`）|
| 操作反馈 | Toast 通知（shadcn/ui Toast 或 Sonner）|
| 表单验证错误 | inline 错误文案（shadcn/ui Form + Zod）|
| 空状态 | 插画 + 说明文案 |
| 全局错误边界 | React Error Boundary，降级到友好错误页 |
| 网络/API 错误 | Toast 展示错误摘要，不暴露内部细节 |

### 5.1 App Router 文件约定

每个路由段按需提供以下 Next.js 约定文件：

| 文件 | 用途 | 必须/按需 |
| --- | --- | --- |
| `loading.tsx` | 路由段加载态，自动包裹 `<Suspense>`；内容为 Skeleton 骨架屏 | 按需（数据密集页必须：`/`, `/books/:id/graph`, `/admin/review`）|
| `error.tsx` | 路由段运行时错误降级 UI（`"use client"`）；展示友好提示 + "重试"按钮 | 必须（所有路由段）|
| `not-found.tsx` | 404 降级 UI；根级 + `books/:id` 级 | 按需 |
| `global-error.tsx` | 根级 Error Boundary（`layout.tsx` 出错时兜底），替代 `app/error.tsx` | 必须（根目录）|

**规则：**
- `error.tsx` 自动为该路由段内所有服务端/客户端异常兜底，无需手动 `<ErrorBoundary>`
- `loading.tsx` 的骨架屏结构应与实际页面布局一致（避免 CLS）
- 嵌套路由段的 `error.tsx` 不捕获同级 `layout.tsx` 的错误，需上层兜底

### 5.2 SEO 与 Metadata

使用 Next.js `generateMetadata` / `metadata` 导出，**不使用** `<Head>` 或手动 `<meta>` 标签。

| 页面 | `title` | `description` | Open Graph |
| --- | --- | --- | --- |
| 首页 `/` | `文渊 — AI 古典文学人物关系图谱` | 探索中国古典文学作品中的人物关系网络 | 是（含默认封面图）|
| 图谱页 `/books/:id/graph` | `{书名} · 人物图谱 — 文渊` | 动态生成（`generateMetadata`）| 是（含书籍封面）|
| 登录页 | `登录 — 文渊` | — | 否 |
| Admin 所有页面 | `{子页名} — 文渊管理` | — | 否（`robots: noindex`）|

**规则：**
- `robots: { index: false }` 用于所有 `/admin/*` 页面
- 提供 `src/app/opengraph-image.tsx`（或 `.png`）作为全局默认 OG 图
- `title` 使用 `template: '%s — 文渊'` 格式在根 `layout.tsx` 统一后缀

---

## 六、API 合约（前端调用侧，以 task-backend.md 为权威源）

所有响应遵循 `src/server/http/api-response.ts` 格式：

```typescript
// 成功
{ success: true, data: T, message?: string }
// 失败
{ success: false, error: string, code?: string }
```

**接口鉴权策略（混合模式）：**

| 层级 | 路径前缀 | 保护机制 |
| --- | --- | --- |
| Tier 1 | `/api/admin/*` | Next.js Middleware 自动拦截（`matcher` 配置，viewer 返回 401） |
| Tier 2 | `/api/<resource>/*` | Route Handler 内显式调用 `requireAdmin()` 守卫写操作 |

**Tier 1 — `/api/admin/*`（Middleware 自动保护，零公开访问）**

```
GET    /api/admin/drafts                      草稿汇总（?bookId=&tab=&source=）
POST   /api/admin/bulk-verify                 批量确认（ids: string[]）
POST   /api/admin/bulk-reject                 批量拒绝（ids: string[]）
GET    /api/admin/merge-suggestions           合并建议列表（?bookId=&status=）
POST   /api/admin/merge-suggestions/:id/accept
POST   /api/admin/merge-suggestions/:id/reject
POST   /api/admin/merge-suggestions/:id/defer
GET    /api/admin/models                      模型配置列表（apiKey 脱敏）
PATCH  /api/admin/models/:id                  更新模型配置
POST   /api/admin/models/:id/test             连通性测试
POST   /api/admin/models/:id/set-default      设置默认模型
```

**Tier 2 — 资源路径（GET 公开，写操作 Handler 内 `requireAdmin()`）**

```
# 认证
POST   /api/auth/login                [pub]   登录
POST   /api/auth/logout               [pub]   登出

# 书籍
GET    /api/books                     [pub]   书籍列表
POST   /api/books                     [admin] 创建书籍（上传文本 + 元数据）
GET    /api/books/:id                 [pub]   书籍详情
DELETE /api/books/:id                 [admin] 删除书籍（软删除）
POST   /api/books/:id/analyze         [admin] 启动解析
GET    /api/books/:id/status          [pub]   解析进度 *

# 人物
GET    /api/books/:id/personas        [pub]   人物列表
POST   /api/books/:id/personas        [admin] 手动新增人物
GET    /api/personas/:id              [pub]   人物详情（含时间轴）
PATCH  /api/personas/:id              [admin] 更新人物（校对）
DELETE /api/personas/:id              [admin] 软删除（级联）
POST   /api/personas/merge            [admin] 合并两个 Persona

# 传记事件
POST   /api/personas/:id/biography    [admin] 手动新增传记事件
PATCH  /api/biography/:id             [admin] 更新传记事件
DELETE /api/biography/:id             [admin] 软删除

# 关系
GET    /api/books/:id/relationships   [pub]   关系列表
POST   /api/books/:id/relationships   [admin] 手动添加关系
PATCH  /api/relationships/:id         [admin] 更新关系
DELETE /api/relationships/:id         [admin] 软删除

# 图谱工具 & 原文阅读
POST   /api/graph/path                [pub]   两人最短路径查找（Neo4j）
PATCH  /api/graphs/:id/layout         [admin] 保存图谱节点坐标布局（§4.4.4 拖拽后持久化）
GET    /api/books/:id/chapters/:chapterId/read  [pub]  原文阅读（含段落锚点）

# 静态资源
GET    /api/assets/:key*              [pub]   静态资源访问
```

> `*` `GET /api/books/:id/status`：同一 URL，Handler 内按角色过滤返回字段——admin 返回 `{ status, progress, stage, errorLog }`，viewer 仅返回 `{ status: "COMPLETED" | "NOT_COMPLETED" }`。

**鉴权约定：**
- 未登录访问 `/admin/*` 页面：重定向 `/login?redirect=<当前路径>`
- API 返回 `403`：前端收到后跳转 `/login?redirect=<当前路径>`
- 登录态：httpOnly Cookie（`token`），Next.js Middleware 注入 `x-auth-role` 请求头
- 前端通过读取 layout 传递的 session 信息判断登录态，不直接读 Cookie

---

## 七、权限与路由守卫

**Middleware 行为（`middleware.ts`）：**
- 所有 `/admin/*` 路径：viewer 访问直接重定向 `/login?redirect=<路径>`
- 前台页面：viewer 可正常访问

**Admin Layout 守卫（`src/app/admin/layout.tsx`）：**
- 在 layout 服务端再次校验登录态，非 admin 跳 `/login?redirect=<admin 路径>`
- `/admin/*` 使用独立布局骨架，不复用前台内容区结构

**顶部导航（前台）：**
- 未登录：右上角"管理员登录"
- 已登录：右上角"管理员" + "退出登录"
- 管理导航不在前台常驻

---

## 八、实施阶段计划（前端视角）

### Phase 1 — 基础 UI 骨架（配合后端基础层）

- [ ] `src/app/globals.css` 中定义四套主题 CSS 变量（`[data-theme="danqing"]` 等）
- [ ] 配置 next-themes（`ThemeProvider`，`attribute="data-theme"`）
- [ ] 顶部导航组件（前台 + 后台两套）
- [ ] 登录页 UI（`/login`）—— 表单 + 错误提示 + redirect 处理
- [ ] Admin Layout 骨架（`src/app/admin/layout.tsx`）—— 顶部导航 + 内容区
- [ ] 路由守卫逻辑（Admin Layout 服务端校验）
- [ ] 各路由段 `error.tsx` + 根级 `global-error.tsx`
- [ ] 数据密集页 `loading.tsx` 骨架屏（`/`, `/books/:id/graph`, `/admin/review`）
- [ ] 根 `layout.tsx` Metadata 配置（`title.template`, OG 默认图、Admin `robots: noindex`）

### Phase 2 — 书库页 + 导入向导

- [ ] 书库页（`/`）：仿真书架网格、3D 书脊卡片、Hover 动画、空状态
- [ ] 书籍封面默认生成（纯 CSS，id hash 取派系色）
- [ ] 数据说明弹出层（Popover / Tooltip）
- [ ] 导入向导 4 步 UI（`/admin/books/import`）
  - Step 1：拖拽上传区
  - Step 2：基本信息表单（Zod 校验）
  - Step 3：章节切分预览表格（含手动合并）
  - Step 4：模型卡片选择 + 解析粒度
- [ ] 解析进度轮询 UI（进度条 + 阶段标签 + 错误 + 重试）

### Phase 3 — 人物图谱页

- [ ] D3 SVG 图谱基础渲染（节点 + 边 + 派系配色）
- [ ] 节点交互：点击详情、双击聚焦、拖拽、右键菜单
- [ ] 人物详情面板（右侧）
- [ ] 章节时间轴滑块（D3 transition 动画）
- [ ] 图谱工具栏骨架（筛选、搜索、路径查找入口）
- [ ] 原文阅读面板（高亮回跳）

### Phase 4 — 校对 & 审核

- [ ] 图谱内联校对 UI（编辑态表单、实体合并搜索）
- [ ] 管理审核页（`/admin/review`）：Tab 布局、草稿列表、原文对照
- [ ] 合并建议队列 UI
- [ ] 手动人物 / 关系 / 传记事件 增删改 UI

### Phase 5 — 视觉打磨

- [ ] 书脊 CSS 3D 效果、木纹背景精调
- [ ] 图谱 Canvas 渲染切换 + 语义缩放 + 视口裁剪 + Web Worker
- [ ] `VERIFIED` 节点发光效果（diancang 下尤强）
- [ ] 详情面板 Glassmorphism 效果
- [ ] 四套主题视觉精调 + 对比度验收
- [ ] 全局动画细节（页面切换、Skeleton、Toast）
- [ ] `.epub` 导入 UI 支持（Step 1 解锁该格式）
- [ ] 性能预算验收（LCP ≤ 2.5s、JS bundle ≤ 200KB gzip、图谱 SVG 200节点 ≥ 30fps）
- [ ] D3 / Framer Motion / lucide-react 按需导入审计（禁止全量 barrel import）

---

## 九、前端验收标准

### 书库

- [ ] 书籍卡片 `2:3` 比例，封面为主视觉
- [ ] 书架风格、3D 书脊与 Hover 抬起动画可用
- [ ] 前台不展示解析状态 Badge 与进度条
- [ ] 非 `COMPLETED` 书籍灰度且不可点击
- [ ] 卡片数据说明与接口口径一致

### 导入

- [ ] 文件上传 UI 可用，50MB 限制提示
- [ ] Step 2 书名 AI 预填，可用户修改
- [ ] Step 3 章节表格可预览与手动调整
- [ ] 导入入口仅在 `/admin/*` 提供

### 图谱

- [ ] 节点按大小/颜色区分影响力和派系
- [ ] `DRAFT` 节点与 `VERIFIED` 视觉有明显区别
- [ ] 点击节点正确打开详情面板，时间轴展示
- [ ] 章节滑块拖动，节点随之渐入增减
- [ ] 双击触发聚焦模式
- [ ] 路径查找 & 工具栏入口预留

### 主题

- [ ] 下拉选择四套主题（古风 / 素雅 / 典藏 / 星空）
- [ ] 主题通过 CSS 变量解耦，新增主题不改业务组件
- [ ] 主题切换 300ms 淡入淡出，无闪烁
- [ ] 图谱节点 / 边在四套主题下均清晰可读
- [ ] 主题偏好持久化（localStorage）

### Admin & 登录

- [ ] 未登录访问 `/admin/*` 跳 `/login?redirect=<路径>`
- [ ] 登录成功精确返回原后台页面（含查询参数）
- [ ] API Key 在模型设置页只展示脱敏值
- [ ] 模型连通性测试显示成功/失败/延迟

### 性能

- [ ] 首页 LCP ≤ 2.5s（桌面，Fast 3G 以上）
- [ ] JS 首屏 bundle ≤ 200KB（gzip）
- [ ] D3 图谱 SVG 阶段流畅交互 ≤ 200 节点
- [ ] 图谱 Canvas 阶段（Phase 5）流畅交互 ≤ 1000 节点
- [ ] 主题切换无白屏闪烁（SSR 脚本注入初始主题）
- [ ] 所有图片 / 字体使用 `next/font` 或 `preload` 优化加载

---

## 九-b、性能预算基线

| 指标 | 目标 | 测量条件 |
| --- | --- | --- |
| LCP（Largest Contentful Paint）| ≤ 2.5s | 桌面 Chrome，Fast 3G |
| CLS（Cumulative Layout Shift）| ≤ 0.1 | `loading.tsx` 骨架屏与真实页面布局匹配 |
| JS 首屏 Bundle（gzip）| ≤ 200KB | `next build` + `@next/bundle-analyzer` |
| 图谱 SVG 帧率（Phase 3）| ≥ 30fps | 200 节点拖拽交互 |
| 图谱 Canvas 帧率（Phase 5）| ≥ 45fps | 1000 节点拖拽交互 |
| 字体加载 | FOUT ≤ 300ms | `display=swap` + `preconnect` |

**约束：**
- D3.js 按需导入（`d3-force`, `d3-selection`），禁止 `import * as d3`
- Framer Motion 使用 `LazyMotion` + `domAnimation` 减包
- `lucide-react` 逐图标导入，禁止全量 barrel import
- 图谱 Web Worker 计算布局（Phase 5），避免主线程阻塞

---

## 十、代码规范

- API 响应错误时使用 Toast 展示摘要，不暴露 stack trace
- 所有可交互元素须有 `:focus-visible` 轮廓
- 图标都从 `lucide-react` 导入，使用 `size` prop，不硬编码色值
- 组件不内嵌 `data-theme` 判断逻辑，通过 CSS 变量实现主题联动
- 类型定义放 `src/types/`，与后端共用时从 `@/types` 导入
- 服务端组件（RSC）负责数据获取，客户端组件（`"use client"`）负责交互
- 表单校验一律使用 Zod + shadcn Form；校验规则与后端保持一致

---

## 十一、前端编码规范

前端实现**严格遵循**以下所有规范文件。

### `.trellis/spec/frontend/`

| 规范文件 | 覆盖内容 |
| --- | --- |
| `react-guidelines.md` | `use()` + Suspense 数据读取、SWR 轮询、Server Actions 写操作、禁止 `useEffect + setState` 首屏拉数 |
| `hook-guidelines.md` | 自定义 Hook 创建条件、命名约定 |
| `state-management.md` | Zustand 引入条件（三个前提同时满足）、Context / `useState` 优先原则 |
| `component-guidelines.md` | 组件拆分、props 设计、Server / Client 边界 |
| `performance-guidelines.md` | 懒加载、`memo` 使用条件、避免过度优化 |
| `type-safety.md` | TypeScript 严格模式、禁止 `any`、类型定义位置 |
| `quality-guidelines.md` | 测试覆盖、lint 规则、代码审查标准 |

### `.trellis/spec/shared/`（全局强制，前后端同时适用）

| 规范文件 | 覆盖内容 |
| --- | --- |
| `code-quality.md` | 禁止非空断言 `!`、禁止 `any`、禁止 `@ts-ignore`、禁止提交 `console.log`、import 顺序 |
| `zod-typescript.md` | Schema 优先原则：有 Zod schema 禁止重复声明 `interface/type`；类型从 schema 推导 |

### `.trellis/spec/guides/`（设计阶段遵循）

| 规范文件 | 覆盖内容 |
| --- | --- |
| `module-boundary-guidelines.md` | `src/components/**` 不得直接依赖 `src/server/**`；跨层共享类型统一放 `src/types/**` |

### `.trellis/spec/big-question/`（已知生产坑，编写对应代码时必读）

| 文件 | 级别 | 覆盖内容 |
| --- | --- | --- |
| `turbopack-webpack-flexbox.md` | ⚠️ Warning | flex 列方向布局须显式加 `items-stretch`；可滚动 flex 子项须加 `min-h-0` |
| `webkit-tap-highlight.md` | ℹ️ Info | iOS Safari 圆角点击高亮：须设 `WebkitTapHighlightColor: "transparent"` + 外层 `overflow-hidden` |
