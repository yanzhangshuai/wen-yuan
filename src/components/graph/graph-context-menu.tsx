"use client";

import { useEffect, useRef } from "react";
import { Eye, Edit3, GitMerge, Trash2 } from "lucide-react";

import type { GraphNode } from "@/types/graph";

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface GraphContextMenuProps {
  node        : GraphNode;
  position    : { x: number; y: number };
  onClose     : () => void;
  onViewDetail: (nodeId: string) => void;
  onEdit      : (nodeId: string) => void;
  onMerge     : (nodeId: string) => void;
  onDelete    : (nodeId: string) => void;
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function GraphContextMenu({
  node,
  position,
  onClose,
  onViewDetail,
  onEdit,
  onMerge,
  onDelete
}: GraphContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

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

  const menuItems = [
    { icon: <Eye size={14} />, label: "查看详情", action: () => onViewDetail(node.id) },
    { icon: <Edit3 size={14} />, label: "编辑校对", action: () => onEdit(node.id) },
    { icon: <GitMerge size={14} />, label: "合并人物", action: () => onMerge(node.id) },
    { icon: <Trash2 size={14} />, label: "删除", action: () => onDelete(node.id), danger: true }
  ];

  return (
    <div
      ref={menuRef}
      className="graph-context-menu fixed z-50 min-w-[160px] rounded-lg border border-border bg-card py-1 shadow-lg"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label={`${node.name} 操作菜单`}
    >
      <div className="border-b border-border px-3 py-1.5">
        <p className="text-xs font-medium text-foreground">{node.name}</p>
        <p className="text-xs text-muted-foreground">{node.status === "DRAFT" ? "草稿" : "已审核"}</p>
      </div>
      {menuItems.map(item => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-muted ${
            item.danger ? "text-destructive" : "text-foreground"
          }`}
          onClick={() => {
            item.action();
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
