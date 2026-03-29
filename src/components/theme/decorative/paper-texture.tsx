"use client";

/**
 * 丹青水墨背景 — danqing 装饰
 * 朱砂渐变光晕 + 水墨纹理 SVG + 竖线纹理
 */
export function PaperTexture() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full opacity-[0.07]"
        style={{ background: "radial-gradient(circle, oklch(0.55 0.18 25) 0%, transparent 70%)", filter: "blur(60px)" }} />
      <div className="absolute -bottom-40 -left-20 w-[500px] h-[500px] rounded-full opacity-[0.05]"
        style={{ background: "radial-gradient(circle, oklch(0.45 0.12 35) 0%, transparent 70%)", filter: "blur(80px)" }} />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] opacity-[0.03]"
        style={{ background: "radial-gradient(ellipse, oklch(0.55 0.18 25) 0%, transparent 60%)", filter: "blur(120px)" }} />
      <svg className="absolute inset-0 w-full h-full opacity-[0.025]" xmlns="http://www.w3.org/2000/svg">
        <filter id="ink-t"><feTurbulence type="turbulence" baseFrequency="0.012 0.008" numOctaves={6} seed={3} result="n" />
          <feColorMatrix type="saturate" values="0" in="n" result="g" /><feBlend in="SourceGraphic" in2="g" mode="multiply" /></filter>
        <rect width="100%" height="100%" filter="url(#ink-t)" fill="oklch(0.55 0.18 25)" />
      </svg>
      <div className="absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: "repeating-linear-gradient(90deg, oklch(0.8 0.02 80) 0px, transparent 1px, transparent 120px)" }} />
    </div>
  );
}
