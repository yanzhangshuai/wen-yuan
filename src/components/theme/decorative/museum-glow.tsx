"use client";

/**
 * 博物馆展厅微光背景 — diancang 典藏装饰
 * 顶部暖黄径向渐变，仿展厅漫射光效果
 */
export function MuseumGlow() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden="true"
      style={{
        background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(200,168,110,0.06) 0%, transparent 70%)"
      }}
    />
  );
}
