"use client";

/**
 * =============================================================================
 * 文件定位（设计系统 - 命令面板/快捷检索）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/ui/command.tsx`
 *
 * 框架语义与运行环境：
 * - 采用 `use client`，因为依赖键盘事件、输入过滤、弹层开关等浏览器交互能力；
 * - 该文件不直接耦合 Next.js 路由，但通常被页面级组件用于全局搜索、命令跳转入口。
 *
 * 业务职责：
 * - 统一命令面板视觉和可访问性结构，避免各页面重复拼装 cmdk 与 dialog；
 * - 将“搜索框 / 分组 / 空态 / 快捷键提示”的交互骨架沉淀为通用组件。
 *
 * 维护注意：
 * - `CommandDialog` 使用 `Dialog` 包装，是为了复用全站弹层行为与焦点管理；
 * - `data-slot` 命名为样式与测试契约，属于上下游依赖点，不建议随意调整。
 * =============================================================================
 */

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  /**
   * 组件职责（基础容器）：
   * - 封装 cmdk 根节点，统一命令面板的容器布局与主题色语义。
   */
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
        className
      )}
      {...props}
    />
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  /**
   * 对话框标题：
   * - 默认英文文案用于通用兜底；业务页面可传入中文或领域文案覆盖。
   */
  title?          : string
  /**
   * 对话框描述：
   * - 主要服务读屏器/无障碍语义，也可作为产品提示文案。
   */
  description?    : string
  /**
   * 允许调用方在不改结构的前提下覆盖弹层样式细节。
   */
  className?      : string
  /**
   * 是否显示右上角关闭按钮：
   * - 某些流程会要求“必须选择命令后关闭”，此时可设为 `false`。
   */
  showCloseButton?: boolean
}) {
  /**
   * 组件职责（容器组件）：
   * - 通过 Dialog 承载 Command，实现“命令面板作为模态弹层”这一交互模型。
   *
   * 设计原因：
   * - `DialogHeader` 使用 `sr-only` 是为了保留无障碍语义，不强占视觉空间。
   * - 这是可访问性规则，不是技术限制。
   */
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("overflow-hidden p-0", className)}
        showCloseButton={showCloseButton}
      >
        <Command className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  /**
   * 组件职责：
   * - 命令检索输入框，统一搜索图标、输入区域和底部分隔线布局。
   */
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-9 items-center gap-2 border-b px-3"
    >
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  /**
   * 组件职责：
   * - 命令结果列表容器，限制最大高度并启用纵向滚动。
   *
   * 防御目的：
   * - 避免命令项过多时撑爆弹层，影响可操作性。
   */
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  /**
   * 组件职责：
   * - 空结果提示，当检索无匹配命令时向用户提供明确反馈。
   */
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm"
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  /**
   * 组件职责：
   * - 命令分组容器，帮助用户按业务域理解命令集合（如“导航/操作/系统”）。
   */
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        className
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  /**
   * 组件职责：
   * - 分割不同命令分组，降低视觉噪音与误读概率。
   */
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("bg-border -mx-1 h-px", className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  /**
   * 组件职责：
   * - 单条命令项，统一“选中态/禁用态/图标对齐”交互语义。
   *
   * React 行为说明：
   * - 选中态由 cmdk 内部状态驱动，样式通过 `data-[selected=true]` 响应，
   *   减少重复状态同步代码。
   */
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  /**
   * 组件职责：
   * - 命令右侧快捷键提示，辅助用户记忆高频操作路径。
   */
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator
};
