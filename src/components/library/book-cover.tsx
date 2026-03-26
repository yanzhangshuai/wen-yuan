"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { cn, getStringHash } from "@/lib/utils";
import { getFactionColorsForTheme } from "@/theme";

interface BookCoverProps {
  id        : string;
  title     : string;
  author?   : string | null;
  coverUrl? : string | null;
  className?: string;
  disabled? : boolean;
}

export function BookCover({ id, title, author, coverUrl, className, disabled }: BookCoverProps) {
  const { theme } = useTheme();

  const hash = getStringHash(id);
  const colorIndex = hash % 6;
  const palette = getFactionColorsForTheme(theme);
  const bgColor = palette[colorIndex];
  const mainTitle = title.slice(0, 2);

  return (
    <div
      className={cn(
        "relative w-full aspect-2/3 overflow-hidden rounded shadow-sm group-hover:shadow-md transition-all duration-300",
        disabled && "grayscale opacity-80",
        className
      )}
      style={!coverUrl ? { backgroundColor: bgColor } : undefined}
    >
      {coverUrl ? (
        <Image
          src={coverUrl}
          alt={title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center select-none">
          <h2 className="text-4xl font-bold text-white mb-2 drop-shadow-md" style={{ fontFamily: "var(--font-serif)" }}>
            {mainTitle}
          </h2>
          {author && (
            <p className="text-sm font-medium text-white/75 line-clamp-1">
              {author}
            </p>
          )}
        </div>
      )}

      {/* 3D Spine Effect */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-black/10 z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-black/5 z-10" />

      {/* Highlight/Gloss */}
      <div className="absolute inset-0 bg-linear-to-tr from-black/5 via-transparent to-white/10 pointer-events-none" />
    </div>
  );
}
