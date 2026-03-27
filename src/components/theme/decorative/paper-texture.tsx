"use client";

/**
 * 宣纸背景纹理 — danqing 丹青装饰
 * 使用 SVG noise pattern 平铺叠加在页面背景上
 */
export function PaperTexture() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden="true"
      style={{
        opacity         : 0.04,
        backgroundImage : "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
        backgroundRepeat: "repeat"
      }}
    />
  );
}
