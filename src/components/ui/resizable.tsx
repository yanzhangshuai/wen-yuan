"use client";

import * as React from "react";
import { GripVerticalIcon } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { cn } from "@/lib/utils";

/**
 * 文件定位：
 * - 可拖拽分栏基础组件封装，属于前端布局交互层。
 * - 使用 `react-resizable-panels` 提供拖拽能力，必须在客户端执行。
 *
 * 业务价值：
 * - 为“左侧目录 + 右侧详情”“多面板对照”等场景提供统一布局交互，不必每页重复实现拖拽逻辑。
 */

/**
 * 分栏组容器。
 * - 根据方向自动切换 flex 轴，保持横向/纵向分栏都可复用。
 */
function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof Group>) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className
      )}
      {...props}
    />
  );
}

/**
 * 单个可伸缩面板。
 * - 仅做 `data-slot` 与透传封装，保持原库行为不变。
 */
function ResizablePanel({
  ...props
}: React.ComponentProps<typeof Panel>) {
  return <Panel data-slot="resizable-panel" {...props} />;
}

/**
 * 分隔拖拽手柄。
 *
 * @param withHandle 是否显示可视化抓手图标。
 * @param className 业务扩展样式。
 * @param props 分隔线原生参数（含方向、禁用等）。
 *
 * 设计原因：
 * - 把可拖拽热区（伪元素 after）做得比可见线宽，提升鼠标命中率，降低误操作。
 * - `withHandle` 可选是为了在“极简布局”和“强调可拖拽提示”之间灵活切换。
 */
function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean
}) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {/* 抓手仅在需要时渲染，避免所有分隔线都产生视觉噪音。 */}
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </Separator>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
