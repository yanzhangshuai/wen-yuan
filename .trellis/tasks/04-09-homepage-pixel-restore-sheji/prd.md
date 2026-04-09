# brainstorm: 首页像素级还原 sheji 设计

## Goal

将当前 `wen-yuan` 首页恢复为与 `/home/mwjz/code/sheji` 首页高度一致的视觉与交互表现，重点还原主题氛围、背景层、字体观感、外层边距、首页 hero 区、主题切换区以及书籍卡片的封面与 hover 细节，同时保留 `wen-yuan` 现有的真实数据加载、路由结构和业务约束。

## What I already know

* 用户明确要求对 `/home/mwjz/code/sheji` 首页做深度分析，并在当前项目中尽量像素级还原首页 UI。
* 参考项目已运行在 `http://localhost:3002/`，当前项目首页可在 `http://localhost:3000/` 访问。
* 当前首页入口为 [`src/app/(viewer)/page.tsx`](/home/mwjz/code/wen-yuan/src/app/(viewer)/page.tsx)，数据来自真实书籍列表服务，而不是 mock 数据。
* 当前首页展示组件为 [`src/components/library/library-home.tsx`](/home/mwjz/code/wen-yuan/src/components/library/library-home.tsx)。
* 当前导航组件为 [`src/components/layout/viewer-header.tsx`](/home/mwjz/code/wen-yuan/src/components/layout/viewer-header.tsx)，参考导航是 [`/home/mwjz/code/sheji/components/navigation/main-nav.tsx`](/home/mwjz/code/sheji/components/navigation/main-nav.tsx)。
* 当前书籍卡片实现为 [`src/components/library/book-card.tsx`](/home/mwjz/code/wen-yuan/src/components/library/book-card.tsx)，与参考 [`/home/mwjz/code/sheji/components/library/book-card.tsx`](/home/mwjz/code/sheji/components/library/book-card.tsx) 存在明显视觉漂移。
* 当前封面实现 [`src/components/library/book-cover.tsx`](/home/mwjz/code/wen-yuan/src/components/library/book-cover.tsx) 使用哈希色占位逻辑，和 `sheji` 的显式封面色/纯色封面表现不一致。
* 当前根布局 [`src/app/layout.tsx`](/home/mwjz/code/wen-yuan/src/app/layout.tsx) 使用 `ThemeProvider + DecorativeLayer`，而 `sheji` 使用 `ThemeProvider + ClientThemeBackground` portal 方案。
* 当前 viewer 布局 [`src/app/(viewer)/layout.tsx`](/home/mwjz/code/wen-yuan/src/app/(viewer)/layout.tsx) 在 `main` 上直接施加了 `max-w-[1440px]`，这会影响首页与图谱页的外层节奏。
* 当前首页缺少 `sheji` 首页 hero 区中的“切换主题风格”行。
* 历史任务 [`/.trellis/tasks/archive/2026-03/03-29-ui-merge-sheji/prd.md`](/home/mwjz/code/wen-yuan/.trellis/tasks/archive/2026-03/03-29-ui-merge-sheji/prd.md) 已明确本项目遵循“UI/视觉/交互以 sheji 为准，代码架构/数据层以 wen-yuan 为准”。

## Assumptions (temporary)

* 本次先聚焦首页与首页直接关联的壳层元素，不主动扩散到登录页、后台或图谱页视觉重构。
* `wen-yuan` 现有主题标识与真实数据字段保持不变，只做呈现层对齐。
* 对 `viewer` 布局的改动需要兼容图谱页，因此首页容器与图谱全宽能力需要同时成立。
* 用户要的是“视觉尽量一致”，优先保证观感、层级和间距一致性，而不是复用 `sheji` 的原始代码结构。

## Open Questions

* 无阻塞问题；按“首页视觉 fidelity 优先、架构与真实数据保持当前项目模式”执行。

## Requirements (evolving)

* 首页整体结构应与 `sheji` 首页一致，包括顶部导航、hero、统计区、数据提示、主题切换行、书库区和页脚结构。
* 首页的外层宽度、边距、分隔线、间距节奏应与 `sheji` 尽量一致。
* 主题背景层、背景纹理和最小页面宽度要尽量贴近 `sheji` 的表现。
* 字体栈与字体变量使用需对齐 `sheji` 的整体观感，不破坏当前项目可用性。
* 书籍卡片必须尽量还原 `sheji` 的 3D 书封、书脊、hover 遮罩、竖排标题、状态展示和阴影表现。
* 保留 `wen-yuan` 的真实书籍数据、当前路由跳转策略和“仅 COMPLETED 可进入图谱”的业务规则。
* 未完成书籍仍需保留当前项目的禁用逻辑，但视觉应更接近 `sheji`。

