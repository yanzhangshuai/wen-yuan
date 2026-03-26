"use client";

/**
 * 星尘粒子背景 — theme-04 星空装饰
 * 多层径向渐变模拟星尘微光点
 */
export function StarDust() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden="true"
      style={{
        background: [
          "radial-gradient(1px 1px at 20% 30%, rgba(124,110,248,0.4) 0%, transparent 100%)",
          "radial-gradient(1px 1px at 40% 70%, rgba(34,211,238,0.3) 0%, transparent 100%)",
          "radial-gradient(1px 1px at 80% 20%, rgba(124,110,248,0.35) 0%, transparent 100%)",
          "radial-gradient(1px 1px at 60% 85%, rgba(34,211,238,0.25) 0%, transparent 100%)",
          "radial-gradient(1px 1px at 10% 60%, rgba(248,113,113,0.2) 0%, transparent 100%)",
          "radial-gradient(1px 1px at 90% 50%, rgba(124,110,248,0.3) 0%, transparent 100%)",
          "radial-gradient(1.5px 1.5px at 30% 10%, rgba(250,204,21,0.25) 0%, transparent 100%)",
          "radial-gradient(1px 1px at 70% 40%, rgba(124,110,248,0.35) 0%, transparent 100%)",
          "radial-gradient(1.5px 1.5px at 50% 55%, rgba(34,211,238,0.3) 0%, transparent 100%)",
          "radial-gradient(1px 1px at 15% 90%, rgba(124,110,248,0.25) 0%, transparent 100%)"
        ].join(", ")
      }}
    />
  );
}
