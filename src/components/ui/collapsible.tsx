"use client";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

/**
 * 文件定位（Next.js / React）：
 * - 这是一个前端基础 UI 组件封装文件，位于 `src/components/ui`，属于“展示层基础设施”。
 * - `use client` 表明该文件内组件是 Client Component：会在浏览器执行，可响应点击/展开等交互状态。
 * - 该文件不承载业务数据请求，只负责把 Radix 的可折叠能力统一成项目内部约定的组件接口。
 *
 * 业务职责：
 * - 为业务页面提供可复用的“折叠容器 / 触发器 / 内容区”三件套。
 * - 通过统一 `data-slot` 标记，与设计系统样式、测试定位、可视化调试保持一致。
 *
 * 维护注意：
 * - 这里导出的是“薄封装”组件，外部页面可能依赖 Radix 原生 props 行为，不能随意改 props 透传方式。
 * - `data-slot` 属于项目 UI 规范的一部分，是业务规则，不是技术限制；改动会影响全局样式选择器与测试脚本。
 */

/**
 * 折叠根容器组件。
 * - 业务语义：承载“某区域可展开/收起”的状态边界。
 * - 参数语义：完整透传 Radix Root 参数（受控/非受控展开状态、回调等）。
 * - 返回语义：带 `data-slot="collapsible"` 的根节点，供样式系统识别。
 */
function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

/**
 * 折叠触发器组件。
 * - 业务语义：用于触发展开/收起动作（如“更多”“查看详情”按钮）。
 * - 设计原因：单独封装触发器，确保交互语义和样式挂载点统一，不让业务层直接分散依赖 Radix 命名。
 */
function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  );
}

/**
 * 折叠内容组件。
 * - 业务语义：放置“仅在展开后展示”的信息区域。
 * - 设计原因：保持内容区与触发器解耦，业务方可自由组合复杂结构。
 */
function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
