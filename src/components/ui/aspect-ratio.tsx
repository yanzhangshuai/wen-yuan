"use client";

import * as AspectRatioPrimitive from "@radix-ui/react-aspect-ratio";

/**
 * 文件定位（通用等比容器组件）：
 * - 文件路径：`src/components/ui/aspect-ratio.tsx`
 * - 所属层次：前端基础 UI 组件层（客户端组件）。
 *
 * 核心职责：
 * - 对 Radix `AspectRatio.Root` 进行项目级封装；
 * - 统一打上 `data-slot` 以便样式系统和测试定位。
 *
 * React 语义：
 * - 该组件是纯展示组件，无内部状态；
 * - 全量透传 props，保证下游调用与原始 Radix 能力一致。
 */
function AspectRatio({
  ...props
}: React.ComponentProps<typeof AspectRatioPrimitive.Root>) {
  // 保持“薄封装”策略：不改写任何行为，只补充项目内统一语义标识。
  return <AspectRatioPrimitive.Root data-slot="aspect-ratio" {...props} />;
}

export { AspectRatio };
