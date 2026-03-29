"use client";

/**
 * 素雅宣纸背景 — suya 装饰
 * 分质噪声纹理 + 斜线底纹 + 右上角竹青光晕
 */
export function SuyaBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <filter id="pg"><feTurbulence type="fractalNoise" baseFrequency="0.65 0.45" numOctaves={4} seed={8} result="n" />
          <feColorMatrix type="saturate" values="0" in="n" /></filter>
        <rect width="100%" height="100%" filter="url(#pg)" fill="oklch(0.45 0.10 160)" />
      </svg>
      <div className="absolute inset-0 opacity-[0.025]"
        style={{ backgroundImage: "repeating-linear-gradient(168deg, oklch(0.45 0.10 160) 0px, transparent 1px, transparent 80px)" }} />
      <div className="absolute -top-10 -right-10 w-[400px] h-[600px] opacity-[0.06]"
        style={{ background: "radial-gradient(ellipse at top right, oklch(0.55 0.10 160) 0%, transparent 70%)", filter: "blur(50px)" }} />
    </div>
  );
}
