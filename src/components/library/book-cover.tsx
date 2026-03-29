"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { cn, getStringHash } from "@/lib/utils";
import { getFactionColorsForTheme } from "@/theme";

interface BookCoverProps {
  id        : string;
  title     : string;
  author?   : string | null;
  dynasty?  : string | null;
  coverUrl? : string | null;
  className?: string;
  disabled? : boolean;
}

export function BookCover({ id, title, author, dynasty, coverUrl, className, disabled }: BookCoverProps) {
  const { theme } = useTheme();

  const hash = getStringHash(id);
  const colorIndex = hash % 6;
  const palette = getFactionColorsForTheme(theme);
  const bgColor = palette[colorIndex];
  const verticalTitle = title.replace(/\s+/g, "").slice(0, 8).split("");
  const normalizedCoverUrl = coverUrl?.trim() || null;
  const hasCover = normalizedCoverUrl !== null;

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-md transition-all duration-300",
        disabled && "grayscale opacity-80",
        className
      )}
      style={!hasCover ? { backgroundColor: bgColor } : undefined}
    >
      {hasCover ? (
        <Image
          src={normalizedCoverUrl}
          alt={title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
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
