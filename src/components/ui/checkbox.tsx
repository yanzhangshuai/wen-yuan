"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";

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
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
