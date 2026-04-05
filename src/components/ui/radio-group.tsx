"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { CircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 文件定位：
 * - 单选组基础组件封装，属于前端表单交互层。
 * - 必须为 Client Component：用户选择行为需要浏览器事件驱动，且状态实时反馈 UI。
 */

/**
 * 单选组容器。
 *
 * @param className 业务层自定义布局样式。
 * @param props Radix RadioGroup Root 参数（value/defaultValue/onValueChange 等）。
 * @returns 单选组选项集合容器。
 */
function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  );
}

/**
 * 单选项组件。
 *
 * 业务语义：
 * - 表示“互斥选项”中的一个候选值。
 * - 与 `RadioGroup` 搭配后，同一组只能有一个 active 项。
 *
 * 设计原因：
 * - `Indicator` 内部使用 `CircleIcon`，通过视觉点位强化“已选中”状态反馈。
 * - 保留 `...props` 透传，确保禁用态、可访问性属性、值绑定不被封装层截断。
 */
function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "border-input text-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 aspect-square size-4 shrink-0 rounded-full border shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <CircleIcon className="fill-primary absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
