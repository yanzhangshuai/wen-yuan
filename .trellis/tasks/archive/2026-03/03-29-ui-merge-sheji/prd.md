# UI合并: sheji项目UI整合到wen-yuan

## Goal

将 `/home/mwjz/code/sheji/` (v0.app 生成的文渊UI设计稿项目) 的页面设计、主题系统、交互体验整体合并到当前 wen-yuan 项目，以 sheji 的 UI/交互为准，以 wen-yuan 的代码规范和后端集成为准。

## 原则

- **UI/视觉/交互** → 以 sheji 为准
- **代码架构/规范** → 以 wen-yuan 为准（src/ 目录结构、service 层、类型系统）
- **数据层** → 保留 wen-yuan 的真实 API 集成，不使用 mock 数据
- **组件库** → 以 sheji 的 shadcn/ui 组件为基础，遵循 wen-yuan 的导入规范 (`@/components/ui/`)

---

## 两项目对比分析

### 架构差异

| 维度 | wen-yuan (当前) | sheji (设计稿) |
|------|----------------|---------------|
| 目录结构 | `src/app/`, `src/components/` | `app/`, `components/` (无 src/) |
| 主题实现 | 独立 CSS 文件 per theme (`tokens/danqing/index.css`) + hex 色值 | 单文件 `globals.css` 内联 4 主题 + oklch 色值 |
| CSS 变量命名 | `--color-bg`, `--color-fg`, `--color-primary` | `--background`, `--foreground`, `--primary` (shadcn 标准) |
| 数据层 | 8 个 service 模块 + clientFetch/clientMutate | mock-data.ts (纯演示) |
| 图谱 | D3.js 力导向图 (600+ 行) | Canvas 力导向图 + 3D 选项 |
| UI 组件数 | 13 个 | 50+ 个 |
| 字体 | Noto Serif SC (本地) | Noto Serif SC + JetBrains Mono (Google Fonts) |

### 页面映射

| sheji 页面 | wen-yuan 对应页面 | 合并策略 |
|-----------|-----------------|---------|
| `/` (首页) | `/(viewer)/page.tsx` | **更新** - 采用 sheji 的书库展示设计 |
| `/login` | `/login/page.tsx` | **更新** - 采用 sheji 的左右分栏装饰设计 |
| `/book/[bookId]` | 无对应 | **新增** - 书籍详情页(独立于图谱的书籍信息页) |
| `/graph/[bookId]` | `/(viewer)/books/[id]/graph/page.tsx` | **更新** - 升级工具栏、面板设计 |
| `/admin` | `/admin/page.tsx` | **更新** - 采用 sheji 的仪表盘设计(统计卡片+快速操作+活动) |
| `/admin/books` | `/admin/books/page.tsx` | **更新** - 采用 sheji 的搜索筛选表格设计 |
| `/admin/books/[id]` | `/admin/books/[id]/page.tsx` | **更新** - 采用 sheji 的解析进度+任务+人物 tabs |
| `/admin/books/import` | `/admin/books/import/page.tsx` | **更新** - 升级为 sheji 的5步导入向导 |
| `/admin/characters` | 无对应 | **新增** - 人物管理页 |
| `/admin/relations` | 无对应 | **新增** - 关系管理页 |
| `/admin/review` | `/admin/review/page.tsx` | **更新** - 采用 sheji 的审核中心设计 |
| `/admin/settings` | `/admin/model/page.tsx` | **更新** - 采用 sheji 的模型配置设计 |

### 组件映射

| sheji 组件 | wen-yuan 对应 | 合并策略 |
|-----------|-------------|---------|
| `navigation/main-nav.tsx` | `layout/viewer-header.tsx` | **重写** - 采用 sheji logo+品牌设计 |
| `navigation/admin-nav.tsx` | `layout/admin-header.tsx` | **重写** - 采用 sheji admin 导航设计 |
| `library/book-card.tsx` | `library/book-card.tsx` | **重写** - 采用 sheji 3D 书封效果 |
| `graph/graph-toolbar.tsx` | `graph/graph-toolbar.tsx` | **更新** - 采用 sheji 玻璃态工具栏设计 |
| `graph/character-panel.tsx` | `graph/persona-detail-panel.tsx` | **更新** - 采用 sheji 侧边面板设计 |
| `graph/timeline-slider.tsx` | `graph/chapter-timeline.tsx` | **更新** - 采用 sheji 时间线设计 |
| `graph/graph-canvas-3d.tsx` | 无对应 | **新增** |
| `reader/evidence-panel.tsx` | `graph/text-reader-panel.tsx` | **更新** - 采用 sheji 证据面板设计 |
| `admin/book-detail-tabs.tsx` | 已有 tabs 组件 | **参考** - 类型定义有参考价值 |
| `layout/page-header.tsx` | 无对应 | **新增** - 通用页面头部组件 |
| `theme-switcher.tsx` | `theme/toggle.tsx` | **重写** - 采用 sheji 下拉菜单主题切换 |
| `theme-provider.tsx` | 使用 next-themes | **保持** - wen-yuan 已经用 next-themes |
| `theme-background.tsx` | 无对应 | **新增** - 装饰性背景 |
| `client-theme-background.tsx` | 无对应 | **新增** - Portal 背景(避免水合不匹配) |

### 新增 UI 基础组件 (sheji → wen-yuan)

需要从 sheji 添加到 wen-yuan 的 shadcn/ui 组件:

