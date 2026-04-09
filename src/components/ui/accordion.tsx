"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 文件定位：
 * - Accordion（手风琴）基础组件封装，属于前端内容组织交互层。
 * - 使用 `use client`，因为展开/收起状态和动画由客户端事件驱动。
 */

/**
 * 手风琴根容器。
 * - 管理 item 的展开模式（单开/多开）、默认值、受控值等。
 */
function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

/**
 * 手风琴条目容器。
 * - 默认加底边分隔，最后一项去边框，保证列表视觉节奏一致。
 */
function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  );
}

/**
 * 手风琴触发器。
 *
 * @param children 触发区域内容（通常是条目标题）。
 * @param className 自定义样式扩展。
 *
 * 设计原因：
 * - 把 Trigger 包在 Header 里，遵循 Radix 可访问性结构约定。
 * - 箭头根据 `data-state=open` 自动旋转，给用户明确状态反馈。
 */
function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "interactive-text-link focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

/**
 * 手风琴内容区。
 * - 根据 `data-state` 使用开合动画，减少内容突兀跳变。
 * - 内层 `div` 提供统一内边距，避免业务内容紧贴边缘。
 */
function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
