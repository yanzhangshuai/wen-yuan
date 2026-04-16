---
stage: mvp
---

# 文渊设计系统

> 文渊项目专属的前端设计系统规则。
> AI 在本项目做 UI 开发时的约束性参考。

---

## 一、设计调性

- **产品定位**：中国古典文学知识图谱——学术严谨感 + 传统美学意蕴。
- **关键词**：沉稳、内敛、书卷气、可信赖。
- **禁止方向**：
  - 科技感强的 SaaS 风格（紫蓝渐变、霓虹辉光、Glassmorphism）。
  - 游戏化的卡通风格（圆角过大、配色过于活泼）。
  - 过度装饰的古风页游风格（龙凤纹、描金边、仿古纸背景铺满）。
- **对标参考**：学术出版物排版、博物馆数字化藏品展示、高质量文学类 App。

---

## 二、主题系统

### 四套主题

| 主题 ID | 中文名 | 定位 |
|---------|--------|------|
| `danqing` | 丹青 | 浓墨重彩的传统美学 |
| `suya` | 素雅 | 默认主题，温和清淡 |
| `diancang` | 典藏 | 庄重厚实的馆藏感 |
| `xingkong` | 星空 | 深色主题，沉浸夜读 |

### 规则

1. **所有颜色通过 CSS 变量消费**：使用 `var(--primary)`、`var(--background)` 等，禁止硬编码 hex/rgb 色值。
2. **新增语义色须注册**：新颜色需同时在 4 套主题 token 文件（`src/theme/tokens/<theme>/index.css`）中添加。
3. **默认回退**：缺失主题时回退到 `suya`（素雅），这是产品策略不是技术限制。
4. **多主题测试**：新增或修改 UI 时至少在 `suya`（亮色代表）和 `xingkong`（深色代表）下验证。

### 派系与关系颜色

- `factionColors`：人物派系着色，数组索引对应业务派系槽位，顺序不可随意变更。
- `edgeTypeColors`：关系类型着色（亲属/友好/对立/从属/其他），同理不可调序。
- 这两组颜色由主题 token 提供，禁止在组件中硬编码。

---

## 三、排版

### 字体栈

```css
/* 主字体：CJK 衬线（产品身份字体，不可更换） */
--font-sans: 'Noto Serif SC Variable', 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', serif;

/* 等宽字体：数据、代码、技术标识 */
--font-mono: 'JetBrains Mono', monospace;
```

### 规则

1. **正文行高**：中文正文 `line-height: 1.8` 至 `2.0`，比英文默认更宽松以适应宋体密排。
2. **行宽约束**：正文段落 28–35 字/行，使用 `max-w-prose` 或 `max-w-[42rem]`。
3. **标题层级**：通过 `font-weight`（400 → 700）+ `font-size` 建立层级。慎用 `letter-spacing` 负值（CJK 笔画粘连风险）。
4. **数据等宽**：统计数字、ID、代码片段使用 `font-mono` 或 `font-variant-numeric: tabular-nums`。
5. **中英混排**：英文技术标识内联使用 `font-mono`；英文句段保持原比例字体，确保不破坏 CJK 排版节奏。

### 反模式

- 标题 `tracking-[-0.05em]` 以上的负间距。
- 全页面单一 `font-weight`。
- 中文正文 `line-height` 低于 1.6。

---

## 四、组件体系

### shadcn/ui

- 基础组件位于 `src/components/ui/`，**不直接编辑源文件**。
- 定制通过 CSS 变量 + Tailwind v4 `@theme` 实现：修改 `src/app/globals.css` 或主题 token。
- 需要新组件时通过 shadcn CLI 生成（`npx shadcn@latest add <component>`）。

### 图标

- 统一使用 **Lucide**（shadcn 默认配套），不引入 Phosphor / Radix Icons / FontAwesome 等其他图标库。
- 图标 `strokeWidth` 保持一致（默认 2）。

### Toast / 通知

- Toast 只从 `@/components/ui/sonner` 导入，不直接 `import { toast } from "sonner"`。

### 表单

- Label 在 input 上方。
- 错误文本在 input 下方，使用行内展示。
- 标准 `gap-2` 间隔组织 input 块。

---

## 五、图谱可视化

### 技术选型

- **D3** 是图谱的唯一动画/渲染引擎（d3-force, d3-zoom, d3-drag, d3-selection）。
- 禁止为图谱引入 Framer Motion / GSAP / Three.js 等库。
- 图谱组件位于 `src/components/graph/`。

### 视觉规则

1. **颜色来自主题 token**：通过 `getFactionColorsForTheme()` / `getEdgeTypeColorsForTheme()` 获取，禁止硬编码色值。
2. **颜色数组索引有语义**：`edgeTypeColors[0]` = 亲属、`[1]` = 友好 ... 不可重排。
3. **节点与边的视觉反馈**：hover 高亮、选中态、淡出态需有明确的视觉区分。
4. **性能**：大规模图谱（100+ 节点）注意 force simulation 的性能，必要时降低 tick 频率或简化碰撞检测。

---

## 六、性能守卫

这些规则从 `design-taste-frontend` 中摘取，适用于所有前端开发：

| 规则 | 说明 |
|------|------|
| GPU 安全动画 | 仅使用 `transform` + `opacity`，禁止动画 `top` / `left` / `width` / `height` |
| blur 限制 | `backdrop-blur` 仅用于 `fixed` / `sticky` 元素，禁止用于滚动容器 |
| 纹理层固定 | 噪点/纹理挂 `position: fixed; pointer-events: none` 伪元素 |
| 全高安全 | 使用 `min-h-[100dvh]`，禁止 `h-screen`（iOS Safari 视口跳动） |
| will-change 谨慎 | 仅在正在动画的元素上使用，动画结束后移除 |
| z-index 约束 | 不随意 `z-50`；仅分配给系统层级：粘性导航、弹窗、Overlay、Tooltip |
| Grid 优先 | 多列布局用 CSS Grid，禁止 flexbox 百分比算术 |
| 容器约束 | 内容区 `max-width` 1200–1440px + `mx-auto` |

---

## 七、间距与留白

- **文学浏览页**：大方留白，区块间 `py-16` 至 `py-24`。
- **管理后台**：可适当紧凑，但仍需保证可读性，区块间 `py-8` 至 `py-12`。
- **图谱页面**：图谱画布占满可用空间，侧边面板与工具栏使用紧凑间距。
- **通用规则**：底部 padding 通常比顶部略大（光学校正）。

---

## 与其他规范的关系

- **组件开发**：遵循 `component-guidelines.md` 的代码组织规范，本文件补充**视觉设计**维度。
- **审计检查**：使用 `design-audit.md` 的清单逐项审查页面质量。
- **质量规范**：`quality-guidelines.md` 管代码质量，本文件管视觉质量。