## Acceptance Criteria (evolving)

* [x] 首页顶部导航、hero 区和主题切换区视觉结构与 `sheji` 首页基本一致。
* [x] 首页背景层、主题观感、页面宽度和整体边距与 `sheji` 基本一致。
* [x] 书籍卡片的封面、书脊、hover 层和阴影表现与 `sheji` 高度接近。
* [x] 首页继续使用 `wen-yuan` 的真实数据渲染，未引入 mock 数据。
* [x] 只有已完成书籍可以点击进入 `/books/[id]/graph`，该业务行为未退化。
* [x] `pnpm lint` 通过。

## Definition of Done (team quality bar)

* 首页像素风格明显回归 `sheji`，用户关注的颜色、背景、字体、边距、书籍卡片问题均得到处理。
* 代码符合当前前端规范，没有破坏现有路由和数据层。
* Lint 通过，已做本地页面检查。

## Out of Scope (explicit)

* 登录页、后台页面、图谱页 UI 的系统性重做。
* 后端接口、数据模型、书籍解析逻辑调整。
* 新增首页以外的主题种类或新的主题机制。

## Technical Notes

* 参考首页主文件：[`/home/mwjz/code/sheji/app/page.tsx`](/home/mwjz/code/sheji/app/page.tsx)
* 参考导航：[`/home/mwjz/code/sheji/components/navigation/main-nav.tsx`](/home/mwjz/code/sheji/components/navigation/main-nav.tsx)
* 参考卡片：[`/home/mwjz/code/sheji/components/library/book-card.tsx`](/home/mwjz/code/sheji/components/library/book-card.tsx)
* 参考主题切换：[`/home/mwjz/code/sheji/components/theme-switcher.tsx`](/home/mwjz/code/sheji/components/theme-switcher.tsx)
* 参考背景层：[`/home/mwjz/code/sheji/components/client-theme-background.tsx`](/home/mwjz/code/sheji/components/client-theme-background.tsx) 和 [`/home/mwjz/code/sheji/components/theme-background.tsx`](/home/mwjz/code/sheji/components/theme-background.tsx)
* 参考全局样式：[`/home/mwjz/code/sheji/app/globals.css`](/home/mwjz/code/sheji/app/globals.css)
* 当前关键改动点预计集中在：
  * [`src/app/layout.tsx`](/home/mwjz/code/wen-yuan/src/app/layout.tsx)
  * [`src/app/(viewer)/layout.tsx`](/home/mwjz/code/wen-yuan/src/app/(viewer)/layout.tsx)
  * [`src/components/layout/viewer-header.tsx`](/home/mwjz/code/wen-yuan/src/components/layout/viewer-header.tsx)
  * [`src/components/library/library-home.tsx`](/home/mwjz/code/wen-yuan/src/components/library/library-home.tsx)
  * [`src/components/library/book-card.tsx`](/home/mwjz/code/wen-yuan/src/components/library/book-card.tsx)
  * [`src/components/library/book-cover.tsx`](/home/mwjz/code/wen-yuan/src/components/library/book-cover.tsx)
  * [`src/components/theme/toggle.tsx`](/home/mwjz/code/wen-yuan/src/components/theme/toggle.tsx)
  * 主题背景相关组件与 `src/app/globals.css`

## Verification Notes

* 本轮本地校验已通过 `pnpm lint` 与 `pnpm type-check`。
* 重新抓取等待 2500ms 后的首页截图：
  * 当前项目：`http://localhost:3000/`
  * 参考项目：`http://localhost:3002/`
* 当前整页截图像素差异（RMSE）为 `6404.33 (0.0977239)`，与本任务此前最佳结果一致，说明本轮收尾未引入新的视觉漂移。
* 先前的局部裁剪对比显示：首页顶部/hero/theme switcher 区域已明显逼近 `sheji`；剩余主要差异集中在书卡内容区，根因是 `wen-yuan` 保留真实书籍数据、真实封面和真实数量，而 `sheji` 使用固定 demo 数据。
* 结论：在保留真实数据、真实路由和现有业务约束的前提下，首页壳层、主题氛围、背景、字体、间距与书卡样式已达到本任务目标；剩余截图差异不再主要来自 UI 样式漂移。
