"use client";

import { useToast } from "@/hooks/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport
} from "@/components/ui/toast";

/**
 * 文件定位（Next.js）：
 * - 前端通知渲染容器，属于 Client Component。
 * - 该组件通常放在应用根布局附近，监听全局 toast 状态并渲染通知队列。
 *
 * 业务职责：
 * - 把“任意业务模块触发的提示消息”统一收敛到一个可管理的通知出口。
 * - 维持标题、描述、动作按钮、关闭按钮的标准化结构，保证交互一致性。
 */
export function Toaster() {
  // 上游来自全局 toast store/hook；当队列变化时，本组件会自动重新渲染。
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {/* 逐条渲染通知：
          - `id` 作为 React key，保证增删动画和状态关联稳定；
          - `...props` 保留每条 toast 的持续时间、状态等控制参数。 */}
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {/* 判空原因：标题/描述允许按需出现，避免空节点影响布局与可读性。 */}
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {/* action 由触发方定义（如“撤销”），这里仅负责插槽渲染。 */}
            {action}
            {/* 始终保留关闭按钮，确保用户可主动结束通知，属于体验保障。 */}
            <ToastClose />
          </Toast>
        );
      })}
      {/* 统一视口容器：集中管理 toast 定位、堆叠与动效。 */}
      <ToastViewport />
    </ToastProvider>
  );
}
