"use client";

/**
 * =============================================================================
 * 文件定位（设计系统 - Toast 全局状态 Hook）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/ui/use-toast.ts`
 *
 * 在项目中的职责：
 * - 维护全局 toast 队列（新增、更新、关闭、移除）；
 * - 为任意客户端组件提供统一通知 API：`toast()` 与 `useToast()`。
 *
 * 架构说明：
 * - 采用“模块内内存状态 + 订阅监听器”模式，无需额外状态库；
 * - 这是一条轻量全局消息通道，适合通知类短时 UI 状态。
 *
 * 维护提示：
 * - `TOAST_LIMIT` 是产品体验策略（避免通知淹没用户），属于业务规则；
 * - `TOAST_REMOVE_DELAY` 控制关闭后延迟卸载，目的是保留退出动画并避免闪烁。
 * =============================================================================
 */

// Inspired by react-hot-toast library
import * as React from "react";

import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1000000;

type ToasterToast = ToastProps & {
  /** Toast 主键，由前端生成用于更新/关闭定位。 */
  id          : string
  /** 主标题（可选）。 */
  title?      : React.ReactNode
  /** 说明文案（可选）。 */
  description?: React.ReactNode
  /** 可选附加动作按钮。 */
  action?     : ToastActionElement
};

let count = 0;

function genId() {
  // 循环计数可避免整数无限增长；在会话内保证足够唯一即可满足通知场景。
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type Action =
  | {
      /** 新增一条 toast（打开态）。 */
      type : "ADD_TOAST"
      toast: ToasterToast
    }
  | {
      /** 更新已有 toast 的部分字段（如文案、状态）。 */
      type : "UPDATE_TOAST"
      toast: Partial<ToasterToast>
    }
  | {
      /** 关闭 toast（可指定单条或全部）。 */
      type    : "DISMISS_TOAST"
      toastId?: ToasterToast["id"]
    }
  | {
      /** 从队列中彻底移除 toast（可指定单条或全部）。 */
      type    : "REMOVE_TOAST"
      toastId?: ToasterToast["id"]
    };

interface State {
  /** 当前待展示/待动画结束的 toast 列表。 */
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const addToRemoveQueue = (toastId: string) => {
  // 若已在移除队列中，直接返回，避免重复 setTimeout 造成状态抖动。
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type   : "REMOVE_TOAST",
      toastId: toastId
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        // 只保留最新 N 条，避免通知堆积淹没当前操作反馈。
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT)
      };

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        )
      };

    case "DISMISS_TOAST": {
      const { toastId } = action;

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        // 未指定 id 时视为“关闭全部”，常用于页面切换或全局清理。
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                // 先关闭（触发退出动画），由 remove 阶段再彻底删除。
                open: false
              }
            : t
        )
      };
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: []
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId)
      };
  }
};

const listeners: Array<(state: State) => void> = [];

let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  // 广播给所有订阅组件，实现跨组件同步。
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

type Toast = Omit<ToasterToast, "id">;

function toast({ ...props }: Toast) {
  const id = genId();

  const update = (props: ToasterToast) =>
    dispatch({
      type : "UPDATE_TOAST",
      toast: { ...props, id }
    });
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id });

  dispatch({
    type : "ADD_TOAST",
    toast: {
      ...props,
      id,
      open        : true,
      onOpenChange: (open) => {
        // 当用户手动关闭（或系统关闭）时，统一走 dismiss 流程。
        if (!open) dismiss();
      }
    }
  });

  return {
    id: id,
    dismiss,
    update
  };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        // 组件卸载时及时解除订阅，避免内存泄漏与无效更新。
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId })
  };
}

export { useToast, toast };
