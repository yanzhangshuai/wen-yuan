"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon, MinusIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 文件定位（复选框组件）：
 * - 文件路径：`src/components/ui/checkbox.tsx`
 * - 所属层次：前端基础表单组件层（客户端组件）。
 *
 * 核心职责：
 * - 提供“可多选”场景的统一交互控件；
 * - 封装选中态、错误态、禁用态与视觉一致性。
 *
 * 维护注意：
 * - `Indicator` 内部图标为状态核心反馈，避免随意替换为低对比度样式；
 * - `aria-invalid` 相关样式用于表单校验反馈，是业务可用性要求。
 * - 边框使用 `border-border`（`--border` 变量）而非 `border-input`（`--input` 为输入框背景色，
 *   与页面背景几乎相同，会导致在四个主题下复选框边框不可见）。
 * - `bg-muted/20` 为未选中状态提供轻量背景填充，提升四个主题下的边框对比度。
 * - `indeterminate` 状态使用 MinusIcon + 与 checked 相同的填充样式，区别于全选/全不选。
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-border bg-muted/20 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground data-[state=indeterminate]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        {/* indeterminate（全选表头部分选中）显示横线；checked 显示对勾 */}
        {props.checked === "indeterminate"
          ? <MinusIcon className="size-3.5" />
          : <CheckIcon className="size-3.5" />
        }
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
