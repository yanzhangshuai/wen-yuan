"use client";

/**
 * =============================================================================
 * 文件定位（设计系统 - 菜单栏 Menubar）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/ui/menubar.tsx`
 *
 * 场景职责：
 * - 适用于桌面端“应用级菜单栏”交互（多级菜单、勾选项、单选组）；
 * - 为后台复杂操作区提供统一菜单规范，避免交互碎片化。
 *
 * 为什么是客户端组件：
 * - 菜单栏依赖键盘方向键导航、焦点穿梭、弹层展开收起；
 * - 这些能力都属于浏览器运行时行为，因此必须使用 `use client`。
 *
 * 维护边界：
 * - 快捷键展示 `MenubarShortcut` 与菜单项对齐布局是可读性规则，不建议删除；
 * - 子菜单触发器箭头是层级提示，属于业务可用性要求，不是装饰元素。
 * =============================================================================
 */

import * as React from "react";
import * as MenubarPrimitive from "@radix-ui/react-menubar";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Menubar({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Root>) {
  /**
   * 组件职责（容器组件）：
   * - 定义菜单栏根节点，通常用于页面顶部“文件/编辑/设置”这类应用级菜单入口。
   * - 样式上约束高度、边框与阴影，确保不同业务模块的菜单栏观感一致。
   */
  return (
    <MenubarPrimitive.Root
      data-slot="menubar"
      className={cn(
        "bg-background flex h-9 items-center gap-1 rounded-md border p-1 shadow-xs",
        className
      )}
      {...props}
    />
  );
}

function MenubarMenu({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Menu>) {
  /**
   * 业务语义：
   * - 表示一个可独立开合的菜单单元（例如“文件”菜单）。
   */
  return <MenubarPrimitive.Menu data-slot="menubar-menu" {...props} />;
}

function MenubarGroup({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Group>) {
  /**
   * 业务语义：
   * - 在同一菜单内组织同类操作项，便于视觉分区和键盘导航理解。
   */
  return <MenubarPrimitive.Group data-slot="menubar-group" {...props} />;
}

function MenubarPortal({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Portal>) {
  /**
   * 框架行为说明：
   * - 将弹层渲染到 Portal，避免被父级 `overflow` 或层叠上下文裁剪。
   * - 这是菜单可见性与层级正确性的基础，不建议移除。
   */
  return <MenubarPrimitive.Portal data-slot="menubar-portal" {...props} />;
}

function MenubarRadioGroup({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.RadioGroup>) {
  /**
   * 业务语义：
   * - 封装“互斥选择”菜单组（例如视图模式二选一），保证同组仅一个选项生效。
   */
  return (
    <MenubarPrimitive.RadioGroup data-slot="menubar-radio-group" {...props} />
  );
}

function MenubarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Trigger>) {
  /**
   * 组件职责：
   * - 一级菜单触发器，承载 hover/focus/open 状态视觉反馈。
   *
   * 设计原因：
   * - `data-[state=open]` 的显式样式用于强化“当前正在操作哪个菜单”。
   */
  return (
    <MenubarPrimitive.Trigger
      data-slot="menubar-trigger"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex items-center rounded-sm px-2 py-1 text-sm font-medium outline-hidden select-none",
        className
      )}
      {...props}
    />
  );
}

function MenubarContent({
  className,
  align = "start",
  alignOffset = -4,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Content>) {
  /**
   * 组件职责：
   * - 渲染一级菜单下拉内容，并统一默认定位策略。
   *
   * 参数业务语义：
   * - `align = "start"`：默认左对齐触发器，符合中文界面的阅读起点。
   * - `alignOffset = -4`：轻微回拉，减小触发器与菜单边缘的视觉错位。
   * - `sideOffset = 8`：设置触发器与内容面板的垂直间距，降低误触风险。
   *
   * 这是交互体验策略，不是技术限制；修改会直接影响操作手感。
   */
  return (
    <MenubarPortal>
      <MenubarPrimitive.Content
        data-slot="menubar-content"
        align={align}
        alignOffset={alignOffset}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[12rem] origin-(--radix-menubar-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-md",
          className
        )}
        {...props}
      />
    </MenubarPortal>
  );
}

function MenubarItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Item> & {
  /**
   * `inset`：
   * - 是否增加左侧缩进，常用于“从属项/层级项”。
   */
  inset?  : boolean
  /**
   * `variant`：
   * - `default`：普通操作；
   * - `destructive`：高风险操作（如删除），需通过颜色强化风险感知。
   */
  variant?: "default" | "destructive"
}) {
  /**
   * 组件职责：
   * - 菜单基础项，支持禁用态、危险态与层级缩进等业务语义。
   */
  return (
    <MenubarPrimitive.Item
      data-slot="menubar-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function MenubarCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.CheckboxItem>) {
  /**
   * 组件职责：
   * - 可多选菜单项（如“显示网格/显示标尺”）。
   *
   * 参数语义：
   * - `checked` 来自调用方状态，代表该选项是否启用。
   * - 使用 `ItemIndicator` 显示勾选图标，避免调用方重复实现选中标识。
   */
  return (
    <MenubarPrimitive.CheckboxItem
      data-slot="menubar-checkbox-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-xs py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <MenubarPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.CheckboxItem>
  );
}

function MenubarRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.RadioItem>) {
  /**
   * 组件职责：
   * - 单选菜单项（在 `MenubarRadioGroup` 内使用）。
   * - 圆点图标用于表达“当前唯一生效选项”。
   */
  return (
    <MenubarPrimitive.RadioItem
      data-slot="menubar-radio-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-xs py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <MenubarPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.RadioItem>
  );
}

function MenubarLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Label> & {
  /**
   * `inset`：
   * - 与菜单项保持同等缩进，便于分组标题与内容对齐。
   */
  inset?: boolean
}) {
  /**
   * 组件职责：
   * - 菜单分组标题，不可点击，主要承担信息组织与阅读引导作用。
   */
  return (
    <MenubarPrimitive.Label
      data-slot="menubar-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        className
      )}
      {...props}
    />
  );
}

function MenubarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Separator>) {
  /**
   * 组件职责：
   * - 菜单分隔线，明确不同操作组的语义边界，降低误操作概率。
   */
  return (
    <MenubarPrimitive.Separator
      data-slot="menubar-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function MenubarShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  /**
   * 组件职责：
   * - 展示快捷键信息（如 `⌘S`），帮助用户形成“鼠标操作 -> 键盘提效”迁移路径。
   */
  return (
    <span
      data-slot="menubar-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  );
}

function MenubarSub({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Sub>) {
  /**
   * 业务语义：
   * - 子菜单容器，用于承载二级操作层级。
   */
  return <MenubarPrimitive.Sub data-slot="menubar-sub" {...props} />;
}

function MenubarSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubTrigger> & {
  /**
   * `inset`：
   * - 用于在包含图标或分组时保持内容基线对齐。
   */
  inset?: boolean
}) {
  /**
   * 组件职责：
   * - 子菜单触发器，右侧箭头是“存在下级操作”的关键提示。
   */
  return (
    <MenubarPrimitive.SubTrigger
      data-slot="menubar-sub-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[inset]:pl-8",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto h-4 w-4" />
    </MenubarPrimitive.SubTrigger>
  );
}

function MenubarSubContent({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubContent>) {
  /**
   * 组件职责：
   * - 子菜单内容面板，复用与一级菜单一致的动效语言，保证层级切换连续性。
   */
  return (
    <MenubarPrimitive.SubContent
      data-slot="menubar-sub-content"
      className={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-menubar-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg",
        className
      )}
      {...props}
    />
  );
}

export {
  Menubar,
  MenubarPortal,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarGroup,
  MenubarSeparator,
  MenubarLabel,
  MenubarItem,
  MenubarShortcut,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent
};
