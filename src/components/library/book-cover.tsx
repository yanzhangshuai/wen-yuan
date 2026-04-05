"use client";

import Image from "next/image";
import { cn, getStringHash } from "@/lib/utils";

/**
 * 文件定位（Client Component / 书籍封面展示）：
 * - 该组件用于书库卡片中的封面区域渲染。
 * - 使用 `'use client'` 的原因：依赖 hover 交互样式、浏览器端渲染细节，以及 Next/Image 客户端行为。
 *
 * 业务目标：
 * - 有真实封面时展示图片；
 * - 无封面时生成“稳定且可识别”的占位封面，避免列表视觉断层。
 */

interface BookCoverProps {
  /** 书籍唯一 ID：用于生成稳定哈希色，保证同一本书占位色在多次渲染中一致。 */
  id        : string;
  /** 书名：用于封面 alt 与无图时竖排标题展示。 */
  title     : string;
  /** 作者名，可为空（古籍常见佚名）。 */
  author?   : string | null;
  /** 朝代标签，可为空。 */
  dynasty?  : string | null;
  /** 封面图片 URL，可为空或空白字符串。 */
  coverUrl? : string | null;
  /** 外部样式扩展类。 */
  className?: string;
  /** 禁用态：用于表现不可操作或离线状态。 */
  disabled? : boolean;
}

export function BookCover({ id, title, author, dynasty, coverUrl, className, disabled }: BookCoverProps) {
  // 哈希取模 12：与 CSS 中 --book-cover-faction-* 变量槽位对齐。
  const hash = getStringHash(id);
  const colorIndex = hash % 12;
  const bgColor = `var(--book-cover-faction-${colorIndex}, var(--muted))`;
  // 无封面时用竖排短标题，最多 8 字，防止卡片拥挤。
  const verticalTitle = title.replace(/\s+/g, "").slice(0, 8).split("");
  // 统一 trim，避免仅包含空格的 URL 被误判为有效封面。
  const normalizedCoverUrl = coverUrl?.trim() || null;
  const hasCover = normalizedCoverUrl !== null;

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-md transition-[opacity,filter,background-color] duration-[320ms]",
        disabled && "grayscale opacity-80",
        className
      )}
      style={!hasCover ? { backgroundColor: bgColor } : undefined}
    >
      {hasCover ? (
        // 有封面时走图片分支：Next/Image 可获得自动优化、懒加载与尺寸控制收益。
        <Image
          src={normalizedCoverUrl}
          alt={title}
          fill
          className="object-cover transition-transform duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.018]"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
      ) : (
        <>
          {/* 无封面书籍：使用主题色块 + 细纹理 + 竖排标题，保证与实封面混排时层次统一 */}
          <div className="absolute inset-0 bg-linear-to-br from-white/14 via-transparent to-black/25" aria-hidden="true" />
          <div className="absolute inset-0 texture-paper opacity-25" aria-hidden="true" />
          <div className="relative z-20 flex h-full flex-col p-4 text-card-foreground select-none">
            <div className="self-end rounded-full bg-black/22 px-2 py-0.5 text-[10px] tracking-wide text-white/80">
              {dynasty || "典籍"}
            </div>
            <div className="flex flex-1 items-center justify-center py-3">
              <h2
                className="text-[1.55rem] font-bold tracking-[0.18em] text-white/95 drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {verticalTitle.map((char, index) => (
                  <span key={`${char}-${index}`} className="block leading-tight">
                    {char}
                  </span>
                ))}
              </h2>
            </div>
            <p className="line-clamp-1 text-center text-xs text-white/80">
              {/* 作者为空时展示“佚名”是业务兜底文案，不是技术限制。 */}
              {author || "佚名"}
            </p>
          </div>
        </>
      )}

      {/* 平面封面仅保留轻微高光，避免产生“立体书脊”观感。 */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-tr from-black/8 via-transparent to-white/15" />
    </div>
  );
}
