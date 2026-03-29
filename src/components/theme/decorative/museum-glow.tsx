"use client";

/**
 * 博物馆典藏背景 — diancang 装饰
 * 仅保留低强度黄铜光晕，避免与页面内容背景产生花纹冲突
 */
export function MuseumGlow() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute top-[-160px] right-[-120px] h-[640px] w-[640px] opacity-[0.045]"
        style={{
          background: "radial-gradient(circle at 70% 24%, oklch(0.72 0.12 85) 0%, transparent 68%)",
          filter    : "blur(84px)"
        }}
      />
      <div
        className="absolute bottom-[-220px] left-[-180px] h-[620px] w-[620px] opacity-[0.04]"
        style={{
          background: "radial-gradient(circle at 30% 70%, oklch(0.60 0.10 70) 0%, transparent 70%)",
          filter    : "blur(92px)"
        }}
      />
    </div>
  );
}
