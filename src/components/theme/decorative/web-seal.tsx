import { cn } from "@/lib/utils";

interface SealProps {
  className?: string;
  text?     : string;
  size?     : number;
}

export function WenYuanSeal({ className, text = "文渊", size = 48 }: SealProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn("text-primary opacity-80 mix-blend-multiply dark:mix-blend-screen", className)}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={text}
    >
      <title>{text}</title>
      <path
        d="M10,10 H90 V90 H10 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M30,30 L70,30 M50,30 L50,70 M30,70 L70,70" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <circle cx="20" cy="20" r="1" fill="currentColor" opacity="0.5" />
      <circle cx="80" cy="80" r="2" fill="currentColor" opacity="0.3" />
    </svg>
  );
}
