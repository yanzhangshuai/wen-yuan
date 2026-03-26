"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <div style={{
          minHeight      : "100vh",
          display        : "flex",
          flexDirection  : "column",
          alignItems     : "center",
          justifyContent : "center",
          padding        : "2rem",
          backgroundColor: "#F5F0E8",
          color          : "#1A1206"
        }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            应用出错了
          </h1>
          <p style={{ fontSize: "1rem", color: "#8B7355", marginBottom: "1.5rem", textAlign: "center" }}>
            {error.message || "发生了一个意外错误，请刷新页面重试。"}
          </p>
          <button
            onClick={reset}
            style={{
              padding        : "0.75rem 1.5rem",
              backgroundColor: "#C0392B",
              color          : "#fff",
              borderRadius   : "6px",
              border         : "none",
              fontSize       : "0.875rem",
              fontWeight     : 600,
              cursor         : "pointer"
            }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