| 组件 | 用途 |
|------|------|
| accordion | 手风琴展开 |
| alert-dialog | 确认对话框 |
| alert | 行内警告 |
| aspect-ratio | 等比缩放容器 |
| avatar | 头像 |
| breadcrumb | 面包屑导航 |
| button-group | 按钮组 |
| calendar | 日历选择 |
| carousel | 轮播 |
| chart | 图表 |
| checkbox | 复选框 |
| collapsible | 可折叠 |
| command | 命令面板 |
| context-menu | 右键菜单 |
| drawer | 底部抽屉 |
| dropdown-menu | 下拉菜单 |
| empty | 空状态 |
| field | 表单字段 |
| hover-card | 悬浮卡片 |
| input-group | 组合输入框 |
| input-otp | OTP输入 |
| item | 列表项 |
| kbd | 键盘按键展示 |
| label | 标签 |
| menubar | 菜单栏 |
| navigation-menu | 导航菜单 |
| pagination | 分页 |
| popover | 弹出框 |
| progress | 进度条 |
| radio-group | 单选组 |
| resizable | 可调大小面板 |
| scroll-area | 滚动区域 |
| separator | 分隔线 |
| sheet | 侧边抽屉 |
| sidebar | 侧边栏系统 |
| slider | 滑块 |
| sonner | 通知 |
| spinner | 加载动画 |
| states | 状态组件(空/错误/骨架) |
| switch | 开关 |
| tabs | 标签页 |
| toggle | 切换 |
| toggle-group | 切换组 |
| tooltip | 工具提示 |

---

## 实施阶段

### Phase 0: 依赖准备
- [ ] 比较 package.json 依赖差异，安装缺失依赖
- [ ] 添加 JetBrains Mono 字体 (可选或继续用 next/font)

### Phase 1: 主题系统对齐 (基础层)
- [ ] 将 sheji 的 oklch 色值迁移到 wen-yuan 的 per-theme CSS 文件中，保持 wen-yuan 的变量命名
- [ ] 补充 sheji 特有的 CSS 变量 (graph-node, sidebar, chart 等)
- [ ] 合并 globals.css 中的工具类 (border-classical, texture-paper, glow-node)
- [ ] 补充滚动条、选区等全局样式
- [ ] 在 @theme 中桥接新变量到 Tailwind

### Phase 2: UI 组件库扩充
- [ ] 批量复制 sheji 的 shadcn/ui 组件到 `src/components/ui/`
- [ ] 调整导入路径 (`@/components/ui/` → `@/components/ui/`)
- [ ] 添加自定义组件 (empty, states, spinner, kbd, etc.)
- [ ] 验证所有组件 TypeScript 编译通过

### Phase 3: 布局与导航
- [ ] 重写 viewer-header → 采用 sheji main-nav 设计 (logo 淵 + 文淵 WEN YUAN)
- [ ] 重写 admin-header → 采用 sheji admin-nav 设计
- [ ] 添加 theme-background + client-theme-background
- [ ] 添加 page-header 通用组件
- [ ] 更新 theme-switcher → 下拉菜单4主题选择

### Phase 4: 前台页面 (Viewer)
- [ ] 重写首页 (`/`) → sheji 的书库展示 + BookCard 设计
- [ ] 重写 book-card → sheji 的 3D 书封效果
- [ ] 新增 book-cover 组件更新
- [ ] 重写登录页 → sheji 的左右分栏设计
- [ ] 新增书籍详情页 `/books/[id]`

### Phase 5: 图谱页面
- [ ] 更新图谱工具栏 → sheji 玻璃态设计
- [ ] 更新人物详情面板 → sheji 侧边面板
- [ ] 更新章节时间线 → sheji 时间线滑块
- [ ] 更新文本阅读面板 → sheji 证据面板
- [ ] 可选: 新增 3D 图谱画布

### Phase 6: 管理后台页面
- [ ] 重写 admin 首页 → sheji 仪表盘 (统计+快速操作+活动)
- [ ] 重写 admin 书籍列表 → sheji 搜索筛选表格
- [ ] 更新 admin 书籍详情 → sheji 解析进度tabs
- [ ] 更新 admin 图书导入 → sheji 5步向导
- [ ] 新增 admin 人物管理页 `/admin/characters`
- [ ] 新增 admin 关系管理页 `/admin/relations`
- [ ] 更新 admin 审核中心 → sheji 审核设计
- [ ] 更新 admin 模型设置 → sheji 设置页设计

---

## 技术注意事项

1. **CSS 变量兼容**: wen-yuan 使用 `--color-bg/fg` 命名，sheji 使用 `--background/foreground`。需要在 @theme 桥接中同步映射，保证 Tailwind 工具类 (`bg-background`, `text-foreground`) 和自定义引用 (`var(--color-bg)`) 都能工作。

2. **数据接口**: sheji 所有页面使用 hardcoded mock 数据，合并时需要替换为 wen-yuan 的 service 层调用 (如 `fetchBookList()`, `fetchGraphData()` 等)。

3. **路由结构差异**: sheji 使用 `app/` 根目录，wen-yuan 使用 `src/app/` 且有 `(viewer)` 路由组。需要映射 sheji 的扁平路由到 wen-yuan 的分组路由。

4. **组件导入约定**: wen-yuan 使用 `'use client'` 指令、React 19 的 `use()` hook 等现代 RSC 模式，合并时需保持这些约定。

5. **TypeScript 严格性**: wen-yuan 有严格 TS 类型，sheji 的组件可能用弱类型。合并时需要保证类型安全。

---

## Acceptance Criteria
- [ ] 4 个主题切换正常工作，色彩与 sheji 一致
- [ ] 所有页面视觉效果与 sheji 设计稿匹配
- [ ] 现有后端 API 集成功能不受影响
- [ ] TypeScript 编译零错误
- [ ] ESLint 检查通过
- [ ] 所有现有单元测试通过
