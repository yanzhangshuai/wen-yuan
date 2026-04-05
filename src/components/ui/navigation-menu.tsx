import * as React from "react";
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { cva } from "class-variance-authority";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * =============================================================================
 * 文件定位（设计系统 - 顶部导航菜单）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/ui/navigation-menu.tsx`
 *
 * 项目角色：
 * - 封装 Radix NavigationMenu，提供可展开的导航菜单能力；
 * - 主要服务头部导航与分组跳转入口，属于前端展示层基础组件。
 *
 * 关键语义：
 * - `viewport` 可选开关用于区分“浮层内容”与“仅一级菜单”场景；
 * - `navigationMenuTriggerStyle` 作为统一触发器样式契约，确保站点导航观感一致。
 *
 * 维护建议：
 * - 指示器与 viewport 的动画联动是用户定位当前展开项的重要反馈，不建议删除；
 * - 保持 Radix 语义组件层次，避免破坏键盘导航与读屏可访问性。
 * =============================================================================
 */

function NavigationMenu({
  className,
  children,
  viewport = true,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Root> & {
  viewport?: boolean
}) {
  /**
   * 业务职责：
   * - 作为导航菜单根容器，统一承载一级导航项与可选的二级内容浮层。
   *
   * 参数语义：
   * - `viewport`：是否启用 Radix 的 Viewport 容器。
   *   - `true`：适用于“下拉内容较复杂”的导航（默认）。
   *   - `false`：适用于“仅一级项”或希望内容贴近触发器的轻量菜单。
   *
   * 分支原因：
   * - `viewport && <NavigationMenuViewport />` 是两种导航展示策略的切换点，
   *   这是业务层的交互策略，不是技术限制。
   */
  return (
    <NavigationMenuPrimitive.Root
      data-slot="navigation-menu"
      data-viewport={viewport}
      className={cn(
        "group/navigation-menu relative flex max-w-max flex-1 items-center justify-center",
        className
      )}
      {...props}
    >
      {children}
      {viewport && <NavigationMenuViewport />}
    </NavigationMenuPrimitive.Root>
  );
}

function NavigationMenuList({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.List>) {
  /**
   * 业务职责：
   * - 统一导航项列表的横向排布与间距，保证头部导航在各页面中的视觉节奏一致。
   */
  return (
    <NavigationMenuPrimitive.List
      data-slot="navigation-menu-list"
      className={cn(
        "group flex flex-1 list-none items-center justify-center gap-1",
        className
      )}
      {...props}
    />
  );
}

function NavigationMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Item>) {
  /**
   * 业务职责：
   * - 表示单个导航项容器，`relative` 为后续指示器/浮层定位提供锚点。
   */
  return (
    <NavigationMenuPrimitive.Item
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  );
}

const navigationMenuTriggerStyle = cva(
  "group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=open]:hover:bg-accent data-[state=open]:text-accent-foreground data-[state=open]:focus:bg-accent data-[state=open]:bg-accent/50 focus-visible:ring-ring/50 outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1"
);
/**
 * 业务语义：
 * - 触发器样式抽成 `cva` 是为了沉淀“站点级导航触发器规范”，
 *   避免各业务页面自行拼接 class 导致体验分裂。
 */

function NavigationMenuTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Trigger>) {
  /**
   * 业务职责：
   * - 渲染可展开的导航触发器，并用箭头旋转反馈当前展开状态。
   *
   * React/Radix 行为说明：
   * - `group-data-[state=open]:rotate-180` 依赖 Radix 写入的 `data-state`，
   *   通过纯样式实现“状态 -> 视觉反馈”，避免额外 React 状态维护。
   */
  return (
    <NavigationMenuPrimitive.Trigger
      data-slot="navigation-menu-trigger"
      className={cn(navigationMenuTriggerStyle(), "group", className)}
      {...props}
    >
      {children}{" "}
      <ChevronDownIcon
        className="relative top-[1px] ml-1 size-3 transition duration-300 group-data-[state=open]:rotate-180"
        aria-hidden="true"
      />
    </NavigationMenuPrimitive.Trigger>
  );
}

function NavigationMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Content>) {
  /**
   * 业务职责：
   * - 渲染导航项对应的内容面板（常见于二级菜单）。
   *
   * 关键分支语义：
   * - `group-data-[viewport=false]...` 这组类名用于兼容“禁用 viewport”的布局策略：
   *   内容会以内联浮层方式贴近触发器展示，避免丢失交互能力。
   * - 这属于兼容两种导航信息架构的业务规则，不建议随意删改。
   */
  return (
    <NavigationMenuPrimitive.Content
      data-slot="navigation-menu-content"
      className={cn(
        "data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 top-0 left-0 w-full p-2 pr-2.5 md:absolute md:w-auto",
        "group-data-[viewport=false]/navigation-menu:bg-popover group-data-[viewport=false]/navigation-menu:text-popover-foreground group-data-[viewport=false]/navigation-menu:data-[state=open]:animate-in group-data-[viewport=false]/navigation-menu:data-[state=closed]:animate-out group-data-[viewport=false]/navigation-menu:data-[state=closed]:zoom-out-95 group-data-[viewport=false]/navigation-menu:data-[state=open]:zoom-in-95 group-data-[viewport=false]/navigation-menu:data-[state=open]:fade-in-0 group-data-[viewport=false]/navigation-menu:data-[state=closed]:fade-out-0 group-data-[viewport=false]/navigation-menu:top-full group-data-[viewport=false]/navigation-menu:mt-1.5 group-data-[viewport=false]/navigation-menu:overflow-hidden group-data-[viewport=false]/navigation-menu:rounded-md group-data-[viewport=false]/navigation-menu:border group-data-[viewport=false]/navigation-menu:shadow group-data-[viewport=false]/navigation-menu:duration-200 **:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none",
        className
      )}
      {...props}
    />
  );
}

function NavigationMenuViewport({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Viewport>) {
  /**
   * 业务职责：
   * - 承载所有展开内容的统一可视区域，复用动画与尺寸过渡。
   *
   * 设计原因：
   * - 通过 CSS 变量 `--radix-navigation-menu-viewport-*` 跟随当前内容自适应，
   *   减少内容切换时的“跳动感”，提升导航稳定性体验。
   */
  return (
    <div
      className="absolute top-full left-0 isolate z-50 flex justify-center"
    >
      <NavigationMenuPrimitive.Viewport
        data-slot="navigation-menu-viewport"
        className={cn(
          "origin-top-center bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90 relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-md border shadow md:w-[var(--radix-navigation-menu-viewport-width)]",
          className
        )}
        {...props}
      />
    </div>
  );
}

function NavigationMenuLink({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Link>) {
  /**
   * 业务职责：
   * - 导航内容中的可点击链接项，统一 active/hover/focus 三类可达状态视觉规则。
   */
  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      className={cn(
        "data-[active=true]:focus:bg-accent data-[active=true]:hover:bg-accent data-[active=true]:bg-accent/50 data-[active=true]:text-accent-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus-visible:ring-ring/50 [&_svg:not([class*='text-'])]:text-muted-foreground flex flex-col gap-1 rounded-sm p-2 text-sm transition-all outline-none focus-visible:ring-[3px] focus-visible:outline-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function NavigationMenuIndicator({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Indicator>) {
  /**
   * 业务职责：
   * - 指示当前展开项对应位置，帮助用户快速建立“触发器与内容”映射关系。
   *
   * 维护提醒：
   * - 指示器虽看似装饰，实则是空间定位反馈的重要组成；删除会降低可用性。
   */
  return (
    <NavigationMenuPrimitive.Indicator
      data-slot="navigation-menu-indicator"
      className={cn(
        "data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden",
        className
      )}
      {...props}
    >
      <div className="bg-border relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm shadow-md" />
    </NavigationMenuPrimitive.Indicator>
  );
}

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
  navigationMenuTriggerStyle
};
