"use client";

import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";

import { cn } from "@/lib/utils";

/**
 * 文件定位：
 * - 基础交互组件封装（Hover Card），属于前端展示层。
 * - 使用 `use client` 是因为悬停交互、Portal 定位、状态动画都依赖浏览器事件与 DOM。
 */

/**
 * HoverCard 根容器。
 * - 业务语义：定义悬停浮层的交互边界（触发与内容的关联关系）。
 * - 参数：完整透传 Radix Root 参数，保持外部调用灵活度。
 */
function HoverCard({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />;
}

/**
 * HoverCard 触发器。
 * - 典型场景：用户悬停头像/标签时展示补充信息。
 * - `data-slot` 用于项目统一样式和测试定位。
 */
function HoverCardTrigger({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return (
    <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
  );
}

/**
 * HoverCard 内容层。
 *
 * @param className 业务方可扩展样式。
 * @param align 浮层与触发器对齐方式，默认 center。
 * @param sideOffset 浮层偏移距离，默认 4，避免与触发器视觉粘连。
 *
 * 设计原因：
 * - 使用 Portal 将浮层挂载到更高层，减少父容器 overflow/层级对浮层显示的干扰。
 * - 默认参数提供“开箱即用”的可读性，同时保留覆盖能力。
 */
function HoverCardContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
          className
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
