"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

/**
 * 文件定位：
 * - Avatar 基础组件封装，属于前端展示层原子组件。
 * - 声明为 Client Component，主要因为头像加载失败回退等交互状态由浏览器侧驱动。
 */

/**
 * 头像根容器。
 * - 负责定义尺寸、圆形裁剪与溢出隐藏，确保图片/占位内容都遵循统一外观。
 */
function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  );
}

/**
 * 头像图片层。
 * - 参数来源通常是用户资料图片 URL。
 * - 使用 `aspect-square` + `size-full`，保证图片填满容器且维持方形比例。
 */
function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
}

/**
 * 头像兜底层（图片加载失败或无图片时显示）。
 * - 业务意义：避免“空头像”造成 UI 断裂，通常承载姓名首字母或默认图标。
 */
function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
