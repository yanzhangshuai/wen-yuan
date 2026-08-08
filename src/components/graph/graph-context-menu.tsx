"use client";

import { useEffect, useRef } from "react";
import { Edit3, GitMerge } from "lucide-react";

import type { GraphNode } from "@/types/graph";

/**
 * =============================================================================
 * 文件定位（图谱节点右键菜单）
 * -----------------------------------------------------------------------------
 * 组件角色：节点上下文操作入口。
 * 组件类型：Client Component（依赖浏览器点击/键盘事件）。
 *
 * 核心职责：
 * - 在指定屏幕坐标弹出菜单；
 * - 提供“编辑校对/合并人物”快捷入口（跳转角色资料工作台）；
 * - 处理点击外部与 Esc 关闭。
 *
 * 业务边界：
 * - 本组件只负责 UI 事件分发，不直接执行写操作；
 * - 具体权限与数据校验由上层业务链路完成。
 * =============================================================================
 */

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface GraphContextMenuProps {
  /** 当前被右键的图谱节点。 */
  node    : GraphNode;
  /** 菜单锚点位置（基于视口坐标）。 */
  position: { x: number; y: number };
  /** 菜单关闭回调。 */
  onClose : () => void;
  /** 编辑回调。 */
  onEdit  : (nodeId: string) => void;
  /** 合并回调。 */
  onMerge : (nodeId: string) => void;
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function GraphContextMenu({
  node,
  position,
  onClose,
  onEdit,
  onMerge
}: GraphContextMenuProps) {
  /** 菜单容器 ref，用于“点击外部关闭”判断。 */
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * 全局事件：
   * - 点击菜单外区域 -> 关闭；
   * - 按 Esc -> 关闭。
   *
   * 设计原因：右键菜单属于短生命周期浮层，需支持快速退出。
   */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  /**
   * 菜单项定义。
   * 编辑/合并均跳转角色资料工作台，图侧只做入口分发。
   */
  const menuItems = [
    { icon: <Edit3 size={14} />, label: "编辑校对", action: () => onEdit(node.id) },
    { icon: <GitMerge size={14} />, label: "合并人物", action: () => onMerge(node.id) }
  ];

  return (
    <div
      ref={menuRef}
      className="graph-context-menu fixed z-50 min-w-[160px] rounded-lg border border-border bg-card py-1 shadow-lg"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label={`${node.name} 操作菜单`}
    >
      {/* 菜单头：展示当前节点身份，避免误操作到错误人物。 */}
      <div className="border-b border-border px-3 py-1.5">
        <p className="text-xs font-medium text-foreground">{node.name}</p>
        <p className="text-xs text-muted-foreground">{node.status === "DRAFT" ? "草稿" : "已审核"}</p>
      </div>

      {menuItems.map(item => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
          onClick={() => {
            item.action();
            // 执行动作后立即收起，防止重复触发。
            onClose();
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
